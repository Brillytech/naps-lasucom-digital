import { FileSpreadsheet, FileText, Plus, Receipt, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { formatNaira, parseNairaToKobo } from "../../../utils/money";
import {
  METHOD_LABELS,
  STATUS_LABELS,
  expenseStage,
  exportExpenses,
  fetchExpenses,
  fetchOfficerNames,
  financeErrorMessage,
  formatDate,
  isFinalExpense,
  recordExpense,
  statusBadgeClass,
  todayLagos,
  useFinanceVersion,
} from "../../../utils/finance";
import ExpenseDecisions from "./ExpenseDecisions";

const FILTERS = [
  ["all", "All"],
  ["pending", "Pending"],
  ["counted", "Counted"],
  ["rejected", "Rejected"],
];

const EMPTY = { amount: "", purpose: "", spentOn: todayLagos(), method: "cash", reference: "", note: "", extra: false };

function Expenses({ access, session }) {
  const version = useFinanceVersion();
  const [rows, setRows] = useState(null);
  const [names, setNames] = useState({});
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetchExpenses({ sessionId: session.id })
      .then(async (list) => {
        const n = await fetchOfficerNames(list.flatMap((e) => [e.recorded_by, e.verified_by, e.approved_by, e.rejected_by]));
        if (!cancelled) {
          setRows(list);
          setNames(n);
        }
      })
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [session, version]);

  if (!session) {
    return <p className="aform-note" style={{ marginTop: 16 }}>Expenses are recorded against the active session. The President starts one under Sessions & fees.</p>;
  }

  const list = rows || [];
  const counted = list.filter(isFinalExpense);
  const pending = list.filter((e) => e.status === "pending_verification" || e.status === "awaiting_approval");
  const shown = list.filter((e) =>
    filter === "pending" ? pending.includes(e) : filter === "counted" ? isFinalExpense(e) : filter === "rejected" ? e.status === "rejected" : true
  );
  const sum = (xs) => xs.reduce((s, e) => s + Number(e.amount_kobo), 0);
  const person = (id) => names[id]?.full_name || "—";

  async function runExport(kind) {
    setBusy(kind);
    setError("");
    try {
      await exportExpenses(session.id, session.label, kind);
    } catch {
      setError("The export failed. Check your connection and try again.");
    }
    setBusy("");
  }

  return (
    <>
      {access.isPresident && (
        <ExpenseDecisions
          stage="approval"
          access={access}
          title="Awaiting your approval"
          intro="Extra-budgetary expenses the Financial Secretary has verified. They count as spent only once you approve."
        />
      )}

      {access.isTreasurer && (showForm ? (
        <RecordExpense session={session} onDone={() => setShowForm(false)} />
      ) : (
        <div className="afin-actions-row">
          <button type="button" className="abtn abtn--primary" onClick={() => setShowForm(true)}>
            <Plus size={15} /> Record expense
          </button>
        </div>
      ))}

      <div className="atoolbar">
        <div className="aseg">
          {FILTERS.map(([id, label]) => (
            <button key={id} type="button" className={filter === id ? "is-on" : ""} onClick={() => setFilter(id)}>
              {label}
              <em>{id === "all" ? list.length : id === "pending" ? pending.length : id === "counted" ? counted.length : list.filter((e) => e.status === "rejected").length}</em>
            </button>
          ))}
        </div>
        <span className="aform-note">
          {formatNaira(sum(counted))} counted · {formatNaira(sum(pending))} pending
        </span>
        <span className="afin-export-actions" style={{ marginLeft: "auto" }}>
          <button type="button" className="abtn" disabled={!!busy} onClick={() => runExport("csv")}>
            <FileText size={14} /> {busy === "csv" ? "..." : "CSV"}
          </button>
          <button type="button" className="abtn" disabled={!!busy} onClick={() => runExport("xlsx")}>
            <FileSpreadsheet size={14} /> {busy === "xlsx" ? "..." : "Excel"}
          </button>
        </span>
      </div>
      {error && <div className="anote is-bad" style={{ marginTop: 12 }}>{error}</div>}

      <div className="atable-wrap">
        {rows === null ? (
          <div className="askel" style={{ height: 120, margin: 16 }} />
        ) : shown.length === 0 ? (
          <div className="aempty-row">
            <Receipt size={26} />
            <strong>{list.length ? "Nothing in this view" : `No expenses in ${session.label} yet`}</strong>
            <span>The Treasurer records expenses; the Financial Secretary verifies them.</span>
          </div>
        ) : (
          <div className="atable-scroll">
            <table className="atable afin-stack">
              <thead>
                <tr>
                  <th>Expense</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                  <th>Recorded</th>
                  <th>Decided</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div className="acell-title">
                        <strong>{e.purpose}</strong>
                        <span>
                          {formatDate(e.spent_on)} · {METHOD_LABELS[e.method]}{e.reference ? ` · ${e.reference}` : ""}
                        </span>
                      </div>
                    </td>
                    <td className="num" data-label="Amount"><strong>{formatNaira(e.amount_kobo)}</strong></td>
                    <td data-label="Status">
                      <span className="abadges">
                        <span className={statusBadgeClass(e.status)} title={expenseStage(e)}>
                          {e.status === "pending_verification" ? "Awaiting Fin Sec" : STATUS_LABELS[e.status]}
                        </span>
                        {e.extra_budgetary && <span className="abadge abadge--soon">Extra-budgetary</span>}
                      </span>
                    </td>
                    <td className="quiet" data-label="Recorded">{person(e.recorded_by)} · {formatDate(e.recorded_at)}</td>
                    <td className="quiet" data-label="Decided">
                      {e.status === "rejected"
                        ? `${person(e.rejected_by)}: ${e.rejection_reason}`
                        : e.approved_by
                          ? `Verified ${person(e.verified_by)} · approved ${person(e.approved_by)}`
                          : e.verified_by
                            ? `Verified ${person(e.verified_by)} · ${formatDate(e.verified_at)}`
                            : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// Treasurer's form, with a review step before anything is saved.
function RecordExpense({ session, onDone }) {
  const [form, setForm] = useState(EMPTY);
  const [step, setStep] = useState("form");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const amountKobo = parseNairaToKobo(form.amount);

  function review(e) {
    e.preventDefault();
    setError("");
    setDone("");
    if (!amountKobo) return setError("Enter the amount in naira, for example 12000 or 2,500.50.");
    if (form.purpose.trim().length < 3) return setError("Say what the money was spent on.");
    if (form.method === "bank_transfer" && !form.reference.trim()) return setError("A bank transfer needs its reference.");
    if (!form.spentOn || form.spentOn > todayLagos()) return setError("The date spent cannot be in the future.");
    setStep("review");
  }

  async function submit() {
    setSaving(true);
    setError("");
    const { error: e } = await recordExpense({
      amountKobo,
      purpose: form.purpose.trim(),
      spentOn: form.spentOn,
      method: form.method,
      reference: form.reference,
      note: form.note,
      extraBudgetary: form.extra,
    });
    setSaving(false);
    if (e) {
      setError(financeErrorMessage(e));
      setStep("form");
      return;
    }
    setDone(`${formatNaira(amountKobo)} recorded for "${form.purpose.trim()}". It now waits for the Financial Secretary${form.extra ? ", then the President" : ""}.`);
    setForm({ ...EMPTY, spentOn: form.spentOn });
    setStep("form");
  }

  return (
    <section className="apanel">
      <div className="apanel-head">
        <div>
          <h2>Record an expense</h2>
          <p>Money already spent from the association's funds, in {session.label}.</p>
        </div>
      </div>

      {step === "form" ? (
        <form className="apanel-body aform-grid" onSubmit={review}>
          <div className="afield">
            <label htmlFor="ex-amount">Amount spent (₦)</label>
            <input id="ex-amount" inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" />
          </div>
          <div className="afield">
            <label htmlFor="ex-purpose">Purpose</label>
            <input id="ex-purpose" value={form.purpose} maxLength={300} onChange={(e) => set("purpose", e.target.value)} placeholder="e.g. Printing of handbills for health week" />
          </div>
          <div className="afield">
            <label htmlFor="ex-date">Date spent</label>
            <input id="ex-date" type="date" max={todayLagos()} value={form.spentOn} onChange={(e) => set("spentOn", e.target.value)} />
          </div>
          <div className="afield">
            <label htmlFor="ex-method">Paid out by</label>
            <select id="ex-method" value={form.method} onChange={(e) => set("method", e.target.value)}>
              {Object.entries(METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="afield">
            <label htmlFor="ex-ref">Reference{form.method === "bank_transfer" ? "" : " (optional)"}</label>
            <input id="ex-ref" value={form.reference} maxLength={80} onChange={(e) => set("reference", e.target.value)} placeholder="Transfer reference or receipt number" />
          </div>
          <div className="afield">
            <label htmlFor="ex-note">Note (optional)</label>
            <input id="ex-note" value={form.note} maxLength={500} onChange={(e) => set("note", e.target.value)} />
          </div>

          <label className="afin-check">
            <input type="checkbox" checked={form.extra} onChange={(e) => set("extra", e.target.checked)} />
            <span>
              <strong>Extra-budgetary</strong>
              <em>Not in the approved budget. After the Financial Secretary verifies it, the President must approve it before it counts.</em>
            </span>
          </label>

          {error && <div className="anote is-bad" style={{ gridColumn: "1 / -1" }}>{error}</div>}
          {done && <div className="anote is-ok" style={{ gridColumn: "1 / -1" }}>{done}</div>}

          <div className="aform-foot">
            <button type="button" className="abtn" onClick={onDone}>Close</button>
            <button type="submit" className="abtn abtn--primary">Review</button>
          </div>
        </form>
      ) : (
        <div className="apanel-body">
          <div className="afin-review">
            <div className="afin-review-amount">{formatNaira(amountKobo)}</div>
            <dl>
              <div><dt>Purpose</dt><dd>{form.purpose.trim()}</dd></div>
              <div><dt>Paid out</dt><dd>{METHOD_LABELS[form.method]}{form.reference.trim() ? ` · ${form.reference.trim()}` : ""}</dd></div>
              <div><dt>Date spent</dt><dd>{formatDate(form.spentOn)}</dd></div>
              <div><dt>Kind</dt><dd>{form.extra ? "Extra-budgetary" : "Within budget"}</dd></div>
            </dl>
            <p className="aform-note">
              <ShieldCheck size={14} />
              {form.extra
                ? "Needs the Financial Secretary to verify, then the President to approve. Only then does it count as spent."
                : "Needs the Financial Secretary to verify it. Only then does it count as spent."}
            </p>
          </div>
          {error && <div className="anote is-bad" style={{ marginTop: 12 }}>{error}</div>}
          <div className="aform-foot" style={{ marginTop: 14 }}>
            <button type="button" className="abtn" disabled={saving} onClick={() => setStep("form")}>Back</button>
            <button type="button" className="abtn abtn--primary" disabled={saving} onClick={submit}>
              {saving ? "Recording..." : `Record ${formatNaira(amountKobo)}`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default Expenses;
