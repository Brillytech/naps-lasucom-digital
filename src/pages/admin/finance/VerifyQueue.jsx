import { CheckCircle2, Inbox, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { formatNaira } from "../../../utils/money";
import {
  METHOD_LABELS,
  STATUS_LABELS,
  financeErrorMessage,
  formatDate,
  statusBadgeClass,
  notifyFinanceChanged,
  useFinanceVersion,
} from "../../../utils/finance";
import ExpenseDecisions from "./ExpenseDecisions";
import ReceiptDownloads from "./ReceiptDownloads";

// receipts.payment_id is unique, so the API embeds it as an object, not a list.
function receiptOf(row) {
  return Array.isArray(row.receipts) ? row.receipts[0] : row.receipts;
}

const VIEWS = [
  ["pending_verification", "Awaiting"],
  ["verified", "Verified"],
  ["rejected", "Rejected"],
];

function VerifyQueue({ access }) {
  const version = useFinanceVersion();
  const [view, setView] = useState("pending_verification");
  const [rows, setRows] = useState([]);
  const [names, setNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [rejecting, setRejecting] = useState({ id: "", reason: "" });
  const [message, setMessage] = useState(null); // { kind, text, receiptId }

  const me = access.profile?.user_id;
  const canDecide = access.isFinSec;

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("payments")
      .select(
        "id, amount_kobo, method, payment_date, bank_reference, note, status, recorded_by, recorded_at, verified_by, verified_at, rejection_reason, students(full_name, matric_no), student_dues(level, fee_types(name)), academic_sessions(label), receipts(id, receipt_number)"
      )
      .eq("status", view)
      .order(view === "pending_verification" ? "recorded_at" : "verified_at", {
        ascending: view === "pending_verification",
      })
      .limit(100);

    const list = data || [];
    setRows(list);

    // Officer names for "recorded by" / "decided by".
    const ids = [...new Set(list.flatMap((r) => [r.recorded_by, r.verified_by]).filter(Boolean))];
    if (ids.length) {
      const { data: people } = await supabase
        .from("admin_profiles")
        .select("user_id, full_name, office")
        .in("user_id", ids);
      setNames(Object.fromEntries((people || []).map((p) => [p.user_id, p])));
    }
    setLoading(false);
  }, [view]);

  useEffect(() => {
    load();
  }, [load, version]);

  async function verify(row) {
    const ok = window.confirm(
      `Verify ${formatNaira(row.amount_kobo)} from ${row.students?.full_name}?\n\nOnly confirm if the money is in the account or cash box. A permanent receipt will be issued.`
    );
    if (!ok) return;

    setBusyId(row.id);
    setMessage(null);
    const { data, error } = await supabase.rpc("verify_payment", { p_payment_id: row.id });
    setBusyId("");

    if (error) {
      setMessage({ kind: "bad", text: financeErrorMessage(error) });
      return;
    }

    setMessage({
      kind: "ok",
      text: `Verified. Receipt ${data.receipt_number} issued to ${row.students?.full_name}.`,
      receiptId: data.receipt_id,
    });
    notifyFinanceChanged();
  }

  async function reject(row) {
    setBusyId(row.id);
    setMessage(null);
    const { error } = await supabase.rpc("reject_payment", {
      p_payment_id: row.id,
      p_reason: rejecting.reason,
    });
    setBusyId("");

    if (error) {
      setMessage({ kind: "bad", text: financeErrorMessage(error) });
      return;
    }

    setRejecting({ id: "", reason: "" });
    setMessage({ kind: "ok", text: `Rejected. The Treasurer can see why and record it again if needed.` });
    notifyFinanceChanged();
  }

  const person = (id) => names[id]?.full_name || "—";

  return (
    <>
      <div className="atoolbar">
        <div className="aseg">
          {VIEWS.map(([id, label]) => (
            <button key={id} type="button" className={view === id ? "is-on" : ""} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </div>
        {!canDecide && view === "pending_verification" && (
          <span className="aform-note">Only the Financial Secretary can verify or reject.</span>
        )}
      </div>

      {message && (
        <div className={message.kind === "ok" ? "anote is-ok" : "anote is-bad"} style={{ marginTop: 14 }}>
          {message.text}
          {message.receiptId && (
            <div style={{ marginTop: 10 }}>
              <ReceiptDownloads receiptId={message.receiptId} />
            </div>
          )}
        </div>
      )}

      <div className="atable-wrap">
        {loading ? (
          <div className="askel" style={{ height: 120, margin: 16 }} />
        ) : rows.length === 0 ? (
          <div className="aempty-row">
            <Inbox size={26} />
            <strong>{view === "pending_verification" ? "Nothing awaiting verification" : "Nothing here yet"}</strong>
            <span>
              {view === "pending_verification"
                ? "Payments the Treasurer records appear here."
                : "Decided payments are listed here, newest first."}
            </span>
          </div>
        ) : (
          <div className="atable-scroll">
            <table className="atable afin-stack">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>For</th>
                  <th className="num">Amount</th>
                  <th>Paid by</th>
                  <th>Recorded</th>
                  <th>{view === "pending_verification" ? "Status" : "Decided"}</th>
                  <th className="num">{view === "pending_verification" ? "Decision" : ""}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const own = row.recorded_by === me;
                  const isRejecting = rejecting.id === row.id;
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="acell-title">
                          <strong>{row.students?.full_name}</strong>
                          <span>{row.students?.matric_no} · {row.student_dues?.level}L</span>
                        </div>
                      </td>
                      <td data-label="For">
                        <div className="acell-title afin-cell-tight">
                          <strong>{row.student_dues?.fee_types?.name}</strong>
                          <span>{row.academic_sessions?.label}</span>
                        </div>
                      </td>
                      <td className="num" data-label="Amount"><strong>{formatNaira(row.amount_kobo)}</strong></td>
                      <td data-label="Paid">
                        <div className="acell-title afin-cell-tight">
                          <strong>{METHOD_LABELS[row.method]} · {formatDate(row.payment_date)}</strong>
                          <span>{row.bank_reference || row.note || "No reference"}</span>
                        </div>
                      </td>
                      <td className="quiet" data-label="Recorded">
                        {person(row.recorded_by)}
                        <br />
                        {formatDate(row.recorded_at)}
                      </td>
                      <td data-label={view === "pending_verification" ? "Status" : "Decided"}>
                        {view === "pending_verification" ? (
                          <span className={statusBadgeClass(row.status)}>{STATUS_LABELS[row.status]}</span>
                        ) : (
                          <div className="acell-title afin-cell-tight">
                            <strong>
                              <span className={statusBadgeClass(row.status)}>{STATUS_LABELS[row.status]}</span>
                            </strong>
                            <span>
                              {person(row.verified_by)} · {formatDate(row.verified_at)}
                              {row.rejection_reason ? ` · ${row.rejection_reason}` : ""}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="num afin-stack-actions" data-label="">
                        {view === "verified" && receiptOf(row) && (
                          <ReceiptDownloads receiptId={receiptOf(row).id} compact />
                        )}
                        {view === "pending_verification" && canDecide && (
                          isRejecting ? (
                            <span className="afin-reject">
                              <input
                                value={rejecting.reason}
                                onChange={(e) => setRejecting({ id: row.id, reason: e.target.value })}
                                placeholder="Reason for rejecting"
                                aria-label="Reason for rejecting"
                                autoFocus
                              />
                              <button type="button" className="abtn abtn--danger" disabled={busyId === row.id} onClick={() => reject(row)}>
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
                                disabled={own || busyId === row.id}
                                title={own ? "You recorded this payment, so someone else must verify it." : ""}
                                onClick={() => verify(row)}
                              >
                                <CheckCircle2 size={14} /> Verify
                              </button>
                              <button
                                type="button"
                                className="abtn"
                                disabled={own || busyId === row.id}
                                onClick={() => setRejecting({ id: row.id, reason: "" })}
                              >
                                <XCircle size={14} /> Reject
                              </button>
                            </span>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {view === "pending_verification" && (
        <ExpenseDecisions
          stage="verification"
          access={access}
          title="Expenses awaiting verification"
          intro="Check each against the receipt or statement. Extra-budgetary ones go on to the President after you verify."
        />
      )}
    </>
  );
}

export default VerifyQueue;
