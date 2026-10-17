import { ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatNaira, parseNairaToKobo } from "../../../utils/money";
import {
  METHOD_LABELS,
  fetchStudentDues,
  financeErrorMessage,
  formatDate,
  recordPayment,
  todayLagos,
} from "../../../utils/finance";

/*
  "Mark paid": records money the Treasurer has received, in two steps --
  fill in, then review -- so a stray tap can never record a payment.

  It goes through the same record_payment() as the Record payment tab. It
  does not mark anything paid by itself: the payment waits as "Pending
  verification" until the Financial Secretary verifies it.
*/
function MarkPaidDialog({ student, sessionId = null, onClose }) {
  const [dues, setDues] = useState(null);
  const [step, setStep] = useState("form"); // form | review | done
  const [form, setForm] = useState({ dueId: "", amount: "", method: "cash", date: todayLagos(), reference: "", note: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const amountRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetchStudentDues(student.student_id, sessionId).then((rows) => {
      if (cancelled) return;
      const open = rows.filter((r) => r.remainingKobo > 0);
      setDues(open);
      if (open[0]) {
        setForm((f) => ({ ...f, dueId: open[0].id, amount: (open[0].remainingKobo / 100).toFixed(2) }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [student.student_id, sessionId]);

  useEffect(() => {
    if (dues?.length) amountRef.current?.focus();
  }, [dues]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !saving && onClose(step === "done");
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving, step]);

  const due = dues?.find((d) => d.id === form.dueId);
  const amountKobo = parseNairaToKobo(form.amount);

  function set(field, value) {
    setForm((f) => {
      const next = { ...f, [field]: value };
      // Switching fee re-fills the amount with that fee's balance.
      if (field === "dueId") {
        const d = dues.find((x) => x.id === value);
        if (d) next.amount = (d.remainingKobo / 100).toFixed(2);
      }
      return next;
    });
  }

  function review(e) {
    e.preventDefault();
    setError("");
    if (!due) return setError("Choose which fee this payment is for.");
    if (!amountKobo) return setError("Enter the amount in naira, for example 5000 or 2,500.50.");
    if (amountKobo > due.remainingKobo) {
      return setError(`That is more than is left to pay. At most ${formatNaira(due.remainingKobo)}.`);
    }
    if (form.method === "bank_transfer" && !form.reference.trim()) {
      return setError("A bank transfer needs its reference, so the Financial Secretary can match it.");
    }
    if (!form.date || form.date > todayLagos()) return setError("The payment date cannot be in the future.");
    setStep("review");
  }

  async function submit() {
    setSaving(true);
    setError("");
    const { error: rpcError } = await recordPayment({
      dueId: due.id,
      amountKobo,
      method: form.method,
      date: form.date,
      reference: form.reference,
      note: form.note,
    });
    setSaving(false);
    if (rpcError) {
      setError(financeErrorMessage(rpcError));
      setStep("form");
      return;
    }
    setStep("done");
  }

  const partial = due && amountKobo && amountKobo < due.remainingKobo;

  // Rendered on <body>: inside the admin page it would sit under the
  // fixed bottom bar on phones, which stacks above the page content.
  return createPortal(
    <div className="afin-dialog-backdrop" onClick={() => !saving && onClose(step === "done")}>
      <div
        className="afin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="markpaid-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="afin-dialog-head">
          <div>
            <h2 id="markpaid-title">{step === "done" ? "Recorded" : "Mark paid"}</h2>
            <p>{student.full_name} · {student.matric_no}</p>
          </div>
          <button type="button" className="aicon-btn" aria-label="Close" disabled={saving} onClick={() => onClose(step === "done")}>
            <X size={16} />
          </button>
        </div>

        {dues === null ? (
          <div className="askel" style={{ height: 160, margin: 16 }} />
        ) : dues.length === 0 ? (
          <div className="afin-dialog-body">
            <p className="aform-note">Nothing left to record. Anything outstanding is already awaiting verification.</p>
          </div>
        ) : step === "form" ? (
          <form className="afin-dialog-body aform-grid" onSubmit={review}>
            {dues.length > 1 && (
              <div className="afield">
                <label htmlFor="mp-due">Payment for</label>
                <select id="mp-due" value={form.dueId} onChange={(e) => set("dueId", e.target.value)}>
                  {dues.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.fee_types?.name} · {d.academic_sessions?.label} · {formatNaira(d.remainingKobo)} left
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="afield">
              <label htmlFor="mp-amount">Amount received (₦)</label>
              <input id="mp-amount" ref={amountRef} inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
              <span className="afield-hint">
                {due ? `${formatNaira(due.remainingKobo)} left on ${due.fee_types?.name}. Change it for a part payment.` : ""}
              </span>
            </div>

            <div className="afield">
              <label htmlFor="mp-method">Method</label>
              <select id="mp-method" value={form.method} onChange={(e) => set("method", e.target.value)}>
                {Object.entries(METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            <div className="afield">
              <label htmlFor="mp-date">Date paid</label>
              <input id="mp-date" type="date" max={todayLagos()} value={form.date} onChange={(e) => set("date", e.target.value)} />
            </div>

            <div className="afield">
              <label htmlFor="mp-ref">Reference{form.method === "bank_transfer" ? "" : " (optional)"}</label>
              <input id="mp-ref" value={form.reference} maxLength={80} onChange={(e) => set("reference", e.target.value)} placeholder="Transfer reference or teller number" />
            </div>

            <div className="afield">
              <label htmlFor="mp-note">Note (optional)</label>
              <input id="mp-note" value={form.note} maxLength={500} onChange={(e) => set("note", e.target.value)} />
            </div>

            {error && <div className="anote is-bad">{error}</div>}

            <div className="aform-foot">
              <button type="button" className="abtn" onClick={() => onClose(false)}>Cancel</button>
              <button type="submit" className="abtn abtn--primary">Review</button>
            </div>
          </form>
        ) : step === "review" ? (
          <div className="afin-dialog-body">
            <div className="afin-review">
              <div className="afin-review-amount">{formatNaira(amountKobo)}</div>
              <dl>
                <div><dt>For</dt><dd>{due.fee_types?.name} · {due.academic_sessions?.label}</dd></div>
                <div><dt>Method</dt><dd>{METHOD_LABELS[form.method]}{form.reference.trim() ? ` · ${form.reference.trim()}` : ""}</dd></div>
                <div><dt>Date paid</dt><dd>{formatDate(form.date)}</dd></div>
                <div><dt>{partial ? "Still owed after" : "Balance after"}</dt><dd>{formatNaira(due.remainingKobo - amountKobo)}</dd></div>
              </dl>
              <p className="aform-note">
                <ShieldCheck size={14} /> This waits as Pending verification until the Financial Secretary verifies it. Only then is it counted and a receipt issued.
              </p>
            </div>

            {error && <div className="anote is-bad">{error}</div>}

            <div className="aform-foot">
              <button type="button" className="abtn" disabled={saving} onClick={() => setStep("form")}>Back</button>
              <button type="button" className="abtn abtn--primary" disabled={saving} onClick={submit}>
                {saving ? "Recording..." : `Record ${formatNaira(amountKobo)}`}
              </button>
            </div>
          </div>
        ) : (
          <div className="afin-dialog-body">
            <div className="anote is-ok">
              {formatNaira(amountKobo)} recorded for {student.full_name}. It is now pending verification by the Financial Secretary.
            </div>
            <div className="aform-foot">
              <span />
              <button type="button" className="abtn abtn--primary" onClick={() => onClose(true)}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default MarkPaidDialog;
