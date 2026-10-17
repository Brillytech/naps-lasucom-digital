import { ArrowRight, CalendarPlus, CheckCircle2, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { formatNaira, parseNairaToKobo } from "../../../utils/money";
import {
  LEVELS,
  STATUS_LABELS,
  STUDENT_STATUS_LABELS,
  financeErrorMessage,
  formatDate,
  statusBadgeClass,
} from "../../../utils/finance";

function nextLabel(sessions) {
  const latest = sessions.map((s) => Number(s.label.slice(0, 4))).sort((a, b) => b - a)[0];
  const start = latest ? latest + 1 : new Date().getFullYear();
  return {
    label: `${start}/${start + 1}`,
    starts_on: `${start}-10-01`,
    ends_on: `${start + 1}-09-30`,
  };
}

/*
  President's controls: draft sessions, set their fees, then move the
  association into one through Preview -> Review -> Confirm. Every step is
  re-checked by the database; the screens only make the consequences plain.
*/
function SessionManager({ sessions }) {
  const [feeTypes, setFeeTypes] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [note, setNote] = useState(null);
  const [wizardFor, setWizardFor] = useState(null);

  const drafts = sessions.sessions.filter((s) => s.status === "draft");
  const selected = sessions.sessions.find((s) => s.id === selectedId) || drafts[0] || null;

  async function loadFeeTypes() {
    const { data } = await supabase.from("fee_types").select("id, name, description, active").order("name");
    setFeeTypes(data || []);
  }

  useEffect(() => {
    loadFeeTypes();
  }, []);

  if (wizardFor) {
    return (
      <TransitionWizard
        target={wizardFor}
        onClose={(changed) => {
          setWizardFor(null);
          if (changed) sessions.reload();
        }}
      />
    );
  }

  return (
    <>
      {note && <div className={note.kind === "ok" ? "anote is-ok" : "anote is-bad"} style={{ marginTop: 14 }}>{note.text}</div>}

      <SessionsPanel sessions={sessions} onSelect={setSelectedId} selected={selected} setNote={setNote} onStart={setWizardFor} />

      {selected?.status === "draft" && (
        <FeesPanel session={selected} feeTypes={feeTypes} setNote={setNote} />
      )}

      <FeeTypesPanel feeTypes={feeTypes} reload={loadFeeTypes} setNote={setNote} />

      <SharingPanel setNote={setNote} />
    </>
  );
}

function SessionsPanel({ sessions, selected, onSelect, setNote, onStart }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("academic_sessions").insert(form);
    setBusy(false);
    if (error) {
      setNote({
        kind: "bad",
        text: /label_check/.test(error.message)
          ? "Session names look like 2026/2027: two consecutive years."
          : /unique/.test(error.message)
            ? "That session already exists."
            : financeErrorMessage(error),
      });
      return;
    }
    setNote({ kind: "ok", text: `${form.label} drafted. Set its fees, then start it when the year begins.` });
    setForm(null);
    sessions.reload();
  }

  async function removeDraft(s) {
    if (!window.confirm(`Delete the draft ${s.label}? Its fees are removed too. Nothing else is affected.`)) return;
    const { error } = await supabase.from("academic_sessions").delete().eq("id", s.id);
    if (error) return setNote({ kind: "bad", text: financeErrorMessage(error) });
    sessions.reload();
  }

  return (
    <section className="apanel">
      <div className="apanel-head">
        <div>
          <h2>Academic sessions</h2>
          <p>A session is a draft until you start it. Starting closes the current one and promotes students.</p>
        </div>
        {!form && (
          <button type="button" className="abtn" onClick={() => setForm(nextLabel(sessions.sessions))}>
            <CalendarPlus size={15} /> New session
          </button>
        )}
      </div>

      {form && (
        <form className="apanel-body aform-grid" onSubmit={create}>
          <div className="afield">
            <label htmlFor="ns-label">Session</label>
            <input id="ns-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="2026/2027" />
          </div>
          <div className="afield">
            <label htmlFor="ns-start">Starts</label>
            <input id="ns-start" type="date" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} />
          </div>
          <div className="afield">
            <label htmlFor="ns-end">Ends</label>
            <input id="ns-end" type="date" value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} />
          </div>
          <div className="aform-foot">
            <span className="aform-note">Created as a draft. Nothing changes for students yet.</span>
            <span className="acell-actions">
              <button type="button" className="abtn" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="abtn abtn--primary" disabled={busy}>Create draft</button>
            </span>
          </div>
        </form>
      )}

      <div className="atable-scroll">
        <table className="atable">
          <thead>
            <tr>
              <th>Session</th>
              <th>Dates</th>
              <th>Status</th>
              <th className="num"></th>
            </tr>
          </thead>
          <tbody>
            {sessions.sessions.map((s) => (
              <tr key={s.id} className={selected?.id === s.id ? "afin-row-on" : ""}>
                <td><strong>{s.label}</strong></td>
                <td className="quiet">{formatDate(s.starts_on)} – {formatDate(s.ends_on)}</td>
                <td><span className={statusBadgeClass(s.status)}>{STATUS_LABELS[s.status]}</span></td>
                <td className="num">
                  {s.status === "draft" && (
                    <span className="acell-actions">
                      <button type="button" className="abtn" onClick={() => onSelect(s.id)}>Fees</button>
                      <button type="button" className="abtn abtn--primary" onClick={() => onStart(s)}>
                        Start <ArrowRight size={14} />
                      </button>
                      <button type="button" className="aicon-btn is-danger" title="Delete draft" aria-label={`Delete draft ${s.label}`} onClick={() => removeDraft(s)}>
                        <Trash2 size={14} />
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {sessions.sessions.length === 0 && (
              <tr><td colSpan={4} className="quiet">No sessions yet. Create the current one to begin.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FeesPanel({ session, feeTypes, setNote }) {
  const [fees, setFees] = useState([]);
  const [form, setForm] = useState({ fee_type_id: "", level: "", amount: "" });

  async function load() {
    const { data } = await supabase
      .from("session_fees")
      .select("id, level, amount_kobo, fee_types(name)")
      .eq("session_id", session.id)
      .order("level", { nullsFirst: true });
    setFees(data || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  async function add(e) {
    e.preventDefault();
    const amount_kobo = parseNairaToKobo(form.amount);
    const feeTypeId = form.fee_type_id || feeTypes.find((f) => f.active)?.id;
    if (!feeTypeId) return setNote({ kind: "bad", text: "Add a fee type first (below)." });
    if (!amount_kobo) return setNote({ kind: "bad", text: "Enter the amount in naira, e.g. 5000." });

    const { error } = await supabase.from("session_fees").insert({
      session_id: session.id,
      fee_type_id: feeTypeId,
      level: form.level ? Number(form.level) : null,
      amount_kobo,
    });
    if (error) {
      return setNote({
        kind: "bad",
        text: /duplicate|unique/.test(error.message)
          ? "That fee is already set for that level. Remove it first to change the amount."
          : financeErrorMessage(error),
      });
    }
    setForm({ ...form, amount: "" });
    load();
  }

  async function remove(id) {
    const { error } = await supabase.from("session_fees").delete().eq("id", id);
    if (error) return setNote({ kind: "bad", text: financeErrorMessage(error) });
    load();
  }

  return (
    <section className="apanel">
      <div className="apanel-head">
        <div>
          <h2>Fees for {session.label}</h2>
          <p>"All levels" applies to everyone; a level-specific amount overrides it for that level. Locked once the session starts.</p>
        </div>
      </div>

      <div className="atable-scroll">
        <table className="atable">
          <thead>
            <tr><th>Fee</th><th>Applies to</th><th className="num">Amount</th><th className="num"></th></tr>
          </thead>
          <tbody>
            {fees.map((f) => (
              <tr key={f.id}>
                <td>{f.fee_types?.name}</td>
                <td className="quiet">{f.level ? `${f.level}L only` : "All levels"}</td>
                <td className="num">{formatNaira(f.amount_kobo)}</td>
                <td className="num">
                  <button type="button" className="aicon-btn is-danger" title="Remove" aria-label="Remove fee" onClick={() => remove(f.id)}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {fees.length === 0 && <tr><td colSpan={4} className="quiet">No fees yet. A session cannot start without at least one.</td></tr>}
          </tbody>
        </table>
      </div>

      <form className="apanel-body aform-grid" onSubmit={add}>
        <div className="afield">
          <label htmlFor="sf-type">Fee</label>
          <select id="sf-type" value={form.fee_type_id} onChange={(e) => setForm({ ...form, fee_type_id: e.target.value })}>
            {feeTypes.filter((f) => f.active).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div className="afield">
          <label htmlFor="sf-level">Applies to</label>
          <select id="sf-level" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
            <option value="">All levels</option>
            {LEVELS.map((l) => <option key={l} value={l}>{l}L only</option>)}
          </select>
        </div>
        <div className="afield">
          <label htmlFor="sf-amount">Amount (₦)</label>
          <input id="sf-amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="5000" />
        </div>
        <div className="aform-foot">
          <span className="aform-note">Stored exactly, to the kobo.</span>
          <button type="submit" className="abtn abtn--primary"><Plus size={15} /> Add fee</button>
        </div>
      </form>
    </section>
  );
}

function FeeTypesPanel({ feeTypes, reload, setNote }) {
  const [name, setName] = useState("");

  async function add(e) {
    e.preventDefault();
    const { error } = await supabase.from("fee_types").insert({ name });
    if (error) {
      return setNote({ kind: "bad", text: /unique|duplicate/.test(error.message) ? "That fee type already exists." : financeErrorMessage(error) });
    }
    setName("");
    reload();
  }

  async function toggle(f) {
    const { error } = await supabase.from("fee_types").update({ active: !f.active }).eq("id", f.id);
    if (error) return setNote({ kind: "bad", text: financeErrorMessage(error) });
    reload();
  }

  return (
    <section className="apanel">
      <div className="apanel-head">
        <div>
          <h2>Fee types</h2>
          <p>The kinds of charges, e.g. Annual dues. Retire one instead of deleting it; past dues keep its name.</p>
        </div>
      </div>
      <div className="atable-scroll">
        <table className="atable">
          <tbody>
            {feeTypes.map((f) => (
              <tr key={f.id}>
                <td>{f.name}</td>
                <td><span className={f.active ? "abadge abadge--live" : "abadge abadge--draft"}>{f.active ? "In use" : "Retired"}</span></td>
                <td className="num">
                  <button type="button" className="abtn" onClick={() => toggle(f)}>{f.active ? "Retire" : "Bring back"}</button>
                </td>
              </tr>
            ))}
            {feeTypes.length === 0 && <tr><td className="quiet">None yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <form className="apanel-body aform-grid" onSubmit={add}>
        <div className="afield">
          <label htmlFor="ft-name">New fee type</label>
          <input id="ft-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Annual dues" />
        </div>
        <div className="aform-foot">
          <span className="aform-note">Amounts are set per session, above.</span>
          <button type="submit" className="abtn" disabled={name.trim().length < 2}><Plus size={15} /> Add</button>
        </div>
      </form>
    </section>
  );
}

function SharingPanel({ setNote }) {
  const [shared, setShared] = useState(null);

  useEffect(() => {
    supabase.from("org_settings").select("finance_visible_to_all_admins").maybeSingle()
      .then(({ data }) => setShared(Boolean(data?.finance_visible_to_all_admins)));
  }, []);

  async function toggle() {
    const { error } = await supabase.from("org_settings").update({ finance_visible_to_all_admins: !shared }).eq("id", true);
    if (error) return setNote({ kind: "bad", text: financeErrorMessage(error) });
    setShared(!shared);
  }

  if (shared === null) return null;

  return (
    <section className="apanel">
      <div className="apanel-head">
        <div>
          <h2>Who can see finance</h2>
          <p>
            {shared
              ? "Every executive can view finance, read-only. Only the Treasurer records and only the Financial Secretary verifies."
              : "Only the President, Treasurer and Financial Secretary can view finance."}
          </p>
        </div>
        <button type="button" className="abtn" onClick={toggle}>
          {shared ? "Limit to finance officers" : "Share read-only with all executives"}
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Preview -> Review -> Confirm -> Done
// ---------------------------------------------------------------------------
function TransitionWizard({ target, onClose }) {
  const [step, setStep] = useState("preview");
  const [preview, setPreview] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    supabase.rpc("preview_session_transition", { p_to_session_id: target.id }).then(({ data, error: e }) => {
      if (e) setError(financeErrorMessage(e));
      else setPreview(data);
    });
  }, [target.id]);

  async function confirm() {
    setBusy(true);
    setError("");
    const { data, error: e } = await supabase.rpc("confirm_session_transition", {
      p_to_session_id: target.id,
      p_decisions: decisions,
    });
    setBusy(false);
    if (e) return setError(financeErrorMessage(e));
    setResult(data);
    setStep("done");
  }

  if (!preview) {
    return (
      <section className="apanel">
        <div className="apanel-body">{error ? <div className="anote is-bad">{error}</div> : <div className="askel" style={{ height: 140 }} />}</div>
        {error && <div className="apanel-body"><button type="button" className="abtn" onClick={() => onClose(false)}>Back</button></div>}
      </section>
    );
  }

  const first = preview.first_session;
  const decide = (id) => decisions[id] || "promote";
  const counts = preview.review.reduce(
    (acc, s) => ({ ...acc, [decide(s.id)]: (acc[decide(s.id)] || 0) + 1 }),
    {}
  );
  // Review students promoted from 600L graduate rather than move up.
  const reviewUp = preview.review.filter((s) => decide(s.id) === "promote" && s.level < 600).length;
  const reviewGrad = preview.review.filter((s) => decide(s.id) === "promote" && s.level === 600).length;
  const promoteLabel = first ? "Include" : "Promote";
  const steps = ["preview", "review", "confirm", "done"];

  return (
    <section className="apanel">
      <div className="apanel-head">
        <div>
          <h2>{first ? `Start ${preview.to.label}` : `Move from ${preview.from.label} to ${preview.to.label}`}</h2>
          <p>Nothing changes until you confirm on the last step.</p>
        </div>
        <ol className="afin-steps">
          {["Preview", "Review", "Confirm", "Done"].map((label, i) => (
            <li key={label} className={steps.indexOf(step) >= i ? "is-on" : ""}>{label}</li>
          ))}
        </ol>
      </div>

      <div className="apanel-body">
        {preview.problems.length > 0 && (
          <div className="anote is-bad" style={{ marginBottom: 14 }}>
            {preview.problems.map((p) => <div key={p}>{p}</div>)}
          </div>
        )}

        {step === "preview" && (
          <>
            <div className="afin-moves">
              <div className="afin-move afin-move--total">
                <strong>{preview.total_students}</strong>
                <span>students affected</span>
              </div>
              {first
                ? [100, 200, 300, 400, 500].map((l) => (
                    <div className="afin-move" key={l}><strong>{preview.moves[l]}</strong><span>start in {l}L</span></div>
                  )).concat(
                    <div className="afin-move" key="600"><strong>{preview.enrolling_600}</strong><span>start in 600L</span></div>
                  )
                : [100, 200, 300, 400, 500].map((l) => (
                    <div className="afin-move" key={l}><strong>{preview.moves[l]}</strong><span>{l}L → {l + 100}L</span></div>
                  ))}
              {!first && (
                <div className="afin-move afin-move--grad"><strong>{preview.graduating}</strong><span>600L → Graduated</span></div>
              )}
              <div className={preview.review.length ? "afin-move afin-move--review" : "afin-move"}>
                <strong>{preview.review.length}</strong><span>need your review</span>
              </div>
            </div>

            <p className="aform-note" style={{ marginTop: 14 }}>
              New dues: {preview.fees.map((f) => `${f.fee} ${formatNaira(f.amount_kobo)}${f.level ? ` (${f.level}L)` : ""}`).join(", ") || "none set"}.
              {first ? " Everyone starts at the level they are registered at." : ""}
            </p>

            <div className="aform-foot" style={{ marginTop: 16 }}>
              <button type="button" className="abtn" onClick={() => onClose(false)}>Cancel</button>
              <button type="button" className="abtn abtn--primary" disabled={preview.problems.length > 0} onClick={() => setStep(preview.review.length ? "review" : "confirm")}>
                Continue <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}

        {step === "review" && (
          <>
            <p className="aform-note" style={{ marginTop: 0 }}>
              These students are marked repeating, deferred or unconfirmed. Choose for each; {promoteLabel.toLowerCase()} is the default.
              {" "}Deferred students get no dues this session.
            </p>
            <div className="atable-scroll" style={{ marginTop: 10 }}>
              <table className="atable afin-stack">
                <thead>
                  <tr><th>Student</th><th>Now</th><th>Decision</th></tr>
                </thead>
                <tbody>
                  {preview.review.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div className="acell-title afin-cell-tight">
                          <strong>{s.full_name}</strong>
                          <span>{s.matric_no}</span>
                        </div>
                      </td>
                      <td className="quiet" data-label="Now">{s.level}L · {STUDENT_STATUS_LABELS[s.status]}</td>
                      <td className="afin-stack-actions" data-label="">
                        <div className="aseg">
                          {[["promote", promoteLabel], ...(first ? [] : [["repeat", "Repeat level"]]), ["defer", "Defer"]].map(([v, label]) => (
                            <button key={v} type="button" className={decide(s.id) === v ? "is-on" : ""} onClick={() => setDecisions({ ...decisions, [s.id]: v })}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="aform-foot" style={{ marginTop: 16 }}>
              <button type="button" className="abtn" onClick={() => setStep("preview")}>Back</button>
              <button type="button" className="abtn abtn--primary" onClick={() => setStep("confirm")}>
                Continue <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}

        {step === "confirm" && (
          <>
            <div className="afin-confirm">
              <TriangleAlert size={18} />
              <div>
                <strong>This is what will happen, all at once:</strong>
                <ul>
                  {!first && <li>{preview.from.label} is closed. Its dues, payments and receipts stay exactly as they are and remain viewable.</li>}
                  <li>{preview.to.label} becomes the active session.</li>
                  {first ? (
                    <li>{preview.total_students - (counts.defer || 0)} students start the session at their registered level.</li>
                  ) : (
                    <>
                      <li>{Object.values(preview.moves).reduce((a, b) => a + b, 0) + reviewUp} students move up one level.</li>
                      <li>{preview.graduating + reviewGrad} students in 600L are marked Graduated. They stay in the register.</li>
                      {counts.repeat > 0 && <li>{counts.repeat} {counts.repeat === 1 ? "repeats their" : "repeat their"} current level.</li>}
                    </>
                  )}
                  {counts.defer > 0 && <li>{counts.defer} {counts.defer === 1 ? "is" : "are"} deferred and {counts.defer === 1 ? "gets" : "get"} no dues this session.</li>}
                  <li>Every student who continues gets new dues for {preview.to.label}, starting unpaid.</li>
                  <li>Each student's level history gets a new entry; nothing is overwritten.</li>
                </ul>
                <p>It cannot be run twice or undone from here. If anything fails, nothing changes.</p>
              </div>
            </div>

            <div className="afield" style={{ marginTop: 14, maxWidth: 320 }}>
              <label htmlFor="tw-type">Type {preview.to.label} to confirm</label>
              <input id="tw-type" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={preview.to.label} autoComplete="off" />
            </div>

            {error && <div className="anote is-bad" style={{ marginTop: 14 }}>{error}</div>}

            <div className="aform-foot" style={{ marginTop: 16 }}>
              <button type="button" className="abtn" disabled={busy} onClick={() => setStep(preview.review.length ? "review" : "preview")}>Back</button>
              <button type="button" className="abtn abtn--primary" disabled={busy || typed.trim() !== preview.to.label} onClick={confirm}>
                {busy ? "Working..." : `Start ${preview.to.label}`}
              </button>
            </div>
          </>
        )}

        {step === "done" && result && (
          <>
            <div className="anote is-ok">
              <CheckCircle2 size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
              {result.to_session} is now the active session.
            </div>
            <div className="afin-moves" style={{ marginTop: 14 }}>
              {first ? (
                <div className="afin-move"><strong>{result.enrolled}</strong><span>started</span></div>
              ) : (
                <div className="afin-move"><strong>{result.promoted}</strong><span>promoted</span></div>
              )}
              {!first && <div className="afin-move afin-move--grad"><strong>{result.graduated}</strong><span>graduated</span></div>}
              <div className="afin-move"><strong>{result.repeating}</strong><span>repeating</span></div>
              <div className="afin-move"><strong>{result.deferred}</strong><span>deferred</span></div>
              <div className="afin-move afin-move--total"><strong>{result.dues_created}</strong><span>new dues created</span></div>
            </div>
            <div className="aform-foot" style={{ marginTop: 16 }}>
              <span />
              <button type="button" className="abtn abtn--primary" onClick={() => onClose(true)}>Done</button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default SessionManager;
