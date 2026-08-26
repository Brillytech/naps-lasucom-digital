import jsPDF from "jspdf";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  ImageRun,
  Header,
  Footer,
  AlignmentType,
  BorderStyle,
  TextWrappingType,
} from "docx";
import * as XLSX from "xlsx";
import { getSchemaForCategory } from "../data/recordFieldSchemas";
import {
  PDF_FONTS,
  registerPdfFonts,
  normaliseText,
  formatAmount,
} from "./pdfFonts";

const BRAND_BLUE_HEX = "1D4ED8";

const LOGO_HEADER_PATH = "/images/naps-logo.png";
const LOGO_WATERMARK_PATH = "/images/naps-logo-transparent.png";

const cache = {};

async function loadImageAsDataURL(path) {
  if (cache[path]) return cache[path];
  const response = await fetch(path);
  const blob = await response.blob();
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  cache[path] = dataUrl;
  return dataUrl;
}

async function loadImageArrayBuffer(path) {
  const response = await fetch(path);
  return response.arrayBuffer();
}

function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// Bakes a low-opacity version of the watermark logo onto a canvas so it can
// be embedded as a flat, semi-transparent PNG in the Word document.
async function loadWatermarkPngBuffer(opacity = 0.08, size = 480) {
  const dataUrl = await loadImageAsDataURL(LOGO_WATERMARK_PATH);
  const img = await loadImageElement(dataUrl);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.globalAlpha = opacity;
  ctx.drawImage(img, 0, 0, size, size);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob.arrayBuffer();
}

function getFieldEntries(record) {
  const schema = getSchemaForCategory(record.category);
  const fields =
    record.content_fields && typeof record.content_fields === "object"
      ? record.content_fields
      : {};

  const entries = schema
    .map((f) => [f.label, fields[f.key]])
    .filter(([, value]) => value && String(value).trim());

  if (entries.length === 0 && record.content_body) {
    entries.push(["Written Record", record.content_body]);
  }

  return entries;
}

function formatDate(dateStr) {
  if (!dateStr) return "No date";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getMetaEntries(record, setLabel) {
  const meta = [
    ["Category", record.category],
    ["DEC Set", setLabel || "No DEC set"],
    ["Record Date", formatDate(record.record_date)],
    ["Record Type", record.record_type],
    ["Prepared By", record.prepared_by || "Not stated"],
    ["Reviewed By", record.reviewed_by || "Not stated"],
    ["Office", record.source_office || "Not stated"],
  ];

  if (record.amount) meta.push(["Amount / Proceeds", formatAmount(record.amount)]);
  if (record.drive_link) meta.push(["Drive Link", record.drive_link]);

  return meta;
}

function safeFileName(title) {
  return (title || "record").replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ---------------------------- PDF EXPORT ----------------------------
 *
 * Laid out as a formal record rather than a form dump: a masthead, a
 * reference line, a rule-separated metadata table, numbered sections on a
 * measured column, and a signature block. Type does the work -- serif for
 * reading, sans for labels, one accent colour used sparingly.
 */

/** Page furniture, in points. A4 is 595.28 x 841.89. */
const PDF = {
  margin: 56,
  gutter: 18,
  // ~92 characters at 10pt serif is too wide to read comfortably; the body
  // column is deliberately narrower than the full measure.
  bodyLeading: 15.5,
  rule: 0.6,
};

const TYPE = {
  masthead: 15,
  docType: 8.5,
  title: 23,
  subtitle: 10.5,
  sectionNo: 8.5,
  section: 11.5,
  label: 7.5,
  value: 9.5,
  body: 10,
  footer: 7.5,
};

const PALETTE = {
  ink: [26, 28, 33],
  body: [48, 52, 60],
  muted: [122, 128, 140],
  hairline: [214, 218, 226],
  accent: [7, 82, 184],
  accentSoft: [232, 240, 252],
};

export async function downloadRecordAsPDF(record, setLabel) {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });

  // Embeds Unicode fonts. Without these, any curly quote letter-spaces its
  // whole paragraph and the Naira sign renders as a broken bar.
  const hasFonts = await registerPdfFonts(doc);

  const SERIF = hasFonts ? PDF_FONTS.SERIF : "times";
  const SANS = hasFonts ? PDF_FONTS.SANS : "helvetica";

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const { margin } = PDF;
  const contentWidth = pageWidth - margin * 2;
  const footerY = pageHeight - 42;
  const bodyFloor = footerY - 26;

  let y = margin;
  let pageIndex = 1;

  let headerLogo = null;
  let watermarkLogo = null;

  try {
    headerLogo = await loadImageAsDataURL(LOGO_HEADER_PATH);
  } catch {
    // Logo missing -- the export still produces a valid document.
  }

  try {
    watermarkLogo = await loadImageAsDataURL(LOGO_WATERMARK_PATH);
  } catch {
    // Watermark missing -- non-fatal.
  }

  /* ---------------- primitives ---------------- */

  const setType = (family, style, size, colour) => {
    doc.setFont(family, style);
    doc.setFontSize(size);
    doc.setTextColor(...colour);
  };

  const hairline = (yy, x1 = margin, x2 = pageWidth - margin, colour = PALETTE.hairline) => {
    doc.setDrawColor(...colour);
    doc.setLineWidth(PDF.rule);
    doc.line(x1, yy, x2, yy);
  };

  /**
   * A restrained crest, low on the page rather than centred behind the text.
   *
   * Centred and large, it competed with the body on dense pages and dominated
   * sparse ones. Kept small and set below the text block, it reads as a mark of
   * origin instead of a background.
   *
   * Opacity is applied through GState where the renderer supports it, but the
   * size and placement are chosen so the document still looks right if a
   * renderer ignores it -- pdf.js, for one, does not honour it reliably.
   */
  function drawWatermark() {
    if (!watermarkLogo) return;

    const size = 132;
    const x = (pageWidth - size) / 2;
    const yy = pageHeight - size - 96;

    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.05 }));
    doc.addImage(watermarkLogo, "PNG", x, yy, size, size);
    doc.restoreGraphicsState();
  }

  /** Full masthead, page 1 only. */
  function drawMasthead() {
    const top = margin;

    if (headerLogo) doc.addImage(headerLogo, "PNG", margin, top - 4, 38, 38);

    const textX = headerLogo ? margin + 50 : margin;

    setType(SANS, "bold", TYPE.masthead, PALETTE.ink);
    doc.text("NAPS LASUCOM", textX, top + 12);

    setType(SANS, "normal", 8, PALETTE.muted);
    doc.text(
      "Nigeria Association of Physiotherapy Students",
      textX,
      top + 24
    );

    setType(SANS, "bold", TYPE.docType, PALETTE.accent);
    doc.text("OFFICIAL RECORD", pageWidth - margin, top + 12, {
      align: "right",
      charSpace: 0.8,
    });

    setType(SANS, "normal", 8, PALETTE.muted);
    doc.text("Digital Secretariat", pageWidth - margin, top + 24, {
      align: "right",
    });

    // Double rule: a heavy accent line over a hairline reads as letterhead
    // rather than as a divider.
    doc.setDrawColor(...PALETTE.accent);
    doc.setLineWidth(1.6);
    doc.line(margin, top + 40, pageWidth - margin, top + 40);
    hairline(top + 44);

    y = top + 74;
  }

  /** Compact running header for continuation pages. */
  function drawRunningHeader() {
    const top = margin - 12;

    setType(SANS, "bold", 7.5, PALETTE.muted);
    doc.text("NAPS LASUCOM · OFFICIAL RECORD", margin, top, { charSpace: 0.6 });

    setType(SANS, "normal", 7.5, PALETTE.muted);
    doc.text(
      normaliseText(record.title || "Untitled Record").slice(0, 58),
      pageWidth - margin,
      top,
      { align: "right" }
    );

    hairline(top + 8);
    y = top + 30;
  }

  function newPage() {
    doc.addPage();
    pageIndex += 1;
    drawWatermark();
    drawRunningHeader();
  }

  const ensure = (needed) => {
    if (y + needed > bodyFloor) newPage();
  };

  /**
   * Draw a wrapped paragraph, breaking pages mid-paragraph where needed.
   * Blank lines in the source become real paragraph spacing.
   */
  function paragraph(
    text,
    {
      width = contentWidth,
      x = margin,
      leading = PDF.bodyLeading,
      font = SERIF,
      style = "normal",
      size = TYPE.body,
      colour = PALETTE.body,
    } = {}
  ) {
    // Blank lines separate paragraphs; single newlines are real breaks. Minutes
    // are typed as "3. HEALTH WEEK BUDGET\nThe Social Director tabled...", so
    // collapsing single newlines would run every heading into its own body.
    const blocks = normaliseText(text).split(/\n{2,}/);

    blocks.forEach((block, blockIndex) => {
      // Flatten to laid-out lines first so keep-with-next can look ahead.
      const lines = block
        .split("\n")
        .flatMap((rawLine) => doc.splitTextToSize(rawLine, width));

      lines.forEach((line, lineIndex) => {
        // Never strand a line alone at a page foot. Reserving two leadings
        // while more lines follow keeps a run-in heading with its body, which
        // is where this showed up: "4. CONSTITUTIONAL AMENDMENT" sat by itself
        // at the bottom of page one.
        const hasMore = lineIndex < lines.length - 1;

        // Order matters: break the page first, then re-assert type. The
        // running header leaves the font set to sans, so setting it before
        // ensure() would be undone by the break.
        ensure(hasMore ? leading * 2 : leading);
        setType(font, style, size, colour);
        doc.text(line, x, y);
        y += leading;
      });

      if (blockIndex < blocks.length - 1) y += leading * 0.5;
    });
  }

  /* ---------------- document ---------------- */

  drawWatermark();
  drawMasthead();

  // --- Reference line: category and date, above the title ---
  setType(SANS, "bold", TYPE.label, PALETTE.accent);
  doc.text(
    normaliseText(record.category || "Record").toUpperCase(),
    margin,
    y,
    { charSpace: 1.1 }
  );

  setType(SANS, "normal", TYPE.label, PALETTE.muted);
  doc.text(formatDate(record.record_date).toUpperCase(), pageWidth - margin, y, {
    align: "right",
    charSpace: 1.1,
  });

  y += 20;

  // --- Title ---
  setType(SERIF, "bold", TYPE.title, PALETTE.ink);
  doc.splitTextToSize(normaliseText(record.title || "Untitled Record"), contentWidth).forEach(
    (line) => {
      ensure(30);
      doc.text(line, margin, y);
      y += 28;
    }
  );

  y += 6;

  // --- Metadata: a rule-separated table, not a grey box ---
  const metaEntries = getMetaEntries(record, setLabel);
  const colWidth = (contentWidth - PDF.gutter) / 2;
  const metaRowHeight = 30;

  hairline(y);
  y += 16;

  metaEntries.forEach(([label, value], index) => {
    const col = index % 2;
    const isNewRow = col === 0;

    if (isNewRow) ensure(metaRowHeight);

    const x = margin + col * (colWidth + PDF.gutter);
    const rowY = y;

    setType(SANS, "bold", TYPE.label, PALETTE.muted);
    doc.text(label.toUpperCase(), x, rowY, { charSpace: 0.7 });

    setType(SERIF, "normal", TYPE.value, PALETTE.ink);
    const shown = doc.splitTextToSize(normaliseText(value), colWidth)[0] || "—";
    doc.text(shown, x, rowY + 13);

    // Advance only after the right-hand cell, or after a lone final cell.
    if (col === 1 || index === metaEntries.length - 1) y += metaRowHeight;
  });

  y += 4;
  hairline(y);
  y += 30;

  /* --- Sections --- */

  const sections = [];
  if (record.summary) sections.push(["Summary", record.summary]);
  getFieldEntries(record).forEach(([label, value]) => sections.push([label, value]));

  sections.forEach(([label, value], index) => {
    // Keep a heading with at least a couple of lines of its body.
    ensure(PDF.bodyLeading * 3 + 34);

    const number = String(index + 1).padStart(2, "0");

    setType(SANS, "bold", TYPE.sectionNo, PALETTE.accent);
    doc.text(number, margin, y);

    setType(SANS, "bold", TYPE.section, PALETTE.ink);
    doc.text(normaliseText(label).toUpperCase(), margin + 24, y, { charSpace: 0.5 });

    y += 9;
    hairline(y, margin + 24, pageWidth - margin, PALETTE.accentSoft);
    y += 18;

    setType(SERIF, "normal", TYPE.body, PALETTE.body);
    paragraph(value, { x: margin + 24, width: contentWidth - 24 });

    y += 22;
  });

  /* --- Signature block --- */

  const signers = [
    ["Prepared by", record.prepared_by],
    ["Reviewed by", record.reviewed_by],
  ].filter(([, name]) => normaliseText(name));

  if (signers.length) {
    ensure(96);
    y += 10;
    hairline(y);
    y += 30;

    signers.forEach(([role, name], index) => {
      const x = margin + index * (colWidth + PDF.gutter);

      // Signature rule sits above the name, as on a signed document.
      doc.setDrawColor(...PALETTE.hairline);
      doc.setLineWidth(PDF.rule);
      doc.line(x, y, x + colWidth - 40, y);

      setType(SERIF, "bold", TYPE.value, PALETTE.ink);
      doc.text(normaliseText(name), x, y + 15);

      setType(SANS, "normal", TYPE.label, PALETTE.muted);
      doc.text(role.toUpperCase(), x, y + 27, { charSpace: 0.7 });
    });

    y += 46;
  }

  /* --- Footers, once the page count is final --- */

  const totalPages = doc.internal.getNumberOfPages();
  const reference = `${safeFileName(record.title).slice(0, 28).toUpperCase()}`;

  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);

    hairline(footerY - 12);

    setType(SANS, "normal", TYPE.footer, PALETTE.muted);
    doc.text(
      `NAPS LASUCOM Digital Secretariat · Ref ${reference} · Generated ${formatDate(
        new Date().toISOString()
      )}`,
      margin,
      footerY
    );

    doc.text(`${page} / ${totalPages}`, pageWidth - margin, footerY, {
      align: "right",
    });
  }

  doc.save(`${safeFileName(record.title)}.pdf`);
}

/* ---------------------------- WORD EXPORT ---------------------------- */

export async function downloadRecordAsDocx(record, setLabel) {
  let headerLogoBuffer = null;
  let watermarkBuffer = null;

  try {
    headerLogoBuffer = await loadImageArrayBuffer(LOGO_HEADER_PATH);
  } catch (e) {
    // Logo missing — export still proceeds without it.
  }

  try {
    watermarkBuffer = await loadWatermarkPngBuffer(0.08, 480);
  } catch (e) {
    // Watermark missing — export still proceeds without it.
  }

  const headerChildren = [];

  headerChildren.push(
    new Paragraph({
      children: [
        ...(headerLogoBuffer
          ? [
              new ImageRun({
                data: headerLogoBuffer,
                transformation: { width: 34, height: 34 },
              }),
              new TextRun({ text: "   " }),
            ]
          : []),
        new TextRun({ text: "NAPS LASUCOM", bold: true, size: 24, color: BRAND_BLUE_HEX }),
      ],
    })
  );

  headerChildren.push(
    new Paragraph({
      spacing: { after: 120 },
      border: {
        bottom: { color: BRAND_BLUE_HEX, space: 6, style: BorderStyle.SINGLE, size: 8 },
      },
      children: [
        new TextRun({
          text: "Digital Secretariat • Official Record Export",
          size: 16,
          color: "888888",
        }),
      ],
    })
  );

  const bodyChildren = [];

  if (watermarkBuffer) {
    bodyChildren.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: watermarkBuffer,
            transformation: { width: 380, height: 380 },
            floating: {
              horizontalPosition: { relative: "page", align: "center" },
              verticalPosition: { relative: "page", align: "center" },
              behindDocument: true,
              wrap: { type: TextWrappingType.NONE },
            },
          }),
        ],
      })
    );
  }

  bodyChildren.push(
    new Paragraph({
      text: record.title || "Untitled Record",
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 160 },
    })
  );

  bodyChildren.push(
    new Paragraph({
      spacing: { after: 220 },
      children: [
        new TextRun({
          text: (record.category || "Record").toUpperCase(),
          bold: true,
          size: 18,
          color: BRAND_BLUE_HEX,
        }),
      ],
    })
  );

  getMetaEntries(record, setLabel).forEach(([label, value]) => {
    bodyChildren.push(
      new Paragraph({
        spacing: { after: 90 },
        children: [
          new TextRun({ text: `${label}: `, bold: true, color: BRAND_BLUE_HEX }),
          new TextRun({ text: String(value) }),
        ],
      })
    );
  });

  bodyChildren.push(new Paragraph({ text: "", spacing: { after: 160 } }));

  if (record.summary) {
    bodyChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 100, after: 90 },
        children: [new TextRun({ text: "Summary", color: BRAND_BLUE_HEX })],
      })
    );
    bodyChildren.push(
      new Paragraph({ text: record.summary, spacing: { after: 200 } })
    );
  }

  getFieldEntries(record).forEach(([label, value]) => {
    bodyChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 200, after: 90 },
        children: [new TextRun({ text: label, color: BRAND_BLUE_HEX })],
      })
    );
    bodyChildren.push(
      new Paragraph({ text: String(value), spacing: { after: 160 } })
    );
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        headers: { default: new Header({ children: headerChildren }) },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `NAPS LASUCOM Digital Secretariat • Generated ${formatDate(
                      new Date().toISOString()
                    )}`,
                    size: 16,
                    color: "999999",
                  }),
                ],
              }),
            ],
          }),
        },
        children: bodyChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `${safeFileName(record.title)}.docx`);
}

/* --------------------------- EXCEL EXPORT ---------------------------- */
/* Kept plain and functional, per instruction — no logo/branding here. */

export function downloadRecordAsExcel(record, setLabel) {
  const rows = [
    ["Field", "Value"],
    ["Title", record.title || ""],
    ...getMetaEntries(record, setLabel),
    ["Summary", record.summary || ""],
    ...getFieldEntries(record),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [{ wch: 24 }, { wch: 80 }];
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Record");
  XLSX.writeFile(workbook, `${safeFileName(record.title)}.xlsx`);
}

export function downloadRecordsAsExcel(records, getSetLabel) {
  const rows = records.map((record) => ({
    Title: record.title || "",
    Category: record.category || "",
    "DEC Set": getSetLabel ? getSetLabel(record) : "",
    "Record Date": formatDate(record.record_date),
    "Record Type": record.record_type || "",
    "Prepared By": record.prepared_by || "",
    "Reviewed By": record.reviewed_by || "",
    Office: record.source_office || "",
    Amount: record.amount || "",
    Summary: record.summary || "",
    "Drive Link": record.drive_link || "",
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 22 }));
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Records");
  XLSX.writeFile(workbook, `records_export_${Date.now()}.xlsx`);
}
