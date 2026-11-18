/**
 * Small rich-text helpers for the correspondence composer's short fields
 * (To, Through, From, salutation, subject, closing).
 *
 * The editors store HTML. Older drafts stored plain text, so every reader here
 * accepts both: a plain value is treated as plain lines of text.
 */

/** True when the value contains HTML tags rather than being plain text. */
export const isRichHtml = (value) => /<\/?[a-z][^>]*>/i.test(String(value ?? ""));

const escapeHtml = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Plain text (one line per row) -> editor HTML, optionally bold and/or underlined. */
export function plainToHtml(text, { bold = false, underline = false } = {}) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let html = lines.map(escapeHtml).join("<br>");
  if (!html) return "";
  if (underline) html = `<u>${html}</u>`;
  if (bold) html = `<b>${html}</b>`;
  return html;
}

/** Whatever is stored -> HTML the editor can show. */
export function toEditorHtml(value, style) {
  return isRichHtml(value) ? String(value) : plainToHtml(value, style);
}

/** Whatever is stored -> plain text, one line per row. Used for titles, file names and the memo/letter templates. */
export function htmlToPlain(value) {
  const text = String(value ?? "");
  if (!isRichHtml(text)) return text.trim();
  if (typeof document === "undefined") return text.replace(/<[^>]*>/g, " ").trim();

  const root = document.createElement("div");
  root.innerHTML = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<(div|p|li|h[1-6])[\s>]/gi, "\n$&")
    .replace(/<\/(div|p|li|h[1-6])>/gi, "\n");
  return root.textContent
    .replace(/ /g, " ")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * HTML -> lines, each a list of styled runs ({ text, bold, italic, underline }).
 * A line ends at a <br> or at the end of a block element (div, p, li, heading).
 */
export function htmlToLines(html) {
  if (typeof document === "undefined") return [];

  const root = document.createElement("div");
  root.innerHTML = html || "";

  const lines = [];
  let current = [];

  const flush = (keepEmpty = false) => {
    if (current.length || keepEmpty) lines.push(current);
    current = [];
  };

  const walk = (node, inherited) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) {
        const text = child.textContent.replace(/\s+/g, " ");
        if (text.trim() || (text && current.length)) current.push({ text, ...inherited });
        return;
      }
      if (child.nodeType !== 1) return;

      const tag = child.tagName.toLowerCase();
      if (tag === "br") {
        flush(true);
        return;
      }

      // Editing commands emit tags; a paste can bring inline styles, so both are read.
      const css = (child.getAttribute("style") || "").toLowerCase();
      const style = {
        ...inherited,
        bold: inherited.bold || tag === "b" || tag === "strong" || /font-weight:\s*(bold|[6-9]00)/.test(css),
        italic: inherited.italic || tag === "i" || tag === "em" || /font-style:\s*italic/.test(css),
        underline: inherited.underline || tag === "u" || /text-decoration[^;]*underline/.test(css),
      };

      const isBlock = /^(div|p|li|ul|ol|h[1-6])$/.test(tag);
      if (isBlock && current.length) flush();
      walk(child, style);
      if (isBlock) flush();
    });
  };

  walk(root, {});
  flush();

  // Trim each line's edges and drop blank lines.
  return lines
    .map((runs) => {
      const trimmed = runs.map((run) => ({ ...run }));
      if (trimmed.length) trimmed[0].text = trimmed[0].text.replace(/^\s+/, "");
      if (trimmed.length) trimmed[trimmed.length - 1].text = trimmed[trimmed.length - 1].text.replace(/\s+$/, "");
      return trimmed.filter((run) => run.text);
    })
    .filter((runs) => runs.length);
}

/**
 * Lines for the renderer. A plain (older) value has no formatting of its own,
 * so `plainStyle` supplies the look it always printed with.
 */
export function richLines(value, plainStyle = {}) {
  const text = String(value ?? "");
  if (!text.trim()) return [];
  if (!isRichHtml(text)) {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => [{ text: line, ...plainStyle }]);
  }
  return htmlToLines(text);
}