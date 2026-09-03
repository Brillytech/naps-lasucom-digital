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

/*
  White paper, blue brand, green used three times.

  The palette was blue, navy, green, gold and red, which read as busy rather
  than official. Gold and red are gone entirely. What replaces them is not a
  substitute colour but two further tints of the same blue: a mark built from
  one hue in four values reads as deliberate in a way four hues never do.

  Green appears in exactly three places, all structural and all at the edges
  of the page -- the head of the header rule, the flag on the subject band,
  and the tail of the footer strip. That is enough to register as the
  organisation's second colour without ever competing with the blue.
*/
const C = {
  blue: [7, 82, 184],
  deep: [8, 43, 99],
  /** A mid tint of the same blue, carrying the work gold used to. */
  sky: [92, 143, 214],
  green: [34, 164, 71],
  ink: [22, 24, 30],
  body: [28, 32, 40],
  muted: [108, 116, 130],
  /** Footer dividers. Deliberately darker than the page rules -- the old
   *  value sat too close to white to read as a division at all. */
  divider: [176, 184, 198],
  /** Edge rails. Pale enough to sit under the text without pulling focus. */
  rail: [211, 222, 240],
  /** Reference band. A wash, not a fill -- it groups the line without
   *  becoming a second banner competing with the subject. */
  wash: [239, 244, 251],
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
    [C.deep, 0.13],
    [C.blue, 0.15],
    [C.sky, 0.045],
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

/**
 * Masthead.
 *
 * Centred, and sized so the three lines read as one block: 27pt for the
 * name is enough to carry the page without the drop to the lines beneath
 * becoming a cliff. Filling the full width had meant 40pt, which dominated
 * everything under it.
 *
 * The block's height is matched to the crest -- the name's cap line sits
 * level with the top of the seal and the college line with its foot -- so
 * the two read as one masthead rather than a mark with text next to it.
 */
function drawHead(doc, { office, logo }) {
  if (logo) doc.addImage(logo, "PNG", M, 33, 68, 68);

  const mid = A4.w / 2;

  setType(doc, PDF_FONTS.SANS, "bold", 27, C.deep);
  doc.text("NAPS-LASUCOM", mid, 63, { align: "center", charSpace: 1.4 });

  setType(doc, PDF_FONTS.SANS, "bold", 12.5, C.ink);
  doc.text("Nigeria Association of Physiotherapy Students", mid, 81, {
    align: "center",
  });

  setType(doc, PDF_FONTS.SANS, "normal", 11.5, C.body);
  doc.text("Lagos State University College of Medicine", mid, 97, {
    align: "center",
  });

  /*
    A stacked rule: 2.6pt of blue with a hairline set below it. It is the
    oldest device on a letterhead, and with the corner bars gone it is what
    gives the header a floor.
  */
  doc.setFillColor(...C.blue);
  doc.rect(M, 109, CONTENT, 2.6, "F");
  doc.setFillColor(...C.green);
  doc.rect(M, 109, CONTENT * 0.24, 2.6, "F");

  doc.setFillColor(...C.sky);
  doc.rect(M, 115, CONTENT, 0.8, "F");

  /*
    The issuing office sits below the rule, centred between two hairlines
    that run out to the margins. It belongs to the document rather than to
    the letterhead -- it changes with every office -- and in the corner it
    read as something left over.
  */
  const label = `OFFICE OF THE ${String(office || "").toUpperCase()}`;
  const track = 0.9;

  setType(doc, PDF_FONTS.SANS, "bold", 10.2, C.blue);
  const half = (doc.getTextWidth(label) + track * (label.length - 1)) / 2;
  doc.text(label, mid, 134, { align: "center", charSpace: track });

  doc.setDrawColor(...C.rail);
  doc.setLineWidth(0.9);
  doc.line(M, 130.5, mid - half - 14, 130.5);
  doc.line(mid + half + 14, 130.5, A4.w - M, 130.5);
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
      nameLines = doc.splitTextToSize(shortenName(name), inner);
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
    setType(doc, PDF_FONTS.SANS, "bold", 6.6, C.muted);
    doc.text(label.toUpperCase(), cx, cy, { charSpace: 0.5 });

    const v = normaliseText(value) || "—";
    fitted(doc, v, PDF_FONTS.SANS, "normal", 7.6, 5.6, inner);
    doc.setTextColor(...C.ink);
    doc.text(v, cx, cy + 12);

    cy += 34;
  }
}

/** Signatory offices, in order of precedence. The P.R.O does not sign. */
export const SIGNING_OFFICES = ["President", "Vice President", "General Secretary"];

/**
 * Who signs a letter: the three principal officers, always in the same order
 * whichever office issued it. A letter to a Provost carries the executive,
 * not just its author.
 */
function signatories(officials) {
  return SIGNING_OFFICES.map((label) =>
    officials.find((o) => o.office === label)
  ).filter((o) => o && o.name);
}

/**
 * First name, middle initials, surname.
 *
 * Three signature blocks leave about 148pt each, and a name like "Anibaba
 * Oluwadarasimi Brilliance" cannot be set in a script face at that width
 * without shrinking to something illegible. Initialising the middle names is
 * how the name is written on a signature anyway.
 */
function shortenName(name) {
  const parts = String(name).split(/\s+/).filter(Boolean);
  if (parts.length < 3) return name;

  return [parts[0], ...parts.slice(1, -1).map((w) => `${w[0]}.`), parts.at(-1)].join(" ");
}

/**
 * Signature block.
 *
 * With `signed`, the script line is a rendered mark set from the name -- not a
 * scan of anyone's hand, which suits routine correspondence and nothing that
 * has to bind. Without it the space is simply left clear for a pen, which is
 * what a letter going out on paper needs.
 */
function drawSignature(doc, person, x, y, width, signed) {
  if (signed) {
    // Try the full name, fall back to initialised middle names, and only then
    // shrink -- dropping to 11pt to fit a long name reads as a mistake.
    let mark = person.name;
    doc.setFont(PDF_FONTS.SCRIPT, "normal");
    doc.setFontSize(23);

    if (doc.getTextWidth(mark) > width - 8) mark = shortenName(person.name);

    let size = 23;
    while (size > 13) {
      doc.setFontSize(size);
      if (doc.getTextWidth(mark) <= width - 8) break;
      size -= 0.5;
    }

    doc.setTextColor(...C.deep);
    doc.text(mark, x + 4, y);
  }

  // Darker than the footer dividers: a signature rule is meant to be seen,
  // and on a blank block it is the only thing marking where to sign.
  doc.setDrawColor(...C.ink);
  doc.setLineWidth(1);
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

  setType(doc, PDF_FONTS.SANS, "bold", 6.8, C.muted);
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

  // Mirrors the header rule -- blue across, green at one end -- so the sheet
  // is closed by the same mark that opened it, reversed.
  doc.setFillColor(...C.blue);
  doc.rect(0, y - 3, A4.w, 3, "F");
  doc.setFillColor(...C.green);
  doc.rect(A4.w * 0.72, y - 3, A4.w * 0.28, 3, "F");

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
  const gap = 6;
  const h = 2.4;

  // Tapering rather than three equal marks: one hue stepping down in both
  // value and length reads as a considered full stop.
  const segments = [
    [C.deep, 34],
    [C.blue, 20],
    [C.sky, 10],
  ];

  const total =
    segments.reduce((sum, [, w]) => sum + w, 0) + gap * (segments.length - 1);
  let x = (A4.w - total) / 2;

  segments.forEach(([colour, w]) => {
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
  signed = true,
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

  const recipTop = 186;
  const recipEnd = recipientLines.length
    ? recipTop + (recipientLines.length - 1) * 14.5
    : recipTop - 14.5;
  const salutationY = recipEnd + 28;

  const titleY = isLetter ? salutationY + 30 : 180;

  /*
    A letter states its subject the way formal correspondence does: capitals,
    underlined, set in the same serif as the body. The memo's banner belongs to
    the memo's register -- on a letter to a Provost it would read as branding.
  */
  const titleFace = isLetter ? PDF_FONTS.SERIF : PDF_FONTS.SANS;
  const titlePt = isLetter ? 12.5 : TITLE_PT;
  const titleLead = isLetter ? 17 : 18;

  // Measure the title in the face it is actually set in: splitting under
  // whatever font happened to be current breaks the lines for the wrong width.
  doc.setFont(titleFace, "bold");
  doc.setFontSize(titlePt);
  const titleLines = doc.splitTextToSize(
    isLetter
      ? (normaliseText(subject) || "Subject").toUpperCase()
      : normaliseText(subject) || "Subject",
    CONTENT - (isLetter ? 20 : 56)
  );
  const titleH = (isLetter ? 10 : 24) + titleLines.length * titleLead;

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

  doc.setFillColor(...C.wash);
  doc.roundedRect(M, 148, CONTENT, 20, 2, 2, "F");

  setType(doc, PDF_FONTS.SANS, "bold", 8.2, C.deep);
  doc.text(`REF: ${normaliseText(reference) || "—"}`, M + 10, 161.5, {
    charSpace: 0.4,
  });
  doc.text(`DATE: ${String(date || "").toUpperCase()}`, A4.w - M - 10, 161.5, {
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

  if (isLetter) {
    setType(doc, titleFace, "bold", titlePt, C.ink);
    doc.setDrawColor(...C.ink);
    doc.setLineWidth(1);

    titleLines.forEach((line, n) => {
      const ly = titleY + 12 + n * titleLead;
      const half = doc.getTextWidth(line) / 2;

      doc.text(line, A4.w / 2, ly, { align: "center" });
      doc.line(A4.w / 2 - half, ly + 3.4, A4.w / 2 + half, ly + 3.4);
    });
  } else {
    // Solid rather than tinted: against a page this open, a wash of pale blue
    // had no more presence than the paper. This bookends the footer band.
    doc.setFillColor(...C.deep);
    doc.rect(M, titleY, CONTENT, titleH, "F");
    doc.setFillColor(...C.green);
    doc.rect(M, titleY, 5, titleH, "F");

    // A lighter value of the band's own blue, not a second colour: it reads
    // as the band having an edge rather than as another stripe.
    doc.setFillColor(...C.blue);
    doc.rect(M, titleY + titleH, CONTENT, 2, "F");

    setType(doc, PDF_FONTS.SANS, "bold", TITLE_PT, [255, 255, 255]);
    titleLines.forEach((line, n) => {
      doc.text(line, M + CONTENT / 2, titleY + 27 + n * 18, { align: "center" });
    });
  }

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

    const signers = signatories(officials);
    const gap = 24;
    const colW = (CONTENT - gap * (signers.length - 1)) / Math.max(signers.length, 1);

    signers.forEach((person, n) => {
      drawSignature(doc, person, M + n * (colW + gap), closeY + 52, colW, signed);
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
