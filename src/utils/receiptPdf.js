/*
  The NAPS-LASUCOM official receipt, in two formats from one design:

  - "rect": 210 x 99 mm landscape (DL / cheque proportion), the default.
  - "a4":   A4 portrait, the same content with room to breathe.

  Everything printed comes from the receipt row's snapshot, taken when the
  payment was verified, so a receipt reads the same forever. There is no
  drawn signature and no stamp: the two officers are named, with dates.

  Fonts: Playfair Display (headings, motto), Noto Sans (body), Noto Serif
  (numbers and amounts). All embedded, so ₦ prints as itself. Nothing is
  set below 8pt on the rectangle or 9pt on A4.

  The PNG download is the PDF rendered to an image, so the two never drift.
*/
import jsPDF from "jspdf";
import { registerFontFiles } from "./pdfFonts";
import { download, rasterisePdf, safeFileName } from "./pdfPreview";
import { amountInWords, formatNaira } from "./money";

const C = {
  blue: [11, 58, 130], // #0B3A82
  green: [31, 143, 78], // #1F8F4E
  pale: [234, 241, 251], // #EAF1FB
  paleGreen: [229, 243, 235],
  ink: [16, 32, 63],
  muted: [91, 103, 130],
  rule: [213, 222, 236],
  white: [255, 255, 255],
};

const F = { display: "PlayfairDisplay", sans: "NotoSans", serif: "NotoSerif" };

const FONT_FILES = [
  { file: "PlayfairDisplay-Bold.ttf", family: F.display, style: "bold" },
  { file: "PlayfairDisplay-Italic.ttf", family: F.display, style: "italic" },
  { file: "NotoSans-Regular.ttf", family: F.sans, style: "normal" },
  { file: "NotoSans-Bold.ttf", family: F.sans, style: "bold" },
  { file: "NotoSerif-Regular.ttf", family: F.serif, style: "normal" },
  { file: "NotoSerif-Bold.ttf", family: F.serif, style: "bold" },
  { file: "NotoSerif-Italic.ttf", family: F.serif, style: "italic" },
];

const METHOD = { cash: "Cash", bank_transfer: "Bank transfer", other: "Other" };
const PUBLIC_HOST = "naps-lasucom-digital.vercel.app";
const MOTTO = "Strength in knowledge, Service to Humanity";

let crestPromise = null;

// The real crest from the project, never redrawn.
function loadCrest() {
  if (!crestPromise) {
    crestPromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d").drawImage(img, 0, 0);
        resolve({ data: canvas.toDataURL("image/png"), ratio: img.naturalHeight / img.naturalWidth });
      };
      img.onerror = () => {
        crestPromise = null;
        reject(new Error("Could not load the crest"));
      };
      img.src = "/images/naps-logo.png";
    });
  }
  return crestPromise;
}

function fmtDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function verifyHost() {
  const { hostname, host } = window.location;
  return hostname === "localhost" || hostname === "127.0.0.1" ? PUBLIC_HOST : host;
}

// ---------------------------------------------------------------------------
// Drawing primitives
// ---------------------------------------------------------------------------
function makeKit(doc) {
  const kit = {
    font(family, style, size, color = C.ink) {
      doc.setFont(family, style);
      doc.setFontSize(size);
      doc.setTextColor(...color);
    },
    // Text with optional letter spacing; alignment computed by hand because
    // jsPDF's own right-align ignores charSpace.
    text(str, x, y, { align = "left", charSpace = 0 } = {}) {
      const width = doc.getTextWidth(str) + charSpace * Math.max(str.length - 1, 0);
      const left = align === "right" ? x - width : align === "center" ? x - width / 2 : x;
      doc.text(str, left, y, { charSpace });
      return width;
    },
    fill(color) {
      doc.setFillColor(...color);
    },
    rect(x, y, w, h, color) {
      kit.fill(color);
      doc.rect(x, y, w, h, "F");
    },
    line(x1, y1, x2, y2, color, width) {
      doc.setDrawColor(...color);
      doc.setLineWidth(width);
      doc.line(x1, y1, x2, y2);
    },
  };
  return kit;
}

// Thin blue bar with a short green block at the right end.
function drawBar(kit, y, pageW, h, greenW) {
  kit.rect(0, y, pageW, h, C.blue);
  kit.rect(pageW - greenW, y, greenW, h, C.green);
}

function drawWatermark(doc, crest, cx, cy, size) {
  doc.setGState(new doc.GState({ opacity: 0.07 }));
  doc.addImage(crest.data, "PNG", cx - size / 2, cy - (size * crest.ratio) / 2, size, size * crest.ratio);
  doc.setGState(new doc.GState({ opacity: 1 }));
}

function drawVerifiedPill(doc, kit, x, y, h, size) {
  kit.font(F.sans, "bold", size, C.white);
  const label = "PAYMENT VERIFIED";
  const charSpace = h * 0.06;
  const textW = doc.getTextWidth(label) + charSpace * (label.length - 1);
  const checkW = h * 0.55;
  const padX = h * 0.55;
  const w = padX + checkW + h * 0.3 + textW + padX;

  kit.fill(C.green);
  doc.roundedRect(x, y, w, h, h / 2, h / 2, "F");

  // Check mark, drawn rather than a font glyph.
  const cx = x + padX;
  const cy = y + h / 2;
  doc.setDrawColor(...C.white);
  doc.setLineWidth(h * 0.11);
  doc.setLineCap("round");
  doc.setLineJoin("round");
  doc.lines([[checkW * 0.32, checkW * 0.3], [checkW * 0.62, -checkW * 0.62]], cx, cy, [1, 1], "S");
  doc.setLineCap("butt");

  kit.font(F.sans, "bold", size, C.white);
  kit.text(label, cx + checkW + h * 0.3, cy + size * 0.3528 * 0.36, { charSpace });
  return w;
}

function summaryRows(r) {
  const before = Number(r.paid_to_date_kobo) - Number(r.amount_kobo);
  return [
    ["Total due", r.total_due_kobo],
    ...(before > 0 ? [["Paid before this receipt", before]] : []),
    ["Paid with this receipt", r.amount_kobo],
    ["Outstanding balance", r.outstanding_kobo, true],
  ];
}

function detailRows(r) {
  return [
    ["Received from", r.student_name],
    ["Matric number", r.matric_no],
    ["Level", r.level ? `${r.level} Level` : "—"],
    ["Academic session", r.session_label],
    ["Payment for", r.fee_name],
    ["Payment method", METHOD[r.payment_method] || r.payment_method],
    ["Payment date", fmtDate(r.payment_date)],
    ["Payment reference", r.payment_reference || "—"],
  ];
}

function drawSummaryTable(doc, kit, r, { x, y, w, rowH, size, padX }) {
  const rows = summaryRows(r);
  rows.forEach(([label, kobo, isBalance], i) => {
    const top = y + i * rowH;
    const settled = isBalance && Number(kobo) === 0;
    if (settled) kit.rect(x, top, w, rowH, C.paleGreen);
    if (i > 0) kit.line(x, top, x + w, top, C.rule, 0.2);

    const baseline = top + rowH / 2 + size * 0.3528 * 0.36;
    kit.font(F.sans, isBalance ? "bold" : "normal", size, settled ? C.green : isBalance ? C.ink : C.muted);
    kit.text(label, x + padX, baseline);
    kit.font(F.serif, "bold", size, settled ? C.green : C.ink);
    kit.text(formatNaira(kobo), x + w - padX, baseline, { align: "right" });
  });
  doc.setDrawColor(...C.rule);
  doc.setLineWidth(0.25);
  doc.rect(x, y, w, rows.length * rowH, "S");
  return rows.length * rowH;
}

function drawSample(doc, kit, pageW, pageH, size) {
  doc.setGState(new doc.GState({ opacity: 0.12 }));
  kit.font(F.sans, "bold", size, C.blue);
  doc.text("SAMPLE · NOT A VALID RECEIPT", pageW / 2, pageH / 2, { align: "center", angle: 18 });
  doc.setGState(new doc.GState({ opacity: 1 }));
}

// ---------------------------------------------------------------------------
// Format A: 210 x 99 mm
// ---------------------------------------------------------------------------
function drawRect(doc, r, crest) {
  const kit = makeKit(doc);
  const W = 210;
  const H = 99;
  const M = 9;

  drawWatermark(doc, crest, W / 2, 57, 50);
  drawBar(kit, 0, W, 2.2, 34);
  drawBar(kit, H - 2.2, W, 2.2, 34);

  // Header
  doc.addImage(crest.data, "PNG", M, 5.2, 14.5, 14.5 * crest.ratio);
  kit.font(F.display, "bold", 12.5, C.blue);
  kit.text("Nigeria Association of Physiotherapy Students", 27, 11.2);
  kit.font(F.sans, "normal", 8.5, C.muted);
  kit.text("LASUCOM Chapter", 27, 15.8);

  kit.font(F.sans, "bold", 8.5, C.blue);
  kit.text("OFFICIAL RECEIPT", W - M, 9.4, { align: "right", charSpace: 0.55 });
  kit.font(F.serif, "bold", 10.5, C.ink);
  kit.text(r.receipt_number, W - M, 14.6, { align: "right" });
  kit.font(F.sans, "normal", 8, C.muted);
  kit.text(`Issued ${fmtDate(r.issued_at)}`, W - M, 18.6, { align: "right" });

  kit.rect(M, 21.6, W - 2 * M, 0.9, C.blue);
  kit.rect(M, 23.0, W - 2 * M, 0.35, C.green);

  // Left: amount box
  const boxX = M;
  const boxY = 26.5;
  const boxW = 86;
  const boxH = 30;
  kit.fill(C.pale);
  doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, "F");
  kit.font(F.sans, "bold", 8, C.muted);
  kit.text("AMOUNT RECEIVED", boxX + 4, boxY + 5.2, { charSpace: 0.35 });
  kit.font(F.serif, "bold", 19, C.blue);
  kit.text(formatNaira(r.amount_kobo), boxX + 4, boxY + 13.4);
  kit.font(F.serif, "italic", 8.5, C.ink);
  const words = doc.splitTextToSize(amountInWords(r.amount_kobo), boxW - 8).slice(0, 2);
  words.forEach((line, i) => kit.text(line, boxX + 4, boxY + 18.4 + i * 3.6));
  drawVerifiedPill(doc, kit, boxX + 4, boxY + boxH - 7.6, 5.2, 8);

  // Left: summary table
  drawSummaryTable(doc, kit, r, { x: M, y: boxY + boxH + 2.2, w: boxW, rowH: summaryRows(r).length > 3 ? 4.2 : 5.2, size: 8, padX: 3 });

  // Right: details
  const dx = 101;
  const labelW = 31;
  detailRows(r).forEach(([label, value], i) => {
    const y = 30.2 + i * 5.85;
    kit.font(F.sans, "normal", 8, C.muted);
    kit.text(label, dx, y);
    kit.font(F.sans, "bold", 8.8, C.ink);
    const v = doc.splitTextToSize(String(value), W - M - dx - labelW)[0];
    kit.text(v, dx + labelW, y);
    if (i < 7) kit.line(dx, y + 2.1, W - M, y + 2.1, C.rule, 0.15);
  });

  // Officers
  kit.line(M, 77.4, W - M, 77.4, C.rule, 0.25);
  [
    ["Payment recorded by", r.recorded_by_name, r.recorded_by_title, r.recorded_at, M],
    ["Payment verified by", r.verified_by_name, r.verified_by_title, r.verified_at, dx],
  ].forEach(([label, name, title, at, x]) => {
    kit.font(F.sans, "normal", 8, C.muted);
    kit.text(label, x, 80.9);
    kit.font(F.sans, "bold", 8.5, C.ink);
    const w = kit.text(name, x, 84.6);
    kit.font(F.sans, "normal", 8, C.muted);
    kit.text(`  ·  ${title}  ·  ${fmtDate(at)}`, x + w, 84.6);
  });

  // Footer
  kit.font(F.display, "italic", 9, C.blue);
  kit.text(MOTTO, M, 90.3);
  const verify = `Verify at ${verifyHost()}/verify`;
  kit.font(F.sans, "normal", 8, C.muted);
  kit.text(verify, W - M, 90.3, { align: "right" });
  doc.link(W - M - doc.getTextWidth(verify), 87.5, doc.getTextWidth(verify), 3.5, {
    url: `${window.location.origin}/verify?n=${encodeURIComponent(r.receipt_number)}`,
  });
  kit.text(
    `Issued electronically by NAPS-LASUCOM Digital after verification by the Financial Secretary. Receipt ${r.receipt_number}.`,
    M,
    94.0
  );

  if (r.__sample) drawSample(doc, kit, W, H, 26);
}

// ---------------------------------------------------------------------------
// Format B: A4 portrait
// ---------------------------------------------------------------------------
function drawA4(doc, r, crest) {
  const kit = makeKit(doc);
  const W = 210;
  const H = 297;
  const M = 18;

  drawWatermark(doc, crest, W / 2, 150, 110);
  drawBar(kit, 0, W, 3.2, 48);
  drawBar(kit, H - 3.2, W, 3.2, 48);

  // Header
  doc.addImage(crest.data, "PNG", M, 13, 24, 24 * crest.ratio);
  kit.font(F.display, "bold", 17, C.blue);
  kit.text("Nigeria Association of", M + 30, 21.5);
  kit.text("Physiotherapy Students", M + 30, 28.6);
  kit.font(F.sans, "normal", 10.5, C.muted);
  kit.text("LASUCOM Chapter", M + 30, 34.6);

  kit.font(F.sans, "bold", 10, C.blue);
  kit.text("OFFICIAL RECEIPT", W - M, 20.5, { align: "right", charSpace: 0.8 });
  kit.font(F.serif, "bold", 13, C.ink);
  kit.text(r.receipt_number, W - M, 28, { align: "right" });
  kit.font(F.sans, "normal", 9.5, C.muted);
  kit.text(`Issued ${fmtDate(r.issued_at)}`, W - M, 34, { align: "right" });

  kit.rect(M, 42, W - 2 * M, 1.3, C.blue);
  kit.rect(M, 44.1, W - 2 * M, 0.5, C.green);

  // Amount box
  const boxY = 52;
  const boxH = 38;
  kit.fill(C.pale);
  doc.roundedRect(M, boxY, W - 2 * M, boxH, 3, 3, "F");
  kit.font(F.sans, "bold", 10, C.muted);
  kit.text("AMOUNT RECEIVED", M + 7, boxY + 9.5, { charSpace: 0.5 });
  kit.font(F.serif, "bold", 30, C.blue);
  kit.text(formatNaira(r.amount_kobo), M + 7, boxY + 22.5);
  kit.font(F.serif, "italic", 11, C.ink);
  const words = doc.splitTextToSize(amountInWords(r.amount_kobo), W - 2 * M - 14).slice(0, 2);
  words.forEach((line, i) => kit.text(line, M + 7, boxY + 30 + i * 4.8));
  drawVerifiedPill(doc, kit, W - M - 7 - 52, boxY + 6, 7.2, 10);

  // Details: two columns, label over value.
  const colW = (W - 2 * M) / 2;
  detailRows(r).forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = M + col * colW;
    const y = 108 + row * 15;
    kit.font(F.sans, "normal", 9.5, C.muted);
    kit.text(label, x, y);
    kit.font(F.sans, "bold", 11.5, C.ink);
    kit.text(doc.splitTextToSize(String(value), colW - 6)[0], x, y + 6);
    kit.line(x, y + 9.5, x + colW - 6, y + 9.5, C.rule, 0.2);
  });

  // Summary
  kit.font(F.sans, "bold", 10, C.muted);
  kit.text("SUMMARY", M, 176, { charSpace: 0.5 });
  drawSummaryTable(doc, kit, r, { x: M, y: 180, w: W - 2 * M, rowH: 9, size: 10.5, padX: 5 });

  // Officers
  const oy = 226;
  kit.line(M, oy - 6, W - M, oy - 6, C.rule, 0.3);
  [
    ["Payment recorded by", r.recorded_by_name, r.recorded_by_title, r.recorded_at, M],
    ["Payment verified by", r.verified_by_name, r.verified_by_title, r.verified_at, M + colW],
  ].forEach(([label, name, title, at, x]) => {
    kit.font(F.sans, "normal", 9.5, C.muted);
    kit.text(label, x, oy);
    kit.font(F.sans, "bold", 12, C.ink);
    kit.text(name, x, oy + 6.5);
    kit.font(F.sans, "normal", 10, C.muted);
    kit.text(`${title} · ${fmtDate(at)}`, x, oy + 12);
  });

  // Footer
  kit.font(F.display, "italic", 12.5, C.blue);
  kit.text(MOTTO, W / 2, 265, { align: "center" });
  kit.font(F.sans, "normal", 9.5, C.muted);
  kit.text("Issued electronically by NAPS-LASUCOM Digital after verification by the Financial Secretary.", W / 2, 273, { align: "center" });
  const verify = `Verify this receipt at ${verifyHost()}/verify  ·  ${r.receipt_number}`;
  kit.text(verify, W / 2, 279, { align: "center" });
  doc.link(W / 2 - doc.getTextWidth(verify) / 2, 275.5, doc.getTextWidth(verify), 4.5, {
    url: `${window.location.origin}/verify?n=${encodeURIComponent(r.receipt_number)}`,
  });

  if (r.__sample) drawSample(doc, kit, W, H, 40);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function buildReceiptPdf(receipt, format = "rect") {
  const doc =
    format === "a4"
      ? new jsPDF({ unit: "mm", format: "a4" })
      : new jsPDF({ unit: "mm", orientation: "landscape", format: [99, 210] });

  const [crest] = await Promise.all([loadCrest(), registerFontFiles(doc, FONT_FILES)]);

  doc.setProperties({
    title: `Receipt ${receipt.receipt_number}`,
    subject: "NAPS-LASUCOM official receipt",
    author: "NAPS-LASUCOM Digital",
  });

  if (format === "a4") drawA4(doc, receipt, crest);
  else drawRect(doc, receipt, crest);
  return doc;
}

function fileBase(receipt) {
  return safeFileName(`NAPS receipt ${receipt.receipt_number.replace(/\//g, "-")} ${receipt.student_name}`);
}

export async function downloadReceiptPdf(receipt, format = "rect") {
  const doc = await buildReceiptPdf(receipt, format);
  doc.save(`${fileBase(receipt)}${format === "a4" ? " A4" : ""}.pdf`);
}

export async function downloadReceiptImage(receipt) {
  const doc = await buildReceiptPdf(receipt, "rect");
  const { pages } = await rasterisePdf(doc, 3.2);
  download(pages[0], `${fileBase(receipt)}.png`);
}
