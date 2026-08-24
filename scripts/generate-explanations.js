#!/usr/bin/env node
/**
 * Generates study explanations for lecture materials.
 *
 * Run from a laptop, not from Vercel -- serverless functions cap out at 10-60
 * seconds and this is a multi-hour job.
 *
 * Uses the Batch API: half the cost, no rate-limit juggling, and the batch id
 * doubles as a resume point. Rows are marked `processing` with their batch id
 * before submission, so a crash leaves a trail rather than a mystery.
 *
 *   node scripts/generate-explanations.js --limit=5
 *   node scripts/generate-explanations.js --dry-run --limit=1
 *   node scripts/generate-explanations.js --retry-failed
 *   node scripts/generate-explanations.js --reset-stuck
 *
 * Scope: category = 'Materials' only. Past questions and timetables share this
 * table and are never touched.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

import { prepareSource } from "./fetchSource.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import {
  GEMINI_MODELS,
  DEFAULT_DELAY_MS,
  createGeminiClient,
  generateWithGemini,
} from "./geminiProvider.js";
import {
  EXPLANATION_JSON_SCHEMA,
  STATUS,
  buildStoredExplanation,
  findSemanticProblem,
} from "./explanationSchema.js";

const MODEL = "claude-opus-5";
const MAX_TOKENS = 32000;
const CATEGORY = "Materials";
const POLL_INTERVAL_MS = 30_000;
const FILES_BETA = "files-api-2025-04-14";

const here = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ *
 * Setup
 * ------------------------------------------------------------------ */

function loadEnv() {
  const envPath = path.join(here, "..", ".env");
  if (!fs.existsSync(envPath)) return;

  // Split on /\r?\n/, not "\n". This file is CRLF, and in JS `.` does not
  // match \r -- so `(.*)$` would fail on every line except the last one,
  // which has no trailing carriage return.
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!match) continue;

    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

function parseArgs(argv) {
  const args = {
    provider: "claude",
    geminiModel: GEMINI_MODELS.DEFAULT,
    delayMs: DEFAULT_DELAY_MS,
    limit: null,
    ids: null,
    retryFailed: false,
    resetStuck: false,
    dryRun: false,
  };

  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--provider=")) args.provider = arg.split("=")[1];
    else if (arg.startsWith("--gemini-model=")) args.geminiModel = arg.split("=")[1];
    else if (arg.startsWith("--delay=")) args.delayMs = Number(arg.split("=")[1]);
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.split("=")[1]);
    // Explicit row ids, for the quality gate: --limit alone takes whatever is
    // oldest, which is not a representative sample.
    else if (arg.startsWith("--ids="))
      args.ids = arg
        .slice("--ids=".length)
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    else if (arg === "--retry-failed") args.retryFailed = true;
    else if (arg === "--reset-stuck") args.resetStuck = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else {
      console.error(`Unknown flag: ${arg}`);
      process.exit(1);
    }
  }

  if (!["claude", "gemini"].includes(args.provider)) {
    console.error(
      `--provider must be "claude" or "gemini" (got "${args.provider}").`
    );
    process.exit(1);
  }

  if (args.limit !== null && (!Number.isFinite(args.limit) || args.limit < 1)) {
    console.error("--limit must be a positive number.");
    process.exit(1);
  }

  return args;
}

const log = (...parts) =>
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...parts);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ *
 * Steps
 * ------------------------------------------------------------------ */

async function resetStuck(supabase) {
  const { data, error } = await supabase
    .from("resources")
    .update({ processing_status: STATUS.PENDING, explanation_batch_id: null })
    .eq("category", CATEGORY)
    .eq("processing_status", STATUS.PROCESSING)
    .select("id");

  if (error) throw new Error(`Could not reset stuck rows: ${error.message}`);

  log(`Reset ${data?.length ?? 0} stuck row(s) back to pending.`);
}

async function loadQueue(supabase, args) {
  const wanted = args.retryFailed
    ? [STATUS.PENDING, STATUS.FAILED]
    : [STATUS.PENDING];

  let query = supabase
    .from("resources")
    .select("id, title, course_code, level, semester, external_link, file_url")
    .eq("category", CATEGORY)
    .order("created_at", { ascending: true });

  // Explicit ids bypass the status filter so a completed row can be
  // regenerated deliberately; otherwise take whatever is queued.
  if (args.ids?.length) query = query.in("id", args.ids);
  else query = query.in("processing_status", wanted);

  if (args.limit) query = query.limit(args.limit);

  const { data, error } = await query;
  if (error) throw new Error(`Could not load queue: ${error.message}`);

  return data ?? [];
}

/**
 * Persist a status change, retrying on transport failure.
 *
 * Worth the retry: a dropped connection here is how a row ends up stranded in
 * `processing` after its work actually succeeded, which then needs
 * --reset-stuck and a full regeneration to recover.
 */
async function markRow(supabase, id, fields, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { error } = await supabase
      .from("resources")
      .update(fields)
      .eq("id", id);

    if (!error) return true;

    if (attempt === attempts) {
      log(`  ! could not update ${id} after ${attempts} tries: ${error.message}`);
      return false;
    }

    await sleep(attempt * 3000);
  }

  return false;
}

/**
 * Fetch every source and build the batch requests. Sources that cannot be
 * used are recorded immediately -- they never reach the model.
 */
async function prepareAll(supabase, queue, args, anthropic) {
  const requests = [];
  const prepared = new Map();
  let skipped = 0;
  let uploaded = 0;

  for (const [index, resource] of queue.entries()) {
    const label = `${index + 1}/${queue.length}`;
    const title = (resource.title || "untitled").slice(0, 58);

    const source = await prepareSource(resource);

    if (!source.ok) {
      skipped += 1;
      const status = source.unsupported ? STATUS.UNSUPPORTED : STATUS.FAILED;
      log(`${label} SKIP  ${title} -- ${source.reason}`);

      if (!args.dryRun) {
        await markRow(supabase, resource.id, {
          processing_status: status,
          error_message: source.reason,
          generated_date: new Date().toISOString(),
        });
      }
      continue;
    }

    // Oversized PDFs go up through the Files API and are referenced by id,
    // which sidesteps the 32 MB request cap. Scans land here most often.
    if (source.needsUpload && args.provider === "claude") {
      if (args.dryRun) {
        log(
          `${label} ready ${title} (${source.sourceKind}, ${(
            source.bytes / 1024 / 1024
          ).toFixed(1)} MB -- would upload via Files API)`
        );
        continue;
      }

      try {
        const file = await anthropic.beta.files.upload(
          {
            file: new File([source.buffer], `${resource.id}.pdf`, {
              type: "application/pdf",
            }),
          },
          { betas: [FILES_BETA] }
        );

        source.contentBlock = {
          type: "document",
          source: { type: "file", file_id: file.id },
        };
        uploaded += 1;

        log(
          `${label} ready ${title} (${source.sourceKind}, ${(
            source.bytes / 1024 / 1024
          ).toFixed(1)} MB -> file ${file.id})`
        );
      } catch (error) {
        skipped += 1;
        const reason = `Files API upload failed: ${error.message}`;
        log(`${label} SKIP  ${title} -- ${reason}`);
        await markRow(supabase, resource.id, {
          processing_status: STATUS.FAILED,
          error_message: reason,
          generated_date: new Date().toISOString(),
        });
        continue;
      }
    } else {
      log(
        `${label} ready ${title} (${source.sourceKind}, ${(source.bytes / 1024).toFixed(0)} KB)`
      );
    }

    prepared.set(resource.id, { resource, source });

    requests.push({
      custom_id: resource.id,
      params: {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        thinking: { type: "adaptive" },
        output_config: {
          format: { type: "json_schema", schema: EXPLANATION_JSON_SCHEMA },
        },
        messages: [
          {
            role: "user",
            content: [
              source.contentBlock,
              { type: "text", text: buildUserPrompt(resource) },
            ],
          },
        ],
      },
    });
  }

  return { requests, prepared, skipped, uploaded };
}

function extractJson(message) {
  const block = message?.content?.find((part) => part.type === "text");
  if (!block?.text) return null;

  try {
    return JSON.parse(block.text);
  } catch {
    return null;
  }
}

async function writeResults(supabase, anthropic, batchId, prepared) {
  let completed = 0;
  let failed = 0;
  const seen = new Set();

  for await (const entry of await anthropic.beta.messages.batches.results(batchId, { betas: [FILES_BETA] })) {
    seen.add(entry.custom_id);

    const context = prepared.get(entry.custom_id);
    const title = (context?.resource.title || entry.custom_id).slice(0, 58);

    if (entry.result.type !== "succeeded") {
      failed += 1;
      const reason =
        entry.result.error?.message ||
        entry.result.error?.type ||
        entry.result.type;

      log(`  FAIL ${title} -- ${reason}`);
      await markRow(supabase, entry.custom_id, {
        processing_status: STATUS.FAILED,
        error_message: `Batch result: ${reason}`,
        generated_date: new Date().toISOString(),
      });
      continue;
    }

    const message = entry.result.message;

    if (message.stop_reason === "refusal") {
      failed += 1;
      const reason = `Model declined: ${message.stop_details?.category ?? "unknown"}`;
      log(`  FAIL ${title} -- ${reason}`);
      await markRow(supabase, entry.custom_id, {
        processing_status: STATUS.FAILED,
        error_message: reason,
        generated_date: new Date().toISOString(),
      });
      continue;
    }

    const parsed = extractJson(message);
    const problem = parsed
      ? findSemanticProblem(parsed)
      : "Response contained no parsable JSON.";

    if (problem) {
      failed += 1;
      log(`  FAIL ${title} -- ${problem}`);
      await markRow(supabase, entry.custom_id, {
        processing_status: STATUS.FAILED,
        error_message: problem,
        generated_date: new Date().toISOString(),
      });
      continue;
    }

    const explanation = buildStoredExplanation(parsed, {
      sourceUrl:
        context.resource.external_link || context.resource.file_url || "",
      extractionMethod: context.source.extractionMethod,
      sourceKind: context.source.sourceKind,
      model: MODEL,
    });

    await markRow(supabase, entry.custom_id, {
      generated_explanation: explanation,
      processing_status: STATUS.COMPLETED,
      generated_date: new Date().toISOString(),
      error_message: null,
    });

    completed += 1;
    log(`  ok   ${title} (${parsed.sections.length} sections)`);
  }

  // Anything the batch never reported stays `processing` on purpose, so
  // --reset-stuck can find it rather than it being silently lost.
  const missing = [...prepared.keys()].filter((id) => !seen.has(id));
  if (missing.length) {
    log(
      `! ${missing.length} row(s) had no batch result and remain 'processing'. Run --reset-stuck to requeue.`
    );
  }

  return { completed, failed };
}

/* ------------------------------------------------------------------ *
 * Gemini path
 *
 * Sequential rather than batched: the free tier is bound by requests per
 * minute, not by cost, so there is nothing for a batch to save. Validation
 * and persistence go through the same findSemanticProblem() and
 * buildStoredExplanation() the Claude path uses, so a row written by either
 * provider is indistinguishable in shape.
 * ------------------------------------------------------------------ */

async function runGemini(supabase, prepared, args) {
  const ai = createGeminiClient(process.env.GEMINI_API_KEY);

  let completed = 0;
  let failed = 0;
  let index = 0;

  const total = prepared.size;

  for (const [id, { resource, source }] of prepared) {
    index += 1;
    const label = `${index}/${total}`;
    const title = (resource.title || id).slice(0, 52);

    await markRow(supabase, id, {
      processing_status: STATUS.PROCESSING,
      explanation_batch_id: `gemini:${args.geminiModel}`,
      error_message: null,
    });

    const result = await generateWithGemini({
      ai,
      model: args.geminiModel,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(resource),
      schema: EXPLANATION_JSON_SCHEMA,
      source,
    });

    const problem = result.ok
      ? findSemanticProblem(result.parsed)
      : result.reason;

    if (problem) {
      failed += 1;
      log(`${label} FAIL ${title} -- ${problem}`);
      await markRow(supabase, id, {
        processing_status: STATUS.FAILED,
        error_message: problem,
        generated_date: new Date().toISOString(),
      });
    } else {
      const explanation = buildStoredExplanation(result.parsed, {
        sourceUrl: resource.external_link || resource.file_url || "",
        extractionMethod: source.extractionMethod,
        sourceKind: source.sourceKind,
        model: result.model,
      });

      await markRow(supabase, id, {
        generated_explanation: explanation,
        processing_status: STATUS.COMPLETED,
        generated_date: new Date().toISOString(),
        error_message: null,
      });

      completed += 1;
      log(`${label} ok   ${title} (${result.parsed.sections.length} sections)`);
    }

    // Free-tier pacing. Skipped after the last item so a short run does not
    // sit idle for no reason.
    if (index < total) await sleep(args.delayMs);
  }

  return { completed, failed };
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  loadEnv();
  const args = parseArgs(process.argv);

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
    process.exit(1);
  }

  // No hard check on the Anthropic key: the SDK resolves credentials itself
  // (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile),
  // so an unset env var does not mean there are none. Let it raise its own
  // error if nothing resolves.

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  if (args.resetStuck) {
    await resetStuck(supabase);
    if (!args.limit && !args.retryFailed) return;
  }

  const queue = await loadQueue(supabase, args);

  if (queue.length === 0) {
    log("Nothing to do -- no pending materials.");
    return;
  }

  log(`Queue: ${queue.length} material(s).${args.dryRun ? "  [DRY RUN]" : ""}`);

  // Built before preparation because oversized PDFs are uploaded during it.
  // Only for the Claude path -- constructing it under --provider=gemini would
  // demand Anthropic credentials that a Gemini run has no use for.
  const anthropic =
    args.dryRun || args.provider !== "claude"
      ? null
      : anthropicKey
        ? new Anthropic({ apiKey: anthropicKey })
        : new Anthropic();

  const { requests, prepared, skipped, uploaded } = await prepareAll(
    supabase,
    queue,
    args,
    anthropic
  );

  log(
    `Prepared ${requests.length}, skipped ${skipped}${
      uploaded ? `, uploaded ${uploaded} oversized PDF(s)` : ""
    }.`
  );

  if (prepared.size === 0) {
    log("No usable sources in this batch.");
    return;
  }

  if (args.dryRun) {
    log("Dry run -- nothing submitted, nothing written.");
    log(`Provider would be: ${args.provider}`);
    if (requests.length) {
      const sample = requests[0];
      log(`First request: custom_id=${sample.custom_id}`);
      log(
        `  content blocks: ${sample.params.messages[0].content
          .map((c) => c?.type ?? "pending-upload")
          .join(", ")}`
      );
    }
    return;
  }

  if (args.provider === "gemini") {
    log(`Running ${prepared.size} through ${args.geminiModel}, ${args.delayMs}ms apart.`);

    const { completed, failed } = await runGemini(supabase, prepared, args);

    log(
      `Done. ${completed} completed, ${failed} failed, ${skipped} skipped, of ${queue.length} queued.`
    );
    return;
  }

  // Beta namespace throughout: a request may reference an uploaded file, and
  // mixing namespaces between create and results would drop the header.
  const batch = await anthropic.beta.messages.batches.create({
    requests,
    betas: [FILES_BETA],
  });
  log(`Submitted batch ${batch.id} with ${requests.length} request(s).`);

  // Claim the rows only after submission succeeds, so a failed submit leaves
  // them pending rather than stranded.
  for (const id of prepared.keys()) {
    await markRow(supabase, id, {
      processing_status: STATUS.PROCESSING,
      explanation_batch_id: batch.id,
      error_message: null,
    });
  }

  let status = batch;
  while (status.processing_status !== "ended") {
    await sleep(POLL_INTERVAL_MS);
    status = await anthropic.beta.messages.batches.retrieve(batch.id, { betas: [FILES_BETA] });
    const counts = status.request_counts;
    log(
      `  ${status.processing_status} -- succeeded ${counts.succeeded}, errored ${counts.errored}, processing ${counts.processing}`
    );
  }

  log("Batch ended. Writing results...");
  const { completed, failed } = await writeResults(
    supabase,
    anthropic,
    batch.id,
    prepared
  );

  log(
    `Done. ${completed} completed, ${failed} failed, ${skipped} skipped, of ${queue.length} queued.`
  );
}

main().catch((error) => {
  console.error("\nFatal:", error.message);
  process.exit(1);
});
