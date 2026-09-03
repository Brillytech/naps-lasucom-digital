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
  body: [28, 32, 40],
  muted: [108, 116, 130],
  /** Footer dividers. Deliberately darker than the page rules -- the old
   *  value sat too close to white to read as a division at all. */
  divider: [176, 184, 198],
  /** Edge rails. Pale enough to sit under the text without pulling focus. */
  rail: [211, 222, 240],
  red: [190, 30, 45],
};

const M = 52;
const CONTENT = A4.w - M * 2;

/** Body never goes below this, however long the document runs. */
const MIN_BODY_PT = 10.5;
const MAX_BODY_PT = 12.5;

/** Subject band. Set once so the title is measured at the size it renders. */
const TITLE_PT = 13;

const FOOTER_H = 150;

/**
 * Letters run a slim foot instead.
 *
 * The officials strip names the same four people the signature blocks do, so
 * carrying both would say it twice. Letters are signed; memos are not, which
 * is why memos keep the strip.
 */
const LETTER_FOOTER_H = 66;
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
function accentBars(doc, rightEdge, y) {
  const bars = [
    { colour: C.green, h: 60 },
    { colour: C.blue, h: 45 },
    { colour: C.gold, h: 31 },
    { colour: C.deep, h: 20 },
  ];

  const w = 5.6;
  const gap = 6.4;
  const total = bars.length * (w + gap) - gap;

  // Right-aligned rather than placed from the left, so changing the weight
  // never walks the group off the margin.
  const x = rightEdge - total;

  bars.forEach((bar, i) => {
    doc.setFillColor(...bar.colour);
    doc.roundedRect(x + i * (w + gap), y, w, bar.h, w / 2, w / 2, "F");
  });

  return total;
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
  if (logo) doc.addImage(logo, "PNG", M, 40, 56, 56);

  const x = M + 68;

  setType(doc, PDF_FONTS.SANS, "bold", 16.5, C.deep);
  doc.text("NAPS-LASUCOM", x, 59, { charSpace: 0.2 });

  setType(doc, PDF_FONTS.SANS, "bold", 8.8, C.ink);
  doc.text("Nigeria Association of Physiotherapy Students", x, 74);

  setType(doc, PDF_FONTS.SANS, "normal", 8.6, C.body);
  doc.text("Lagos State University College of Medicine", x, 86);

  setType(doc, PDF_FONTS.SANS, "bold", 10, C.green);
  doc.text(`OFFICE OF THE ${String(office || "").toUpperCase()}`, x, 101, {
    charSpace: 0.6,
  });

  accentBars(doc, A4.w - M, 34);

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
function drawFooter(doc, { officials, email, instagram, setName, office }) {
  const top = A4.h - FOOTER_H;

  // A memo carries no signature, so the issuing office is stated instead.
  if (office) {
    setType(doc, PDF_FONTS.SANS, "bold", 7.4, C.muted);
    doc.text(
      `ISSUED BY THE OFFICE OF THE ${String(office).toUpperCase()}`,
      A4.w / 2,
      top - 15,
      { align: "center", charSpace: 0.5 }
    );
  }

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

/**
 * Who signs a letter.
 *
 * The issuing officer, attested by the General Secretary -- or by the
 * President where the Secretary is the one issuing it. Two blocks either way,
 * which is both the convention and what balances the page.
 */
function signatories(officials, officeLabel) {
  const issuer = officials.find((o) => o.office === officeLabel);
  const second = officials.find(
    (o) =>
      o.office ===
      (officeLabel === "General Secretary" ? "President" : "General Secretary")
  );

  return [issuer, second].filter((o) => o && o.name);
}

/**
 * Signature block.
 *
 * The script line is a rendered mark set from the name, not a scan of anyone's
 * hand. That is appropriate for routine correspondence, which is what this
 * composer is for, and not for anything that has to bind.
 */
function drawSignature(doc, person, x, y, width) {
  doc.setFont(PDF_FONTS.SCRIPT, "normal");

  let size = 25;
  while (size > 13) {
    doc.setFontSize(size);
    if (doc.getTextWidth(person.name) <= width - 6) break;
    size -= 0.5;
  }

  doc.setTextColor(...C.deep);
  doc.text(person.name, x + 4, y);

  doc.setDrawColor(...C.divider);
  doc.setLineWidth(0.9);
  doc.line(x, y + 9, x + width, y + 9);

  // fitted() leaves the font and size set, so the draw that follows inherits
  // whatever it settled on.
  fitted(doc, person.name, PDF_FONTS.SANS, "bold", 9.2, 7, width);
  doc.setTextColor(...C.ink);
  doc.text(person.name, x, y + 23);

  fitted(doc, person.office, PDF_FONTS.SANS, "bold", 8.2, 6.6, width);
  doc.setTextColor(...C.blue);
  doc.text(person.office, x, y + 35);
}

/** Slim foot for letters: contact details and the tenure, nothing more. */
function drawLetterFoot(doc, { email, instagram, setName }) {
  const top = A4.h - LETTER_FOOTER_H;

  doc.setDrawColor(...C.divider);
  doc.setLineWidth(0.8);
  doc.line(M, top, A4.w - M, top);

  const col = M + 200;

  setType(doc, PDF_FONTS.SANS, "bold", 6.8, C.red);
  doc.text("E-MAIL", M, top + 17, { charSpace: 0.5 });
  doc.text("INSTAGRAM", col, top + 17, { charSpace: 0.5 });

  setType(doc, PDF_FONTS.SANS, "normal", 7.8, C.ink);
  doc.text(normaliseText(email) || "—", M, top + 29);
  doc.text(normaliseText(instagram) || "—", col, top + 29);

  setType(doc, PDF_FONTS.SANS, "normal", 7.2, C.muted);
  doc.text(normaliseText(setName) || "NAPS-LASUCOM", A4.w - M, top + 29, {
    align: "right",
  });
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

/**
 * Crest watermark, sized and placed to occupy whatever the body leaves.
 *
 * A short memo used to end halfway down and leave the rest of the sheet
 * blank, which read as something missing rather than as margin. Filling that
 * region with the crest is what makes the space deliberate; on a full page
 * the region is small and the mark sits quietly behind the text as before.
 */
function drawWatermark(doc, mark, region) {
  if (!mark) return;

  const height = region.bottom - region.top;
  if (height < 120) return;

  const size = Math.max(190, Math.min(height * 0.94, 372));

  doc.saveGraphicsState();
  doc.setGState(new doc.GState({ opacity: height > 260 ? 0.085 : 0.055 }));
  doc.addImage(
    mark,
    "PNG",
    (A4.w - size) / 2,
    region.top + (height - size) / 2,
    size,
    size
  );
  doc.restoreGraphicsState();
}

/**
 * Closing mark: a short centred rule in the brand sequence, set below the
 * last paragraph so the text block visibly ends rather than just stopping.
 * Echoes the rails and the header bars so it reads as part of the furniture.
 */
function drawClosing(doc, y) {
  const w = 26;
  const gap = 6;
  const h = 2.4;
  const colours = [C.green, C.blue, C.gold];
  let x = (A4.w - (colours.length * w + (colours.length - 1) * gap)) / 2;

  colours.forEach((colour) => {
    doc.setFillColor(...colour);
    doc.roundedRect(x, y, w, h, h / 2, h / 2, "F");
    x += w + gap;
  });
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
function layoutBlocks(doc, blocks, width, size, leading, dryRun, startY, flow) {
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
      // Break before drawing, not after: a line committed past the limit is
      // one that has already run into the footer.
      if (!dryRun && flow && y > flow.limit) {
        doc.addPage();
        y = flow.resumeTop;
      }

      if (!dryRun) {
        if (block.type === "li" && index === 0) {
          setType(doc, PDF_FONTS.SERIF, "normal", blockSize, C.body);
          doc.text(block.marker, M, y);
        }

        const gaps = l.words.length - 1;

        // Justify, but stop short of stretching a sparse line into holes --
        // past roughly a space-and-a-half per gap the rivers cost more
        // legibility than a ragged right edge does, so that line goes flush.
        let extra = !l.last && gaps > 0 ? (usable - l.width) / gaps : 0;
        if (extra > sw * 0.85) extra = 0;
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

  if (!dryRun && flow) flow.endY = y;

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
  template = "memo",
  office,
  subject,
  date,
  reference,
  bodyHtml,
  officials = [],
  email,
  instagram,
  setName,
  recipient,
  salutation,
  closing,
  logo,
  watermark,
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  await registerPdfFonts(doc);

  // Letters are addressed and signed; memos are neither. Everything else --
  // the head, the rails, the band, the subject treatment -- is shared, because
  // it is one letterhead.
  const isLetter = template === "letter";
  const blocks = htmlToBlocks(bodyHtml);

  const footerTop = A4.h - (isLetter ? LETTER_FOOTER_H : FOOTER_H);

  const recipientLines = isLetter
    ? normaliseText(recipient).split(/\r?\n/).filter(Boolean)
    : [];

  const recipTop = 168;
  const recipEnd = recipientLines.length
    ? recipTop + (recipientLines.length - 1) * 14.5
    : recipTop - 14.5;
  const salutationY = recipEnd + 28;

  const titleY = isLetter ? salutationY + 26 : 162;

  // Measure the title in the face it is actually set in: splitting under
  // whatever font happened to be current breaks the lines for the wrong width.
  doc.setFont(PDF_FONTS.SANS, "bold");
  doc.setFontSize(TITLE_PT);
  const titleLines = doc.splitTextToSize(
    normaliseText(subject) || "Subject",
    CONTENT - 56
  );
  const titleH = 24 + titleLines.length * 18;

  const bodyTop = titleY + titleH + 36;

  // A letter must keep room under the body for the close and the two
  // signature blocks, or they would be pushed onto a page of their own.
  const signSpace = isLetter ? 132 : 18;
  const available = footerTop - signSpace - bodyTop;

  const flow = { limit: footerTop - 24, resumeTop: 96, endY: 0 };

  // Largest size that still fits one page, then settle at the floor.
  let size = MAX_BODY_PT;
  let leading = size * 1.62;
  let used = 0;

  for (; size >= MIN_BODY_PT; size -= 0.25) {
    leading = size * 1.62;
    used = layoutBlocks(doc, blocks, CONTENT, size, leading, true, bodyTop);
    if (used <= available) break;
  }
  if (size < MIN_BODY_PT) {
    size = MIN_BODY_PT;
    leading = size * 1.62;
    used = layoutBlocks(doc, blocks, CONTENT, size, leading, true, bodyTop);
  }

  const onePage = used <= available;
  const bodyEnd = bodyTop + used;

  drawWatermark(doc, watermark, {
    top: onePage ? bodyEnd + (isLetter ? 118 : 34) : bodyTop,
    bottom: footerTop - 20,
  });
  drawRails(doc);
  drawHead(doc, { office, logo });

  setType(doc, PDF_FONTS.SANS, "bold", 8.4, C.muted);
  doc.text(`REF: ${normaliseText(reference) || "—"}`, M, 140, { charSpace: 0.4 });
  doc.text(`DATE: ${String(date || "").toUpperCase()}`, A4.w - M, 140, {
    align: "right",
    charSpace: 0.4,
  });

  if (isLetter) {
    setType(doc, PDF_FONTS.SERIF, "normal", 10.5, C.ink);
    recipientLines.forEach((line, n) =>
      doc.text(line, M, recipTop + n * 14.5)
    );

    setType(doc, PDF_FONTS.SERIF, "normal", 11, C.ink);
    doc.text(normaliseText(salutation) || "Dear Sir/Ma,", M, salutationY);
  }

  // Solid rather than tinted: against a page this open, a wash of pale blue
  // had no more presence than the paper. This bookends the footer band.
  doc.setFillColor(...C.deep);
  doc.rect(M, titleY, CONTENT, titleH, "F");
  doc.setFillColor(...C.green);
  doc.rect(M, titleY, 5, titleH, "F");
  doc.setFillColor(...C.gold);
  doc.rect(M, titleY + titleH, CONTENT, 2, "F");

  setType(doc, PDF_FONTS.SANS, "bold", TITLE_PT, [255, 255, 255]);
  titleLines.forEach((line, n) => {
    doc.text(line, M + CONTENT / 2, titleY + 27 + n * 18, { align: "center" });
  });

  layoutBlocks(doc, blocks, CONTENT, size, leading, false, bodyTop, flow);

  if (isLetter) {
    // The body may have run onto a later page, so the close hangs off where
    // the text actually finished. If the signatures will not fit under it,
    // they take a page of their own rather than colliding with the foot.
    let closeY = (onePage ? bodyEnd : flow.endY) + 26;

    if (closeY + signSpace - 26 > footerTop) {
      doc.addPage();
      closeY = flow.resumeTop + 24;
    }

    setType(doc, PDF_FONTS.SERIF, "normal", 11, C.ink);
    doc.text(normaliseText(closing) || "Yours faithfully,", M, closeY);

    const signers = signatories(officials, office);
    const colW = CONTENT / 2 - 18;

    signers.slice(0, 2).forEach((person, n) => {
      drawSignature(doc, person, M + n * (colW + 36), closeY + 48, colW);
    });
  } else if (onePage) {
    drawClosing(doc, bodyEnd + 18);
  }

  const total = doc.internal.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    // Page one is drawn above; later pages get the rails here.
    if (page > 1) drawRails(doc);

    if (isLetter) {
      drawLetterFoot(doc, { email, instagram, setName });
    } else {
      drawFooter(doc, { officials, email, instagram, setName, office });
    }

    drawBand(doc, page, total);
  }

  return doc;
}
