import { Bold, Italic, Underline } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { toEditorHtml } from "../utils/richText";

/**
 * A short formattable field (bold, italic, underline) for the correspondence
 * composer: To, Through, From, salutation, subject and closing.
 *
 * The value is HTML. Older drafts hold plain text, which is shown as typed.
 *
 * React must not own what is inside the editable node (it would rewrite it on
 * every keystroke and throw away what was just typed), so the content is
 * written by ref: once on mount, and again only when the parent replaces the
 * value from outside (opening a draft, starting a new document).
 *
 * Props
 *  - formatting: show the toolbar. Off for templates that print plain text.
 *  - multiline: allow Enter to start a new line (addresses). Off for one-liners.
 *  - boldUnderline: the field's default look (the subject): older plain values
 *    are shown that way, and typing into an empty field starts that way.
 */
export default function RichField({
  label,
  value,
  onChange,
  hint,
  placeholder = "",
  formatting = true,
  multiline = false,
  boldUnderline = false,
  minHeight = 44,
}) {
  const ref = useRef(null);
  const lastEmitted = useRef(null);
  const labelId = useId();

  const legacyStyle = boldUnderline && formatting ? { bold: true, underline: true } : null;

  useEffect(() => {
    const el = ref.current;
    if (!el || value === lastEmitted.current) return;
    lastEmitted.current = value;
    el.innerHTML = toEditorHtml(value, legacyStyle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    const empty = !el.textContent.trim();
    if (empty && el.innerHTML === "<br>") el.innerHTML = "";
    const html = empty ? "" : el.innerHTML;
    lastEmitted.current = html;
    onChange(html);
  }

  /** Toolbar buttons take focus on mousedown, which would collapse the selection first. */
  const keepSelection = (event) => event.preventDefault();

  function format(command) {
    document.execCommand(command, false, null);
    ref.current?.focus();
    emit();
  }

  function handleKeyDown(event) {
    if (!multiline && event.key === "Enter") {
      event.preventDefault();
      return;
    }
    // Without a toolbar the field prints plain, so keyboard shortcuts must not
    // quietly format text that will not print formatted.
    if (!formatting && (event.ctrlKey || event.metaKey) && ["b", "i", "u"].includes(event.key.toLowerCase())) {
      event.preventDefault();
    }
  }

  function handlePaste(event) {
    event.preventDefault();
    let text = event.clipboardData.getData("text/plain");
    if (!multiline) text = text.replace(/\s*\r?\n\s*/g, " ");
    document.execCommand("insertText", false, text);
    emit();
  }

  function handleFocus() {
    if (!legacyStyle) return;
    // Empty field: whatever is typed starts bold and underlined.
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el || document.activeElement !== el || el.textContent.trim()) return;
      if (!document.queryCommandState("bold")) document.execCommand("bold");
      if (!document.queryCommandState("underline")) document.execCommand("underline");
    });
  }

  return (
    <div className="afield">
      <label id={labelId}>{label}</label>

      <div className={formatting ? "aeditor" : "aeditor rich-plain"}>
        {formatting && (
          <div className="aeditor-bar">
            <button type="button" onMouseDown={keepSelection} onClick={() => format("bold")} title="Bold">
              <Bold size={13} />
            </button>
            <button type="button" onMouseDown={keepSelection} onClick={() => format("italic")} title="Italic">
              <Italic size={13} />
            </button>
            <button type="button" onMouseDown={keepSelection} onClick={() => format("underline")} title="Underline">
              <Underline size={13} />
            </button>
          </div>
        )}

        <div
          ref={ref}
          className="aeditor-area rich-area"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline={multiline}
          aria-labelledby={labelId}
          data-placeholder={placeholder}
          style={{ minHeight, height: "auto" }}
          onInput={emit}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={handleFocus}
        />
      </div>

      {hint && <small className="afield-hint">{hint}</small>}
    </div>
  );
}