import {
  AlertCircle,
  AlertTriangle,
  Bold,
  Calendar,
  CheckCircle2,
  Download,
  FilePlus2,
  FileText,
  Globe,
  Hash,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Minus,
  PenLine,
  Save,
  Underline,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  OFFICES,
  pickOfficials,
  renderCorrespondence,
} from "../../utils/correspondencePdf";
import {
  download,
  rasterisePdf,
  safeFileName,
  stitchPages,
} from "../../utils/pdfPreview";

const TEMPLATES = [
  {
    id: "memo",
    name: "Memorandum",
    note: "Public notice. No signatures; officials listed at the foot.",
  },
  {
    id: "letter",
    name: "Official Letter",
    note: "Addressed correspondence with signature blocks.",
  },
];

const STARTER_BODY = `<p>We are pleased to inform all NAPSITES that registration for the <strong>2026 NAPS Health Week</strong> volunteer corps is now open to students across all levels.</p><p>Volunteers will assist with free blood pressure and blood sugar screening, the blood donation drive, and crowd coordination at the College Auditorium.</p>`;

/** Debounce for the preview. A render costs a few hundred milliseconds on the
 *  main thread, so it waits until typing has actually stopped. */
const PREVIEW_DELAY = 450;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function longDate(value) {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00`);
  const day = d.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  return `${day}${suffix} ${d.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  })}`;
}

async function loadImage(path) {
  const response = await fetch(path);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function AdminCorrespondence() {
  const editorRef = useRef(null);
  const timerRef = useRef(null);
  const runRef = useRef(0);

  const [template, setTemplate] = useState("memo");
  const [office, setOffice] = useState("general_secretary");
  const [reference, setReference] = useState("");
  const [autoRef, setAutoRef] = useState(true);
  const [date, setDate] = useState(today());
  const [subject, setSubject] = useState("2026 NAPS Health Week — Call for Volunteers!");
  const [bodyHtml, setBodyHtml] = useState(STARTER_BODY);

  // Letters only. Kept in state regardless of the active template so that
  // switching to a memo and back does not lose what was typed.
  const [recipient, setRecipient] = useState(
    "The Provost,\nLagos State University College of Medicine,\nIkeja, Lagos."
  );
  const [salutation, setSalutation] = useState("Dear Sir,");
  const [closing, setClosing] = useState("Yours faithfully,");

  // Rendered script mark, or a clear line for the issuing officer to sign by
  // hand. One setting; the letter carries one signature either way.
  const [signed, setSigned] = useState(true);

  const [officials, setOfficials] = useState([]);
  const [decSet, setDecSet] = useState(null);
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");

  // The draft currently open, if any. Null means this is a new document and
  // saving will create a row rather than overwrite one.
  const [draftId, setDraftId] = useState(null);
  const [drafts, setDrafts] = useState([]);

  /*
    Drawn signatures, keyed by storage path.

    The bucket is private, so each one has to be downloaded with the
    session and held as a data URL -- jsPDF embeds bytes, not URLs. Cached
    because the preview re-renders on every keystroke and re-fetching a
    signature per render would be absurd.
  */
  const [signatures, setSignatures] = useState({});

  /** The number the next export would take. Provisional until it allocates. */
  const [nextSeq, setNextSeq] = useState(1);

  const [art, setArt] = useState({ logo: null, watermark: null });
  const [pages, setPages] = useState([]);
  const [rendering, setRendering] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);

  const officeLabel = useMemo(
    () => OFFICES.find((o) => o.id === office)?.label ?? "",
    [office]
  );

  /* ---------------- load once ---------------- */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [setsResult, execResult, settingsResult, logo, watermark] = await Promise.all([
        supabase
          .from("executive_sets")
          .select("id, set_name, set_number, academic_session, is_current")
          .order("set_number", { ascending: false }),
        supabase
          .from("executives")
          .select("full_name, name, office, phone, signature_path, set_id, is_active, display_order")
          .eq("is_active", true)
          .order("display_order", { ascending: true }),
        supabase.from("org_settings").select("email, instagram").maybeSingle(),
        loadImage("/images/naps-logo.png").catch(() => null),
        loadImage("/images/naps-logo-transparent.png").catch(() => null),
      ]);

      if (cancelled) return;

      if (execResult.error) {
        setNotice({ kind: "bad", text: `Executives: ${execResult.error.message}` });
      }

      // Whichever set is flagged current, falling back to the highest number
      // so a database that has never had one marked still names a tenure.
      const sets = setsResult.data || [];
      const current = sets.find((row) => row.is_current) || sets[0] || null;
      setDecSet(current);

      // Older executive rows predate set_id and carry null. Filtering them out
      // would empty the footer, so only narrow to the set when it actually
      // matches somebody.
      const active = execResult.data || [];
      const scoped = current ? active.filter((e) => e.set_id === current.id) : [];

      setOfficials(pickOfficials(scoped.length ? scoped : active));
      setEmail(settingsResult.data?.email || "napslasucom@gmail.com");
      setInstagram(settingsResult.data?.instagram || "@napslasucom");
      setArt({ logo, watermark });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
    Seed the editor once, by hand.

    It cannot be done with dangerouslySetInnerHTML: the prop is a fresh object
    on every render, so React rewrote the node's innerHTML after every input
    event and threw away whatever had just been typed. Writing it once here and
    never letting React near the children is what makes the field editable.
  */
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = STARTER_BODY;
  }, []);

  /* ---------------- reference ---------------- */

  const referenceFor = useCallback(
    (seq) => {
      const code =
        { president: "PRES", vice_president: "VP", general_secretary: "GS", pro: "PRO" }[
          office
        ] || "GS";
      const year = (date || today()).slice(0, 4);
      return `NAPS/LASUCOM/${code}/${year}/${String(seq).padStart(3, "0")}`;
    },
    [office, date]
  );

  const autoReference = useMemo(
    () => referenceFor(nextSeq),
    [referenceFor, nextSeq]
  );

  const effectiveRef = autoRef ? autoReference : reference;

  // What the counter stands at for this office and year. Read only to show the
  // number ahead of time; the export allocates the real one.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("correspondence_counters")
        .select("last")
        .eq("office", office)
        .eq("year", Number((date || today()).slice(0, 4)))
        .maybeSingle();

      if (!cancelled) setNextSeq((data?.last ?? 0) + 1);
    })();

    return () => {
      cancelled = true;
    };
  }, [office, date]);

  // Only the issuing office signs, so only that signature is fetched.
  const signaturePath = useMemo(
    () => officials.find((o) => o.office === officeLabel)?.signaturePath || "",
    [officials, officeLabel]
  );

  useEffect(() => {
    if (!signaturePath || signatures[signaturePath]) return undefined;

    let cancelled = false;

    (async () => {
      const { data } = await supabase.storage
        .from("signatures")
        .download(signaturePath);

      if (!data || cancelled) return;

      const reader = new FileReader();
      reader.onload = () => {
        if (!cancelled) {
          setSignatures((prev) => ({ ...prev, [signaturePath]: reader.result }));
        }
      };
      reader.readAsDataURL(data);
    })();

    return () => {
      cancelled = true;
    };
  }, [signaturePath, signatures]);

  const signedOfficials = useMemo(
    () =>
      officials.map((o) => ({
        ...o,
        signature: signatures[o.signaturePath] || null,
      })),
    [officials, signatures]
  );

  const loadDrafts = useCallback(async () => {
    const { data } = await supabase
      .from("correspondence_drafts")
      .select("id, template, office, subject, reference, status, document_date, updated_at, body_html, recipient, salutation, closing")
      .order("updated_at", { ascending: false })
      .limit(25);

    setDrafts(data || []);
  }, []);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  /*
    A letter is signed by the office issuing it. If that office has nobody
    against it in the executives table, signatories() returns none and the
    letter prints unsigned without saying so.
  */
  const missingSigners = useMemo(
    () =>
      template === "letter" &&
      !officials.find((o) => o.office === officeLabel)?.name
        ? [officeLabel]
        : [],
    [template, officials, officeLabel]
  );

  /* ---------------- preview ---------------- */

  const build = useCallback(
    (referenceOverride) =>
      renderCorrespondence({
        template,
        office: officeLabel,
        subject,
        date: longDate(date),
        // The preview shows the provisional number; an export passes the one
        // the database actually handed out.
        reference: referenceOverride || effectiveRef,
        bodyHtml,
        officials: signedOfficials,
        email,
        instagram,
        setName: decSet?.set_name,
        recipient,
        salutation,
        closing,
        signed,
        logo: art.logo,
        watermark: art.watermark,
      }),
    [
      template,
      officeLabel,
      subject,
      date,
      effectiveRef,
      bodyHtml,
      signedOfficials,
      email,
      instagram,
      decSet,
      recipient,
      salutation,
      closing,
      signed,
      art,
    ]
  );

  useEffect(() => {
    if (!officials.length) return undefined;

    clearTimeout(timerRef.current);
    setRendering(true);

    timerRef.current = setTimeout(async () => {
      // Renders overlap when typing quickly; only the newest may commit.
      const run = ++runRef.current;

      try {
        const doc = await build();
        const { pages: rendered } = await rasterisePdf(doc);
        if (run === runRef.current) setPages(rendered);
      } catch (error) {
        if (run === runRef.current) {
          setNotice({ kind: "bad", text: `Preview failed: ${error.message}` });
        }
      } finally {
        if (run === runRef.current) setRendering(false);
      }
    }, PREVIEW_DELAY);

    return () => clearTimeout(timerRef.current);
  }, [build, officials.length]);

  /* ---------------- actions ---------------- */

  /**
   * Allocate the definitive reference and record the document as issued.
   *
   * The number comes from the database, not from counting rows here: two
   * admins exporting at the same moment would otherwise read the same count
   * and both take it. Drafts never allocate -- a draft is not an issued
   * document, and numbering them would leave a gap for every one abandoned.
   */
  async function issue() {
    if (!autoRef) return effectiveRef;

    const { data: seq, error } = await supabase.rpc("next_correspondence_ref", {
      p_office: office,
      p_year: Number(date.slice(0, 4)),
    });

    if (error) throw new Error(error.message);

    const allocated = referenceFor(seq);
    const { data: auth } = await supabase.auth.getUser();

    await supabase.from("correspondence_drafts").upsert({
      ...(draftId ? { id: draftId } : {}),
      template,
      office,
      reference: allocated,
      reference_seq: seq,
      subject,
      body_html: bodyHtml,
      document_date: date,
      recipient: template === "letter" ? recipient : null,
      salutation: template === "letter" ? salutation : null,
      closing: template === "letter" ? closing : null,
      status: "issued",
      issued_at: new Date().toISOString(),
      created_by: auth?.user?.id ?? null,
    });

    setNextSeq(seq + 1);
    loadDrafts();

    return allocated;
  }

  async function handleExportPdf() {
    setBusy("pdf");
    try {
      const reference = await issue();
      const doc = await build(reference);
      doc.save(`${safeFileName(subject)}.pdf`);
      setNotice({ kind: "ok", text: `Issued as ${reference}.` });
    } catch (error) {
      setNotice({ kind: "bad", text: `Export failed: ${error.message}` });
    } finally {
      setBusy("");
    }
  }

  async function handleExportPng() {
    setBusy("png");
    try {
      const reference = await issue();
      const doc = await build(reference);
      const { pages: rendered } = await rasterisePdf(doc, 3);

      download(await stitchPages(rendered), `${safeFileName(subject)}.png`);
      setNotice({ kind: "ok", text: `Issued as ${reference}.` });
    } catch (error) {
      setNotice({ kind: "bad", text: `Image export failed: ${error.message}` });
    } finally {
      setBusy("");
    }
  }

  async function handleSaveDraft() {
    setBusy("draft");
    setNotice(null);

    const { data: auth } = await supabase.auth.getUser();

    const row = {
      template,
      office,
      reference: effectiveRef,
      subject,
      body_html: bodyHtml,
      document_date: date,
      // Null on a memo, which is how a reader tells the two apart.
      recipient: template === "letter" ? recipient : null,
      salutation: template === "letter" ? salutation : null,
      closing: template === "letter" ? closing : null,
      created_by: auth?.user?.id ?? null,
      updated_at: new Date().toISOString(),
    };

    // Saving a draft that was opened from the list updates it. Without this
    // every save of the same document would leave another copy behind.
    const { data, error } = draftId
      ? await supabase
          .from("correspondence_drafts")
          .update(row)
          .eq("id", draftId)
          .select("id")
          .maybeSingle()
      : await supabase
          .from("correspondence_drafts")
          .insert(row)
          .select("id")
          .maybeSingle();

    if (data?.id) setDraftId(data.id);
    if (!error) loadDrafts();

    setBusy("");
    setNotice(
      error
        ? { kind: "bad", text: `Could not save: ${error.message}` }
        : { kind: "ok", text: "Draft saved. You can leave and come back to it." }
    );
  }

  function loadDraft(row) {
    setDraftId(row.id);
    setTemplate(row.template || "memo");
    setOffice(row.office || "general_secretary");
    setSubject(row.subject || "");
    setDate(row.document_date || today());
    setRecipient(row.recipient || "");
    setSalutation(row.salutation || "Dear Sir,");
    setClosing(row.closing || "Yours faithfully,");

    // A reference already allocated is kept verbatim rather than renumbered.
    setAutoRef(row.status !== "issued");
    setReference(row.reference || "");

    setBodyHtml(row.body_html || "");
    if (editorRef.current) editorRef.current.innerHTML = row.body_html || "";

    setNotice({ kind: "ok", text: `Opened “${row.subject || "Untitled"}”.` });
  }

  function newDocument() {
    setDraftId(null);
    setAutoRef(true);
    setSubject("");
    setBodyHtml("");
    if (editorRef.current) editorRef.current.innerHTML = "";
    setNotice(null);
  }

  /** Shared across the secretariat, so this writes the single settings row. */
  async function handleSaveContact() {
    setBusy("contact");
    setNotice(null);

    const { data: auth } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("org_settings")
      .update({
        email,
        instagram,
        updated_by: auth?.user?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);

    setBusy("");
    setNotice(
      error
        ? { kind: "bad", text: `Could not save contact: ${error.message}` }
        : { kind: "ok", text: "Contact details updated for everyone." }
    );
  }

  /**
   * Toolbar buttons take focus on mousedown, which collapses the selection in
   * the editor before execCommand ever runs -- so Bold would apply to nothing.
   */
  function keepSelection(event) {
    event.preventDefault();
  }

  function format(command, value) {
    document.execCommand(command, false, value ?? null);
    editorRef.current?.focus();
    setBodyHtml(editorRef.current?.innerHTML ?? "");
  }

  /**
   * Paste as plain text.
   *
   * Anything copied out of Word or a browser arrives carrying its own fonts,
   * colours and sizes. None of it survives into the PDF -- the renderer reads
   * bold, italic, headings and lists and ignores the rest -- so letting it
   * into the editor only makes what is on screen disagree with what prints.
   */
  function handlePaste(event) {
    event.preventDefault();

    const text = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);

    setBodyHtml(editorRef.current?.innerHTML ?? "");
  }

  return (
    <main className="admin-page">
      <header className="apage-head">
        <div>
          <p className="apage-eyebrow">Correspondence</p>
          <h1>Compose</h1>
          <p>Letters and memoranda on NAPS-LASUCOM letterhead.</p>
        </div>

        <div className="apage-actions">
          <button
            type="button"
            className="abtn"
            onClick={handleSaveDraft}
            disabled={busy !== ""}
          >
            {busy === "draft" ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            Save draft
          </button>

          <button
            type="button"
            className="abtn"
            onClick={handleExportPng}
            disabled={busy !== ""}
          >
            {busy === "png" ? <Loader2 size={14} className="spin" /> : <ImageIcon size={14} />}
            PNG
          </button>

          <button
            type="button"
            className="abtn abtn--primary"
            onClick={handleExportPdf}
            disabled={busy !== ""}
          >
            {busy === "pdf" ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
            Export PDF
          </button>
        </div>
      </header>

      {notice && (
        <div
          className={notice.kind === "ok" ? "anote is-ok" : "anote is-bad"}
          style={{ margin: "16px 0 0" }}
        >
          {notice.kind === "ok" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {notice.text}
        </div>
      )}

      {missingSigners.length > 0 && (
        <div className="anote is-warn" style={{ margin: "16px 0 0" }}>
          <AlertTriangle size={15} />
          No {missingSigners.join(", ")} on the current DEC set — this letter
          will print unsigned. Add them on Executives first.
        </div>
      )}

      <div className="acompose">
        <aside className="acompose-panel">
          <div className="acompose-section">
            <div className="acompose-legend">
              <h3>Documents</h3>
              <button type="button" className="achip" onClick={newDocument}>
                <FilePlus2 size={11} />
                New
              </button>
            </div>

            {drafts.length === 0 ? (
              <p className="ashared-note">
                Nothing saved yet. Save a draft and it will be listed here.
              </p>
            ) : (
              <div className="adrafts">
                {drafts.map((row) => (
                  <button
                    type="button"
                    key={row.id}
                    className={row.id === draftId ? "adraft is-on" : "adraft"}
                    onClick={() => loadDraft(row)}
                  >
                    <FileText size={13} />
                    <span>
                      <strong>{row.subject || "Untitled"}</strong>
                      <small>
                        {row.reference || "No reference"}
                        {row.status === "issued" ? " · Issued" : " · Draft"}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="acompose-section">
            <div className="acompose-legend">
              <h3>Template</h3>
            </div>

            <div className="atemplates">
              {TEMPLATES.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={template === item.id ? "atemplate is-on" : "atemplate"}
                  onClick={() => setTemplate(item.id)}
                >
                  <strong>{item.name}</strong>
                  <small>{item.note}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="acompose-section">
            <div className="acompose-legend">
              <h3>Issuing office</h3>
              {decSet && (
                <span className="atenure">
                  {decSet.set_name}
                  {decSet.academic_session ? " · " + decSet.academic_session : ""}
                </span>
              )}
            </div>

            <div className="aoffices">
              {OFFICES.map((item) => {
                const holder = officials.find((o) => o.office === item.label);
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={office === item.id ? "aoffice is-on" : "aoffice"}
                    onClick={() => setOffice(item.id)}
                  >
                    <span className="aoffice-dot" />
                    <span>
                      {item.label}
                      <small>{holder?.name || "Not assigned"}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="acompose-section">
            <div className="acompose-legend">
              <h3>Document</h3>
            </div>

            <div className="afield">
              <label htmlFor="c-ref">
                Reference
                <button
                  type="button"
                  className="achip"
                  style={{ marginLeft: 8, padding: "2px 8px", fontSize: 10 }}
                  onClick={() => {
                    if (autoRef) setReference(autoReference);
                    setAutoRef((v) => !v);
                  }}
                >
                  {autoRef ? "Auto" : "Manual"}
                </button>
              </label>
              <div className="afield-icon">
                <Hash size={14} />
                <input
                  id="c-ref"
                  value={effectiveRef}
                  disabled={autoRef}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>
              <small className="afield-hint">
                {autoRef
                  ? "Assigned when you export. Saving a draft does not take a number."
                  : "Manual — use this to continue an existing sequence or correct one."}
              </small>
            </div>

            <div className="afield">
              <label htmlFor="c-date">Date</label>
              <div className="afield-icon">
                <Calendar size={14} />
                <input
                  id="c-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>

            {template === "letter" && (
              <>
                <div className="afield">
                  <label htmlFor="c-recipient">Addressed to</label>
                  <textarea
                    id="c-recipient"
                    rows={3}
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                  />
                  <small className="afield-hint">One line each, as it should print.</small>
                </div>

                <div className="afield-pair">
                  <div className="afield">
                    <label htmlFor="c-salutation">Salutation</label>
                    <input
                      id="c-salutation"
                      value={salutation}
                      onChange={(e) => setSalutation(e.target.value)}
                    />
                  </div>

                  <div className="afield">
                    <label htmlFor="c-closing">Closing</label>
                    <input
                      id="c-closing"
                      value={closing}
                      onChange={(e) => setClosing(e.target.value)}
                    />
                  </div>
                </div>

                <div className="afield">
                  <label>Signatures</label>

                  <div className="asegment">
                    <button
                      type="button"
                      className={signed ? "is-on" : ""}
                      onClick={() => setSigned(true)}
                    >
                      <PenLine size={13} />
                      Rendered
                    </button>
                    <button
                      type="button"
                      className={signed ? "" : "is-on"}
                      onClick={() => setSigned(false)}
                    >
                      <Minus size={13} />
                      Blank
                    </button>
                  </div>

                  <small className="afield-hint">
                    {signed
                      ? signaturePath
                        ? `${officeLabel}'s saved signature is printed.`
                        : `No signature saved for the ${officeLabel} — their name is set in script instead. Add one on Executives.`
                      : "A clear line, to be signed by hand."}
                  </small>
                </div>
              </>
            )}

            <div className="afield">
              <label htmlFor="c-subject">Subject</label>
              <input
                id="c-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div className="afield">
              <label>Body</label>

              <div className="aeditor">
                <div className="aeditor-bar">
                  <button
                    type="button"
                    onMouseDown={keepSelection}
                    onClick={() => format("bold")} title="Bold">
                    <Bold size={13} />
                  </button>
                  <button
                    type="button"
                    onMouseDown={keepSelection}
                    onClick={() => format("italic")} title="Italic">
                    <Italic size={13} />
                  </button>
                  <button
                    type="button"
                    onMouseDown={keepSelection}
                    onClick={() => format("underline")} title="Underline">
                    <Underline size={13} />
                  </button>

                  <span className="sep" />

                  <button
                    type="button"
                    onMouseDown={keepSelection}
                    onClick={() => format("formatBlock", "<h3>")}
                    title="Heading"
                  >
                    H
                  </button>
                  <button
                    type="button"
                    onMouseDown={keepSelection}
                    onClick={() => format("insertUnorderedList")}
                    title="Bulleted list"
                  >
                    <List size={13} />
                  </button>
                  <button
                    type="button"
                    onMouseDown={keepSelection}
                    onClick={() => format("insertOrderedList")}
                    title="Numbered list"
                  >
                    <ListOrdered size={13} />
                  </button>
                </div>

                {/*
                  No children and no dangerouslySetInnerHTML: React must not
                  own what is inside this node. The initial content is written
                  once by ref below -- see the effect for why.
                */}
                <div
                  ref={editorRef}
                  className="aeditor-area"
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => setBodyHtml(e.currentTarget.innerHTML)}
                  onPaste={handlePaste}
                />
              </div>
            </div>
          </div>

          <div className="acompose-section">
            <div className="acompose-legend">
              <h3>Organisation contact</h3>
              <span className="ashared">
                <Globe size={10} />
                SHARED
              </span>
            </div>

            <p className="ashared-note">
              One value for the whole secretariat. Saving changes it on every
              future document, for every admin.
            </p>

            <div className="afield">
              <label htmlFor="c-email">E-mail</label>
              <input id="c-email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div className="afield">
              <label htmlFor="c-ig">Instagram</label>
              <input id="c-ig" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
            </div>

            <button
              type="button"
              className="abtn"
              onClick={handleSaveContact}
              disabled={busy !== ""}
              style={{ justifyContent: "center" }}
            >
              {busy === "contact" ? <Loader2 size={14} className="spin" /> : <Globe size={14} />}
              Save for everyone
            </button>
          </div>
        </aside>

        <div className="apreview-stage">
          <div className="apreview-toolbar">
            <span>
              Live preview · {TEMPLATES.find((t) => t.id === template)?.name} · A4
            </span>
            <span>
              {rendering ? "Rendering…" : `${pages.length} page${pages.length === 1 ? "" : "s"}`}
            </span>
          </div>

          {pages.length === 0 ? (
            <div className="apaper apaper--empty">
              <Loader2 size={22} className="spin" />
            </div>
          ) : (
            pages.map((src, i) => (
              <img
                key={i}
                className={rendering ? "apaper-page is-stale" : "apaper-page"}
                src={src}
                alt={`Page ${i + 1}`}
              />
            ))
          )}
        </div>
      </div>
    </main>
  );
}

export default AdminCorrespondence;
