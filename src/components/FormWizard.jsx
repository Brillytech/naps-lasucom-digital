import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Pencil,
  X,
} from "lucide-react";
import "./FormWizard.css";

/*
  FormWizard - one question per screen.

  Used by Announcements and Records; any admin form can use it.

  steps: [{
    key, label, short?, hint?, placeholder?,
    type: "text" | "textarea" | "choice" | "date" | "time" | "url" | "custom",
    value, onChange(value),
    options?: [{ value, label, desc?, disabled? }]     (choice)
    required?, validate?(value) -> message, hidden?,
    render?({ value, onChange })                       (custom)
    format?(value) -> string                           (review screen)
  }]

  draft: { key, values, onRestore(values) } keeps typed answers on the phone.
  Call clearWizardDraft(key) after a successful save.
*/

const PREFIX = "napsWizard:";

export function clearWizardDraft(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* storage unavailable - drafts are a convenience only */
  }
}

function readDraft(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function isEmpty(v) {
  return v == null || (typeof v === "string" && !v.trim());
}

function problemWith(step) {
  const v = step.value;
  if (step.required && isEmpty(v)) {
    return step.requiredMessage || `${step.short || step.label} is required.`;
  }
  if (!isEmpty(v) && step.validate) return step.validate(v) || "";
  return "";
}

function reviewText(step) {
  const v = step.value;
  if (step.format) return step.format(v) || "—";
  if (step.type === "choice") {
    const opt = (step.options || []).find((o) => o.value === v);
    return opt ? opt.label : isEmpty(v) ? "—" : String(v);
  }
  return isEmpty(v) ? "—" : String(v);
}

export default function FormWizard({
  eyebrow,
  title,
  steps,
  onSubmit,
  onClose,
  saving = false,
  submitLabel = "Save",
  error = "",
  draft = null,
}) {
  const visible = useMemo(() => steps.filter((s) => !s.hidden), [steps]);
  const total = visible.length;

  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState("fwd");
  const [fromReview, setFromReview] = useState(false);
  const [localError, setLocalError] = useState("");
  const [pending, setPending] = useState(null);
  const [vh, setVh] = useState(null);

  const bodyRef = useRef(null);
  const initialJson = useRef(draft ? JSON.stringify(draft.values) : "");
  const timer = useRef(null);

  const isReview = index >= total;
  const step = visible[index];

  // Offer to resume a saved draft once, on open.
  useEffect(() => {
    if (!draft?.key) return;
    const saved = readDraft(draft.key);
    if (saved && saved.values && JSON.stringify(saved.values) !== initialJson.current) {
      setPending(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save progress (only after something changed).
  useEffect(() => {
    if (!draft?.key || pending) return;
    const json = JSON.stringify(draft.values);
    if (json === initialJson.current) return;
    try {
      localStorage.setItem(
        PREFIX + draft.key,
        JSON.stringify({ values: draft.values, index })
      );
    } catch {
      /* ignore */
    }
  }, [draft?.key, draft?.values, index, pending]);

  // Keep within range if hidden steps change the length.
  useEffect(() => {
    if (index > total) setIndex(total);
  }, [index, total]);

  // Lock page scroll and follow the on-screen keyboard (iOS).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const vv = window.visualViewport;
    const onVv = () => vv && setVh(vv.height);
    if (vv) {
      onVv();
      vv.addEventListener("resize", onVv);
    }
    return () => {
      document.body.style.overflow = prev;
      if (vv) vv.removeEventListener("resize", onVv);
      clearTimeout(timer.current);
    };
  }, []);

  // Focus the field on each text step.
  useEffect(() => {
    if (pending) return;
    const t = setTimeout(() => {
      const el = bodyRef.current?.querySelector(
        "input:not([type=file]):not([type=hidden]), textarea"
      );
      if (el && step?.type !== "choice") el.focus({ preventScroll: true });
    }, 260);
    return () => clearTimeout(t);
  }, [index, pending, step?.type]);

  const go = useCallback((to, direction) => {
    setLocalError("");
    setDir(direction);
    setIndex(to);
  }, []);

  function next() {
    if (!step) return;
    const msg = problemWith(step);
    if (msg) {
      setLocalError(msg);
      return;
    }
    if (fromReview) {
      setFromReview(false);
      go(total, "fwd");
      return;
    }
    go(Math.min(index + 1, total), "fwd");
  }

  function back() {
    if (fromReview) {
      setFromReview(false);
      go(total, "back");
      return;
    }
    if (index > 0) go(index - 1, "back");
  }

  function editStep(i) {
    setFromReview(true);
    go(i, "back");
  }

  async function submit() {
    for (let i = 0; i < visible.length; i += 1) {
      const msg = problemWith(visible[i]);
      if (msg) {
        setFromReview(true);
        go(i, "back");
        setLocalError(msg);
        return;
      }
    }
    setLocalError("");
    await onSubmit();
  }

  function pickChoice(opt) {
    if (opt.disabled) return;
    step.onChange(opt.value);
    setLocalError("");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (fromReview) {
        setFromReview(false);
        go(total, "fwd");
      } else {
        go(Math.min(index + 1, total), "fwd");
      }
    }, 190);
  }

  function onKeyDown(e) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    const tag = e.target.tagName;
    if (tag === "TEXTAREA" && !(e.ctrlKey || e.metaKey)) return;
    if (tag === "BUTTON") return;
    e.preventDefault();
    if (isReview) submit();
    else next();
  }

  function resume() {
    draft.onRestore(pending.values);
    const i = Math.max(0, Math.min(pending.index || 0, 60));
    setIndex(i);
    setPending(null);
  }

  function discard() {
    clearWizardDraft(draft.key);
    setPending(null);
  }

  const progress = Math.round(((Math.min(index, total) + (isReview ? 0 : 1)) / (total + 1)) * 100);
  const shownError = localError || error;
  const optionalEmpty = step && !step.required && isEmpty(step.value);

  const body = (
    <div
      className="fw-root"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={onKeyDown}
    >
      <div className="fw-card" style={vh ? { "--fw-vh": `${vh}px` } : undefined}>
        <header className="fw-head">
          <div className="fw-head-row">
            <div className="fw-head-text">
              {eyebrow && <p>{eyebrow}</p>}
              <h2>{title}</h2>
            </div>
            <button type="button" className="fw-x" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <div className="fw-progress" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="fw-count">
            {isReview ? "Review" : `Step ${index + 1} of ${total}`}
          </div>
        </header>

        <div className="fw-body" ref={bodyRef}>
          {pending ? (
            <div className="fw-slide fw-fwd">
              <h3 className="fw-q">Continue where you left off?</h3>
              <p className="fw-hint">
                You have an unfinished form saved on this phone.
              </p>
              <div className="fw-choices">
                <button type="button" className="fw-choice is-on" onClick={resume}>
                  <span className="fw-choice-t">Continue draft</span>
                  <span className="fw-choice-d">Pick up from your last step</span>
                </button>
                <button type="button" className="fw-choice" onClick={discard}>
                  <span className="fw-choice-t">Start fresh</span>
                  <span className="fw-choice-d">Delete the saved draft</span>
                </button>
              </div>
            </div>
          ) : isReview ? (
            <div key="review" className={`fw-slide fw-${dir}`}>
              <h3 className="fw-q">Check everything</h3>
              <p className="fw-hint">Tap Edit on anything you want to change.</p>
              <ul className="fw-review">
                {visible.map((s, i) => (
                  <li key={s.key}>
                    <div>
                      <span className="fw-review-l">{s.short || s.label}</span>
                      <span className="fw-review-v">{reviewText(s)}</span>
                    </div>
                    <button type="button" onClick={() => editStep(i)}>
                      <Pencil size={12} /> Edit
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : step ? (
            <div key={step.key} className={`fw-slide fw-${dir}`}>
              <h3 className="fw-q">{step.label}</h3>
              {step.hint && <p className="fw-hint">{step.hint}</p>}

              {step.type === "choice" && (
                <div className="fw-choices">
                  {(step.options || []).map((o) => (
                    <button
                      type="button"
                      key={String(o.value)}
                      className={`fw-choice${step.value === o.value ? " is-on" : ""}`}
                      disabled={o.disabled}
                      onClick={() => pickChoice(o)}
                    >
                      <span className="fw-choice-t">{o.label}</span>
                      {o.desc && <span className="fw-choice-d">{o.desc}</span>}
                      {step.value === o.value && <Check size={16} className="fw-tick" />}
                    </button>
                  ))}
                </div>
              )}

              {step.type === "textarea" && (
                <textarea
                  className="fw-input fw-area"
                  rows={7}
                  placeholder={step.placeholder}
                  value={step.value || ""}
                  onChange={(e) => {
                    setLocalError("");
                    step.onChange(e.target.value);
                  }}
                />
              )}

              {["text", "url", "date", "time"].includes(step.type) && (
                <input
                  className="fw-input"
                  type={step.type}
                  inputMode={step.type === "url" ? "url" : undefined}
                  enterKeyHint="next"
                  placeholder={step.placeholder}
                  value={step.value || ""}
                  onChange={(e) => {
                    setLocalError("");
                    step.onChange(e.target.value);
                  }}
                />
              )}

              {step.type === "custom" &&
                step.render({ value: step.value, onChange: step.onChange })}

              {step.type === "textarea" && (
                <p className="fw-tip">Enter adds a new line · Ctrl+Enter for next</p>
              )}
              {["text", "url"].includes(step.type) && (
                <p className="fw-tip">Press Enter to continue</p>
              )}
            </div>
          ) : null}
        </div>

        {!pending && (
          <footer className="fw-foot">
            {shownError && (
              <div className="fw-error" role="alert">
                <AlertCircle size={14} />
                <span>{shownError}</span>
              </div>
            )}

            <div className="fw-actions">
              <button
                type="button"
                className="fw-btn fw-btn--ghost"
                onClick={back}
                disabled={index === 0 && !fromReview}
              >
                <ArrowLeft size={16} />
                Back
              </button>

              {isReview ? (
                <button
                  type="button"
                  className="fw-btn fw-btn--primary"
                  onClick={submit}
                  disabled={saving}
                >
                  <Check size={16} />
                  {saving ? "Saving..." : submitLabel}
                </button>
              ) : step?.type === "choice" ? (
                <button
                  type="button"
                  className="fw-btn fw-btn--primary"
                  onClick={next}
                >
                  Next
                  <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  className="fw-btn fw-btn--primary"
                  onClick={next}
                >
                  {fromReview ? "Done" : optionalEmpty ? "Skip" : "Next"}
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          </footer>
        )}
      </div>
    </div>
  );

  // Portal to <body> so no transformed ancestor can trap the overlay and
  // nothing (the bottom nav included) can sit above it.
  return createPortal(body, document.body);
}