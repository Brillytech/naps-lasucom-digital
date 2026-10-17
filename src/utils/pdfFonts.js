/**
 * Unicode fonts for PDF export.
 *
 * jsPDF's built-in fonts (helvetica, times, courier) are simple Latin-1 fonts.
 * The moment a string contains any character above U+00FF -- a smart quote
 * pasted from Word, an en-dash, the Naira sign -- jsPDF re-encodes that whole
 * string as UTF-16BE and prefixes it with a byte-order mark. A simple font
 * renders one glyph per BYTE, so:
 *
 *   "The"  ->  00 54 00 68 00 65  ->  rendered as "T h e" with nulls between
 *   "₦"  ->  20 A6           ->  rendered as space + "¦"
 *
 * That single mechanism produced both the letter-spacing glitch and the broken
 * Naira symbol, and it explains why only *some* paragraphs were affected: one
 * curly apostrophe was enough to spoil an entire run.
 *
 * Embedding a real TrueType font makes jsPDF emit a composite font with proper
 * CID encoding, so text is measured and drawn from the font's own cmap. Both
 * problems disappear at the source rather than being worked around.
 *
 * The files are fetched at export time rather than bundled: they total ~2 MB,
 * this is an admin-only feature, and students on mobile data should never pay
 * for it. They are cached after the first export.
 */

const FONT_DIR = "/fonts";

/**
 * Noto covers the Currency Symbols block, so U+20A6 is a real glyph rather
 * than a fallback box. Serif carries the body -- an official record reads as
 * a document, not a UI -- and Sans carries labels and small caps.
 */
export const PDF_FONTS = {
  SERIF: "NotoSerif",
  SANS: "NotoSans",
  /** Signature marks on letters. Never used for anything that has to be read
   *  at size -- it is a rendered mark, not body type. */
  SCRIPT: "AlexBrush",
};

const FILES = [
  { file: "NotoSerif-Regular.ttf", family: PDF_FONTS.SERIF, style: "normal" },
  { file: "NotoSerif-Bold.ttf", family: PDF_FONTS.SERIF, style: "bold" },
  { file: "NotoSans-Regular.ttf", family: PDF_FONTS.SANS, style: "normal" },
  { file: "NotoSans-Bold.ttf", family: PDF_FONTS.SANS, style: "bold" },
  { file: "AlexBrush-Regular.ttf", family: PDF_FONTS.SCRIPT, style: "normal" },
];

/**
 * Italic faces, registered only for documents that use them.
 *
 * jsPDF embeds every font it is given, used or not -- each Noto face adds
 * roughly half a megabyte to the file. A letter with no italic text should
 * not carry four unused faces, so these are added on demand.
 */
const ITALIC_FILES = [
  { file: "NotoSerif-Italic.ttf", family: PDF_FONTS.SERIF, style: "italic" },
  { file: "NotoSerif-BoldItalic.ttf", family: PDF_FONTS.SERIF, style: "bolditalic" },
  { file: "NotoSans-Italic.ttf", family: PDF_FONTS.SANS, style: "italic" },
  { file: "NotoSans-BoldItalic.ttf", family: PDF_FONTS.SANS, style: "bolditalic" },
];

/**
 * Register the italic faces. Returns false (and the caller sets upright
 * text instead) if they cannot be loaded, rather than failing the export.
 */
export async function registerItalicFonts(doc, families = [PDF_FONTS.SERIF, PDF_FONTS.SANS]) {
  try {
    await registerFontFiles(doc, ITALIC_FILES.filter((f) => families.includes(f.family)));
    return true;
  } catch (error) {
    console.warn("Italic fonts unavailable, setting upright:", error.message);
    return false;
  }
}

/** jsPDF style name for a run. */
export function fontStyle(bold, italic) {
  if (bold && italic) return "bolditalic";
  if (italic) return "italic";
  return bold ? "bold" : "normal";
}

/** Base64 payload promises, keyed by filename. Each file is fetched once. */
const cache = {};

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  // Chunked: String.fromCharCode(...bytes) blows the call stack on a 500 KB
  // font.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + CHUNK)
    );
  }

  return btoa(binary);
}

function loadFile(file) {
  if (!cache[file]) {
    cache[file] = fetch(`${FONT_DIR}/${file}`).then(async (response) => {
      if (!response.ok) {
        delete cache[file];
        throw new Error(`Could not load ${file} (HTTP ${response.status})`);
      }
      return toBase64(await response.arrayBuffer());
    });
  }
  return cache[file];
}

/**
 * Register any set of font files ({ file, family, style }) on a document.
 * Throws if a file cannot be loaded; registerPdfFonts() below is the
 * forgiving wrapper the letters use.
 */
export async function registerFontFiles(doc, files) {
  const payloads = await Promise.all(files.map((entry) => loadFile(entry.file)));
  files.forEach((entry, i) => {
    doc.addFileToVFS(entry.file, payloads[i]);
    doc.addFont(entry.file, entry.family, entry.style);
  });
}

async function loadAll() {
  const payloads = await Promise.all(FILES.map((entry) => loadFile(entry.file)));
  return Object.fromEntries(FILES.map((entry, i) => [entry.file, payloads[i]]));
}

/**
 * Register the Unicode fonts on a jsPDF document.
 *
 * @returns {Promise<boolean>} true if the document can use PDF_FONTS, false if
 *   the files could not be loaded -- in which case the caller should fall back
 *   to a built-in font and accept its Latin-1 limits rather than fail the
 *   export outright.
 */
export async function registerPdfFonts(doc) {
  let payloads;

  try {
    payloads = await loadAll();
  } catch (error) {
    console.warn("PDF fonts unavailable, falling back to helvetica:", error.message);
    return false;
  }

  for (const entry of FILES) {
    doc.addFileToVFS(entry.file, payloads[entry.file]);
    doc.addFont(entry.file, entry.family, entry.style);
  }

  return true;
}

/**
 * Normalise text that came from a rich-text editor or a paste.
 *
 * With a Unicode font embedded, none of this is required for correctness --
 * curly quotes and dashes render properly now. It runs anyway because these
 * characters still cause trouble downstream (Excel export, filenames, search),
 * and because a record should read consistently whichever way it was typed.
 */
export function normaliseText(value) {
  if (value === null || value === undefined) return "";

  return String(value)
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ") // non-breaking space
    .replace(/[​-‍﻿]/g, "") // zero-width and BOM
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/…/g, "...")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/**
 * Format an amount for display.
 *
 * Records store `amount` as free text, so this only adds structure when the
 * value is recognisably a number -- "₦45,000" stays as typed, "45000" becomes
 * "₦45,000.00", and "Two hundred thousand naira" is left alone.
 *
 * The Naira sign is safe to emit now that the font carries the glyph; the old
 * output turned it into "¦".
 */
export function formatAmount(value) {
  const raw = normaliseText(value);
  if (!raw) return "";

  const numeric = raw.replace(/[₦NGN\s,]/gi, "");

  if (!/^-?\d+(\.\d+)?$/.test(numeric)) return raw;

  return `₦${Number(numeric).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
