import {
  Bold,
  Calendar,
  Download,
  FileText,
  Globe,
  Hash,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  Save,
  Underline,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

/**
 * Correspondence composer -- UI layout only.
 *
 * Nothing here persists yet and nothing exports yet: the officials are
 * placeholders rather than rows from `executives`, the shared contact values
 * are local state rather than an organisation setting, and the body uses a
 * contenteditable with execCommand so the toolbar can be seen working without
 * committing to an editor library before the layout is agreed.
 *
 * The preview is a CSS facsimile of the exported template -- same proportions,
 * type scale and furniture -- so typing shows the document forming. The
 * exported PDF remains the source of truth; see the note in the panel.
 */

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

/** Exactly these four. Constrained on purpose -- never free text. */
const OFFICES = [
  { id: "president", label: "President", holder: "Oluwaseun A. Adeyemi" },
  { id: "vice_president", label: "Vice President", holder: "Chidinma U. Nwosu" },
  { id: "general_secretary", label: "General Secretary", holder: "Adaeze N. Okonkwo" },
  { id: "pro", label: "P.R.O", holder: "Tobi A. Balogun" },
];

/** Stand-ins for rows from `executives`, so the footer can be seen laid out. */
const OFFICIALS = [
  ["Adaeze N. Okonkwo", "General Secretary", "0803 555 0142"],
  ["Oluwaseun A. Adeyemi", "President", "0806 555 0198"],
  ["Chidinma U. Nwosu", "Vice President", "0812 555 0177"],
  ["Tobi A. Balogun", "P.R.O", "0809 555 0165"],
];

const STRIPES = ["#22a447", "#0752b8", "#dea414", "#082b63"];

const STARTER_BODY = `<p>We are pleased to inform all NAPSITES that registration for the <strong>2026 NAPS Health Week</strong> volunteer corps is now open to students across all levels.</p><p>Volunteers will assist with free blood pressure and blood sugar screening, the blood donation drive, and crowd coordination at the College Auditorium.</p><p>The deadline for submission is <strong>20th September, 2026, 11:59 PM.</strong></p>`;

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

function AdminCorrespondence() {
  const editorRef = useRef(null);

  const [template, setTemplate] = useState("memo");
  const [office, setOffice] = useState("general_secretary");
  const [reference, setReference] = useState("NAPS/LASUCOM/GS/2026/041");
  const [autoRef, setAutoRef] = useState(true);
  const [date, setDate] = useState(today());
  const [subject, setSubject] = useState(
    "2026 NAPS Health Week — Call for Volunteers!"
  );
  const [bodyHtml, setBodyHtml] = useState(STARTER_BODY);

  // Shared, organisation-wide. Local state for now; these become a single
  // stored row so the last saved value shows for every admin.
  const [email, setEmail] = useState("napslasucom@gmail.com");
  const [instagram, setInstagram] = useState("napslasucom");

  const officeLabel = useMemo(
    () => OFFICES.find((o) => o.id === office)?.label ?? "",
    [office]
  );

  function format(command) {
    document.execCommand(command, false, null);
    editorRef.current?.focus();
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
          <button type="button" className="abtn" disabled>
            <Save size={14} />
            Save draft
          </button>
          <button type="button" className="abtn" disabled>
            <ImageIcon size={14} />
            PNG
          </button>
          <button type="button" className="abtn abtn--primary" disabled>
            <Download size={14} />
            Export PDF
          </button>
        </div>
      </header>

      <div className="anote is-bad" style={{ margin: "16px 0 0" }}>
        Layout preview only — nothing saves or exports yet, and the officials
        below are placeholders rather than live Executives data.
      </div>

      <div className="acompose">
        <aside className="acompose-panel">
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
            </div>

            <div className="aoffices">
              {OFFICES.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={office === item.id ? "aoffice is-on" : "aoffice"}
                  onClick={() => setOffice(item.id)}
                >
                  <span className="aoffice-dot" />
                  <span>
                    {item.label}
                    <small>{item.holder}</small>
                  </span>
                </button>
              ))}
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
                  onClick={() => setAutoRef((v) => !v)}
                >
                  {autoRef ? "Auto" : "Manual"}
                </button>
              </label>
              <div className="afield-icon">
                <Hash size={14} />
                <input
                  id="c-ref"
                  value={reference}
                  disabled={autoRef}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>
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
                  <button type="button" onClick={() => format("bold")} title="Bold">
                    <Bold size={13} />
                  </button>
                  <button type="button" onClick={() => format("italic")} title="Italic">
                    <Italic size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => format("underline")}
                    title="Underline"
                  >
                    <Underline size={13} />
                  </button>

                  <span className="sep" />

                  <button
                    type="button"
                    onClick={() => format("formatBlock", "h3")}
                    title="Heading"
                  >
                    H
                  </button>
                  <button
                    type="button"
                    onClick={() => format("insertUnorderedList")}
                    title="Bulleted list"
                  >
                    <List size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => format("insertOrderedList")}
                    title="Numbered list"
                  >
                    <ListOrdered size={13} />
                  </button>
                </div>

                <div
                  ref={editorRef}
                  className="aeditor-area"
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => setBodyHtml(e.currentTarget.innerHTML)}
                  dangerouslySetInnerHTML={{ __html: STARTER_BODY }}
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
              One value for the whole secretariat. Changing it here changes it on
              every future document, for every admin.
            </p>

            <div className="afield">
              <label htmlFor="c-email">E-mail</label>
              <input
                id="c-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="afield">
              <label htmlFor="c-ig">Instagram</label>
              <input
                id="c-ig"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
              />
            </div>
          </div>
        </aside>

        <div className="apreview-stage">
          <div className="apreview-toolbar">
            <span>
              Live preview · {TEMPLATES.find((t) => t.id === template)?.name} · A4
            </span>
            <span>
              <FileText size={12} style={{ verticalAlign: "-2px" }} /> Page 1 of 1
            </span>
          </div>

          <div className="apaper">
            <div className="apaper-stripes">
              {STRIPES.map((c, i) => (
                <i key={c} style={{ background: c, height: `${7 - i}cqw` }} />
              ))}
            </div>

            <img className="apaper-mark" src="/images/naps-logo-transparent.png" alt="" />

            <div className="apaper-inner">
              <div className="apaper-head">
                <img src="/images/naps-logo.png" alt="" />
                <div>
                  <div className="apaper-org">NAPS-LASUCOM</div>
                  <div className="apaper-sub">
                    Nigeria Association of Physiotherapy Students
                    <br />
                    Lagos State University College of Medicine
                  </div>
                  <div className="apaper-office">Office of the {officeLabel}</div>
                </div>
              </div>

              <div className="apaper-rule" />

              <div className="apaper-date">Date: {longDate(date)}</div>

              <div className="apaper-title">{subject || "Subject line"}</div>

              <div
                className="apaper-body"
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />

              <div className="apaper-foot">
                {OFFICIALS.map(([name, role, phone]) => (
                  <div className="apaper-official" key={name}>
                    <b>{name}</b>
                    <span>36th NAPS-LASUCOM</span>
                    <em>{role}</em>
                    <i>{phone}</i>
                  </div>
                ))}

                <div className="apaper-official">
                  <b className="lbl">E-mail:</b>
                  <i>{email}</i>
                  <b className="lbl" style={{ marginTop: "0.8cqw" }}>
                    Instagram:
                  </b>
                  <i>{instagram}</i>
                </div>
              </div>
            </div>

            <div className="apaper-band">
              Strength in Knowledge, Service to Humanity
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default AdminCorrespondence;
