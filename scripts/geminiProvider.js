/**
 * Gemini provider for explanation generation.
 *
 * Deliberately additive: the Claude path is untouched. Both providers are fed
 * the identical system prompt, user prompt and JSON schema from prompt.js and
 * explanationSchema.js, so their outputs are directly comparable.
 *
 * Two things differ from Claude by necessity, not by choice:
 *
 *  - No batch API. Gemini's free tier is rate-limit bound rather than cost
 *    bound, so this runs sequentially with a configurable delay.
 *  - Schema dialect. Gemini's responseSchema is an OpenAPI 3.0 subset and
 *    rejects `additionalProperties`, which the Claude schema sets everywhere
 *    for strict mode. toGeminiSchema() strips it.
 */

import { GoogleGenAI } from "@google/genai";

/** Free-tier Flash models, newest first. Verified against Google's model docs. */
export const GEMINI_MODELS = {
  // gemini-3.7-flash is listed as free-tier in Google docs but errors on this
  // key (a transport-level failure, not a 404), so the default is the newest
  // Flash that was verified to actually respond. Override with --gemini-model.
  DEFAULT: "gemini-3.6-flash",
  FALLBACKS: ["gemini-3.5-flash", "gemini-2.5-flash"],
};

/** Free tier is roughly 10 requests/minute; 6s between calls stays under it. */
export const DEFAULT_DELAY_MS = 6000;

/** Gemini's inline limit is well under its 50 MB file cap. */
const MAX_INLINE_BYTES = 18 * 1024 * 1024;

/** A hung call otherwise blocks for ~5 minutes before failing. */
const REQUEST_TIMEOUT_MS = 120_000;

const FILE_ACTIVE_TIMEOUT_MS = 180_000;
const FILE_POLL_MS = 3000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Convert the strict JSON Schema used for Claude into the OpenAPI 3.0 subset
 * Gemini accepts.
 *
 * The only structural change is dropping `additionalProperties`. Every
 * property, type, description and `required` list is carried across verbatim,
 * which is what keeps the two providers comparable -- the model is being asked
 * for exactly the same shape, described in exactly the same words.
 */
export function toGeminiSchema(schema) {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== "object") return schema;

  const out = {};

  for (const [key, value] of Object.entries(schema)) {
    // Not in Gemini's dialect -- a schema carrying it is rejected outright.
    if (key === "additionalProperties") continue;

    if (key === "properties") {
      out.properties = Object.fromEntries(
        Object.entries(value).map(([name, sub]) => [name, toGeminiSchema(sub)])
      );
      continue;
    }

    out[key] = typeof value === "object" ? toGeminiSchema(value) : value;
  }

  // Gemini does not guarantee key order unless asked; matching the schema's
  // own declaration order keeps stored JSON diffable against Claude's.
  if (out.type === "object" && out.properties && !out.propertyOrdering) {
    out.propertyOrdering = Object.keys(out.properties);
  }

  return out;
}

export function createGeminiClient(apiKey) {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in .env");
  }

  return new GoogleGenAI({ apiKey });
}

/** Wait for an uploaded file to finish processing before it can be referenced. */
async function waitForActive(ai, name) {
  const deadline = Date.now() + FILE_ACTIVE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const file = await ai.files.get({ name });

    if (file.state === "ACTIVE") return file;
    if (file.state === "FAILED") {
      throw new Error(`Gemini rejected the uploaded file: ${file.error?.message ?? "no detail"}`);
    }

    await sleep(FILE_POLL_MS);
  }

  throw new Error("Uploaded file did not become ACTIVE in time.");
}

/**
 * Translate a prepared source into Gemini parts.
 *
 * Takes the same PreparedSource that the Claude path uses, so fetchSource.js
 * needs no changes and both providers read byte-identical documents.
 */
async function buildParts(ai, source, userPrompt) {
  // Oversized PDF: Gemini has its own Files API, separate from Anthropic's.
  if (source.needsUpload || source.buffer?.length > MAX_INLINE_BYTES) {
    const blob = new Blob([source.buffer], { type: "application/pdf" });

    const uploaded = await ai.files.upload({
      file: blob,
      config: { mimeType: "application/pdf" },
    });

    const active = await waitForActive(ai, uploaded.name);

    return [
      { fileData: { fileUri: active.uri, mimeType: active.mimeType } },
      { text: userPrompt },
    ];
  }

  const block = source.contentBlock;

  if (block.type === "text") {
    return [{ text: block.text }, { text: userPrompt }];
  }

  if (block.type === "document" && block.source?.type === "base64") {
    return [
      {
        inlineData: {
          mimeType: block.source.media_type,
          data: block.source.data,
        },
      },
      { text: userPrompt },
    ];
  }

  throw new Error(`Cannot convert content block of type "${block.type}" for Gemini.`);
}

/**
 * Generate one explanation.
 *
 * Mirrors the Claude path's contract: returns parsed JSON or a reason. Never
 * throws for expected conditions, so the caller records outcomes identically
 * regardless of provider.
 *
 * @returns {Promise<{ok: boolean, parsed?: object, reason?: string, model?: string}>}
 */
export async function generateWithGemini({
  ai,
  model = GEMINI_MODELS.DEFAULT,
  systemPrompt,
  userPrompt,
  schema,
  source,
  attempts = 3,
}) {
  let parts;

  try {
    parts = await buildParts(ai, source, userPrompt);
  } catch (error) {
    return { ok: false, reason: `Could not build request: ${error.message}` };
  }

  const config = {
    systemInstruction: systemPrompt,
    responseMimeType: "application/json",
    responseSchema: toGeminiSchema(schema),
  };

  let lastReason = "No attempt was made.";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;

    try {
      response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: { ...config, abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
      });
    } catch (error) {
      lastReason = `Gemini call failed: ${error.message}`;

      // Worth waiting out on a free tier: throttling, server errors, and
      // transport failures ("fetch failed", aborts). A 400 or 404 is not --
      // those fail immediately rather than burning the backoff.
      const retryable =
        /(429|500|502|503|504|quota|rate limit|timeout|abort|fetch failed|ECONN|ETIMEDOUT)/i.test(
          error.message || ""
        );

      if (!retryable || attempt === attempts) break;
      await sleep(attempt * 15000);
      continue;
    }

    const text = response.text;

    if (!text) {
      lastReason = `Gemini returned no text (finish reason: ${
        response.candidates?.[0]?.finishReason ?? "unknown"
      }).`;
      if (attempt === attempts) break;
      await sleep(2000);
      continue;
    }

    try {
      // responseSchema makes this near-certain, but a truncated response still
      // yields invalid JSON -- so it is retried rather than trusted.
      return { ok: true, parsed: JSON.parse(text), model };
    } catch {
      lastReason = `Gemini returned malformed JSON (${text.length} chars).`;
      if (attempt === attempts) break;
      await sleep(2000);
    }
  }

  return { ok: false, reason: lastReason };
}
