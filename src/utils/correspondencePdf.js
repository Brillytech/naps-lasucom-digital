import jsPDF from "jspdf";
import { PDF_FONTS, fontStyle, normaliseText, registerItalicFonts, registerPdfFonts } from "./pdfFonts";

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
      signaturePath: row?.signature_path || "",
    };
  });
}

/**
 * Nigerian numbers in international form: "0801 234 5678", "2348012345678"
 * and "+234 (0) 801-234-5678" all print as "+234 801 234 5678". Anything
 * that is not a 10-digit Nigerian number after the prefix (a foreign number,
 * a typo) is printed as typed rather than guessed at.
 */
export function formatPhone(raw) {
  const text = normaliseText(raw);
  if (!text) return "";
  const compact = text.replace(/[\s\-().]/g, "");
  let rest = null;
  if (/^\+234\d+$/.test(compact)) rest = compact.slice(4);
  else if (/^234\d+$/.test(compact)) rest = compact.slice(3);
  else if (/^0\d+$/.test(compact)) rest = compact.slice(1);
  else if (/^\d{10}$/.test(compact)) rest = compact;
  if (rest === null) return text;
  rest = rest.replace(/^0+/, ""); // never a leading 0 after +234
  if (!/^\d{10}$/.test(rest)) return text;
  return `+234 ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`;
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
    doc.text(formatPhone(person.phone) || "—", x, below + 44);
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
 * Who signs a letter: the officer whose office issued it, and only them.
 *
 * All three principal officers used to sign every letter. A letter carries
 * one signature -- the person sending it -- and three blocks read as a
 * petition rather than as correspondence from an office.
 */
function signatories(officials, officeLabel) {
  const issuer = officials.find((o) => o.office === officeLabel);
  return issuer && issuer.name ? [issuer] : [];
}

/**
 * First name, middle initials, surname.
 *
 * A name like "Anibaba Oluwadarasimi Brilliance" cannot be set in a script
 * face across a signature rule without shrinking to something illegible.
 * Initialising the middle names is how a name is signed anyway.
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
  if (signed && person.signature) {
    /*
      A drawn signature, sized to sit on the rule.

      The stored PNG is cropped to its ink, so its own proportions are the
      placement: fit it to a 34pt band and let the width follow, capped at
      the rule so a wide flourish cannot run past it.
    */
    const props = doc.getImageProperties(person.signature);
    const ratio = props.width / props.height;

    let h = 34;
    let w = h * ratio;

    if (w > width - 8) {
      w = width - 8;
      h = w / ratio;
    }

    doc.addImage(person.signature, "PNG", x + 4, y + 7 - h, w, h);
  } else if (signed) {
    // No signature on file for this officer, so the name is set in the
    // script face instead. Try it in full, fall back to initialised middle
    // names, and only then shrink -- dropping to 11pt to fit reads as a
    // mistake rather than as a mark.
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

  fitted(doc, person.office, PDF_FONTS.SANS, "bold", 8.6, 6.6, width);
  doc.setTextColor(...C.blue);
  doc.text(person.office, x, y + 35);

  // A line the recipient can act on. The disc stands in for a handset --
  // there is no icon face embedded, and a bare number under an office
  // reads as a reference rather than as a way to reach someone.
  if (person.phone) {
    doc.setFillColor(...C.blue);
    doc.circle(x + 3.4, y + 45.4, 3.4, "F");

    setType(doc, PDF_FONTS.SANS, "normal", 8.4, C.ink);
    doc.text(formatPhone(person.phone), x + 11, y + 48);
  }
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
      // Browsers' editing commands emit tags, but a paste can bring inline
      // styles instead, so both are read.
      const css = (child.getAttribute("style") || "").toLowerCase();
      const style = {
        ...inherited,
        bold: inherited.bold || tag === "b" || tag === "strong" || /font-weight:\s*(bold|[6-9]00)/.test(css),
        italic: inherited.italic || tag === "i" || tag === "em" || /font-style:\s*italic/.test(css),
        underline: inherited.underline || tag === "u" || /text-decoration[^;]*underline/.test(css),
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

/**
 * Words of a block, each a run of one or more styled pieces.
 *
 * Formatting splits text into runs, but a run that starts with no space
 * continues the previous word: "<b>Week</b>," is one word, bold then plain,
 * not "Week ," with a stray space before the comma.
 */
function wordsOf(block, isHeading, italics) {
  const words = [];
  let joinNext = false;
  for (const run of block.runs) {
    const style = {
      bold: Boolean(run.bold) || isHeading,
      italic: italics && Boolean(run.italic),
      underline: Boolean(run.underline),
    };
    const tokens = run.text.split(" ").filter(Boolean);
    const startsJoined = !/^\s/.test(run.text);
    tokens.forEach((t, i) => {
      if (i === 0 && startsJoined && joinNext && words.length) {
        words[words.length - 1].segs.push({ t, ...style });
      } else {
        words.push({ segs: [{ t, ...style }] });
      }
    });
    joinNext = run.text.length > 0 && !/\s$/.test(run.text);
  }
  return words;
}

function measureWord(doc, word, family, size) {
  let width = 0;
  for (const seg of word.segs) {
    doc.setFont(family, fontStyle(seg.bold, seg.italic));
    doc.setFontSize(size);
    width += doc.getTextWidth(seg.t);
  }
  return width;
}

/**
 * Break the blocks into justified lines without drawing anything.
 *
 * `family` is the body face (the letters set in Serif, the letterhead in
 * Sans). `italics` is false unless the italic faces were registered; without
 * them an italic run is set upright rather than in a face jsPDF lacks.
 */
function planBlocks(doc, blocks, width, size, { family = PDF_FONTS.SERIF, italics = false } = {}) {
  const spaceWidth = () => {
    doc.setFont(family, "normal");
    doc.setFontSize(size);
    return doc.getTextWidth(" ");
  };

  return blocks.map((block) => {
    const isHeading = block.type === "h";
    const blockSize = isHeading ? size + 1.5 : size;
    const indent = block.type === "li" ? 16 : 0;
    const usable = width - indent;

    const words = wordsOf(block, isHeading, italics);
    const measure = (word) => measureWord(doc, word, family, blockSize);

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

    return { block, isHeading, blockSize, indent, usable, sw, lines, measure, family };
  });
}

/** Draw one planned line with its left edge at `left`. */
function drawPlannedLine(doc, p, l, index, left, y) {
  if (p.block.type === "li" && index === 0) {
    setType(doc, p.family, "normal", p.blockSize, C.body);
    doc.text(p.block.marker, left, y);
  }

  const gaps = l.words.length - 1;

  // Justify, but stop short of stretching a sparse line into holes --
  // past roughly a space-and-a-half per gap the rivers cost more
  // legibility than a ragged right edge does, so that line goes flush.
  let extra = !l.last && gaps > 0 && !p.ragged ? (p.usable - l.width) / gaps : 0;
  if (extra > p.sw * 0.85) extra = 0;
  let x = left + p.indent;

  const colour = p.isHeading ? C.ink : C.body;

  l.words.forEach((word, i) => {
    let sx = x;
    word.segs.forEach((seg, k) => {
      doc.setFont(p.family, fontStyle(seg.bold, seg.italic));
      doc.setFontSize(p.blockSize);
      doc.setTextColor(...colour);
      doc.text(seg.t, sx, y);
      const segW = doc.getTextWidth(seg.t);

      if (seg.underline) {
        // Through the following space too when the next word carries on
        // underlined, so a phrase reads as one line rather than dashes.
        const next = l.words[i + 1];
        const isLast = k === word.segs.length - 1;
        const run = segW + (isLast && next?.segs[0].underline ? p.sw + extra : 0);
        doc.setDrawColor(...colour);
        doc.setLineWidth(Math.max(0.5, p.blockSize * 0.055));
        doc.line(sx, y + p.blockSize * 0.16, sx + run, y + p.blockSize * 0.16);
      }
      sx += segW;
    });
    x += p.measure(word) + p.sw + extra;
  });
}

/** Lay runs out as justified lines, returning the height used. */
function layoutBlocks(doc, blocks, width, size, leading, dryRun, startY, flow, opts = {}) {
  const left = opts.left ?? M;
  let y = startY;

  for (const p of planBlocks(doc, blocks, width, size, opts)) {
    p.lines.forEach((l, index) => {
      // Break before drawing, not after: a line committed past the limit is
      // one that has already run into the footer.
      if (!dryRun && flow && y > flow.limit) {
        doc.addPage();
        y = flow.resumeTop;
      }

      if (!dryRun) drawPlannedLine(doc, p, l, index, left, y);
      y += leading;
    });

    y += leading * (p.isHeading ? 0.5 : 0.4);
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
export async function renderCorrespondence(options) {
  return options.template === "letterhead" ? renderLetterhead(options) : renderClassic(options);
}

/** Memo and Official Letter. */
async function renderClassic({
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

  // Italic faces only when the text has italics, so a plain document is the
  // same file it always was.
  const italics = blocks.some((b) => b.runs.some((r) => r.italic))
    ? await registerItalicFonts(doc, [PDF_FONTS.SERIF])
    : false;
  const textOpts = { italics };

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
  const signSpace = isLetter ? 146 : 18;
  const available = footerTop - signSpace - bodyTop;

  const flow = { limit: footerTop - 24, resumeTop: 96, endY: 0 };

  // Largest size that still fits one page, then settle at the floor.
  let size = MAX_BODY_PT;
  let leading = size * 1.62;
  let used = 0;

  for (; size >= MIN_BODY_PT; size -= 0.25) {
    leading = size * 1.62;
    used = layoutBlocks(doc, blocks, CONTENT, size, leading, true, bodyTop, null, textOpts);
    if (used <= available) break;
  }
  if (size < MIN_BODY_PT) {
    size = MIN_BODY_PT;
    leading = size * 1.62;
    used = layoutBlocks(doc, blocks, CONTENT, size, leading, true, bodyTop, null, textOpts);
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

  layoutBlocks(doc, blocks, CONTENT, size, leading, false, bodyTop, flow, textOpts);

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

    // One block, at the left margin. Half the measure is wide enough for a
    // long name and keeps the rule from running the width of the page.
    const signers = signatories(officials, office);

    signers.forEach((person) => {
      drawSignature(doc, person, M, closeY + 52, CONTENT * 0.46, signed);
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

/* ===========================================================================
   Formal letterhead
   ===========================================================================

   Page 1: a white masthead with the NAPS-LASUCOM crest on the left and the
   LASUCOM crest on the right, each standing alone at 29mm, the association's
   name centred between them; a navy strip with the contact lines and the
   motto; the executive council down a tinted left column; the letter on clean
   white to its right; an optional Patrons / Staff Advisers strip at the foot of the
   column; and a navy footer band with the motto, optional account details and
   the page number.

   Later pages: a slim navy header, a thin spine where the sidebar was, the
   letter at full width, and the same footer band.

   Everything sits on one grid inside a 36pt (12.7mm) print-safe margin; only
   the colour bands run to the paper's edge. Body text 12pt, never below 11pt;
   nothing anywhere below 8pt.
*/

const LH = {
  navy: [11, 58, 130], // #0B3A82
  green: [31, 143, 78], // #1F8F4E
  tint: [234, 241, 251], // #EAF1FB
  ink: [20, 27, 41],
  text: [40, 47, 60],
  muted: [88, 100, 120],
  hair: [198, 211, 232],
  white: [255, 255, 255],
  // No faint text anywhere: on white everything is ink or navy, on navy
  // everything is white.
};

const LG = {
  margin: 36,
  logoTop: 30,
  logoH: 82, // about 29mm
  logoGap: 18, // clear space between a logo and the text block
  stripH: 24,
  stripe: 2,
  contH: 50,
  sideW: 158,
  sidePad: 14,
  ruleW: 1.2,
  gutter: 24,
  footH: 50,
};

const LH_BODY_MAX = 12;
const LH_BODY_MIN = 11;
const LH_MOTTO = "Strength in knowledge, Service to Humanity";
const LH_INSTITUTION = [
  "Department of Physiotherapy",
  "Faculty of Allied Health Sciences",
  "Lagos State University College of Medicine",
  "Ikeja, Lagos State, Nigeria",
];

/**
 * Load an image and trim its transparent border, at full resolution.
 *
 * Logos come with uneven transparent margins; trimming them is what lets two
 * different files sit at exactly the same visible height. Pixels are copied,
 * never resampled, and the result is PNG (lossless). Resolves null if the
 * file is missing.
 */
export async function loadTrimmedImage(path) {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await img.decode();
    URL.revokeObjectURL(url);

    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const { data } = g.getImageData(0, 0, c.width, c.height);

    let minX = c.width;
    let minY = c.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < c.height; y += 1) {
      for (let x = 0; x < c.width; x += 1) {
        if (data[(y * c.width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;

    const out = document.createElement("canvas");
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    out.getContext("2d").drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** Offices that may sign a formal letterhead, in order of precedence. */
export const LH_SIGN_OFFICES = ["President", "Vice President", "General Secretary"];

const lhGeo = () => {
  const W = A4.w;
  const H = A4.h;
  const stripTop = LG.logoTop + LG.logoH + 16;
  const footTop = H - LG.footH;
  const sideX1 = LG.margin + LG.sideW;
  const bodyX = sideX1 + LG.gutter;
  const spineX1 = LG.margin + 8;
  const contX = spineX1 + 22;
  return {
    W,
    H,
    stripTop,
    sideTop: stripTop + LG.stripH + LG.stripe,
    footTop,
    sideBottom: footTop - LG.stripe,
    // Lowest a line of text may sit: clear of the footer's green rule.
    contentBottom: footTop - LG.stripe - 20,
    sideX1,
    bodyX,
    bodyW: W - LG.margin - bodyX,
    spineX1,
    contX,
    contW: W - LG.margin - contX,
    contTop: LG.contH + LG.stripe + 40,
  };
};

function spacedWidth(doc, text, charSpace) {
  return doc.getTextWidth(text) + charSpace * Math.max(0, text.length - 1);
}

/** Largest size from `max` down to `min` at which `text` fits `width`. */
function fitSize(doc, text, family, style, max, min, width, charSpace = 0) {
  doc.setFont(family, style);
  let size = max;
  for (; size > min; size -= 0.1) {
    doc.setFontSize(size);
    if (spacedWidth(doc, text, charSpace) <= width) return size;
  }
  return min;
}

/** A logo at a fixed height, keeping its own proportions. Returns its width. */
function placeLogo(doc, image, alias, x, y, h, alignRight = false) {
  if (!image) return 0;
  const props = doc.getImageProperties(image);
  const w = (h * props.width) / props.height;
  // PNG stays PNG: re-encoded losslessly at its full pixel size.
  doc.addImage(image, "PNG", alignRight ? x - w : x, y, w, h, alias, "SLOW");
  return w;
}

function logoWidth(doc, image, h) {
  if (!image) return h * 0.9;
  const props = doc.getImageProperties(image);
  return (h * props.width) / props.height;
}

function lhMasthead(doc, { logo, partnerLogo, email, instagram }) {
  const g = lhGeo();
  const top = LG.logoTop;

  // Logos, standing alone on white.
  const leftW = placeLogo(doc, logo, "lh-naps", LG.margin, top, LG.logoH);
  let rightW = logoWidth(doc, partnerLogo, LG.logoH);
  if (partnerLogo) {
    placeLogo(doc, partnerLogo, "lh-lasucom", g.W - LG.margin, top, LG.logoH, true);
  } else {
    // Placeholder until the LASUCOM logo is available: a quiet labelled frame.
    doc.setDrawColor(...LH.hair);
    doc.setLineWidth(0.8);
    doc.setLineDashPattern([3, 2], 0);
    doc.rect(g.W - LG.margin - rightW, top, rightW, LG.logoH, "S");
    doc.setLineDashPattern([], 0);
    setType(doc, PDF_FONTS.SANS, "normal", 8, LH.ink);
    doc.text("LASUCOM logo", g.W - LG.margin - rightW / 2, top + LG.logoH / 2 + 3, { align: "center" });
  }

  // Text block, centred between the logos' inner edges, top-aligned with them.
  const left = LG.margin + (leftW || rightW) + LG.logoGap;
  const right = g.W - LG.margin - rightW - LG.logoGap;
  const cx = (left + right) / 2;
  const width = right - left;

  const org = "NIGERIA ASSOCIATION OF PHYSIOTHERAPY STUDENTS";
  const orgSize = fitSize(doc, org, PDF_FONTS.SERIF, "bold", 11.5, 9, width, 0.3);
  setType(doc, PDF_FONTS.SERIF, "bold", orgSize, LH.navy);
  let y = top + orgSize * 0.74;
  doc.text(org, cx, y, { align: "center", charSpace: 0.3 });

  setType(doc, PDF_FONTS.SERIF, "bold", 25, LH.navy);
  y += 27;
  doc.text("NAPS-LASUCOM", cx, y, { align: "center", charSpace: 1.8 });

  y += 13;
  setType(doc, PDF_FONTS.SANS, "bold", 9, LH.navy);
  doc.text("LASUCOM CHAPTER", cx, y, { align: "center", charSpace: 1.6 });

  // Institution: whole phrases per line, at 9pt, as few lines as fit.
  setType(doc, PDF_FONTS.SANS, "normal", 9, LH.ink);
  const lines = [];
  for (const phrase of LH_INSTITUTION) {
    const last = lines[lines.length - 1];
    const joined = last ? `${last}, ${phrase}` : phrase;
    if (last && doc.getTextWidth(joined) <= width) lines[lines.length - 1] = joined;
    else lines.push(phrase);
  }
  y += 5;
  lines.forEach((line, i) => doc.text(line, cx, y + 11.5 * (i + 1), { align: "center" }));

  // Contact strip.
  doc.setFillColor(...LH.navy);
  doc.rect(0, g.stripTop, g.W, LG.stripH, "F");
  doc.setFillColor(...LH.green);
  doc.rect(0, g.stripTop + LG.stripH, g.W, LG.stripe, "F");

  const sy = g.stripTop + LG.stripH / 2 + 3.2;
  let sx = LG.margin;
  [
    ["E-mail:", email],
    ["Instagram:", instagram],
  ].forEach(([label, value]) => {
    const v = normaliseText(value);
    if (!v) return;
    setType(doc, PDF_FONTS.SANS, "bold", 9, LH.white);
    doc.text(label, sx, sy);
    sx += doc.getTextWidth(label) + 5;
    setType(doc, PDF_FONTS.SANS, "normal", 9, LH.white);
    doc.text(v, sx, sy);
    sx += doc.getTextWidth(v) + 22;
  });

  setType(doc, PDF_FONTS.SERIF, "italic", 9, LH.white);
  doc.text(LH_MOTTO, g.W - LG.margin, sy, { align: "right" });
}

function crestOnDisc(doc, logo, cx, cy, r) {
  doc.setFillColor(...LH.white);
  doc.circle(cx, cy, r, "F");
  if (!logo) return;
  const props = doc.getImageProperties(logo);
  const h = r * 1.62;
  const w = (h * props.width) / props.height;
  doc.addImage(logo, "PNG", cx - w / 2, cy - h / 2, w, h, "lh-naps", "SLOW");
}

function lhContHeader(doc, { logo, reference }) {
  const g = lhGeo();
  doc.setFillColor(...LH.navy);
  doc.rect(0, 0, g.W, LG.contH, "F");
  doc.setFillColor(...LH.green);
  doc.rect(0, LG.contH, g.W, LG.stripe, "F");

  const r = 17;
  // On navy the crest needs its white ground back; page 1 stands on white.
  crestOnDisc(doc, logo, LG.margin + r, LG.contH / 2, r);

  setType(doc, PDF_FONTS.SERIF, "bold", 12.5, LH.white);
  doc.text("NAPS-LASUCOM", LG.margin + r * 2 + 12, LG.contH / 2 + 4.4, { charSpace: 0.6 });

  const ref = normaliseText(reference);
  if (ref) {
    const rx = g.W - LG.margin;
    setType(doc, PDF_FONTS.SANS, "normal", 9, LH.white);
    doc.text(ref, rx, LG.contH / 2 + 3.6, { align: "right" });
    const vw = doc.getTextWidth(ref);
    setType(doc, PDF_FONTS.SANS, "bold", 9, LH.white);
    doc.text("Ref:", rx - vw - 6 - doc.getTextWidth("Ref:"), LG.contH / 2 + 3.6);
  }

  // The sidebar's rule carries on as a thin tinted spine.
  const top = LG.contH + LG.stripe;
  doc.setFillColor(...LH.tint);
  doc.rect(LG.margin, top, g.spineX1 - LG.margin, g.sideBottom - top, "F");
  doc.setFillColor(...LH.navy);
  doc.rect(g.spineX1 - 0.9, top, 0.9, g.sideBottom - top, "F");
}

function accountLine(account) {
  if (!account) return "";
  return [account.bankName, account.accountName, account.accountNumber]
    .map(normaliseText)
    .filter(Boolean)
    .join("   ·   ");
}

function lhFooter(doc, { account, page, total }) {
  const g = lhGeo();
  doc.setFillColor(...LH.green);
  doc.rect(0, g.footTop - LG.stripe, g.W, LG.stripe, "F");
  doc.setFillColor(...LH.navy);
  doc.rect(0, g.footTop, g.W, LG.footH, "F");

  const mid = g.footTop + LG.footH / 2;
  const acc = accountLine(account);
  const max = g.W - LG.margin * 2 - 90;

  setType(doc, PDF_FONTS.SERIF, "italic", 9, LH.white);
  doc.text(LH_MOTTO, LG.margin, acc ? mid - 4 : mid + 3);

  if (acc) {
    setType(doc, PDF_FONTS.SANS, "bold", 8.6, LH.white);
    doc.text("Account:", LG.margin, mid + 11);
    const lx = LG.margin + doc.getTextWidth("Account:") + 7;
    const size = fitSize(doc, acc, PDF_FONTS.SANS, "normal", 8.8, 8, max - (lx - LG.margin));
    setType(doc, PDF_FONTS.SANS, "normal", size, LH.white);
    doc.text(doc.splitTextToSize(acc, max - (lx - LG.margin))[0], lx, mid + 11);
  }

  setType(doc, PDF_FONTS.SANS, "normal", 8.6, LH.white);
  doc.text(`Page ${page} of ${total}`, g.W - LG.margin, mid + 3, { align: "right" });
}

function lhWatermark(doc, mark, cx, top, bottom, maxSize) {
  if (!mark) return;
  const height = bottom - top;
  const size = Math.min(maxSize, height * 0.8);
  if (size < 120) return;
  const props = doc.getImageProperties(mark);
  const h = size;
  const w = (h * props.width) / props.height;
  doc.saveGraphicsState();
  doc.setGState(new doc.GState({ opacity: 0.06 }));
  doc.addImage(mark, "PNG", cx - w / 2, top + (height - h) / 2, w, h, "lh-mark", "SLOW");
  doc.restoreGraphicsState();
}

/*
  Executive directory for the sidebar.

  Entries are spread evenly down the column so it reads as a full panel.
  Emails are all-or-nothing: shown for everyone who has one when the whole
  list fits at 8pt or larger, otherwise left off for everyone. An address is
  never broken mid-word: it may shrink toward 8pt, then split once at "@".
*/
const DIRECTORY_MODES = [
  { nameSize: 10, nameLead: 12.4, officeSize: 8.4, officeLead: 11, lineSize: 8.8, lineLead: 11.4, minGap: 10 },
  { nameSize: 9.6, nameLead: 11.8, officeSize: 8.2, officeLead: 10.6, lineSize: 8.5, lineLead: 11, minGap: 8 },
  { nameSize: 9.2, nameLead: 11.2, officeSize: 8, officeLead: 10.2, lineSize: 8.2, lineLead: 10.4, minGap: 6 },
  { nameSize: 9, nameLead: 10.8, officeSize: 8, officeLead: 9.8, lineSize: 8, lineLead: 10, minGap: 4 },
];

function fitEmail(doc, email, width, maxSize) {
  const value = String(email || "").trim().toLowerCase();
  if (!value) return null;
  doc.setFont(PDF_FONTS.SANS, "normal");
  for (let size = maxSize; size >= 7.999; size -= 0.1) {
    doc.setFontSize(size);
    if (doc.getTextWidth(value) <= width) return { size, lines: [value] };
  }
  const at = value.indexOf("@");
  if (at > 0) {
    const parts = [value.slice(0, at), value.slice(at)];
    for (let size = maxSize; size >= 7.999; size -= 0.1) {
      doc.setFontSize(size);
      if (parts.every((part) => doc.getTextWidth(part) <= width)) return { size, lines: parts };
    }
  }
  return false; // has an address, but it cannot be set whole at 8pt
}

function measureDirectory(doc, people, width, mode, withEmails) {
  return people.map((person) => {
    doc.setFont(PDF_FONTS.SERIF, "bold");
    doc.setFontSize(mode.nameSize);
    const nameLines = doc.splitTextToSize(normaliseText(person.name), width);

    doc.setFont(PDF_FONTS.SANS, "bold");
    doc.setFontSize(mode.officeSize);
    const officeLines = doc.splitTextToSize(normaliseText(person.office).toUpperCase(), width - 6);

    const phone = formatPhone(person.phone);
    const email = withEmails ? fitEmail(doc, person.email, width, mode.lineSize) : null;

    const height =
      nameLines.length * mode.nameLead +
      officeLines.length * mode.officeLead +
      (phone ? mode.lineLead : 0) +
      (email ? email.lines.length * mode.lineLead : 0);

    return { person, nameLines, officeLines, phone, email, height };
  });
}

function planDirectory(doc, people, width, available) {
  const total = (rows, mode) =>
    rows.reduce((s, r) => s + r.height, 0) + mode.minGap * Math.max(0, rows.length - 1);

  const anyEmail = people.some((p) => normaliseText(p.email));
  let emailBlock = anyEmail ? "" : "none";

  if (anyEmail) {
    for (const mode of DIRECTORY_MODES) {
      const rows = measureDirectory(doc, people, width, mode, true);
      if (rows.some((r) => r.email === false)) {
        emailBlock = "width";
        break;
      }
      if (total(rows, mode) <= available) return { rows, mode, emailsShown: true, emailBlock: "" };
      emailBlock = "height";
    }
  }

  for (const mode of DIRECTORY_MODES) {
    const rows = measureDirectory(doc, people, width, mode, false);
    if (total(rows, mode) <= available) return { rows, mode, emailsShown: false, emailBlock };
  }
  const mode = DIRECTORY_MODES[DIRECTORY_MODES.length - 1];
  return {
    rows: measureDirectory(doc, people, width, mode, false),
    mode,
    emailsShown: false,
    emailBlock,
    overflow: true,
  };
}

function lhSidebar(doc, { directory, setName }) {
  const g = lhGeo();
  const height = g.sideBottom - g.sideTop;

  doc.setFillColor(...LH.tint);
  doc.rect(LG.margin, g.sideTop, LG.sideW, height, "F");
  doc.setFillColor(...LH.navy);
  doc.rect(g.sideX1 - LG.ruleW, g.sideTop, LG.ruleW, height, "F");

  const x = LG.margin + LG.sidePad;
  const width = LG.sideW - LG.sidePad * 2 - LG.ruleW;

  let y = g.sideTop + 30;
  setType(doc, PDF_FONTS.SANS, "bold", 8.6, LH.navy);
  doc.text("EXECUTIVE COUNCIL", x, y, { charSpace: 1 });
  const tenure = normaliseText(setName);
  if (tenure) {
    setType(doc, PDF_FONTS.SANS, "normal", 8.4, LH.navy);
    doc.text(doc.splitTextToSize(tenure, width)[0], x, y + 12.5);
    y += 12.5;
  }
  doc.setFillColor(...LH.green);
  doc.rect(x, y + 9, 24, 1.8, "F");

  const listTop = y + 32;
  const listBottom = g.sideBottom - 26;
  const plan = planDirectory(doc, directory, width, listBottom - listTop);
  const { mode, rows } = plan;

  // Spread the entries down the column; a gap never grows past 34pt.
  const used = rows.reduce((s, r) => s + r.height, 0);
  const gap = rows.length > 1
    ? Math.min(34, Math.max(mode.minGap, (listBottom - listTop - used) / (rows.length - 1)))
    : 0;

  let cy = listTop;
  rows.forEach((row, i) => {
    let by = cy + mode.nameSize * 0.74;

    setType(doc, PDF_FONTS.SERIF, "bold", mode.nameSize, LH.ink);
    row.nameLines.forEach((line, n) => doc.text(line, x, by + n * mode.nameLead));
    by += (row.nameLines.length - 1) * mode.nameLead + mode.officeLead;

    setType(doc, PDF_FONTS.SANS, "bold", mode.officeSize, LH.green);
    row.officeLines.forEach((line, n) => doc.text(line, x, by + n * mode.officeLead, { charSpace: 0.25 }));
    by += (row.officeLines.length - 1) * mode.officeLead;

    if (row.phone) {
      by += mode.lineLead;
      setType(doc, PDF_FONTS.SANS, "normal", mode.lineSize, LH.ink);
      doc.text(row.phone, x, by);
    }
    if (row.email) {
      setType(doc, PDF_FONTS.SANS, "normal", row.email.size, LH.ink);
      row.email.lines.forEach((line) => {
        by += mode.lineLead;
        doc.text(line, x, by);
      });
    }

    cy += row.height + gap;
    if (i < rows.length - 1 && gap >= 12) {
      const dy = cy - gap / 2 + 1;
      doc.setDrawColor(...LH.hair);
      doc.setLineWidth(0.6);
      doc.line(x, dy, x + 28, dy);
    }
  });

  return plan;
}

// Body flow across pages of different widths, line by line, so a paragraph
// that crosses onto page 2 re-wraps at page 2's width.
function flowLetterhead(doc, blocks, size, frames, { italics, breaks = new Set() }) {
  const family = PDF_FONTS.SANS;
  const leading = size * 1.55;
  doc.setFont(family, "normal");
  doc.setFontSize(size);
  const sw = doc.getTextWidth(" ");

  const placed = [];
  let page = 0;
  let frame = frames(0);
  let y = frame.top;
  let count = 0;

  let prevType = "";
  for (const block of blocks) {
    // A list closes with the same space a paragraph would have after it.
    if (prevType === "li" && block.type !== "li") y += leading * 0.3;
    prevType = block.type;
    const isHeading = block.type === "h";
    const blockSize = isHeading ? size + 1 : size;
    const indent = block.type === "li" ? 16 : 0;
    const words = wordsOf(block, isHeading, italics);
    const measure = (word) => measureWord(doc, word, family, blockSize);

    let i = 0;
    let index = 0;
    while (i < words.length) {
      if (y > frame.limit || (breaks.has(count) && y > frame.top)) {
        page += 1;
        frame = frames(page);
        y = frame.top;
      }
      const usable = frame.width - indent;
      const line = [];
      let lineW = 0;
      while (i < words.length) {
        const ww = measure(words[i]);
        if (line.length && lineW + sw + ww > usable) break;
        lineW += (line.length ? sw : 0) + ww;
        line.push(words[i]);
        i += 1;
      }
      const p = { block, isHeading, blockSize, indent, usable, sw, measure, family, ragged: true };
      placed.push({
        page,
        y,
        left: frame.left,
        p,
        l: { words: line, width: lineW, last: i >= words.length },
        index,
      });
      index += 1;
      count += 1;
      y += leading;
    }
    // List items sit closer together than paragraphs.
    y += leading * (isHeading ? 0.5 : block.type === "li" ? 0.15 : 0.45);
  }

  return { placed, lastPage: page, endY: y, leading, size };
}

/*
  Signature blocks, side by side, each centred on its own short rule
  (35-45mm). A drawn signature is used at its natural size unless the block
  is too narrow for it; without one, the name is set in script.
*/
const SIG = { rule: 112, minRule: 99, maxRule: 125, markH: 34, gap: 16 };

function lhSignatures(doc, people, x, ruleY, totalW, signed) {
  const n = people.length;
  if (!n) return;
  // One signatory sits under the closing line, its rule nearly flush with
  // the text; two or three share the column equally.
  const w = n === 1 ? Math.min(132, totalW) : (totalW - SIG.gap * (n - 1)) / n;
  const rule = Math.max(SIG.minRule, Math.min(SIG.maxRule, w - 4));

  people.forEach((person, i) => {
    const bx = x + i * (w + SIG.gap);
    const cx = bx + w / 2;

    if (signed && person.signature) {
      const props = doc.getImageProperties(person.signature);
      let h = SIG.markH;
      let sw = (h * props.width) / props.height;
      if (sw > w - 4) {
        sw = w - 4;
        h = (sw * props.height) / props.width;
      }
      doc.addImage(person.signature, "PNG", cx - sw / 2, ruleY - 4 - h, sw, h);
    } else if (signed) {
      // Full name, then middle initials, then initials and surname, then the
      // surname alone, each tried from 24pt down to 14pt.
      const parts = String(person.name).split(/\s+/).filter(Boolean);
      const candidates = [
        person.name,
        shortenName(person.name),
        [...parts.slice(0, -1).map((p) => `${p[0]}.`), parts.at(-1)].join(" "),
        parts.at(-1) || person.name,
      ];
      doc.setFont(PDF_FONTS.SCRIPT, "normal");
      let mark = candidates[candidates.length - 1];
      let size = 14;
      search: for (const candidate of candidates) {
        for (let s = 24; s >= 14; s -= 0.5) {
          doc.setFontSize(s);
          if (doc.getTextWidth(candidate) <= w - 4) {
            mark = candidate;
            size = s;
            break search;
          }
        }
      }
      doc.setFontSize(size);
      doc.setTextColor(...LH.navy);
      doc.text(mark, cx, ruleY - 7, { align: "center" });
    }

    doc.setDrawColor(...LH.ink);
    doc.setLineWidth(0.7);
    doc.line(cx - rule / 2, ruleY, cx + rule / 2, ruleY);

    setType(doc, PDF_FONTS.SERIF, "bold", 9.6, LH.ink);
    let nameLines = doc.splitTextToSize(person.name, w);
    if (nameLines.length > 2) nameLines = doc.splitTextToSize(shortenName(person.name), w);
    nameLines.forEach((line, k) => doc.text(line, cx, ruleY + 14 + k * 11.6, { align: "center" }));

    let ly = ruleY + 14 + nameLines.length * 11.6;
    setType(doc, PDF_FONTS.SANS, "bold", 8, LH.navy);
    doc.text(String(person.office).toUpperCase(), cx, ly, { align: "center", charSpace: 0.4 });

    if (signed) {
      ly += 11;
      setType(doc, PDF_FONTS.SANS, "normal", 8, LH.navy);
      doc.text("E-signed", cx, ly, { align: "center" });
    }
  });
}

// From the closing line to the foot of a two-line name, office and label.
const LH_TAIL_H = 30 + 56 + 14 + 2 * 11.6 + 11 + 4;

/*
  Patrons and Staff Advisers: a strip at the foot of page 1's body column, two
  labelled columns, each name with an optional title line beneath.
*/
/**
 * One person per line: "Name" or "Name, title" (a dash or "|" also works).
 * Only the first separator splits, so a title may contain commas.
 */
function parsePeople(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => normaliseText(line))
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.+?)\s*(?:,|\s[-–—]\s|\|)\s*(.+)$/);
      return m ? { name: m[1].trim(), title: m[2].trim() } : { name: line, title: "" };
    })
    .slice(0, 8);
}

function patronColumns({ patrons, advisers } = {}) {
  const cols = [];
  const pt = parsePeople(patrons);
  const ad = parsePeople(advisers);
  if (pt.length) cols.push({ label: pt.length > 1 ? "Patrons" : "Patron", people: pt });
  if (ad.length) cols.push({ label: ad.length > 1 ? "Staff Advisers" : "Staff Adviser", people: ad });
  return cols;
}

function measurePatrons(doc, cols, width) {
  if (!cols.length) return { cols, height: 0, colW: 0 };
  const colW = cols.length === 2 ? (width - 20) / 2 : width;
  let tallest = 0;
  const laid = cols.map((col) => {
    let h = 13;
    const people = col.people.map((p) => {
      setType(doc, PDF_FONTS.SERIF, "bold", 9.2, LH.ink);
      const nameLines = doc.splitTextToSize(p.name, colW);
      setType(doc, PDF_FONTS.SANS, "normal", 8.4, LH.ink);
      const titleLines = p.title ? doc.splitTextToSize(p.title, colW) : [];
      const ph = nameLines.length * 11 + titleLines.length * 10 + 5;
      h += ph;
      return { nameLines, titleLines, ph };
    });
    tallest = Math.max(tallest, h);
    return { ...col, people };
  });
  return { cols: laid, height: tallest + 14, colW };
}

function drawPatrons(doc, laid, x, top, width) {
  if (!laid.cols.length) return;
  doc.setDrawColor(...LH.hair);
  doc.setLineWidth(0.7);
  doc.line(x, top, x + width, top);

  laid.cols.forEach((col, i) => {
    const cx = x + i * (laid.colW + 20);
    let y = top + 16;
    setType(doc, PDF_FONTS.SANS, "bold", 8.4, LH.navy);
    doc.text(col.label, cx, y, { charSpace: 0.3 });
    y += 13;
    col.people.forEach((p) => {
      setType(doc, PDF_FONTS.SERIF, "bold", 9.2, LH.ink);
      p.nameLines.forEach((line, k) => doc.text(line, cx, y + k * 11));
      let ty = y + (p.nameLines.length - 1) * 11;
      setType(doc, PDF_FONTS.SANS, "normal", 8.4, LH.ink);
      p.titleLines.forEach((line) => {
        ty += 10;
        doc.text(line, cx, ty);
      });
      y += p.ph;
    });
  });
}

async function renderLetterhead({
  office,
  subject,
  date,
  reference,
  bodyHtml,
  directory = [],
  setName,
  email,
  instagram,
  recipient,
  salutation,
  closing,
  signatories = [],
  signed = true,
  logo,
  partnerLogo,
  watermark,
  patrons,
  advisers,
  account,
  fromText,
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  await registerPdfFonts(doc);

  const blocks = htmlToBlocks(bodyHtml);
  const bodyItalic = blocks.some((b) => b.runs.some((r) => r.italic));
  // Serif italic sets the motto; Sans italic only if the letter uses italics.
  const italics = await registerItalicFonts(
    doc,
    bodyItalic ? [PDF_FONTS.SERIF, PDF_FONTS.SANS] : [PDF_FONTS.SERIF]
  );

  const g = lhGeo();
  // Per letter: printed whenever any of the three fields is filled.
  const accountOn = accountLine(account) ? account : null;

  // ---- Page 1 above the body: Ref / Date, then TO / FROM / SUBJECT.
  const refY = g.sideTop + 30;
  const labelX = g.bodyX;
  const valueX = g.bodyX + 58;
  const valueW = g.W - LG.margin - valueX;

  setType(doc, PDF_FONTS.SANS, "normal", 10.5, LH.ink);
  const toLines = normaliseText(recipient)
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => doc.splitTextToSize(line, valueW));
  const fromLines = doc.splitTextToSize(
    normaliseText(fromText) || `Office of the ${office || "Secretariat"}, NAPS-LASUCOM`,
    valueW
  );
  setType(doc, PDF_FONTS.SANS, "bold", 10.5, LH.ink);
  const subjectLines = doc.splitTextToSize(normaliseText(subject) || "Subject", valueW);

  const lead = 14.5;
  const rows = [
    ["To:", toLines.length ? toLines : ["—"], "normal"],
    ["From:", fromLines, "normal"],
    ["Subject:", subjectLines, "bold"],
  ];
  let ry = refY + 34;
  const rowTops = rows.map(([, lines]) => {
    const top = ry;
    ry += lines.length * lead + 7;
    return top;
  });
  const blockRule = ry + 2;
  const salutationY = blockRule + 26;
  const bodyTop = salutationY + 26;

  // Patrons strip reserves the foot of page 1's body column.
  const laid = measurePatrons(doc, patronColumns({ patrons, advisers }), g.bodyW);
  const page1Bottom = laid.height ? g.contentBottom - laid.height - 10 : g.contentBottom;

  const frames = (page) =>
    page === 0
      ? { top: bodyTop, limit: page1Bottom, width: g.bodyW, left: g.bodyX }
      : { top: g.contTop, limit: g.contentBottom, width: g.contW, left: g.contX };

  const people = signatories.filter((p) => p && p.name);
  const lastBaseline = (f) => (f.placed.length ? f.placed[f.placed.length - 1].y : bodyTop - f.leading);
  const tailFits = (f) => {
    const limit = f.lastPage === 0 ? page1Bottom : g.contentBottom;
    // The tail may run a little into the margin, but never into the
    // patrons strip on page 1.
    const slack = f.lastPage === 0 && laid.height ? 0 : 12;
    return lastBaseline(f) + LH_TAIL_H <= limit + slack;
  };

  // Largest size, 12pt down to 11pt, that keeps the letter and its
  // signatures on one page; past that it flows at 11pt.
  let flow = null;
  for (let size = LH_BODY_MAX; size >= LH_BODY_MIN - 0.001; size -= 0.25) {
    flow = flowLetterhead(doc, blocks, size, frames, { italics });
    if (flow.lastPage === 0 && tailFits(flow)) break;
  }

  /*
    Page breaks, settled over a few passes:
    - a paragraph never leaves a single line at the foot of a page (orphan)
      or carries a single line onto the next (widow);
    - a heading never ends a page;
    - the signatures never stand alone: if they do not fit under the last
      line, the last lines of the letter go over with them.
  */
  const breaks = new Set();
  for (let pass = 0; pass < 8; pass += 1) {
    let changed = false;
    const lines = flow.placed;
    for (let k = 1; k < lines.length; k += 1) {
      const prev = lines[k - 1];
      const cur = lines[k];
      if (cur.page === prev.page) continue;

      if (prev.p.isHeading) {
        const first = lines.findIndex((l) => l.p.block === prev.p.block);
        if (!breaks.has(first)) {
          breaks.add(first);
          changed = true;
        }
        continue;
      }
      if (prev.p.block !== cur.p.block) continue;

      const own = lines.map((l, i) => [l, i]).filter(([l]) => l.p.block === cur.p.block);
      const before = own.filter(([l]) => l.page === prev.page).length;
      const after = own.length - before;
      const target = before === 1 ? own[0][1] : after === 1 ? (before >= 3 ? k - 1 : own[0][1]) : -1;
      if (target > 0 && !breaks.has(target)) {
        breaks.add(target);
        changed = true;
      }
    }

    if (!tailFits(flow) && lines.length > 2) {
      const onLast = lines.filter((l) => l.page === flow.lastPage).length;
      const target = lines.length - Math.min(3, Math.max(2, onLast));
      if (!breaks.has(target)) {
        breaks.add(target);
        changed = true;
      }
    }

    if (!changed) break;
    flow = flowLetterhead(doc, blocks, flow.size, frames, { italics, breaks });
  }

  const tailOnNewPage = !tailFits(flow); // only when the body is nearly empty
  const pages = flow.lastPage + 1 + (tailOnNewPage ? 1 : 0);
  for (let p = 1; p < pages; p += 1) doc.addPage();

  // ---- Draw, page by page: watermark under everything else.
  let directoryPlan = null;
  for (let p = 0; p < pages; p += 1) {
    doc.setPage(p + 1);
    const frame = frames(p);
    if (p === 0) {
      lhWatermark(doc, watermark, g.bodyX + g.bodyW / 2, bodyTop - 30, page1Bottom, 260);
      lhMasthead(doc, { logo, partnerLogo, email, instagram });
      directoryPlan = lhSidebar(doc, { directory, setName });

      // Ref / Date strip.
      setType(doc, PDF_FONTS.SANS, "bold", 10, LH.ink);
      doc.text("Ref:", g.bodyX, refY);
      const rlw = doc.getTextWidth("Ref:") + 6;
      setType(doc, PDF_FONTS.SANS, "normal", 10, LH.navy);
      doc.text(normaliseText(reference) || "—", g.bodyX + rlw, refY);

      const dateText = normaliseText(date);
      setType(doc, PDF_FONTS.SANS, "normal", 10, LH.ink);
      doc.text(dateText, g.W - LG.margin, refY, { align: "right" });
      const dw = doc.getTextWidth(dateText);
      setType(doc, PDF_FONTS.SANS, "bold", 10, LH.ink);
      doc.text("Date:", g.W - LG.margin - dw - 6 - doc.getTextWidth("Date:"), refY);
      doc.setDrawColor(...LH.hair);
      doc.setLineWidth(0.7);
      doc.line(g.bodyX, refY + 11, g.W - LG.margin, refY + 11);

      // TO / FROM / SUBJECT, labels and values on two fixed columns.
      rows.forEach(([label, lines, weight], i) => {
        const top = rowTops[i];
        setType(doc, PDF_FONTS.SANS, "bold", 10.5, LH.ink);
        doc.text(label, labelX, top);
        setType(doc, PDF_FONTS.SANS, weight, 10.5, LH.ink);
        lines.forEach((line, n) => {
          doc.text(line, valueX, top + n * lead);
          // The subject keeps its underline.
          if (label === "Subject:") {
            doc.setDrawColor(...LH.ink);
            doc.setLineWidth(0.7);
            doc.line(valueX, top + n * lead + 2.2, valueX + doc.getTextWidth(line), top + n * lead + 2.2);
          }
        });
      });
      doc.setDrawColor(...LH.hair);
      doc.setLineWidth(0.7);
      doc.line(g.bodyX, blockRule, g.W - LG.margin, blockRule);

      setType(doc, PDF_FONTS.SANS, "normal", 11, LH.ink);
      doc.text(normaliseText(salutation) || "Dear Sir/Ma,", g.bodyX, salutationY);

      if (laid.height) drawPatrons(doc, laid, g.bodyX, page1Bottom + 10, g.bodyW);
    } else {
      lhWatermark(doc, watermark, frame.left + frame.width / 2, frame.top, g.contentBottom, 300);
      lhContHeader(doc, { logo, reference });
    }

    flow.placed
      .filter((l) => l.page === p)
      .forEach((l) => drawPlannedLine(doc, l.p, l.l, l.index, l.left, l.y));
    lhFooter(doc, { account: accountOn, page: p + 1, total: pages });
  }

  // ---- Close and signatures, under the last line.
  const tailPage = tailOnNewPage ? pages - 1 : flow.lastPage;
  doc.setPage(tailPage + 1);
  const frame = frames(tailPage);
  const closeY = tailOnNewPage ? frame.top : lastBaseline(flow) + 30;
  setType(doc, PDF_FONTS.SANS, "normal", 11, LH.ink);
  doc.text(normaliseText(closing) || "Yours faithfully,", frame.left, closeY);
  lhSignatures(doc, people, frame.left, closeY + 56, frame.width, signed);

  // What the sidebar did, for the composer to explain.
  doc.letterhead = {
    emailsShown: Boolean(directoryPlan?.emailsShown),
    emailBlock: directoryPlan?.emailBlock || "",
    overflow: Boolean(directoryPlan?.overflow),
    pages,
  };
  return doc;
}
