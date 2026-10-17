import { ReceiptText, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { formatNaira } from "../../../utils/money";
import { cleanSearch, formatDate, useFinanceVersion } from "../../../utils/finance";
import ReceiptDownloads from "./ReceiptDownloads";

const PAGE = 50;

function ReceiptsList() {
  const version = useFinanceVersion();
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState({ rows: [], count: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(async () => {
      let query = supabase
        .from("receipts")
        .select("id, receipt_number, student_name, matric_no, level, session_label, fee_name, amount_kobo, outstanding_kobo, issued_at", { count: "exact" })
        .order("issued_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);

      const t = cleanSearch(term);
      if (t) {
        query = query.or(`receipt_number.ilike.%${t}%,student_name.ilike.%${t}%,matric_no.ilike.%${t}%`);
      }

      const { data, count } = await query;
      if (!cancelled) {
        setResult({ rows: data || [], count: count || 0 });
        setLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, page, version]);

  const pages = Math.max(1, Math.ceil(result.count / PAGE));

  return (
    <>
      <div className="atoolbar">
        <label className="asearch">
          <Search size={14} />
          <input
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setPage(0);
            }}
            placeholder="Receipt number, student name or matric"
            aria-label="Search receipts"
          />
        </label>
        <span className="aform-note">{result.count} receipt{result.count === 1 ? "" : "s"}</span>
      </div>

      <div className="atable-wrap">
        {result.rows.length === 0 && !loading ? (
          <div className="aempty-row">
            <ReceiptText size={26} />
            <strong>{term ? "No receipt matches" : "No receipts yet"}</strong>
            <span>Receipts are issued when the Financial Secretary verifies a payment.</span>
          </div>
        ) : (
          <div className="atable-scroll">
            <table className="atable">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Student</th>
                  <th>For</th>
                  <th className="num">Amount</th>
                  <th className="num">Balance after</th>
                  <th className="num">Download</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="acell-title afin-cell-tight">
                        <strong className="afin-mono">{r.receipt_number}</strong>
                        <span>{formatDate(r.issued_at)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="acell-title afin-cell-tight">
                        <strong>{r.student_name}</strong>
                        <span>{r.matric_no}{r.level ? ` · ${r.level}L` : ""}</span>
                      </div>
                    </td>
                    <td className="quiet">{r.fee_name} · {r.session_label}</td>
                    <td className="num"><strong>{formatNaira(r.amount_kobo)}</strong></td>
                    <td className="num">{formatNaira(r.outstanding_kobo)}</td>
                    <td className="num">
                      <ReceiptDownloads receiptId={r.id} compact />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {result.count > PAGE && (
        <div className="afin-pager">
          <button type="button" className="abtn" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page + 1} of {pages}</span>
          <button type="button" className="abtn" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </>
  );
}

export default ReceiptsList;
