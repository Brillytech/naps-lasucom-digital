/**
 * Turns a resources row into something the Claude API can read.
 *
 * The materials in this table are not all PDFs. Roughly: half are Google
 * Slides, a third are uploaded Drive files, and the rest are Google Docs --
 * plus at least one MP4 that somebody uploaded as a lecture. Each needs a
 * different route, and the non-documents need to be caught before they reach
 * the model rather than after.
 */

import {
  getDriveFileId,
  isGoogleDriveLink,
} from "../src/utils/driveLinks.js";

import { EXTRACTION, SOURCE_KIND } from "./explanationSchema.js";

/**
 * Anthropic caps a request at 32 MB, and base64 inflates by 4/3. Stay well
 * under: 20 MB raw is ~27 MB encoded.
 */
const MAX_RAW_BYTES = 20 * 1024 * 1024;

const FETCH_TIMEOUT_MS = 120_000;

/** Detect real file type from magic bytes -- never trust the extension. */
export function sniffFileType(buffer) {
  if (buffer.length < 8) return "empty";

  const hex = buffer.subarray(0, 4).toString("hex");
  const atFour = buffer.subarray(4, 8).toString("ascii");

  if (hex === "25504446") return "pdf"; // %PDF
  if (hex === "504b0304") return "office_zip"; // pptx / docx / xlsx
  if (hex === "d0cf11e0") return "office_legacy"; // .ppt / .doc
  if (atFour === "ftyp") return "video";
  if (hex.startsWith("ffd8ff")) return "image_jpeg";
  if (hex === "89504e47") return "image_png";
  if (hex === "47494638") return "image_gif";
  if (hex === "1f8b0800") return "gzip";

  const asText = buffer.subarray(0, 400).toString("utf8");
  if (/^\s*<(!doctype|html)/i.test(asText)) return "html";

  return "unknown";
}

function classifyLink(url) {
  if (!url) return null;
  if (!isGoogleDriveLink(url)) return null;

  const fileId = getDriveFileId(url);
  if (!fileId) return null;

  if (/docs\.google\.com\/presentation\//.test(url)) {
    return {
      kind: SOURCE_KIND.GOOGLE_SLIDES,
      fetchUrl: `https://docs.google.com/presentation/d/${fileId}/export/pdf`,
    };
  }

  if (/docs\.google\.com\/document\//.test(url)) {
    return {
      kind: SOURCE_KIND.GOOGLE_DOC,
      // Plain text, not PDF: cheaper, cleaner, and nothing is lost since a
      // Doc has no layout worth preserving for this purpose.
      fetchUrl: `https://docs.google.com/document/d/${fileId}/export?format=txt`,
    };
  }

  if (/docs\.google\.com\/spreadsheets\//.test(url)) {
    return {
      kind: SOURCE_KIND.DRIVE_FILE,
      fetchUrl: `https://docs.google.com/spreadsheets/d/${fileId}/export?format=pdf`,
    };
  }

  return {
    kind: SOURCE_KIND.DRIVE_FILE,
    fetchUrl: `https://drive.usercontent.google.com/download?id=${fileId}&export=download`,
  };
}

async function download(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching source`);
    }

    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @typedef {object} PreparedSource
 * @property {boolean} ok
 * @property {string}  [reason]            Why it was rejected.
 * @property {boolean} [unsupported]       True when retrying will never help.
 * @property {object}  [contentBlock]      Ready to drop into message content.
 * @property {string}  [extractionMethod]
 * @property {string}  [sourceKind]
 * @property {number}  [bytes]
 */

/**
 * Fetch a material and return a content block, or an explanation of why not.
 *
 * Never throws for expected conditions -- callers decide how to record them.
 *
 * @returns {Promise<PreparedSource>}
 */
export async function prepareSource(resource) {
  const url = resource.external_link?.trim() || resource.file_url?.trim() || "";

  if (!url) {
    return { ok: false, unsupported: true, reason: "Row has no link at all." };
  }

  const target = classifyLink(url);

  if (!target) {
    return {
      ok: false,
      unsupported: true,
      reason: `Link is not a recognisable Google Drive or Docs URL: ${url.slice(0, 120)}`,
    };
  }

  let buffer;

  try {
    buffer = await download(target.fetchUrl);
  } catch (error) {
    // A network failure is worth retrying, so this is not "unsupported".
    return { ok: false, reason: `Could not fetch source: ${error.message}` };
  }

  if (buffer.length === 0) {
    return { ok: false, reason: "Source downloaded as zero bytes." };
  }

  // --- Google Docs come back as text, and need no sniffing ---
  if (target.kind === SOURCE_KIND.GOOGLE_DOC) {
    const text = buffer.toString("utf8").replace(/^﻿/, "").trim();

    if (text.length < 200) {
      return {
        ok: false,
        unsupported: true,
        reason: `Google Doc exported only ${text.length} characters -- effectively empty.`,
      };
    }

    return {
      ok: true,
      contentBlock: { type: "text", text },
      extractionMethod: EXTRACTION.TEXT,
      sourceKind: target.kind,
      bytes: buffer.length,
    };
  }

  // --- Everything else should be a PDF by this point ---
  const detected = sniffFileType(buffer);

  if (detected === "html") {
    // Drive serves an HTML interstitial when a file is not publicly shared,
    // or when it has hit a download quota. Both are worth retrying.
    return {
      ok: false,
      reason:
        "Drive returned an HTML page instead of the file -- it is probably not shared publicly, or hit a download quota.",
    };
  }

  if (detected !== "pdf") {
    const label = {
      video: "a video file",
      image_jpeg: "a JPEG image",
      image_png: "a PNG image",
      image_gif: "a GIF image",
      office_zip: "an Office file (.pptx/.docx) that Drive will not export as PDF",
      office_legacy: "a legacy Office file (.ppt/.doc)",
      empty: "an empty file",
      gzip: "a compressed archive",
      unknown: "a file of unrecognised type",
    }[detected];

    return {
      ok: false,
      unsupported: true,
      reason: `Source is ${label}, not a readable document (detected: ${detected}, ${buffer.length} bytes). Convert it in Drive and set this row back to pending.`,
    };
  }

  if (buffer.length > MAX_RAW_BYTES) {
    return {
      ok: false,
      unsupported: true,
      reason: `PDF is ${(buffer.length / 1024 / 1024).toFixed(1)} MB, over the ${
        MAX_RAW_BYTES / 1024 / 1024
      } MB request limit.`,
    };
  }

  return {
    ok: true,
    contentBlock: {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: buffer.toString("base64"),
      },
    },
    extractionMethod: EXTRACTION.PDF_NATIVE,
    sourceKind: target.kind,
    bytes: buffer.length,
  };
}
