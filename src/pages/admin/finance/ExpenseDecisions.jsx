import { CheckCircle2, Inbox, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatNaira } from "../../../utils/money";
import {
  METHOD_LABELS,
  decideExpense,
  fetchExpenses,
  fetchOfficerNames,
  financeErrorMessage,
  formatDate,
  useFinanceVersion,
} from "../../../utils/finance";

/*
  Expenses waiting on one decision:
  - stage "verification": the Financial Secretary verifies or rejects;
  - stage "approval":     the President approves or rejects an
                          extra-budgetary expense the Fin Sec has verified.
  Others can see the list; only the deciding office gets the buttons, and
  the database refuses anyone deciding on an entry they recorded or verified.
*/
function ExpenseDecisions({ stage, access, title, intro }) {
  const version = useFinanceVersion();
  const [rows, setRows] = useState(null);
  const [names, setNames] = useState({});
  const [busyId, setBusyId] = useState("");
  const [rejecting, setRejecting] = useState({ id: "", reason: "" });
  const [message, setMessage] = useState(null);

  const status = stage === "approval" ? "awaiting_approval" : "pending_verification";
  const canAct = stage === "approval" ? access.isPresident : access.isFinSec;
  const me = access.profile?.user_id;

  const load = useCallback(async () => {
    const list = await fetchExpenses({ statuses: [status] }).catch(() => []);
    setRows(list.reverse());
    setNames(await fetchOfficerNames(list.flatMap((e) => [e.recorded_by, e.verified_by])));
  }, [status]);

  useEffect(() => {
    load();
  }, [load, version]);

  const ownEntry = (e) => e.recorded_by === me || (stage === "approval" && e.verified_by === me);
  const person = (id) => names[id]?.full_name || "—";

  async function decide(e, action) {
    if (action !== "reject") {
      const verb = action === "approve" ? "Approve" : "Verify";
      const after =
        action === "approve" || !e.extra_budgetary
          ? "It will count as spent in the Overview."
          : "It is extra-budgetary, so it then goes to the President for approval.";
      if (!window.confirm(`${verb} ${formatNaira(e.amount_kobo)} for "${e.purpose}"?\n\n${after}`)) return;
    }
    setBusyId(e.id);
    setMessage(null);
    const { error } = await decideExpense(action, e.id, rejecting.reason);
    setBusyId("");
    if (error) return setMessage({ kind: "bad", text: financeErrorMessage(error) });
    setRejecting({ id: "", reason: "" });
    setMessage({
      kind: "ok",
      text:
        action === "reject"
          ? "Rejected. The Treasurer can see why."
          : action === "approve"
            ? `Approved. ${formatNaira(e.amount_kobo)} now counts as spent.`
            : e.extra_budgetary
              ? "Verified. It now awaits the President's approval."
              : `Verified. ${formatNaira(e.amount_kobo)} now counts as spent.`,
    });
  }

  return (
    <section className="apanel afin-expense-queue">
      <div className="apanel-head">
        <div>
          <h2>{title}</h2>
          {intro && <p>{intro}</p>}
        </div>
        {rows && rows.length > 0 && <span className="apill apill--muted">{rows.length}</span>}
      </div>

      {message && (
        <div className={message.kind === "ok" ? "anote is-ok" : "anote is-bad"} style={{ margin: "12px 16px 0" }}>
          {message.text}
        </div>
      )}

      {rows === null ? (
        <div className="askel" style={{ height: 90, margin: 16 }} />
      ) : rows.length === 0 ? (
        <div className="aempty-row">
          <Inbox size={24} />
          <strong>Nothing waiting</strong>
          <span>{stage === "approval" ? "Extra-budgetary expenses appear here after the Financial Secretary verifies them." : "Expenses the Treasurer records appear here."}</span>
        </div>
      ) : (
        <div className="atable-scroll">
          <table className="atable afin-stack">
            <thead>
              <tr>
                <th>Expense</th>
                <th className="num">Amount</th>
                <th>Paid out</th>
                <th>{stage === "approval" ? "Recorded / verified" : "Recorded"}</th>
                <th className="num"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const own = ownEntry(e);
                const isRejecting = rejecting.id === e.id;
                return (
                  <tr key={e.id}>
                    <td>
                      <div className="acell-title">
                        <strong>{e.purpose}</strong>
                        <span>Spent {formatDate(e.spent_on)}</span>
                      </div>
                      {e.extra_budgetary && (
                        <span className="abadge abadge--soon afin-under-title">Extra-budgetary</span>
                      )}
                    </td>
                    <td className="num" data-label="Amount"><strong>{formatNaira(e.amount_kobo)}</strong></td>
                    <td data-label="Paid out" className="quiet">
                      {METHOD_LABELS[e.method]}{e.reference ? ` · ${e.reference}` : ""}
                    </td>
                    <td data-label={stage === "approval" ? "Recorded / verified" : "Recorded"} className="quiet">
                      {person(e.recorded_by)} · {formatDate(e.recorded_at)}
                      {stage === "approval" && (
                        <>
                          <br />
                          Verified by {person(e.verified_by)} · {formatDate(e.verified_at)}
                        </>
                      )}
                    </td>
                    <td className="num afin-stack-actions" data-label="">
                      {canAct &&
                        (isRejecting ? (
                          <span className="afin-reject">
                            <input
                              value={rejecting.reason}
                              onChange={(ev) => setRejecting({ id: e.id, reason: ev.target.value })}
                              placeholder="Reason for rejecting"
                              aria-label="Reason for rejecting"
                              autoFocus
                            />
                            <button type="button" className="abtn abtn--danger" disabled={busyId === e.id} onClick={() => decide(e, "reject")}>
                              Reject
                            </button>
                            <button type="button" className="abtn" onClick={() => setRejecting({ id: "", reason: "" })}>
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <span className="acell-actions">
                            <button
                              type="button"
                              className="abtn abtn--primary"
                              disabled={own || busyId === e.id}
                              title={own ? "You recorded or verified this, so someone else must decide." : ""}
                              onClick={() => decide(e, stage === "approval" ? "approve" : "verify")}
                            >
                              <CheckCircle2 size={14} /> {stage === "approval" ? "Approve" : "Verify"}
                            </button>
                            <button
                              type="button"
                              className="abtn"
                              disabled={own || busyId === e.id}
                              onClick={() => setRejecting({ id: e.id, reason: "" })}
                            >
                              <XCircle size={14} /> Reject
                            </button>
                          </span>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default ExpenseDecisions;
