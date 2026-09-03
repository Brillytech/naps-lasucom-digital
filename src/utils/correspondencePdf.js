import jsPDF from "jspdf";
import { PDF_FONTS, registerPdfFonts, normaliseText } from "./pdfFonts";

/**
 * Renders NAPS-LASUCOM correspondence to PDF.
 *
 * Shares the font pipeline with the records export, so the Naira sign and
 * pasted curly quotes render correctly here too -- see pdfFonts.js for why
 * that needs an embedded Unicode face.
 *
 * The composer previews by rasterising this output rather than mirroring it
 * in CSS, so what is on screen while typing is the file that gets exported.
 */

const A4 = { w: 595.28, h: 841.89 };

const C = {
  blue: [7, 82, 184],
  deep: [8, 43, 99],
  green: [34, 164, 71],
  gold: [222, 164, 20],
  ink: [22, 24, 30],
  body: [40, 44, 52],
  muted: [108, 116, 130],
  /** Footer dividers. Deliberately darker than the page rules -- the old
   *  value sat too close to white to read as a division at all. */
  divider: [176, 184, 198],
  wash: [238, 244, 252],
  /** Edge rails. Pale enough to sit under the text without pulling focus. */
  rail: [211, 222, 240],
  red: [190, 30, 45],
};

const M = 52;
const CONTENT = A4.w - M * 2;

/** Body never goes below this, however long the document runs. */
const MIN_BODY_PT = 9.5;
const MAX_BODY_PT = 11.5;

const FOOTER_H = 150;
const BAND_H = 26;

export const OFFICES = [
  { id: "president", label: "President", match: ["president"] },
  { id: "vice_president", label: "Vice President", match: ["vice president"] },
  {
    id: "general_secretary",
    label: "General Secretary",
    match: ["general secretary"],
  },
  { id: "pro", label: "P.R.O", match: ["pro", "p.r.o", "public relations officer"] },
];

/**
 * Pick the four signatory offices out of whatever the executives table holds.
 * Matched on the office string because role slugs are not populated there.
 */
export function pickOfficials(executives = []) {
  return OFFICES.map((office) => {
    const row = executives.find((e) => {
      const name = String(e.office || "").trim().toLowerCase();
      // Guard against "Assistant General Secretary" matching "general secretary".
      if (name.startsWith("assistant")) return false;
      return office.match.some((m) => name === m || name === `${m} officer`);
    });

    return {
      office: office.label,
      name: row ? row.full_name || row.name || "" : "",
      phone: row?.phone || "",
    };
  });
}

const setType = (doc, family, style, size, colour) => {
  doc.setFont(family, style);
  doc.setFontSize(size);
  doc.setTextColor(...colour);
};

/** Shrink a string until it fits, never past `floor`. */
function fitted(doc, text, family, style, max, floor, width) {
  let size = max;
  doc.setFont(family, style);
  while (size > floor) {
    doc.setFontSize(size);
    if (doc.getTextWidth(text) <= width) break;
    size -= 0.25;
  }
  return size;
}

/**
 * Staggered accent bars.
 *
 * Thin, rounded, and of varying height rather than one flat block: the eye
 * reads the rhythm as deliberate. Heights follow a fixed pattern so every
 * document looks the same rather than randomly generated.
 */
function accentBars(doc, x, y) {
  const bars = [
    { colour: C.green, h: 52 },
    { colour: C.blue, h: 38 },
    { colour: C.gold, h: 26 },
    { colour: C.deep, h: 16 },
  ];

  const w = 3.4;
  const gap = 5.2;

  bars.forEach((bar, i) => {
    doc.setFillColor(...bar.colour);
    doc.roundedRect(x + i * (w + gap), y, w, bar.h, w / 2, w / 2, "F");
  });

  return bars.length * (w + gap) - gap;
}

/**
 * Edge rails.
 *
 * A hairline down each side margin: a pale spine the full height of the page,
 * with the brand sequence set into its head as separated segments. The gaps
 * are deliberate -- butting the segments together at this width leaves a
 * pinch where the rounded caps meet, and reading them as distinct marks is
 * cleaner than trying to hide that.
 *
 * Kept to 2.6pt and out in the gutter beyond the text margin: at this weight
 * it registers as letterhead furniture rather than decoration competing with
 * the body.
 */
function drawRails(doc) {
  const w = 2.6;
  const r = w / 2;
  const top = 40;
  const bottom = A4.h - BAND_H - 20;
  const height = bottom - top;

  const left = 26;
  const right = A4.w - 26 - w;

  doc.setFillColor(...C.rail);
  doc.roundedRect(left, top, w, height, r, r, "F");

  // Shares rather than fixed lengths, so the rail keeps its proportions if
  // the page format ever changes.
  const gap = 5;
  let y = top;

  [
    [C.green, 0.13],
    [C.blue, 0.15],
    [C.gold, 0.045],
  ].forEach(([colour, share]) => {
    const h = height * share;
    doc.setFillColor(...colour);
    doc.roundedRect(left, y, w, h, r, r, "F");
    y += h + gap;
  });

  // The right edge answers the left, anchored at the foot so the page reads
  // as framed rather than weighted down one side.
  const tail = height * 0.2;
  doc.setFillColor(...C.rail);
  doc.roundedRect(right, bottom - tail, w, tail, r, r, "F");

  doc.setFillColor(...C.deep);
  doc.roundedRect(right, bottom - tail * 0.42, w, tail * 0.42, r, r, "F");
}

/** Header: crest, wordmark, issuing office, and the rule beneath. */
function drawHead(doc, { office, logo }) {
  if (logo) doc.addImage(logo, "PNG", M, 40, 52, 52);

  const x = M + 64;

  setType(doc, PDF_FONTS.SANS, "bold", 15, C.deep);
  doc.text("NAPS-LASUCOM", x, 58);

  setType(doc, PDF_FONTS.SANS, "normal", 8.4, C.body);
  doc.text("Nigeria Association of Physiotherapy Students", x, 72);
  doc.text("Lagos State University College of Medicine", x, 84);

  setType(doc, PDF_FONTS.SANS, "bold", 9.2, C.green);
  doc.text(`OFFICE OF THE ${String(office || "").toUpperCase()}`, x, 99, {
    charSpace: 0.5,
  });

  accentBars(doc, A4.w - M - 33, 34);

  doc.setFillColor(...C.blue);
  doc.rect(M, 112, CONTENT, 2.6, "F");
  doc.setFillColor(...C.green);
  doc.rect(M, 112, CONTENT * 0.28, 2.6, "F");
}

/**
 * Officials row plus contact column.
 *
 * Given real data this has to cope with names like "Anibaba Oluwadarasimi
 * Brilliance" in a fifth of the page width, so every string fits itself to
 * its column rather than wrapping into the line below.
 */
function drawFooter(doc, { officials, email, instagram, setName }) {
  const top = A4.h - FOOTER_H;

  doc.setDrawColor(...C.divider);
  doc.setLineWidth(0.8);
  doc.line(M, top, A4.w - M, top);

  const cols = officials.length + 1;
  const colW = CONTENT / cols;
  const pad = 11;
  const inner = colW - pad * 2;
  const y = top + 30;

  officials.forEach((person, i) => {
    const x = M + i * colW + pad;

    if (i > 0) {
      doc.setDrawColor(...C.divider);
      doc.setLineWidth(0.7);
      doc.line(M + i * colW, top + 16, M + i * colW, top + 104);
    }

    // Real names run long -- "Anibaba Oluwadarasimi Brilliance" cannot fit a
    // fifth of the page on one line at any legible size. Shrink a little,
    // then wrap to a second line rather than shrinking into illegibility or
    // spilling into the next column.
    const name = person.name || "—";
    doc.setFont(PDF_FONTS.SERIF, "bold");

    const nameSize = 8.4;
    doc.setFontSize(nameSize);

    let nameLines = doc.splitTextToSize(name, inner);

    // Past two lines, abbreviate middle names rather than clamping -- cutting
    // a line off silently loses part of someone's name, which is worse than
    // either wrapping or shrinking.
    if (nameLines.length > 2) {
      const parts = name.split(/\s+/).filter(Boolean);
      const shortened =
        parts.length > 2
          ? [parts[0], ...parts.slice(1, -1).map((p) => `${p[0]}.`), parts.at(-1)].join(" ")
          : name;
      nameLines = doc.splitTextToSize(shortened, inner);
    }

    nameLines = nameLines.slice(0, 2);
    doc.setTextColor(...C.ink);
    nameLines.forEach((line, n) => doc.text(line, x, y + n * (nameSize + 2)));

    // Everything below starts under however many lines the name took, so a
    // two-line name pushes its own column down rather than colliding.
    const below = y + (nameLines.length - 1) * (nameSize + 2);

    // The DEC set is whichever one is marked current on the Executives page,
    // not a fixed string -- it changes at every handover.
    const tenure = normaliseText(setName) || "NAPS-LASUCOM";
    fitted(doc, tenure, PDF_FONTS.SANS, "normal", 6.6, 5.2, inner);
    doc.setTextColor(...C.muted);
    doc.text(tenure, x, below + 14);

    fitted(doc, person.office, PDF_FONTS.SANS, "bold", 8.2, 6.4, inner);
    doc.setTextColor(...C.blue);
    doc.text(person.office, x, below + 30);

    setType(doc, PDF_FONTS.SANS, "normal", 7.6, C.ink);
    doc.text(person.phone || "—", x, below + 44);
  });

  // Contact column, with its own generous rhythm so the handle never
  // collides with the label above it.
  const cx = M + officials.length * colW + pad;

  doc.setDrawColor(...C.divider);
  doc.setLineWidth(0.7);
  doc.line(M + officials.length * colW, top + 16, M + officials.length * colW, top + 104);

  const contact = [
    ["E-mail", email],
    ["Instagram", instagram],
  ];

  let cy = y;
  for (const [label, value] of contact) {
    setType(doc, PDF_FONTS.SANS, "bold", 6.6, C.red);
    doc.text(label.toUpperCase(), cx, cy, { charSpace: 0.5 });

    const v = normaliseText(value) || "—";
    fitted(doc, v, PDF_FONTS.SANS, "normal", 7.6, 5.6, inner);
    doc.setTextColor(...C.ink);
    doc.text(v, cx, cy + 12);

    cy += 34;
  }
}

function drawBand(doc, page, total) {
  const y = A4.h - BAND_H;

  doc.setFillColor(...C.deep);
  doc.rect(0, y, A4.w, BAND_H, "F");

  const quarter = A4.w / 4;
  [C.green, C.blue, C.gold, C.deep].forEach((colour, i) => {
    doc.setFillColor(...colour);
    doc.rect(i * quarter, y - 3, quarter, 3, "F");
  });

  setType(doc, PDF_FONTS.SANS, "normal", 7, [206, 224, 250]);
  doc.text("Strength in Knowledge, Service to Humanity", M, y + 16);
  doc.text(`Page ${page} of ${total}`, A4.w - M, y + 16, { align: "right" });
}

function drawWatermark(doc, mark) {
  if (!mark) return;
  const size = 300;
  doc.saveGraphicsState();
  doc.setGState(new doc.GState({ opacity: 0.06 }));
  doc.addImage(mark, "PNG", (A4.w - size) / 2, A4.h / 2 - size / 2 - 30, size, size);
  doc.restoreGraphicsState();
}

/**
 * Flatten the editor's HTML into styled runs.
 *
 * Deliberately small: the composer only offers bold, italic, underline,
 * headings and lists, so this handles exactly those rather than pulling in a
 * parser.
 */
export function htmlToBlocks(html) {
  if (typeof document === "undefined") return [];

  const root = document.createElement("div");
  root.innerHTML = html || "";

  const blocks = [];

  const runsOf = (node, inherited = {}) => {
    const runs = [];
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) {
        const text = child.textContent.replace(/\s+/g, " ");
        if (text.trim()) runs.push({ text, ...inherited });
        return;
      }
      if (child.nodeType !== 1) return;

      const tag = child.tagName.toLowerCase();
      const style = {
        ...inherited,
        bold: inherited.bold || tag === "b" || tag === "strong",
        italic: inherited.italic || tag === "i" || tag === "em",
      };
      runs.push(...runsOf(child, style));
    });
    return runs;
  };

  root.childNodes.forEach((node) => {
    if (node.nodeType === 3) {
      const text = node.textContent.trim();
      if (text) blocks.push({ type: "p", runs: [{ text }] });
      return;
    }
    if (node.nodeType !== 1) return;

    const tag = node.tagName.toLowerCase();

    if (tag === "ul" || tag === "ol") {
      [...node.children].forEach((li, i) => {
        blocks.push({
          type: "li",
          marker: tag === "ol" ? `${i + 1}.` : "•",
          runs: runsOf(li),
        });
      });
      return;
    }

    if (/^h[1-6]$/.test(tag)) {
      blocks.push({ type: "h", runs: runsOf(node, { bold: true }) });
      return;
    }

    const runs = runsOf(node);
    if (runs.length) blocks.push({ type: "p", runs });
  });

  return blocks;
}

/** Lay runs out as justified lines, returning the height used. */
function layoutBlocks(doc, blocks, width, size, leading, dryRun, startY) {
  let y = startY;

  const spaceWidth = () => {
    doc.setFont(PDF_FONTS.SERIF, "normal");
    doc.setFontSize(size);
    return doc.getTextWidth(" ");
  };

  for (const block of blocks) {
    const isHeading = block.type === "h";
    const blockSize = isHeading ? size + 1.5 : size;
    const indent = block.type === "li" ? 16 : 0;
    const usable = width - indent;

    const words = [];
    for (const run of block.runs) {
      for (const w of run.text.split(" ").filter(Boolean)) {
        words.push({ w, bold: run.bold || isHeading, italic: run.italic });
      }
    }

    const measure = (word) => {
      doc.setFont(PDF_FONTS.SERIF, word.bold ? "bold" : "normal");
      doc.setFontSize(blockSize);
      return doc.getTextWidth(word.w);
    };

    const sw = spaceWidth();
    const lines = [];
    let line = [];
    let lineW = 0;

    for (const word of words) {
      const ww = measure(word);
      if (line.length && lineW + sw + ww > usable) {
        lines.push({ words: line, width: lineW });
        line = [word];
        lineW = ww;
      } else {
        lineW += (line.length ? sw : 0) + ww;
        line.push(word);
      }
    }
    if (line.length) lines.push({ words: line, width: lineW, last: true });

    lines.forEach((l, index) => {
      if (!dryRun) {
        if (block.type === "li" && index === 0) {
          setType(doc, PDF_FONTS.SERIF, "normal", blockSize, C.body);
          doc.text(block.marker, M, y);
        }

        const gaps = l.words.length - 1;
        const extra = !l.last && gaps > 0 ? (usable - l.width) / gaps : 0;
        let x = M + indent;

        for (const word of l.words) {
          doc.setFont(PDF_FONTS.SERIF, word.bold ? "bold" : "normal");
          doc.setFontSize(blockSize);
          doc.setTextColor(...(isHeading ? C.ink : C.body));
          doc.text(word.w, x, y);
          x += measure(word) + sw + extra;
        }
      }
      y += leading;
    });

    y += leading * (isHeading ? 0.5 : 0.4);
  }

  return y - startY;
}

/**
 * Build the document.
 *
 * Legibility is the hard constraint: the body shrinks only as far as
 * MIN_BODY_PT to pull a slightly-long document onto one page, and past that
 * it flows onto another page rather than shrinking further.
 */
export async function renderCorrespondence({
  office,
  subject,
  date,
  reference,
  bodyHtml,
  officials,
  email,
  instagram,
  setName,
  logo,
  watermark,
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  await registerPdfFonts(doc);

  const blocks = htmlToBlocks(bodyHtml);

  const bodyTop = 232;
  const available = A4.h - FOOTER_H - 18 - bodyTop;

  // Try the largest size that fits one page, then settle at the floor.
  let size = MAX_BODY_PT;
  let leading = size * 1.62;

  for (; size >= MIN_BODY_PT; size -= 0.25) {
    leading = size * 1.62;
    if (layoutBlocks(doc, blocks, CONTENT, size, leading, true, bodyTop) <= available) break;
  }
  if (size < MIN_BODY_PT) {
    size = MIN_BODY_PT;
    leading = size * 1.62;
  }

  drawWatermark(doc, watermark);
  drawRails(doc);
  drawHead(doc, { office, logo });

  setType(doc, PDF_FONTS.SANS, "bold", 8.4, C.muted);
  doc.text(`REF: ${normaliseText(reference) || "—"}`, M, 140, { charSpace: 0.4 });
  doc.text(`DATE: ${String(date || "").toUpperCase()}`, A4.w - M, 140, {
    align: "right",
    charSpace: 0.4,
  });

  const titleY = 162;
  const titleLines = doc.splitTextToSize(normaliseText(subject) || "Subject", CONTENT - 40);
  const titleH = 20 + titleLines.length * 17;

  doc.setFillColor(...C.wash);
  doc.rect(M, titleY, CONTENT, titleH, "F");
  doc.setFillColor(...C.green);
  doc.rect(M, titleY, 4, titleH, "F");

  setType(doc, PDF_FONTS.SANS, "bold", 12.5, C.deep);
  titleLines.forEach((line, i) => {
    doc.text(line, M + CONTENT / 2, titleY + 24 + i * 17, { align: "center" });
  });

  layoutBlocks(doc, blocks, CONTENT, size, leading, false, bodyTop);

  const total = doc.internal.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    // Page one is drawn above; later pages get the rails here.
    if (page > 1) drawRails(doc);
    drawFooter(doc, { officials, email, instagram, setName });
    drawBand(doc, page, total);
  }

  return doc;
}
