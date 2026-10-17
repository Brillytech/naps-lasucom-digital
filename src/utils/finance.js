// Shared finance vocabulary for the admin screens. The database enforces every
// one of these rules; the UI uses them only to show the right controls.

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export const FINANCE_ROLES = ["president", "treasurer", "financial_secretary"];
export const REGISTER_ROLES = ["president", "general_secretary", "financial_secretary"];
export const LEVELS = [100, 200, 300, 400, 500, 600];

export const METHOD_LABELS = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  other: "Other",
};

export const STUDENT_STATUS_LABELS = {
  active: "Active",
  repeating: "Repeating",
  deferred: "Deferred",
  unconfirmed: "Unconfirmed",
  graduated: "Graduated",
  withdrawn: "Withdrawn",
};

// Status -> shared .abadge modifier. Green only for "done/verified".
export function statusBadgeClass(status) {
  switch (status) {
    case "paid":
    case "verified":
    case "approved":
    case "active":
    case "completed":
      return "abadge abadge--live";
    case "partial":
    case "pending_verification":
    case "awaiting_approval":
    case "draft":
      return "abadge abadge--soon";
    case "rejected":
    case "withdrawn":
      return "abadge abadge--off";
    default:
      return "abadge abadge--draft";
  }
}

export const STATUS_LABELS = {
  paid: "Paid",
  partial: "Partial",
  unpaid: "Unpaid",
  pending_verification: "Awaiting verification",
  awaiting_approval: "Awaiting President",
  approved: "Approved",
  verified: "Verified",
  rejected: "Rejected",
  draft: "Draft",
  active: "Active",
  closed: "Closed",
};

// Database errors raised by the finance functions are already written for
// the person at the screen; RLS refusals are not, so translate those.
export function financeErrorMessage(error) {
  const message = error?.message || "Something went wrong. Try again.";
  if (/row-level security|permission denied/i.test(message)) {
    return "Your office is not allowed to do that.";
  }
  if (/duplicate key.*matric/i.test(message)) {
    return "A student with that matric number is already registered.";
  }
  return message;
}

export function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function todayLagos() {
  // en-CA formats as YYYY-MM-DD, which <input type="date"> expects.
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
}

/*
  The signed-in executive and what finance lets them do. canRead comes from
  the database (it also covers "President shared finance with everyone").
*/
export function useFinanceAccess() {
  const [state, setState] = useState({ loading: true, profile: null, canRead: false });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setState({ loading: false, profile: null, canRead: false });
        return;
      }

      const [{ data: profile }, { data: canRead }] = await Promise.all([
        supabase
          .from("admin_profiles")
          .select("user_id, full_name, office, role")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle(),
        supabase.rpc("can_read_finance"),
      ]);

      if (!cancelled) {
        setState({ loading: false, profile: profile || null, canRead: Boolean(canRead) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const role = state.profile?.role;
  return {
    ...state,
    role,
    isPresident: role === "president",
    isTreasurer: role === "treasurer",
    isFinSec: role === "financial_secretary",
    canKeepRegister: REGISTER_ROLES.includes(role),
  };
}

// PostgREST's or() filter treats these characters as syntax.
export function cleanSearch(text) {
  return String(text || "").replace(/[,()*%\\]/g, " ").trim();
}

/*
  "Finance changed" signal. Recording a payment here, or the Financial
  Secretary verifying one on another device (via Realtime, see
  useFinanceLiveUpdates), bumps every subscriber's version, and each finance
  view refetches. No page reload.
*/
const financeListeners = new Set();

export function notifyFinanceChanged() {
  financeListeners.forEach((fn) => fn());
}

export function useFinanceVersion() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    financeListeners.add(bump);
    return () => financeListeners.delete(bump);
  }, []);
  return version;
}

// Mounted once by the Finance page: payment changes made anywhere (RLS
// still decides what this user may see) and returning to the tab both
// refresh the open view.
export function useFinanceLiveUpdates() {
  useEffect(() => {
    const channel = supabase
      .channel("finance-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, notifyFinanceChanged)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, notifyFinanceChanged)
      .subscribe();

    const onFocus = () => notifyFinanceChanged();
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
      supabase.removeChannel(channel);
    };
  }, []);
}

// A student's dues (all sessions, or one), with what is already awaiting
// verification and what can still be recorded against each.
export async function fetchStudentDues(studentId, sessionId = null) {
  let duesQuery = supabase
    .from("student_dues")
    .select("id, session_id, amount_due_kobo, amount_paid_kobo, status, level, fee_types(name), academic_sessions(label, status, starts_on)")
    .eq("student_id", studentId);
  if (sessionId) duesQuery = duesQuery.eq("session_id", sessionId);

  const [{ data: dueRows }, { data: pending }] = await Promise.all([
    duesQuery,
    supabase
      .from("payments")
      .select("due_id, amount_kobo")
      .eq("student_id", studentId)
      .eq("status", "pending_verification"),
  ]);

  const pendingByDue = {};
  for (const p of pending || []) {
    pendingByDue[p.due_id] = (pendingByDue[p.due_id] || 0) + Number(p.amount_kobo);
  }

  return (dueRows || [])
    .map((d) => {
      const pendingKobo = pendingByDue[d.id] || 0;
      return {
        ...d,
        pendingKobo,
        remainingKobo: Number(d.amount_due_kobo) - Number(d.amount_paid_kobo) - pendingKobo,
      };
    })
    .sort((a, b) => (b.academic_sessions?.starts_on || "").localeCompare(a.academic_sessions?.starts_on || ""));
}

// The one way the app records a payment: the database's record_payment(),
// which checks the caller is the Treasurer and the amount fits the balance.
export async function recordPayment({ dueId, amountKobo, method, date, reference, note }) {
  const result = await supabase.rpc("record_payment", {
    p_due_id: dueId,
    p_amount_kobo: amountKobo,
    p_method: method,
    p_payment_date: date,
    p_bank_reference: reference?.trim() || null,
    p_note: note?.trim() || null,
  });
  if (!result.error) notifyFinanceChanged();
  return result;
}

// Ledger filter state -> finance_ledger() arguments.
export function ledgerParams(filters, limit, offset) {
  return {
    p_session_id: filters.sessionId,
    p_level: filters.level ? Number(filters.level) : null,
    p_status: filters.status || null,
    p_search: cleanSearch(filters.search) || null,
    p_limit: limit,
    p_offset: offset,
  };
}

// Debounced name-or-matric lookup, for picking a student.
export function useStudentSearch(term) {
  const [results, setResults] = useState([]);

  useEffect(() => {
    const t = cleanSearch(term);
    if (t.length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("students")
        .select("id, full_name, matric_no, level, status")
        .or(`full_name.ilike.%${t}%,matric_no.ilike.%${t}%`)
        .order("full_name")
        .limit(8);
      if (!cancelled) setResults(data || []);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  return results;
}

export function useActiveSession() {
  const [state, setState] = useState({ loading: true, session: null, sessions: [] });

  const reload = async () => {
    const { data } = await supabase
      .from("academic_sessions")
      .select("id, label, starts_on, ends_on, status, is_active")
      .order("starts_on", { ascending: false });

    const sessions = data || [];
    setState({
      loading: false,
      sessions,
      session: sessions.find((s) => s.is_active) || null,
    });
  };

  useEffect(() => {
    reload();
  }, []);

  return { ...state, reload };
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

// The one way the app records an expense: record_expense() checks the caller
// is the Treasurer and files it against the active session.
export async function recordExpense({ amountKobo, purpose, spentOn, method, reference, note, extraBudgetary }) {
  const result = await supabase.rpc("record_expense", {
    p_amount_kobo: amountKobo,
    p_purpose: purpose,
    p_spent_on: spentOn,
    p_method: method,
    p_reference: reference?.trim() || null,
    p_note: note?.trim() || null,
    p_extra_budgetary: Boolean(extraBudgetary),
  });
  if (!result.error) notifyFinanceChanged();
  return result;
}

// Verify / approve / reject, each a database function that checks the
// caller's office and refuses their own entries.
export async function decideExpense(action, id, reason) {
  const fn = { verify: "verify_expense", approve: "approve_expense", reject: "reject_expense" }[action];
  const args = action === "reject" ? { p_expense_id: id, p_reason: reason } : { p_expense_id: id };
  const result = await supabase.rpc(fn, args);
  if (!result.error) notifyFinanceChanged();
  return result;
}

export async function fetchExpenses({ sessionId = null, statuses = null } = {}) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let query = supabase
      .from("expenses")
      .select("*")
      .order("recorded_at", { ascending: false })
      .range(from, from + 999);
    if (sessionId) query = query.eq("session_id", sessionId);
    if (statuses) query = query.in("status", statuses);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

// user_id -> { full_name, office } for "recorded by" / "decided by" columns.
export async function fetchOfficerNames(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const { data } = await supabase.from("admin_profiles").select("user_id, full_name, office").in("user_id", unique);
  return Object.fromEntries((data || []).map((p) => [p.user_id, p]));
}

// Counted in the Overview: verified normal, or approved extra-budgetary.
export const isFinalExpense = (e) => e.status === "approved" || (e.status === "verified" && !e.extra_budgetary);

export function expenseStage(e) {
  if (e.status === "pending_verification") return "Awaiting Financial Secretary";
  if (e.status === "awaiting_approval") return "Awaiting President's approval";
  if (e.status === "rejected") return e.rejected_stage === "approval" ? "Rejected by President" : "Rejected at verification";
  return e.status === "approved" ? "Approved" : "Verified";
}

// Expenses log for a session, as CSV (Google Sheets) or Excel.
export async function exportExpenses(sessionId, sessionLabel, kind) {
  const { downloadCsv, downloadXlsx } = await import("./tableExport");
  const rows = await fetchExpenses({ sessionId });
  const names = await fetchOfficerNames(rows.flatMap((e) => [e.recorded_by, e.verified_by, e.approved_by, e.rejected_by]));
  const who = (id) => names[id]?.full_name || "";
  const headers = [
    "Date spent", "Purpose", "Amount (NGN)", "Method", "Reference", "Extra-budgetary", "Status", "Counted",
    "Recorded by", "Recorded", "Verified by", "Verified", "Approved by", "Approved", "Rejected by", "Rejection reason", "Note",
  ];
  const body = rows.map((e) => [
    e.spent_on, e.purpose, (Number(e.amount_kobo) / 100).toFixed(2), METHOD_LABELS[e.method], e.reference || "",
    e.extra_budgetary ? "Yes" : "No", expenseStage(e), isFinalExpense(e) ? "Yes" : "No",
    who(e.recorded_by), e.recorded_at?.slice(0, 10), who(e.verified_by), e.verified_at?.slice(0, 10) || "",
    who(e.approved_by), e.approved_at?.slice(0, 10) || "", who(e.rejected_by), e.rejection_reason || "", e.note || "",
  ]);
  const name = `naps-expenses_${sessionLabel.replace("/", "-")}`;
  if (kind === "csv") downloadCsv(`${name}.csv`, headers, body);
  else await downloadXlsx(`${name}.xlsx`, `Expenses ${sessionLabel}`, headers, body);
}
