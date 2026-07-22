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

const BRAND_BLUE_HEX = "1D4ED8";
const BRAND_BLUE_RGB = [29, 78, 216];
const BRAND_LIGHT_RGB = [239, 246, 255];
const MUTED_RGB = [130, 130, 130];
const INK_RGB = [35, 35, 38];

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

  if (record.amount) meta.push(["Amount / Proceeds", record.amount]);
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

/* ---------------------------- PDF EXPORT ---------------------------- */

export async function downloadRecordAsPDF(record, setLabel) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 50;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  let headerLogo = null;
  let watermarkLogo = null;

  try {
    headerLogo = await loadImageAsDataURL(LOGO_HEADER_PATH);
  } catch (e) {
    // Logo missing — export still proceeds without it.
  }

  try {
    watermarkLogo = await loadImageAsDataURL(LOGO_WATERMARK_PATH);
  } catch (e) {
    // Watermark missing — export still proceeds without it.
  }

  function drawWatermark() {
    if (!watermarkLogo) return;
    const size = 320;
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.06 }));
    doc.addImage(
      watermarkLogo,
      "PNG",
      (pageWidth - size) / 2,
      (pageHeight - size) / 2,
      size,
      size
    );
    doc.restoreGraphicsState();
  }

  function drawHeader() {
    y = margin;

    if (headerLogo) {
      doc.addImage(headerLogo, "PNG", margin, y - 6, 34, 34);
    }

    const textX = headerLogo ? margin + 44 : margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BRAND_BLUE_RGB);
    doc.text("NAPS LASUCOM", textX, y + 8);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED_RGB);
    doc.text("Digital Secretariat • Official Record Export", textX, y + 21);

    doc.setDrawColor(...BRAND_BLUE_RGB);
    doc.setLineWidth(1.2);
    doc.line(margin, y + 34, pageWidth - margin, y + 34);

    y += 58;
  }

  function ensureSpace(minSpace) {
    if (y > pageHeight - minSpace) {
      doc.addPage();
      drawWatermark();
      drawHeader();
    }
  }

  function drawFooter(pageNum, totalPages) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED_RGB);
    doc.text(
      `Generated ${formatDate(new Date().toISOString())} • NAPS LASUCOM Digital Secretariat`,
      margin,
      pageHeight - 26
    );
    doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin, pageHeight - 26, {
      align: "right",
    });
  }

  drawWatermark();
  drawHeader();

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...INK_RGB);
  doc.splitTextToSize(record.title || "Untitled Record", contentWidth).forEach((row) => {
    ensureSpace(90);
    doc.text(row, margin, y);
    y += 24;
  });

  y += 4;

  // Category badge
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const badgeText = record.category || "Record";
  const badgeWidth = doc.getTextWidth(badgeText) + 22;
  doc.setFillColor(...BRAND_LIGHT_RGB);
  doc.roundedRect(margin, y, badgeWidth, 21, 5, 5, "F");
  doc.setTextColor(...BRAND_BLUE_RGB);
  doc.text(badgeText, margin + 11, y + 14);
  y += 38;

// Meta info box
  const metaEntries = getMetaEntries(record, setLabel);
  const metaRowHeight = 28;
  const metaRows = Math.ceil(metaEntries.length / 2);
  const metaBoxHeight = metaRows * metaRowHeight + 24;

  ensureSpace(metaBoxHeight + 60);

  doc.setFillColor(250, 250, 251);
  doc.setDrawColor(226, 226, 230);
  doc.setLineWidth(0.7);
  doc.roundedRect(margin, y, contentWidth, metaBoxHeight, 6, 6, "FD");

  const colWidth = contentWidth / 2;
  const metaStartY = y + 26;

  metaEntries.forEach(([label, value], idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = margin + 16 + col * colWidth;
    const rowY = metaStartY + row * metaRowHeight;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...BRAND_BLUE_RGB);
    doc.text(`${label}`, x, rowY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(70, 70, 70);
    const valueLine = doc.splitTextToSize(String(value), colWidth - 32)[0] || "";
    doc.text(valueLine, x, rowY + 13);
  });

  y += metaBoxHeight + 30;

  // Summary
  if (record.summary) {
    ensureSpace(90);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND_BLUE_RGB);
    doc.text("SUMMARY", margin, y);
    y += 16;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...INK_RGB);
    doc.splitTextToSize(record.summary, contentWidth).forEach((row) => {
      ensureSpace(70);
      doc.text(row, margin, y);
      y += 15;
    });
    y += 20;
  }

  // Structured field sections
  getFieldEntries(record).forEach(([label, value]) => {
    ensureSpace(100);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND_BLUE_RGB);
    doc.text(label.toUpperCase(), margin, y);
    y += 7;

    doc.setDrawColor(...BRAND_BLUE_RGB);
    doc.setLineWidth(0.8);
    doc.line(margin, y, margin + 34, y);
    y += 17;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...INK_RGB);
    doc.splitTextToSize(String(value), contentWidth).forEach((row) => {
      ensureSpace(70);
      doc.text(row, margin, y);
      y += 15;
    });
    y += 20;
  });

  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(i, totalPages);
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
