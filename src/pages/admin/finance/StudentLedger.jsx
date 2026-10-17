import { Banknote, ChevronLeft, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { formatNaira } from "../../../utils/money";
import {
  METHOD_LABELS,
  STATUS_LABELS,
  formatDate,
  ledgerParams,
  statusBadgeClass,
  useFinanceVersion,
} from "../../../utils/finance";
import LedgerFilters from "./LedgerFilters";
import MarkPaidDialog from "./MarkPaidDialog";
import ReceiptDownloads from "./ReceiptDownloads";

const PAGE = 50;

// Pending money is shown as its own state: recorded, not yet counted.
function LedgerStatus({ row }) {
  return (
    <span className="abadges">
      {row.pending_kobo > 0 && (
        <span className="abadge abadge--soon" title={`${formatNaira(row.pending_kobo)} recorded, awaiting the Financial Secretary`}>
          <i />
          Pending verification
        </span>
      )}
      {(row.pending_kobo === 0 || row.status !== "unpaid") && (
        <span className={statusBadgeClass(row.status)}>{STATUS_LABELS[row.status]}</span>
      )}
    </span>
  );
}

// Something is left to record once verified and pending money are counted.
const canMarkPaid = (row) => Number(row.outstanding_kobo) - Number(row.pending_kobo) > 0;

function StudentLedger({ sessions, session, access }) {
  const version = useFinanceVersion();
  const [marking, setMarking] = useState(null);
  const [filters, setFilters] = useState({
    sessionId: session?.id || sessions.sessions.find((s) => s.status !== "draft")?.id || "",
    level: "",
    status: "",
    search: "",
    page: 0,
  });
  const [result, setResult] = useState({ total: 0, rows: [] });
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!filters.sessionId) return;
    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc("finance_ledger", ledgerParams(filters, PAGE, filters.page * PAGE));
      if (!cancelled) {
        setResult(data || { total: 0, rows: [] });
        setLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filters, version]);

  if (selected) {
    return <StudentDetail student={selected} access={access} onBack={() => setSelected(null)} />;
  }

  if (!filters.sessionId) {
    return (
      <div className="atable-wrap">
        <div className="aempty-row">
          <Users size={26} />
          <strong>No session has started yet</strong>
          <span>The ledger fills in once the President confirms a session.</span>
        </div>
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(result.total / PAGE));

  return (
    <>
      <LedgerFilters sessions={sessions.sessions} filters={filters} setFilters={setFilters} />

      <div className="atable-wrap">
        {result.rows.length === 0 && !loading ? (
          <div className="aempty-row">
            <Users size={26} />
            <strong>No students match</strong>
            <span>Try another level, status or search.</span>
          </div>
        ) : (
          <div className="atable-scroll">
            <table className="atable afin-stack">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Level</th>
                  <th className="num">Due</th>
                  <th className="num">Paid</th>
                  <th className="num">Outstanding</th>
                  <th>Status</th>
                  {access.isTreasurer && <th className="num"></th>}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.student_id} className="afin-row-link" onClick={() => setSelected(r)}>
                    <td>
                      <button type="button" className="acell-title afin-linkcell" onClick={() => setSelected(r)}>
                        <strong>{r.full_name}</strong>
                        <span>{r.matric_no}</span>
                      </button>
                    </td>
                    <td className="quiet" data-label="Level">{r.level}L</td>
                    <td className="num" data-label="Due">{formatNaira(r.due_kobo)}</td>
                    <td className="num" data-label="Paid">{formatNaira(r.paid_kobo)}</td>
                    <td className="num" data-label="Outstanding">{formatNaira(r.outstanding_kobo)}</td>
                    <td data-label="Status">
                      <LedgerStatus row={r} />
                    </td>
                    {access.isTreasurer && (
                      <td className="num afin-stack-actions" data-label="">
                        {canMarkPaid(r) && (
                          <button
                            type="button"
                            className="abtn afin-markpaid"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMarking(r);
                            }}
                          >
                            <Banknote size={14} /> Mark paid
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {marking && (
        <MarkPaidDialog student={marking} sessionId={filters.sessionId} onClose={() => setMarking(null)} />
      )}

      {result.total > PAGE && (
        <div className="afin-pager">
          <button type="button" className="abtn" disabled={filters.page === 0} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>
            Previous
          </button>
          <span>
            Page {filters.page + 1} of {pages} · {result.total} students
          </span>
          <button type="button" className="abtn" disabled={filters.page + 1 >= pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>
            Next
          </button>
        </div>
      )}
    </>
  );
}

// Everything about one student, every session: dues, payments, receipts.
function StudentDetail({ student, access, onBack }) {
  const version = useFinanceVersion();
  const [data, setData] = useState(null);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase
        .from("student_dues")
        .select("id, level, amount_due_kobo, amount_paid_kobo, status, fee_types(name), academic_sessions(label, starts_on)")
        .eq("student_id", student.student_id),
      supabase
        .from("payments")
        .select("id, amount_kobo, method, payment_date, bank_reference, status, rejection_reason, recorded_at, student_dues(fee_types(name)), academic_sessions(label), receipts(id, receipt_number)")
        .eq("student_id", student.student_id)
        .order("recorded_at", { ascending: false }),
    ]).then(([dues, payments]) => {
      if (cancelled) return;
      setData({
        dues: (dues.data || []).sort((a, b) =>
          (b.academic_sessions?.starts_on || "").localeCompare(a.academic_sessions?.starts_on || "")
        ),
        payments: payments.data || [],
      });
    });
    return () => {
      cancelled = true;
    };
  }, [student, version]);

  const owesSomething = data?.dues.some((d) => Number(d.amount_due_kobo) > Number(d.amount_paid_kobo));
  const pendingKobo = (data?.payments || [])
    .filter((p) => p.status === "pending_verification")
    .reduce((sum, p) => sum + Number(p.amount_kobo), 0);
  const leftToRecord = (data?.dues || []).reduce((sum, d) => sum + Number(d.amount_due_kobo) - Number(d.amount_paid_kobo), 0) - pendingKobo;

  const receiptOf = (p) => (Array.isArray(p.receipts) ? p.receipts[0] : p.receipts);

  return (
    <>
      <button type="button" className="ainbox-back" style={{ marginTop: 16 }} onClick={onBack}>
        <ChevronLeft size={15} /> Back to ledger
      </button>

      <section className="apanel" style={{ marginTop: 8 }}>
        <div className="apanel-head">
          <div>
            <h2>{student.full_name}</h2>
            <p>{student.matric_no} · {student.level}L</p>
          </div>
          {access.isTreasurer && owesSomething && leftToRecord > 0 && (
            <button type="button" className="abtn abtn--primary" onClick={() => setMarking(true)}>
              <Banknote size={15} /> Mark paid
            </button>
          )}
        </div>

        {pendingKobo > 0 && (
          <div className="anote" style={{ margin: "12px 16px 0" }}>
            <span className="abadge abadge--soon"><i />Pending verification</span>{" "}
            {formatNaira(pendingKobo)} recorded, waiting for the Financial Secretary.
          </div>
        )}

        {!data ? (
          <div className="askel" style={{ height: 120, margin: 16 }} />
        ) : (
          <>
            <div className="atable-scroll">
              <table className="atable">
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Fee</th>
                    <th className="num">Due</th>
                    <th className="num">Paid</th>
                    <th className="num">Outstanding</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dues.map((d) => (
                    <tr key={d.id}>
                      <td className="quiet">{d.academic_sessions?.label} · {d.level}L</td>
                      <td>{d.fee_types?.name}</td>
                      <td className="num">{formatNaira(d.amount_due_kobo)}</td>
                      <td className="num">{formatNaira(d.amount_paid_kobo)}</td>
                      <td className="num">{formatNaira(d.amount_due_kobo - d.amount_paid_kobo)}</td>
                      <td><span className={statusBadgeClass(d.status)}>{STATUS_LABELS[d.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="apanel-head" style={{ borderTop: "1px solid var(--rule)" }}>
              <h2>Payments & receipts</h2>
            </div>
            {data.payments.length === 0 ? (
              <p className="aform-note" style={{ padding: "12px 16px" }}>No payments recorded yet.</p>
            ) : (
              <div className="atable-scroll">
                <table className="atable">
                  <thead>
                    <tr>
                      <th>Paid</th>
                      <th>For</th>
                      <th className="num">Amount</th>
                      <th>Status</th>
                      <th className="num">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((p) => (
                      <tr key={p.id}>
                        <td className="quiet">
                          {formatDate(p.payment_date)}
                          <br />
                          {METHOD_LABELS[p.method]}{p.bank_reference ? ` · ${p.bank_reference}` : ""}
                        </td>
                        <td>
                          {p.student_dues?.fee_types?.name}
                          <br />
                          <span className="quiet">{p.academic_sessions?.label}</span>
                        </td>
                        <td className="num">{formatNaira(p.amount_kobo)}</td>
                        <td>
                          <span className={statusBadgeClass(p.status)}>{STATUS_LABELS[p.status]}</span>
                          {p.rejection_reason && <div className="quiet" style={{ marginTop: 4 }}>{p.rejection_reason}</div>}
                        </td>
                        <td className="num">
                          {receiptOf(p) ? (
                            <span className="afin-receipt-cell">
                              <span className="afin-mono">{receiptOf(p).receipt_number}</span>
                              <ReceiptDownloads receiptId={receiptOf(p).id} compact />
                            </span>
                          ) : (
                            <span className="quiet">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {marking && <MarkPaidDialog student={student} onClose={() => setMarking(false)} />}
    </>
  );
}

export default StudentLedger;
