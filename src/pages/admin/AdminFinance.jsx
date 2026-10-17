import { CalendarRange, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import {
  formatDate,
  useActiveSession,
  useFinanceAccess,
  useFinanceLiveUpdates,
  useFinanceVersion,
} from "../../utils/finance";
import FinanceOverview from "./finance/FinanceOverview";
import RecordPayment from "./finance/RecordPayment";
import VerifyQueue from "./finance/VerifyQueue";
import StudentLedger from "./finance/StudentLedger";
import FinanceReports from "./finance/FinanceReports";
import ReceiptsList from "./finance/ReceiptsList";
import Expenses from "./finance/Expenses";
import SessionManager from "./finance/SessionManager";

/*
  One page, one tab per job. Tabs a role cannot act on are still listed when
  they can be read (a Treasurer can watch the verification queue), but the
  action controls inside are shown only to the office that owns them -- and
  the database refuses everyone else regardless.
*/
function AdminFinance() {
  const { tab = "overview" } = useParams();
  const access = useFinanceAccess();
  const sessions = useActiveSession();
  const version = useFinanceVersion();
  const [counts, setCounts] = useState({ verify: 0, approve: 0 });
  useFinanceLiveUpdates();

  // Counts on the tabs, so waiting work is visible from anywhere: payments
  // and expenses for the Financial Secretary, approvals for the President.
  useEffect(() => {
    let cancelled = false;
    const count = (table, status) =>
      supabase.from(table).select("id", { count: "exact", head: true }).eq("status", status).then(({ count: n }) => n || 0);
    Promise.all([
      count("payments", "pending_verification"),
      count("expenses", "pending_verification"),
      count("expenses", "awaiting_approval"),
    ]).then(([payments, expenses, approve]) => {
      if (!cancelled) setCounts({ verify: payments + expenses, approve });
    });
    return () => {
      cancelled = true;
    };
  }, [version]);

  if (access.loading || sessions.loading) {
    return (
      <main className="admin-page">
        <div className="askel" style={{ height: 64, marginBottom: 12 }} />
        <div className="askel" style={{ height: 220 }} />
      </main>
    );
  }

  if (!access.canRead && !access.isPresident) {
    return (
      <main className="admin-page">
        <section className="admin-empty-panel">
          <ShieldCheck size={34} />
          <h3>Finance is restricted</h3>
          <p>
            Finance is open to the President, Treasurer and Financial Secretary. The
            President can share read-only access with other executives.
          </p>
        </section>
      </main>
    );
  }

  const tabs = [
    ["overview", "Overview", true],
    ["record", "Record payment", access.isTreasurer],
    ["verify", "Verify", true],
    ["ledger", "Students ledger", true],
    ["expenses", "Expenses", true],
    ["reports", "Reports", true],
    ["receipts", "Receipts", true],
    ["sessions", "Sessions & fees", access.isPresident],
  ].filter(([, , shown]) => shown);

  const active = sessions.session;
  const props = { access, sessions, session: active };

  return (
    <main className="admin-page afin-page">
      <header className="apage-head">
        <div>
          <p className="apage-eyebrow">Finance</p>
          <h1>Dues & payments</h1>
          <p>Money is paid outside the app. Here it is recorded, verified and receipted.</p>
        </div>
      </header>

      {/* The active session heads every finance view, so nobody records or
          reads against the wrong year by accident. */}
      <div className={active ? "afin-session" : "afin-session is-none"}>
        <CalendarRange size={16} />
        {active ? (
          <span>
            Active session <strong>{active.label}</strong>
            <em>
              {formatDate(active.starts_on)} – {formatDate(active.ends_on)}
            </em>
          </span>
        ) : (
          <span>
            <strong>No active session.</strong>{" "}
            {access.isPresident
              ? "Create one under Sessions & fees and confirm it to start collecting dues."
              : "The President starts one from Sessions & fees."}
          </span>
        )}
      </div>

      {access.isPresident && counts.approve > 0 && tab !== "expenses" && (
        <NavLink to="/naps-admin/finance/expenses" className="afin-approval-call">
          <strong>
            {counts.approve} extra-budgetary expense{counts.approve === 1 ? "" : "s"} awaiting your approval
          </strong>
          <span>Review</span>
        </NavLink>
      )}

      <nav className="afin-tabs" aria-label="Finance sections">
        {tabs.map(([id, label]) => (
          <NavLink
            key={id}
            to={`/naps-admin/finance/${id}`}
            className={() => (tab === id ? "is-on" : "")}
          >
            {label}
            {id === "verify" && counts.verify > 0 && <em className="afin-tab-count">{counts.verify}</em>}
            {id === "expenses" && access.isPresident && counts.approve > 0 && (
              <em className="afin-tab-count" title="Awaiting your approval">{counts.approve}</em>
            )}
          </NavLink>
        ))}
      </nav>

      {tab === "overview" && <FinanceOverview {...props} />}
      {tab === "record" && access.isTreasurer && <RecordPayment {...props} />}
      {tab === "verify" && <VerifyQueue {...props} />}
      {tab === "ledger" && <StudentLedger {...props} />}
      {tab === "expenses" && <Expenses {...props} />}
      {tab === "reports" && <FinanceReports {...props} />}
      {tab === "receipts" && <ReceiptsList {...props} />}
      {tab === "sessions" && access.isPresident && <SessionManager {...props} />}
    </main>
  );
}

export default AdminFinance;
