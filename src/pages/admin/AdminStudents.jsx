import { Pencil, Search, ShieldCheck, Upload, UserPlus, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  LEVELS,
  STUDENT_STATUS_LABELS,
  cleanSearch,
  financeErrorMessage,
  statusBadgeClass,
  useFinanceAccess,
} from "../../utils/finance";

const PAGE = 50;
const EDITABLE_STATUSES = ["active", "repeating", "deferred", "unconfirmed", "withdrawn", "graduated"];
const EMPTY = { full_name: "", matric_no: "", level: "100", status: "active" };

/*
  Reads the first sheet of an Excel or CSV class list. Columns are matched by
  header text, so "Full Name", "NAME" and "Student name" all work.
*/
async function parseClassList(file) {
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer());
  const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: "" });

  const pick = (row, patterns) => {
    const key = Object.keys(row).find((k) => patterns.some((p) => p.test(k)));
    return key ? String(row[key]).trim() : "";
  };

  return rows.map((row, i) => {
    const full_name = pick(row, [/name/i]);
    const matric_no = pick(row, [/matric/i, /reg/i]).toUpperCase().replace(/\s+/g, "");
    const levelText = pick(row, [/level/i, /^lvl/i, /year/i]).replace(/\D/g, "");
    const level = Number(levelText.length === 1 ? `${levelText}00` : levelText);

    let problem = "";
    if (full_name.length < 2) problem = "No name";
    else if (!/^[A-Z0-9/._-]{3,40}$/.test(matric_no)) problem = "Matric number missing or unusual";
    else if (!LEVELS.includes(level)) problem = "Level must be 100–600";

    return { line: i + 2, full_name, matric_no, level, problem };
  });
}

function AdminStudents() {
  const access = useFinanceAccess();
  const [filters, setFilters] = useState({ search: "", level: "", status: "" });
  const [page, setPage] = useState(0);
  const [result, setResult] = useState({ rows: [], count: 0 });
  const [reloadKey, setReloadKey] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [importRows, setImportRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const fileRef = useRef(null);

  const canEdit = access.canKeepRegister;

  useEffect(() => {
    if (access.loading) return;
    let cancelled = false;

    const timer = setTimeout(async () => {
      let query = supabase
        .from("students")
        .select("id, full_name, matric_no, level, status", { count: "exact" })
        .order("level", { ascending: true, nullsFirst: false })
        .order("full_name")
        .range(page * PAGE, page * PAGE + PAGE - 1);

      const t = cleanSearch(filters.search);
      if (t) query = query.or(`full_name.ilike.%${t}%,matric_no.ilike.%${t}%`);
      if (filters.level) query = query.eq("level", Number(filters.level));
      if (filters.status) query = query.eq("status", filters.status);

      const { data, count } = await query;
      if (!cancelled) setResult({ rows: data || [], count: count || 0 });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filters, page, reloadKey, access.loading]);

  function setFilter(k, v) {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(0);
  }

  async function addStudent(e) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    const { error } = await supabase.from("students").insert({
      full_name: form.full_name,
      matric_no: form.matric_no,
      level: Number(form.level),
      status: form.status,
    });
    setBusy(false);
    if (error) return setNote({ kind: "bad", text: financeErrorMessage(error) });
    setNote({ kind: "ok", text: `${form.full_name.trim()} added to the register.` });
    setForm(EMPTY);
    setReloadKey((k) => k + 1);
  }

  async function saveEdit() {
    setBusy(true);
    setNote(null);
    const graduated = editing.status === "graduated";
    const { error } = await supabase
      .from("students")
      .update({
        full_name: editing.full_name,
        matric_no: editing.matric_no,
        level: graduated ? null : Number(editing.level || 100),
        status: editing.status,
      })
      .eq("id", editing.id);
    setBusy(false);
    if (error) return setNote({ kind: "bad", text: financeErrorMessage(error) });
    setEditing(null);
    setNote({ kind: "ok", text: "Saved. The change is kept in the student's level history." });
    setReloadKey((k) => k + 1);
  }

  async function chooseFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setNote(null);
    try {
      const rows = await parseClassList(file);
      if (!rows.length) return setNote({ kind: "bad", text: "That file has no rows." });
      setImportRows(rows);
    } catch {
      setNote({ kind: "bad", text: "Could not read that file. Use .xlsx or .csv with Name, Matric and Level columns." });
    }
  }

  async function runImport() {
    const good = importRows.filter((r) => !r.problem);
    setBusy(true);
    setNote(null);

    let added = 0;
    for (let i = 0; i < good.length; i += 200) {
      const chunk = good.slice(i, i + 200).map(({ full_name, matric_no, level }) => ({ full_name, matric_no, level }));
      const { data, error } = await supabase
        .from("students")
        .upsert(chunk, { onConflict: "matric_no", ignoreDuplicates: true })
        .select("id");
      if (error) {
        setBusy(false);
        return setNote({ kind: "bad", text: `Stopped after ${added} added: ${financeErrorMessage(error)}` });
      }
      added += data?.length || 0;
    }

    setBusy(false);
    setImportRows(null);
    const skipped = good.length - added;
    setNote({
      kind: "ok",
      text: `${added} student${added === 1 ? "" : "s"} added.${skipped ? ` ${skipped} already registered (matric number exists), left unchanged.` : ""}`,
    });
    setReloadKey((k) => k + 1);
  }

  if (access.loading) {
    return (
      <main className="admin-page">
        <div className="askel" style={{ height: 64, marginBottom: 12 }} />
        <div className="askel" style={{ height: 220 }} />
      </main>
    );
  }

  if (!canEdit && !access.canRead) {
    return (
      <main className="admin-page">
        <section className="admin-empty-panel">
          <ShieldCheck size={34} />
          <h3>Register is restricted</h3>
          <p>The student register is kept by the President, General Secretary and Financial Secretary.</p>
        </section>
      </main>
    );
  }

  const pages = Math.max(1, Math.ceil(result.count / PAGE));
  const importGood = importRows?.filter((r) => !r.problem).length || 0;
  const importBad = importRows?.filter((r) => r.problem) || [];

  return (
    <main className="admin-page afin-page">
      <header className="apage-head">
        <div>
          <p className="apage-eyebrow">Register</p>
          <h1>Students</h1>
          <p>Everyone dues are charged to. Students are never deleted; set them withdrawn instead.</p>
        </div>
        {canEdit && (
          <div className="apage-actions">
            <button type="button" className="abtn" onClick={() => fileRef.current?.click()}>
              <Upload size={15} /> Import list
            </button>
            <button type="button" className="abtn abtn--primary" onClick={() => setShowAdd((v) => !v)}>
              <UserPlus size={15} /> Add student
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={chooseFile} />
          </div>
        )}
      </header>

      {showAdd && canEdit && (
        <section className="apanel">
          <div className="apanel-head">
            <h2>Add a student</h2>
          </div>
          <form className="apanel-body aform-grid" onSubmit={addStudent}>
            <div className="afield">
              <label htmlFor="s-name">Full name</label>
              <input id="s-name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            </div>
            <div className="afield">
              <label htmlFor="s-matric">Matric number</label>
              <input id="s-matric" value={form.matric_no} onChange={(e) => setForm({ ...form, matric_no: e.target.value })} required />
            </div>
            <div className="afield">
              <label htmlFor="s-level">Level</label>
              <select id="s-level" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
                {LEVELS.map((l) => <option key={l} value={l}>{l}L</option>)}
              </select>
            </div>
            <div className="afield">
              <label htmlFor="s-status">Status</label>
              <select id="s-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {["active", "repeating", "deferred", "unconfirmed"].map((s) => (
                  <option key={s} value={s}>{STUDENT_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div className="aform-foot">
              <span className="aform-note">Repeating, deferred and unconfirmed students are reviewed by the President at the next promotion.</span>
              <button type="submit" className="abtn abtn--primary" disabled={busy}>
                {busy ? "Adding..." : "Add student"}
              </button>
            </div>
          </form>
        </section>
      )}

      {importRows && (
        <section className="apanel">
          <div className="apanel-head">
            <div>
              <h2>Import preview</h2>
              <p>{importGood} ready to add{importBad.length ? ` · ${importBad.length} need fixing in the file first` : ""}. Existing matric numbers are skipped, never overwritten.</p>
            </div>
          </div>
          {importBad.length > 0 && (
            <div className="atable-scroll">
              <table className="atable">
                <thead>
                  <tr><th>Row</th><th>Name</th><th>Matric</th><th>Level</th><th>Problem</th></tr>
                </thead>
                <tbody>
                  {importBad.slice(0, 20).map((r) => (
                    <tr key={r.line}>
                      <td className="quiet">{r.line}</td>
                      <td>{r.full_name || "—"}</td>
                      <td>{r.matric_no || "—"}</td>
                      <td>{r.level || "—"}</td>
                      <td><span className="abadge abadge--off">{r.problem}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="apanel-body">
            <div className="aform-foot">
              <span className="aform-note">Columns needed: Name, Matric, Level (e.g. 300 or 300L).</span>
              <span className="acell-actions">
                <button type="button" className="abtn" onClick={() => setImportRows(null)}>Cancel</button>
                <button type="button" className="abtn abtn--primary" disabled={busy || !importGood} onClick={runImport}>
                  {busy ? "Importing..." : `Add ${importGood} students`}
                </button>
              </span>
            </div>
          </div>
        </section>
      )}

      {note && <div className={note.kind === "ok" ? "anote is-ok" : "anote is-bad"} style={{ marginTop: 14 }}>{note.text}</div>}

      <div className="atoolbar">
        <label className="asearch">
          <Search size={14} />
          <input value={filters.search} onChange={(e) => setFilter("search", e.target.value)} placeholder="Search name or matric" aria-label="Search students" />
        </label>
        <select className="aselect" value={filters.level} onChange={(e) => setFilter("level", e.target.value)} aria-label="Level">
          <option value="">All levels</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l}L</option>)}
        </select>
        <select className="aselect" value={filters.status} onChange={(e) => setFilter("status", e.target.value)} aria-label="Status">
          <option value="">Any status</option>
          {Object.entries(STUDENT_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className="aform-note">{result.count} student{result.count === 1 ? "" : "s"}</span>
      </div>

      <div className="atable-wrap">
        {result.rows.length === 0 ? (
          <div className="aempty-row">
            <Users size={26} />
            <strong>{filters.search || filters.level || filters.status ? "No students match" : "The register is empty"}</strong>
            <span>{canEdit ? "Add students one by one, or import a class list from Excel." : "The secretariat adds students here."}</span>
          </div>
        ) : (
          <div className="atable-scroll">
            <table className="atable">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Level</th>
                  <th>Status</th>
                  {canEdit && <th className="num"></th>}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((s) =>
                  editing?.id === s.id ? (
                    <tr key={s.id}>
                      <td>
                        <span className="afin-edit">
                          <input value={editing.full_name} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} aria-label="Full name" />
                          <input value={editing.matric_no} onChange={(e) => setEditing({ ...editing, matric_no: e.target.value })} aria-label="Matric number" />
                        </span>
                      </td>
                      <td>
                        <select className="aselect" value={editing.level || ""} disabled={editing.status === "graduated"} onChange={(e) => setEditing({ ...editing, level: e.target.value })} aria-label="Level">
                          {LEVELS.map((l) => <option key={l} value={l}>{l}L</option>)}
                        </select>
                      </td>
                      <td>
                        <select className="aselect" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} aria-label="Status">
                          {EDITABLE_STATUSES.map((v) => <option key={v} value={v}>{STUDENT_STATUS_LABELS[v]}</option>)}
                        </select>
                      </td>
                      <td className="num">
                        <span className="acell-actions">
                          <button type="button" className="abtn" onClick={() => setEditing(null)}>Cancel</button>
                          <button type="button" className="abtn abtn--primary" disabled={busy} onClick={saveEdit}>Save</button>
                        </span>
                      </td>
                    </tr>
                  ) : (
                    <tr key={s.id}>
                      <td>
                        <div className="acell-title">
                          <strong>{s.full_name}</strong>
                          <span className="afin-mono">{s.matric_no}</span>
                        </div>
                      </td>
                      <td className="quiet">{s.level ? `${s.level}L` : "—"}</td>
                      <td><span className={statusBadgeClass(s.status)}>{STUDENT_STATUS_LABELS[s.status]}</span></td>
                      {canEdit && (
                        <td className="num">
                          <button type="button" className="aicon-btn" title="Edit" aria-label={`Edit ${s.full_name}`} onClick={() => setEditing({ ...s, level: s.level || "" })}>
                            <Pencil size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                )}
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
    </main>
  );
}

export default AdminStudents;
