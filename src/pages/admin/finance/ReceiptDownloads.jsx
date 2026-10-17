import { FileDown, Image as ImageIcon } from "lucide-react";
import { useState } from "react";
import { supabase } from "../../../lib/supabase";

/*
  Download buttons for one receipt. The receipt row is fetched fresh and the
  PDF code is loaded only on click: jsPDF and the fonts are large, and most
  visits to a finance page never print anything.
*/
function ReceiptDownloads({ receiptId, compact = false }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function run(kind) {
    setBusy(kind);
    setError("");
    try {
      const { data: receipt, error: e } = await supabase
        .from("receipts")
        .select("*")
        .eq("id", receiptId)
        .single();
      if (e) throw e;

      const receiptPdf = await import("../../../utils/receiptPdf");
      if (kind === "png") await receiptPdf.downloadReceiptImage(receipt);
      else await receiptPdf.downloadReceiptPdf(receipt, kind);
    } catch (err) {
      console.error(err);
      setError("Could not prepare the receipt.");
    }
    setBusy("");
  }

  const buttons = [
    ["rect", "Receipt PDF", <FileDown key="i" size={14} />],
    ["a4", "A4", <FileDown key="i" size={14} />],
    ["png", "Image", <ImageIcon key="i" size={14} />],
  ];

  return (
    <span className={compact ? "afin-dl is-compact" : "afin-dl"}>
      {buttons.map(([kind, label, icon]) => (
        <button
          key={kind}
          type="button"
          className="abtn"
          disabled={!!busy}
          onClick={(e) => {
            e.stopPropagation();
            run(kind);
          }}
          title={kind === "rect" ? "Receipt (PDF)" : kind === "a4" ? "A4 receipt (PDF)" : "Receipt image for WhatsApp (PNG)"}
        >
          {icon}
          <span>{busy === kind ? "..." : label}</span>
        </button>
      ))}
      {error && <span className="afin-dl-error">{error}</span>}
    </span>
  );
}

export default ReceiptDownloads;
