import { BadgeCheck, CircleX, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatNaira } from "../utils/money";

/*
  Public receipt check. Anyone can confirm a receipt is genuine; the answer
  carries no personal details beyond the payer's initials.
*/
function VerifyReceipt() {
  const [params, setParams] = useSearchParams();
  const [number, setNumber] = useState(params.get("n") || "");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function check(value) {
    const n = value.trim().toUpperCase();
    if (!n) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("verify_receipt", { p_receipt_number: n });
    setBusy(false);
    setResult(error ? { error: true } : { ...data, asked: n });
    setParams({ n }, { replace: true });
  }

  useEffect(() => {
    const n = params.get("n");
    if (n) check(n);
    // Run once for a link opened from a receipt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="verify-page">
      <header className="page-header">
        <h1>Verify a receipt</h1>
        <p>Check that a NAPS-LASUCOM receipt is genuine. Enter the receipt number printed on it.</p>
      </header>

      <form
        className="verify-form"
        onSubmit={(e) => {
          e.preventDefault();
          check(number);
        }}
      >
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="NAPS/FIN/2026/000001"
          aria-label="Receipt number"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <button type="submit" disabled={busy || !number.trim()}>
          <Search size={16} />
          {busy ? "Checking..." : "Check"}
        </button>
      </form>

      {result?.error && (
        <div className="verify-card is-bad" role="status">
          <CircleX size={22} />
          <div>
            <strong>Could not check right now</strong>
            <p>Check your connection and try again.</p>
          </div>
        </div>
      )}

      {result && !result.error && (
        result.valid ? (
          <div className="verify-card is-ok" role="status">
            <BadgeCheck size={24} />
            <div>
              <strong>Valid receipt</strong>
              <p className="verify-number">{result.receipt_number}</p>
              <dl>
                <div><dt>Amount</dt><dd>{formatNaira(result.amount_kobo)}</dd></div>
                <div><dt>Issued</dt><dd>{new Date(result.issued_on).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</dd></div>
                <div><dt>Session</dt><dd>{result.session}</dd></div>
                <div><dt>Paid by</dt><dd>{result.initials}</dd></div>
              </dl>
            </div>
          </div>
        ) : (
          <div className="verify-card is-bad" role="status">
            <CircleX size={22} />
            <div>
              <strong>Not found</strong>
              <p>
                No receipt numbered {result.asked}. Check every character, including the slashes. If it still fails, the
                receipt was not issued by NAPS-LASUCOM Digital.
              </p>
            </div>
          </div>
        )
      )}
    </main>
  );
}

export default VerifyReceipt;
