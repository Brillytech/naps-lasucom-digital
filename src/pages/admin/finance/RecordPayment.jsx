import { Search, UserRound, X } from "lucide-react";
import { useState } from "react";
import { formatNaira, parseNairaToKobo } from "../../../utils/money";
import {
  METHOD_LABELS,
  STATUS_LABELS,
  cleanSearch,
  fetchStudentDues,
  financeErrorMessage,
  recordPayment,
  statusBadgeClass,
  todayLagos,
  useStudentSearch,
} from "../../../utils/finance";

const EMPTY_FORM = { dueId: "", amount: "", method: "cash", date: todayLagos(), reference: "", note: "" };

function RecordPayment() {
  const [term, setTerm] = useState("");
  const results = useStudentSearch(term);
  const [student, setStudent] = useState(null);
  const [dues, setDues] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function loadDues(studentId) {
    const rows = await fetchStudentDues(studentId);
    setDues(rows);
    const firstOpen = rows.find((r) => r.remainingKobo > 0);
    setForm((f) => ({ ...f, dueId: firstOpen?.id || "" }));
  }

  function pickStudent(s) {
    setStudent(s);
    setTerm("");
    setDone("");
    setError("");
    setForm(EMPTY_FORM);
    loadDues(s.id);
  }

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const selectedDue = dues.find((d) => d.id === form.dueId);
  const amountKobo = parseNairaToKobo(form.amount);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setDone("");

    if (!selectedDue) return setError("Choose which fee this payment is for.");
    if (!amountKobo) return setError("Enter the amount in naira, for example 5000 or 2,500.50.");
    if (form.method === "bank_transfer" && !form.reference.trim()) {
      return setError("Add the bank transfer reference.");
    }

    setSaving(true);
    const { error: rpcError } = await recordPayment({
      dueId: selectedDue.id,
      amountKobo,
      method: form.method,
      date: form.date,
      reference: form.reference,
      note: form.note,
    });
    setSaving(false);

    if (rpcError) return setError(financeErrorMessage(rpcError));

    setDone(
      `Recorded ${formatNaira(amountKobo)} for ${student.full_name}. It now waits for the Financial Secretary to verify it.`
    );
    setForm({ ...EMPTY_FORM, date: form.date });
    loadDues(student.id);
  }

  return (
    <section className="apanel">
      <div className="apanel-head">
        <div>
          <h2>Record a payment</h2>
          <p>Only money already received. The Financial Secretary verifies it before a receipt is issued.</p>
        </div>
      </div>

      <div className="apanel-body">
        {!student ? (
          <div className="afin-search">
            <label className="asearch">
              <Search size={14} />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search student by name or matric number"
                aria-label="Search student"
                autoFocus
              />
            </label>

            {results.length > 0 && (
              <ul className="afin-results">
                {results.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => pickStudent(s)}>
                      <strong>{s.full_name}</strong>
                      <span>
                        {s.matric_no} · {s.level ? `${s.level}L` : "Graduated"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {cleanSearch(term).length >= 2 && results.length === 0 && (
              <p className="aform-note">No student matches. Check the spelling, or add them on the Students page.</p>
            )}
          </div>
        ) : (
          <>
            <div className="afin-student">
              <span className="ico ico-sm ico--tint tone-blue">
                <UserRound size={16} />
              </span>
              <span>
                <strong>{student.full_name}</strong>
                <em>
                  {student.matric_no} · {student.level ? `${student.level}L` : "Graduated"}
                </em>
              </span>
              <button type="button" className="abtn" onClick={() => { setStudent(null); setDues([]); setDone(""); }}>
                <X size={14} /> Change
              </button>
            </div>

            {dues.length === 0 ? (
              <p className="aform-note">This student has no dues yet. Dues are created when a session is confirmed.</p>
            ) : (
              <div className="atable-scroll" style={{ marginTop: 12 }}>
                <table className="atable">
                  <thead>
                    <tr>
                      <th>Fee</th>
                      <th>Session</th>
                      <th className="num">Due</th>
                      <th className="num">Verified</th>
                      <th className="num">Awaiting</th>
                      <th className="num">Can record</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dues.map((d) => (
                      <tr key={d.id}>
                        <td>{d.fee_types?.name}</td>
                        <td className="quiet">{d.academic_sessions?.label}</td>
                        <td className="num">{formatNaira(d.amount_due_kobo)}</td>
                        <td className="num">{formatNaira(d.amount_paid_kobo)}</td>
                        <td className="num">{d.pendingKobo ? formatNaira(d.pendingKobo) : "–"}</td>
                        <td className="num"><strong>{formatNaira(Math.max(d.remainingKobo, 0))}</strong></td>
                        <td>
                          <span className={statusBadgeClass(d.status)}>{STATUS_LABELS[d.status]}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {dues.some((d) => d.remainingKobo > 0) ? (
              <form className="aform-grid" style={{ marginTop: 16 }} onSubmit={submit}>
                <div className="afield">
                  <label htmlFor="rp-due">Payment for</label>
                  <select id="rp-due" value={form.dueId} onChange={(e) => update("dueId", e.target.value)}>
                    {dues
                      .filter((d) => d.remainingKobo > 0)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.fee_types?.name} · {d.academic_sessions?.label} · up to {formatNaira(d.remainingKobo)}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="afield">
                  <label htmlFor="rp-amount">Amount received (₦)</label>
                  <input
                    id="rp-amount"
                    inputMode="decimal"
                    value={form.amount}
                    onChange={(e) => update("amount", e.target.value)}
                    placeholder={selectedDue ? (Number(selectedDue.remainingKobo) / 100).toFixed(2) : "0.00"}
                  />
                </div>

                <div className="afield">
                  <label htmlFor="rp-method">Method</label>
                  <select id="rp-method" value={form.method} onChange={(e) => update("method", e.target.value)}>
                    {Object.entries(METHOD_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>

                <div className="afield">
                  <label htmlFor="rp-date">Date paid</label>
                  <input id="rp-date" type="date" max={todayLagos()} value={form.date} onChange={(e) => update("date", e.target.value)} />
                </div>

                <div className="afield">
                  <label htmlFor="rp-ref">
                    Reference{form.method === "bank_transfer" ? "" : " (optional)"}
                  </label>
                  <input
                    id="rp-ref"
                    value={form.reference}
                    onChange={(e) => update("reference", e.target.value)}
                    placeholder="Bank transfer reference or teller number"
                    maxLength={80}
                  />
                </div>

                <div className="afield">
                  <label htmlFor="rp-note">Note (optional)</label>
                  <input id="rp-note" value={form.note} onChange={(e) => update("note", e.target.value)} maxLength={500} />
                </div>

                <div className="aform-foot">
                  <span className="aform-note">
                    {selectedDue && amountKobo
                      ? `Balance after verification: ${formatNaira(Math.max(Number(selectedDue.remainingKobo) - amountKobo, 0))}`
                      : "Amounts are in naira."}
                  </span>
                  <button type="submit" className="abtn abtn--primary" disabled={saving}>
                    {saving ? "Recording..." : "Record payment"}
                  </button>
                </div>
              </form>
            ) : (
              dues.length > 0 && <p className="aform-note" style={{ marginTop: 12 }}>Nothing left to record for this student.</p>
            )}
          </>
        )}

        {error && <div className="anote is-bad" style={{ marginTop: 14 }}>{error}</div>}
        {done && <div className="anote is-ok" style={{ marginTop: 14 }}>{done}</div>}
      </div>
    </section>
  );
}

export default RecordPayment;
