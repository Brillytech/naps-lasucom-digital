import { ArrowDownRight, CheckCircle2, Clock, Scale, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { formatNaira } from "../../../utils/money";
import { useFinanceVersion } from "../../../utils/finance";

function FinanceOverview({ session }) {
  const version = useFinanceVersion();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    supabase.rpc("finance_overview", { p_session_id: session.id }).then(({ data: o, error: e }) => {
      if (cancelled) return;
      if (e) setError("Could not load the overview.");
      else setData(o);
    });

    return () => {
      cancelled = true;
    };
  }, [session, version]);

  if (!session) {
    return (
      <div className="atable-wrap">
        <div className="aempty-row">
          <Wallet size={26} />
          <strong>Nothing to show yet</strong>
          <span>Dues are created when a session is confirmed.</span>
        </div>
      </div>
    );
  }

  if (error) return <div className="anote is-bad" style={{ marginTop: 16 }}>{error}</div>;
  if (!data) return <div className="askel" style={{ height: 120, marginTop: 16 }} />;

  const collectedPct = data.total_due_kobo
    ? Math.round((data.collected_kobo / data.total_due_kobo) * 100)
    : 0;

  const negative = data.balance_kobo < 0;
  const pendingAny = data.pending_count > 0 || data.expenses_pending_count > 0;

  // Only verified money counts. Pending amounts on each side are shown, but
  // never added in, until the Financial Secretary (and for extra-budgetary
  // spending, the President) has signed them off.
  return (
    <>
      <div className="ametrics">
        <div className="ametric">
          <span className="ametric-label">
            <CheckCircle2 size={13} />
            Income (verified)
          </span>
          <strong className="ametric-value afin-money">{formatNaira(data.income_kobo)}</strong>
          <span className="ametric-note">Dues · {collectedPct}% of {formatNaira(data.total_due_kobo)} due</span>
        </div>

        <Link to="/naps-admin/finance/expenses" className="ametric">
          <span className="ametric-label">
            <ArrowDownRight size={13} />
            Expenses (verified/approved)
          </span>
          <strong className="ametric-value afin-money">{formatNaira(data.expenses_kobo)}</strong>
          <span className="ametric-note">
            {data.expenses_count} expense{data.expenses_count === 1 ? "" : "s"} counted
          </span>
        </Link>

        <div className="ametric">
          <span className="ametric-label">
            <Scale size={13} />
            Balance
          </span>
          <strong className={negative ? "ametric-value afin-money afin-negative" : "ametric-value afin-money"}>
            {negative ? "−" : ""}{formatNaira(Math.abs(data.balance_kobo))}
          </strong>
          <span className="ametric-note">Income minus expenses</span>
        </div>

        <Link to="/naps-admin/finance/verify" className="ametric">
          <span className="ametric-label">
            <Clock size={13} />
            Pending, not counted
          </span>
          <span className="afin-pending-lines">
            <span>
              <em>Payments</em>
              <strong>{formatNaira(data.pending_kobo)}</strong>
              <small>{data.pending_count}</small>
            </span>
            <span>
              <em>Expenses</em>
              <strong>{formatNaira(data.expenses_pending_kobo)}</strong>
              <small>{data.expenses_pending_count}</small>
            </span>
          </span>
          <span className={pendingAny ? "ametric-note is-alert" : "ametric-note"}>
            {data.expenses_awaiting_approval_count > 0
              ? `${data.expenses_awaiting_approval_count} awaiting the President`
              : pendingAny
                ? "Awaiting the Financial Secretary"
                : "Nothing waiting"}
          </span>
        </Link>
      </div>

      <section className="apanel">
        <div className="apanel-head">
          <h2>Dues collection</h2>
          <span className="apill apill--muted">
            {formatNaira(data.outstanding_kobo)} outstanding · {data.students_paid} of {data.students} fully paid
          </span>
        </div>
        <div className="afin-progress" aria-label={`${collectedPct}% collected`}>
          <span style={{ width: `${collectedPct}%` }} />
        </div>

        <div className="atable-scroll">
          <table className="atable">
            <thead>
              <tr>
                <th>Level</th>
                <th className="num">Students</th>
                <th className="num">Due</th>
                <th className="num">Collected</th>
                <th className="num">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {data.by_level.map((row) => (
                <tr key={row.level}>
                  <td>{row.level}L</td>
                  <td className="num">{row.students}</td>
                  <td className="num">{formatNaira(row.due_kobo)}</td>
                  <td className="num">{formatNaira(row.paid_kobo)}</td>
                  <td className="num">{formatNaira(row.due_kobo - row.paid_kobo)}</td>
                </tr>
              ))}
              {data.by_level.length === 0 && (
                <tr>
                  <td colSpan={5} className="quiet">No dues in this session yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export default FinanceOverview;
