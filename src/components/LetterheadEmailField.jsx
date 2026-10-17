import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { saveLetterheadEmail } from "../utils/letterheadEmail";

/**
 * One executive's typed letterhead email: a labelled box, a small Save
 * button, and a visible "Saved" once the database has it. Used on the
 * Executives cards and in the composer's letterhead panel.
 */
export default function LetterheadEmailField({ executiveId, value, onSaved, compact = false }) {
  const [text, setText] = useState(value || "");
  const [state, setState] = useState({ saving: false, saved: false, error: "" });

  // Follow the stored value when it changes elsewhere (the other page, a refetch).
  useEffect(() => {
    setText(value || "");
  }, [value]);

  const dirty = text.trim().toLowerCase() !== (value || "");

  async function save(event) {
    event.preventDefault();
    setState({ saving: true, saved: false, error: "" });
    try {
      const stored = await saveLetterheadEmail(executiveId, text);
      setText(stored);
      setState({ saving: false, saved: true, error: "" });
      onSaved?.(stored);
    } catch (error) {
      setState({ saving: false, saved: false, error: error.message });
    }
  }

  const id = `lhe-${compact ? "c" : "x"}-${executiveId}`;

  return (
    // noValidate: our own message below, not the browser's tooltip.
    <form className={compact ? "lhe lhe--compact" : "lhe"} onSubmit={save} noValidate>
      <label htmlFor={id}>Letterhead email</label>
      <div className="lhe-row">
        <input
          id={id}
          type="email"
          inputMode="email"
          autoComplete="off"
          maxLength={120}
          value={text}
          placeholder="Type an email to print"
          onChange={(e) => {
            setText(e.target.value);
            setState({ saving: false, saved: false, error: "" });
          }}
        />
        <button type="submit" className="abtn abtn--primary" disabled={state.saving || !dirty}>
          {state.saving ? "Saving…" : "Save"}
        </button>
      </div>
      {state.error ? (
        <small className="lhe-msg is-bad" role="alert">{state.error}</small>
      ) : state.saved ? (
        <small className="lhe-msg is-good" role="status">
          <Check size={12} /> {text ? "Saved. This email prints on the letterhead." : "Saved. Typed email removed."}
        </small>
      ) : null}
    </form>
  );
}
