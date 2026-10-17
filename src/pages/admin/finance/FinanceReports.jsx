import { FileSpreadsheet, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { formatNaira, koboToPlain } from "../../../utils/money";
import { METHOD_LABELS, STATUS_LABELS, exportExpenses, ledgerParams, useFinanceVersion } from "../../../utils/finance";
import { downloadCsv, downloadXlsx } from "../../../utils/tableExport";
import LedgerFilters from "./LedgerFilters";

// The API returns at most 1,000 rows per request; exports page through.
const CHUNK = 1000;

async function fetchAllLedger(filters) {
  const rows = [];
  for (let offset = 0; ; offset += CHUNK) {
    const { data, error } = await supabase.rpc("finance_ledger", ledgerParams(filters, CHUNK, offset));
    if (error) throw error;
    rows.push(...data.rows);
    if (rows.length >= data.total || data.rows.length === 0) return rows;
  }
}

async function fetchAllPayments(sessionId) {
  const rows = [];
  for (let from = 0; ; from += CHUNK) {
    const { data, error } = await supabase
      .from("payments")
      .select("amount_kobo, method, payment_date, bank_reference, status, recorded_at, verified_at, rejection_reason, students(full_name, matric_no), student_dues(level, fee_types(name)), receipts(receipt_number)")
      .eq("session_id", sessionId)
      .order("recorded_at")
      .range(from, from + CHUNK - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < CHUNK) return rows;
  }
}

function FinanceReports({ sessions, session }) {
  const version = useFinanceVersion();
  const [filters, setFilters] = useState({
    sessionId: session?.id || sessions.sessions.find((s) => s.status !== "draft")?.id || "",
    level: "",
    status: "",
    search: "",
    page: 0,
  });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const label = sessions.sessions.find((s) => s.id === filters.sessionId)?.label || "";
  const slug = [
    "naps-finance",
    label.replace("/", "-"),
    filters.level && `${filters.level}L`,
    filters.status,
  ].filter(Boolean).join("_");

  useEffect(() => {
    if (!filters.sessionId) return;
    let cancelled = false;
    supabase.rpc("finance_ledger", ledgerParams(filters, CHUNK, 0)).then(({ data }) => {
      if (cancelled) return;
      const rows = data?.rows || [];
      setPreview({
        total: data?.total || 0,
        due: rows.reduce((s, r) => s + Number(r.due_kobo), 0),
        paid: rows.reduce((s, r) => s + Number(r.paid_kobo), 0),
        // Past one page the sums would be partial, so they are not shown.
        partialSample: rows.length < (data?.total || 0),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [filters, version]);

  async function exportLedger(kind) {
    setBusy(kind);
    setError("");
    try {
      const rows = await fetchAllLedger(filters);
      const headers = ["Name", "Matric number", "Level", "Session", "Total due (NGN)", "Paid, verified (NGN)", "Awaiting verification (NGN)", "Outstanding (NGN)", "Status"];
      const body = rows.map((r) => [
        r.full_name, r.matric_no, `${r.level}L`, label,
        koboToPlain(r.due_kobo), koboToPlain(r.paid_kobo), koboToPlain(r.pending_kobo), koboToPlain(r.outstanding_kobo),
        STATUS_LABELS[r.status],
      ]);
      if (kind === "csv") downloadCsv(`${slug}.csv`, headers, body);
      else await downloadXlsx(`${slug}.xlsx`, `Dues ${label}`, headers, body);
    } catch {
      setError("The export failed. Check your connection and try again.");
    }
    setBusy("");
  }

  async function exportPayments(kind) {
    setBusy(`p-${kind}`);
    setError("");
    try {
      const rows = await fetchAllPayments(filters.sessionId);
      const headers = ["Name", "Matric number", "Level", "Fee", "Amount (NGN)", "Method", "Date paid", "Reference", "Status", "Receipt number", "Recorded", "Decided", "Rejection reason"];
      const body = rows
        .filter((r) => !filters.level || String(r.student_dues?.level) === String(filters.level))
        .map((r) => {
          const receipt = Array.isArray(r.receipts) ? r.receipts[0] : r.receipts;
          return [
            r.students?.full_name, r.students?.matric_no, `${r.student_dues?.level}L`, r.student_dues?.fee_types?.name,
            koboToPlain(r.amount_kobo), METHOD_LABELS[r.method], r.payment_date, r.bank_reference || "",
            STATUS_LABELS[r.status], receipt?.receipt_number || "",
            r.recorded_at?.slice(0, 10), r.verified_at?.slice(0, 10) || "", r.rejection_reason || "",
          ];
        });
      if (kind === "csv") downloadCsv(`${slug}_payments.csv`, headers, body);
      else await downloadXlsx(`${slug}_payments.xlsx`, `Payments ${label}`, headers, body);
    } catch {
      setError("The export failed. Check your connection and try again.");
    }
    setBusy("");
  }

  async function runExpenses(kind) {
    setBusy(`e-${kind}`);
    setError("");
    try {
      await exportExpenses(filters.sessionId, label, kind);
    } catch {
      setError("The export failed. Check your connection and try again.");
    }
    setBusy("");
  }

  if (!filters.sessionId) {
    return <p className="aform-note" style={{ marginTop: 16 }}>Reports appear once a session has started.</p>;
  }

  return (
    <>
      <LedgerFilters sessions={sessions.sessions} filters={filters} setFilters={setFilters} showSearch={false} />

      <section className="apanel">
        <div className="apanel-head">
          <div>
            <h2>Dues by student</h2>
            <p>One row per student with what they owe, have paid and still owe.</p>
          </div>
          {preview && <span className="apill apill--muted">{preview.total} students</span>}
        </div>
        <div className="apanel-body afin-export">
          {preview && !preview.partialSample && (
            <p className="aform-note">
              {formatNaira(preview.due)} due · {formatNaira(preview.paid)} verified · {formatNaira(preview.due - preview.paid)} outstanding
            </p>
          )}
          <div className="afin-export-actions">
            <button type="button" className="abtn" disabled={!!busy} onClick={() => exportLedger("csv")}>
              <FileText size={15} /> {busy === "csv" ? "Preparing..." : "CSV (Google Sheets)"}
            </button>
            <button type="button" className="abtn" disabled={!!busy} onClick={() => exportLedger("xlsx")}>
              <FileSpreadsheet size={15} /> {busy === "xlsx" ? "Preparing..." : "Excel"}
            </button>
          </div>
        </div>
      </section>

      <section className="apanel">
        <div className="apanel-head">
          <div>
            <h2>Payments log</h2>
            <p>Every payment recorded in this session, with its status and receipt number.</p>
          </div>
        </div>
        <div className="apanel-body afin-export">
          <p className="aform-note">Follows the session and level filters above.</p>
          <div className="afin-export-actions">
            <button type="button" className="abtn" disabled={!!busy} onClick={() => exportPayments("csv")}>
              <FileText size={15} /> {busy === "p-csv" ? "Preparing..." : "CSV (Google Sheets)"}
            </button>
            <button type="button" className="abtn" disabled={!!busy} onClick={() => exportPayments("xlsx")}>
              <FileSpreadsheet size={15} /> {busy === "p-xlsx" ? "Preparing..." : "Excel"}
            </button>
          </div>
        </div>
      </section>

      <section className="apanel">
        <div className="apanel-head">
          <div>
            <h2>Expenses log</h2>
            <p>Every expense in this session: who recorded, verified and approved it, and whether it counts.</p>
          </div>
        </div>
        <div className="apanel-body afin-export">
          <p className="aform-note">Follows the session filter above.</p>
          <div className="afin-export-actions">
            <button type="button" className="abtn" disabled={!!busy} onClick={() => runExpenses("csv")}>
              <FileText size={15} /> {busy === "e-csv" ? "Preparing..." : "CSV (Google Sheets)"}
            </button>
            <button type="button" className="abtn" disabled={!!busy} onClick={() => runExpenses("xlsx")}>
              <FileSpreadsheet size={15} /> {busy === "e-xlsx" ? "Preparing..." : "Excel"}
            </button>
          </div>
        </div>
      </section>

      {error && <div className="anote is-bad" style={{ marginTop: 14 }}>{error}</div>}
    </>
  );
}

export default FinanceReports;
