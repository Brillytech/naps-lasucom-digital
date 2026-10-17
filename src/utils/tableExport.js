// Plain table exports for spreadsheets.
//
// CSV: UTF-8 with a byte-order mark and CRLF line ends. Google Sheets imports
// it as-is; Excel needs the BOM or it reads names with accents as mojibake.
// Amounts go out as plain numbers (5000.00), never "₦5,000.00", so the
// spreadsheet can add them up.

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Quote anything with a comma, quote or line break; and neutralise a
  // leading = + - @ so a name cannot run as a spreadsheet formula.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function save(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(filename, headers, rows) {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(","));
  save(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), filename);
}

export async function downloadXlsx(filename, sheetName, headers, rows) {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = headers.map((h, i) => ({
    wch: Math.min(40, Math.max(String(h).length, ...rows.map((r) => String(r[i] ?? "").length)) + 2),
  }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
  XLSX.writeFile(book, filename);
}
