import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Download,
  ExternalLink,
  FileArchive,
  FileText,
  Filter,
  FolderOpen,
  Link2,
  LockKeyhole,
  NotebookPen,
  Pencil,
  Pin,
  Plus,
  Save,
  Search,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  getSchemaForCategory,
  buildEmptyContentFields,
  normalizeContentFields,
  flattenContentFields,
} from "../../data/recordFieldSchemas";
import {
  downloadRecordAsPDF,
  downloadRecordAsDocx,
  downloadRecordAsExcel,
  downloadRecordsAsExcel,
} from "../../utils/recordExport";

const recordCategories = [
  {
    key: "Meeting Minutes",
    title: "Meeting Minutes",
    description: "CEC meetings, congress minutes, agendas and official resolutions.",
    icon: NotebookPen,
  },
  {
    key: "Financial Records",
    title: "Financial Records",
    description: "Budgets, dues, vouchers, receipts, expenditure and financial reports.",
    icon: FileText,
  },
  {
    key: "Reports",
    title: "Reports",
    description: "Executive, committee, departmental and administrative reports.",
    icon: FileArchive,
  },
  {
    key: "Handover Notes",
    title: "Handover Notes",
    description: "Office handover, continuity notes, pending tasks and key documents.",
    icon: FolderOpen,
  },
  {
    key: "Event Records",
    title: "Event Records",
    description: "Association week, social activities, tours and event documentation.",
    icon: FileArchive,
  },
  {
    key: "Sports Records",
    title: "Sports Records",
    description: "Sporting events, equipment, representation and sports committee records.",
    icon: Trophy,
  },
  {
    key: "Constitution / Policies",
    title: "Constitution / Policies",
    description: "Constitution, certified materials, policies and standing documents.",
    icon: LockKeyhole,
  },
  {
    key: "Other Records",
    title: "Other Records",
    description: "General records that do not fit into the main categories.",
    icon: FolderOpen,
  },
];

const recordTypes = [
  { value: "written", label: "Written Record" },
  { value: "drive", label: "Google Drive Link" },
  { value: "mixed", label: "Written + Drive Link" },
];

const roleLabels = {
  president: "President",
  vice_president: "Vice President",
  general_secretary: "General Secretary",
  assistant_general_secretary: "Assistant General Secretary",
  financial_secretary: "Financial Secretary",
  treasurer: "Treasurer",
  pro: "PRO",
  social_director: "Social Director",
  sports_director: "Sports Director",
  welfare_director: "Welfare Director",
  viewer: "Viewer",
};

const writeRoles = [
  "president",
  "vice_president",
  "general_secretary",
  "assistant_general_secretary",
  "financial_secretary",
  "treasurer",
  "pro",
  "social_director",
  "sports_director",
];

const categoryAccess = {
  president: "all",

  vice_president: [
    "Reports",
    "Event Records",
    "Handover Notes",
    "Other Records",
  ],

  general_secretary: [
    "Meeting Minutes",
    "Financial Records",
    "Reports",
    "Handover Notes",
    "Constitution / Policies",
    "Event Records",
    "Sports Records",
    "Other Records",
  ],

  assistant_general_secretary: [
    "Meeting Minutes",
    "Reports",
    "Handover Notes",
    "Constitution / Policies",
    "Event Records",
    "Other Records",
  ],

  financial_secretary: [
    "Financial Records",
    "Reports",
    "Handover Notes",
    "Other Records",
  ],

  treasurer: [
    "Financial Records",
    "Reports",
    "Handover Notes",
    "Other Records",
  ],

  pro: [
    "Reports",
    "Event Records",
    "Constitution / Policies",
    "Other Records",
  ],

  social_director: [
    "Event Records",
    "Reports",
    "Handover Notes",
    "Other Records",
  ],

  sports_director: [
    "Sports Records",
    "Reports",
    "Handover Notes",
    "Other Records",
  ],
};

const initialForm = {
  title: "",
  category: "Meeting Minutes",
  record_type: "written",
  dec_set_id: "",
  record_date: "",
  summary: "",
  content_fields: buildEmptyContentFields("Meeting Minutes"),
  drive_link: "",
  prepared_by: "",
  reviewed_by: "",
  source_office: "",
  amount: "",
  is_pinned: false,
};

function AdminRecords() {
  const [profile, setProfile] = useState(null);
  const [records, setRecords] = useState([]);
  const [sets, setSets] = useState([]);

  const [selectedCategory, setSelectedCategory] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSet, setSelectedSet] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [viewRecord, setViewRecord] = useState(null);
  const [downloadMenuId, setDownloadMenuId] = useState(null);

  const [form, setForm] = useState(initialForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    initPage();
  }, []);

  async function initPage() {
    setLoading(true);
    setErrorMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setErrorMessage("Login is required to access records.");
      setLoading(false);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("admin_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profileData) {
      setErrorMessage("Admin profile could not be verified.");
      setLoading(false);
      return;
    }

    if (!profileData.is_active) {
      setErrorMessage("This admin account is not active.");
      setLoading(false);
      return;
    }

    setProfile(profileData);

    await Promise.all([fetchRecords(), fetchSets()]);
    setLoading(false);
  }

  async function fetchRecords() {
    const { data, error } = await supabase
      .from("internal_records")
      .select("*, executive_sets(set_name, academic_session)")
      .order("is_pinned", { ascending: false })
      .order("record_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setRecords(data || []);
  }

  async function fetchSets() {
    const { data, error } = await supabase
      .from("executive_sets")
      .select("*")
      .order("set_number", { ascending: false });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    const allSets = data || [];
    const currentSet = allSets.find((item) => item.is_current);

    setSets(allSets);

    setForm((prev) => ({
      ...prev,
      dec_set_id: prev.dec_set_id || currentSet?.id || allSets[0]?.id || "",
    }));
  }

  function updateField(name, value) {
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function canCreateRecord() {
    if (!profile) return false;
    return writeRoles.includes(profile.role);
  }

  function canWriteCategory(category) {
    if (!profile) return false;
    if (profile.role === "president") return true;

    const allowed = categoryAccess[profile.role];

    if (!allowed) return false;
    if (allowed === "all") return true;

    return allowed.includes(category);
  }

  function canEditRecord(record) {
    if (!record) return false;
    return canWriteCategory(record.category);
  }

  function canDeleteRecord() {
    return profile?.role === "president";
  }

  function canPinRecord() {
    return profile?.role === "president" || profile?.role === "general_secretary";
  }

  function openCreateForm(category = "") {
    const firstAllowedCategory =
      category ||
      recordCategories.find((item) => canWriteCategory(item.key))?.key ||
      "Meeting Minutes";

    const currentSet = sets.find((item) => item.is_current);

    setEditingRecord(null);
    setViewRecord(null);
    setShowForm(true);
    setSuccessMessage("");
    setErrorMessage("");

    setForm({
      ...initialForm,
      category: firstAllowedCategory,
      content_fields: buildEmptyContentFields(firstAllowedCategory),
      dec_set_id: currentSet?.id || sets[0]?.id || "",
      record_date: new Date().toISOString().slice(0, 10),
      prepared_by: profile?.full_name || "",
      source_office: profile?.office || roleLabels[profile?.role] || "",
    });
  }

  function openEditForm(record) {
    if (!canEditRecord(record)) {
      setErrorMessage("This office cannot edit this record category.");
      return;
    }

    setEditingRecord(record);
    setViewRecord(null);
    setShowForm(true);
    setSuccessMessage("");
    setErrorMessage("");

    setForm({
      title: record.title || "",
      category: record.category || "Meeting Minutes",
      record_type: record.record_type || "written",
      dec_set_id: record.dec_set_id || "",
      record_date: record.record_date || "",
      summary: record.summary || "",
      content_fields: normalizeContentFields(record),
      drive_link: record.drive_link || "",
      prepared_by: record.prepared_by || "",
      reviewed_by: record.reviewed_by || "",
      source_office: record.source_office || "",
      amount: record.amount || "",
      is_pinned: Boolean(record.is_pinned),
    });
  }

  function closeForm() {
    setShowForm(false);
    setEditingRecord(null);
    setForm(initialForm);
  }

  async function saveRecord(e) {
    e.preventDefault();

    if (!canWriteCategory(form.category)) {
      setErrorMessage("This office cannot save records in this category.");
      return;
    }

    if (!form.title.trim()) {
      setErrorMessage("Record title is required.");
      return;
    }

    const hasWrittenContent = Object.values(form.content_fields || {}).some(
      (v) => v && v.trim()
    );

    if (form.record_type !== "drive" && !hasWrittenContent) {
      setErrorMessage("Please fill in at least one written record field.");
      return;
    }

    if (form.record_type !== "written" && !form.drive_link.trim()) {
      setErrorMessage("Google Drive link is required for this record type.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const shouldKeepAmount =
      form.category === "Financial Records" || form.category === "Event Records";

    const payload = {
      title: form.title.trim(),
      category: form.category,
      record_type: form.record_type,
      dec_set_id: form.dec_set_id || null,
      record_date: form.record_date || null,
      summary: form.summary.trim() || null,
      content_fields: form.record_type === "drive" ? null : form.content_fields,
      content_body:
        form.record_type === "drive"
          ? null
          : flattenContentFields(form.category, form.content_fields),
      drive_link:
        form.record_type === "written" ? null : form.drive_link.trim(),
      prepared_by: form.prepared_by.trim() || null,
      reviewed_by: form.reviewed_by.trim() || null,
      source_office: form.source_office.trim() || profile?.office || null,
      amount: shouldKeepAmount ? form.amount.trim() || null : null,
      status: "saved",
      is_pinned: canPinRecord() ? Boolean(form.is_pinned) : false,
      updated_at: new Date().toISOString(),
    };

    let error;

    if (editingRecord?.id) {
      const result = await supabase
        .from("internal_records")
        .update(payload)
        .eq("id", editingRecord.id);

      error = result.error;
    } else {
      const result = await supabase.from("internal_records").insert({
        ...payload,
        created_by: user?.id || null,
      });

      error = result.error;
    }

    if (error) {
      setErrorMessage(error.message);
      setSaving(false);
      return;
    }

    setSuccessMessage(
      editingRecord ? "Record updated successfully." : "Record saved successfully."
    );

    closeForm();
    await fetchRecords();
    setSaving(false);
  }

  async function deleteRecord(record) {
    if (!canDeleteRecord()) {
      setErrorMessage("Only the President can delete records.");
      return;
    }

    const confirmDelete = window.confirm(
      `Delete "${record.title}" from internal records?`
    );

    if (!confirmDelete) return;

    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("internal_records")
      .delete()
      .eq("id", record.id);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccessMessage("Record deleted.");
    setViewRecord(null);
    await fetchRecords();
  }

  async function togglePin(record) {
    if (!canPinRecord()) {
      setErrorMessage("Only the President or General Secretary can pin records.");
      return;
    }

    const { error } = await supabase
      .from("internal_records")
      .update({
        is_pinned: !record.is_pinned,
        updated_at: new Date().toISOString(),
      })
      .eq("id", record.id);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await fetchRecords();
  }

  function getSetLabel(record) {
    if (record.executive_sets?.set_name) {
      return record.executive_sets.academic_session
        ? `${record.executive_sets.set_name} • ${record.executive_sets.academic_session}`
        : record.executive_sets.set_name;
    }

    const foundSet = sets.find((item) => item.id === record.dec_set_id);

    if (foundSet) {
      return foundSet.academic_session
        ? `${foundSet.set_name} • ${foundSet.academic_session}`
        : foundSet.set_name;
    }

    return "No DEC set";
  }

  function getCategoryCount(category) {
    return records.filter((record) => record.category === category).length;
  }



  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const matchesCategory = selectedCategory
        ? record.category === selectedCategory
        : true;

      const matchesSet = selectedSet ? record.dec_set_id === selectedSet : true;

      const query = searchTerm.trim().toLowerCase();

      const matchesSearch = query
        ? [
            record.title,
            record.category,
            record.summary,
            record.content_body,
            record.prepared_by,
            record.reviewed_by,
            record.source_office,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query)
        : true;

      return matchesCategory && matchesSet && matchesSearch;
    });
  }, [records, selectedCategory, selectedSet, searchTerm]);

  if (loading) {
    return (
      <main className="admin-dashboard-page">
        <div className="admin-loading-card">Loading records archive...</div>
      </main>
    );
  }

  if (errorMessage && !profile) {
    return (
      <main className="admin-page">
        <section className="admin-empty-panel">
          <AlertCircle size={34} />
          <h3>Unable to open records</h3>
          <p>{errorMessage}</p>
        </section>
      </main>
    );
  }

  if (viewRecord) {
    return (
      <RecordReader
        record={viewRecord}
        setLabel={getSetLabel(viewRecord)}
        profile={profile}
        canEditRecord={canEditRecord}
        canDeleteRecord={canDeleteRecord}
        onBack={() => setViewRecord(null)}
        onEdit={() => openEditForm(viewRecord)}
        onDelete={() => deleteRecord(viewRecord)}
      />
    );
  }

  return (
    <main className="admin-page">
      <header className="apage-head">
        <div>
          <p className="apage-eyebrow">Digital secretariat</p>
          <h1>Records</h1>
          <p>Minutes, reports and Drive-backed documents, by DEC set and office.</p>
        </div>

        <div className="apage-actions">
          {filteredRecords.length > 0 && (
            <button
              type="button"
              className="abtn"
              onClick={() => downloadRecordsAsExcel(filteredRecords, getSetLabel)}
            >
              <Download size={14} />
              Export {filteredRecords.length}
            </button>
          )}

          {canCreateRecord() && (
            <button
              type="button"
              className="abtn abtn--primary"
              onClick={() => openCreateForm()}
            >
              <Plus size={14} />
              New record
            </button>
          )}
        </div>
      </header>

      {successMessage && (
        <div className="anote is-ok" style={{ margin: "16px 0 0" }}>
          <CheckCircle2 size={15} />
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="anote is-bad" style={{ margin: "16px 0 0" }}>
          <AlertCircle size={15} />
          {errorMessage}
        </div>
      )}

      <div className="astats">
        <div className="astat astat--soon">
          <span className="astat-ico"><FileArchive size={16} /></span>
          <span className="astat-body">
            <span className="astat-n">{records.length}</span>
            <span className="astat-l">Records</span>
          </span>
        </div>

        <div className="astat astat--mark">
          <span className="astat-ico"><Pin size={16} /></span>
          <span className="astat-body">
            <span className="astat-n">{records.filter((r) => r.is_pinned).length}</span>
            <span className="astat-l">Pinned</span>
          </span>
        </div>

        <div className="astat astat--live">
          <span className="astat-ico"><Link2 size={16} /></span>
          <span className="astat-body">
            <span className="astat-n">
              {records.filter((r) => r.record_type === "drive").length}
            </span>
            <span className="astat-l">Drive-backed</span>
          </span>
        </div>

        <div className="astat astat--idle">
          <span className="astat-ico"><Filter size={16} /></span>
          <span className="astat-body">
            <span className="astat-n">{recordCategories.length}</span>
            <span className="astat-l">Categories</span>
          </span>
        </div>
      </div>

      <div className="atoolbar">
        <label className="asearch">
          <Search size={14} />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search records"
            aria-label="Search records"
          />
        </label>

        <select
          className="aselect"
          value={selectedSet}
          onChange={(e) => setSelectedSet(e.target.value)}
          aria-label="DEC set"
        >
          <option value="">All DEC sets</option>
          {sets.map((set) => (
            <option key={set.id} value={set.id}>
              {set.set_name}
              {set.academic_session ? ` · ${set.academic_session}` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Categories were a grid of nine large cards, which pushed the records
          themselves below the fold. As chips they are a filter rather than a
          second navigation layer. */}
      <div className="achips">
        <button
          type="button"
          className={selectedCategory === "" ? "achip-f is-on" : "achip-f"}
          onClick={() => setSelectedCategory("")}
        >
          All
          <em>{records.length}</em>
        </button>

        {recordCategories.map((category) => (
          <button
            type="button"
            key={category.key}
            className={selectedCategory === category.key ? "achip-f is-on" : "achip-f"}
            onClick={() => setSelectedCategory(category.key)}
          >
            <category.icon size={12} />
            {category.title}
            <em>{getCategoryCount(category.key)}</em>
          </button>
        ))}
      </div>

      <div className="atable-wrap">
        {filteredRecords.length === 0 ? (
          <div className="aempty-row">
            <FileArchive size={26} />
            <strong>
              {searchTerm ? "Nothing matches that search" : "No records here yet"}
            </strong>
            <span>
              {searchTerm
                ? "Try a shorter search, or clear the filters."
                : "Records saved under this filter will appear here."}
            </span>
          </div>
        ) : (
          <div className="atable-scroll">
            <table className="atable">
              <thead>
                <tr>
                  <th>Record</th>
                  <th>Category</th>
                  <th>DEC set</th>
                  <th>Type</th>
                  <th className="num">Date</th>
                  <th className="num">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <button
                        type="button"
                        className="alink-cell"
                        onClick={() => setViewRecord(record)}
                      >
                        <span className="acell-title">
                          <strong>{record.title}</strong>
                          <span>{record.summary || record.source_office || "—"}</span>
                        </span>
                      </button>
                    </td>

                    <td className="quiet">{record.category}</td>
                    <td className="quiet">{getSetLabel(record)}</td>

                    <td>
                      <span className="abadges">
                      <span
                        className={
                          record.record_type === "drive"
                            ? "abadge abadge--soon"
                            : "abadge abadge--draft"
                        }
                      >
                        {record.record_type === "drive" ? (
                          <Link2 size={9} />
                        ) : (
                          <FileText size={9} />
                        )}
                        {record.record_type === "drive" ? "Drive" : "Written"}
                      </span>

                      {record.is_pinned && (
                        <span className="abadge abadge--pin">
                          <Pin size={9} />
                          Pinned
                        </span>
                      )}
                      </span>
                    </td>

                    <td className="num quiet">
                      {record.record_date
                        ? new Date(record.record_date).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </td>

                    <td>
                      <div className="acell-actions">
                        <button
                          type="button"
                          className="aicon-btn"
                          title="Open"
                          onClick={() => setViewRecord(record)}
                        >
                          <FileText size={14} />
                        </button>

                        <DownloadMenu
                          record={record}
                          setLabel={getSetLabel(record)}
                          open={downloadMenuId === record.id}
                          onToggle={() =>
                            setDownloadMenuId(
                              downloadMenuId === record.id ? null : record.id
                            )
                          }
                        />

                        {canPinRecord() && (
                          <button
                            type="button"
                            className="aicon-btn"
                            title={record.is_pinned ? "Unpin" : "Pin"}
                            onClick={() => togglePin(record)}
                          >
                            <Pin size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <RecordFormModal
          form={form}
          sets={sets}
          profile={profile}
          saving={saving}
          editingRecord={editingRecord}
          canWriteCategory={canWriteCategory}
          canPinRecord={canPinRecord}
          updateField={updateField}
          closeForm={closeForm}
          saveRecord={saveRecord}
        />
      )}
    </main>
  );
}

function DownloadMenu({ record, setLabel, open, onToggle }) {
  return (
    <div className="record-download-menu">
      {/* An icon button, so the actions column keeps one rhythm -- a labelled
          button here set its own height and pushed the row taller. */}
      <button
        type="button"
        className="aicon-btn"
        title="Export this record"
        onClick={onToggle}
      >
        <Download size={14} />
      </button>

      {open && (
        <div className="record-download-options">
          <button
            type="button"
            className="pdf"
            onClick={() => downloadRecordAsPDF(record, setLabel)}
          >
            PDF Document
          </button>
          <button
            type="button"
            className="docx"
            onClick={() => downloadRecordAsDocx(record, setLabel)}
          >
            Word Document
          </button>
          <button
            type="button"
            className="xlsx"
            onClick={() => downloadRecordAsExcel(record, setLabel)}
          >
            Excel Sheet
          </button>
        </div>
      )}
    </div>
  );
}

function RecordFormModal({
  form,
  sets,
  profile,
  saving,
  editingRecord,
  canWriteCategory,
  canPinRecord,
  updateField,
  closeForm,
  saveRecord,
}) {
  const showWritten = form.record_type === "written" || form.record_type === "mixed";
  const showDrive = form.record_type === "drive" || form.record_type === "mixed";

  return (
    <div className="record-modal-backdrop">
      <section className="record-modal">
        <div className="record-modal-header">
          <div>
            <p>{editingRecord ? "Edit Record" : "New Record"}</p>
            <h2>{form.category}</h2>
          </div>

          <button type="button" onClick={closeForm}>
            <X size={18} />
          </button>
        </div>

        <form className="record-form" onSubmit={saveRecord}>
          <div className="request-form-group">
            <label>Record title</label>
            <input
              type="text"
              placeholder="CEC Meeting Minutes - July"
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
            />
          </div>

          <div className="record-form-grid">
            <div className="request-form-group">
              <label>Category</label>
              <select
                value={form.category}
                onChange={(e) => {
                  const nextCategory = e.target.value;
                  updateField("category", nextCategory);
                  updateField("content_fields", buildEmptyContentFields(nextCategory));
                }}
              >
                {recordCategories.map((category) => (
                  <option
                    key={category.key}
                    value={category.key}
                    disabled={!canWriteCategory(category.key)}
                  >
                    {category.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="request-form-group">
              <label>Record type</label>
              <select
                value={form.record_type}
                onChange={(e) => updateField("record_type", e.target.value)}
              >
                {recordTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="record-form-grid">
            <div className="request-form-group">
              <label>DEC set</label>
              <select
                value={form.dec_set_id}
                onChange={(e) => updateField("dec_set_id", e.target.value)}
              >
                <option value="">No DEC set</option>
                {sets.map((set) => (
                  <option key={set.id} value={set.id}>
                    {set.set_name}{" "}
                    {set.academic_session ? `• ${set.academic_session}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="request-form-group">
              <label>Record date</label>
              <input
                type="date"
                value={form.record_date}
                onChange={(e) => updateField("record_date", e.target.value)}
              />
            </div>
          </div>

          <CategoryFields form={form} updateField={updateField} />

          <div className="request-form-group">
            <label>Short summary</label>
            <textarea
              rows="3"
              placeholder="Briefly describe this record..."
              value={form.summary}
              onChange={(e) => updateField("summary", e.target.value)}
            />
          </div>

          {showWritten && (
            <div className="record-structured-fields">
              <p className="record-structured-fields-title">Written Record Details</p>

              {getSchemaForCategory(form.category).map((field) => (
                <div className="request-form-group" key={field.key}>
                  <label>{field.label}</label>
                  {field.type === "textarea" ? (
                    <textarea
                      rows="3"
                      placeholder={field.label}
                      value={form.content_fields[field.key] || ""}
                      onChange={(e) =>
                        updateField("content_fields", {
                          ...form.content_fields,
                          [field.key]: e.target.value,
                        })
                      }
                    />
                  ) : (
                    <input
                      type="text"
                      placeholder={field.label}
                      value={form.content_fields[field.key] || ""}
                      onChange={(e) =>
                        updateField("content_fields", {
                          ...form.content_fields,
                          [field.key]: e.target.value,
                        })
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {showDrive && (
            <div className="request-form-group">
              <label>Google Drive link</label>
              <input
                type="url"
                placeholder="Paste Google Drive document link"
                value={form.drive_link}
                onChange={(e) => updateField("drive_link", e.target.value)}
              />
            </div>
          )}

          <div className="record-form-grid">
            <div className="request-form-group">
              <label>Prepared by</label>
              <input
                type="text"
                placeholder={profile?.full_name || "Prepared by"}
                value={form.prepared_by}
                onChange={(e) => updateField("prepared_by", e.target.value)}
              />
            </div>

            <div className="request-form-group">
              <label>Reviewed by</label>
              <input
                type="text"
                placeholder="Reviewer name optional"
                value={form.reviewed_by}
                onChange={(e) => updateField("reviewed_by", e.target.value)}
              />
            </div>
          </div>

          {canPinRecord() && (
            <label className="record-pin-toggle">
              <input
                type="checkbox"
                checked={form.is_pinned}
                onChange={(e) => updateField("is_pinned", e.target.checked)}
              />
              <span>Pin as important record</span>
            </label>
          )}

          <button type="submit" className="record-save-btn" disabled={saving}>
            <Save size={17} />
            {saving ? "Saving..." : editingRecord ? "Update Record" : "Save Record"}
          </button>
        </form>
      </section>
    </div>
  );
}

function CategoryFields({ form, updateField }) {
  if (form.category === "Financial Records") {
    return (
      <div className="record-form-grid">
        <div className="request-form-group">
          <label>Amount involved</label>
          <input
            type="text"
            placeholder="₦50,000"
            value={form.amount}
            onChange={(e) => updateField("amount", e.target.value)}
          />
        </div>

        <div className="request-form-group">
          <label>Source office</label>
          <input
            type="text"
            placeholder="Financial Secretary"
            value={form.source_office}
            onChange={(e) => updateField("source_office", e.target.value)}
          />
        </div>
      </div>
    );
  }

  if (form.category === "Event Records") {
    return (
      <div className="record-form-grid">
        <div className="request-form-group">
          <label>Proceeds / amount involved</label>
          <input
            type="text"
            placeholder="₦20,000 or Not applicable"
            value={form.amount}
            onChange={(e) => updateField("amount", e.target.value)}
          />
        </div>

        <div className="request-form-group">
          <label>Responsible office</label>
          <input
            type="text"
            placeholder="Social Director"
            value={form.source_office}
            onChange={(e) => updateField("source_office", e.target.value)}
          />
        </div>
      </div>
    );
  }

  if (form.category === "Sports Records") {
    return (
      <div className="request-form-group">
        <label>Responsible office</label>
        <input
          type="text"
          placeholder="Sports Director"
          value={form.source_office}
          onChange={(e) => updateField("source_office", e.target.value)}
        />
      </div>
    );
  }

  if (form.category === "Handover Notes") {
    return (
      <div className="request-form-group">
        <label>Office / handover source</label>
        <input
          type="text"
          placeholder="General Secretary"
          value={form.source_office}
          onChange={(e) => updateField("source_office", e.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="request-form-group">
      <label>Source office</label>
      <input
        type="text"
        placeholder="Office or committee responsible"
        value={form.source_office}
        onChange={(e) => updateField("source_office", e.target.value)}
      />
    </div>
  );
}

function RecordReader({
  record,
  setLabel,
  profile,
  canEditRecord,
  canDeleteRecord,
  onBack,
  onEdit,
  onDelete,
}) {
  const canEdit = canEditRecord(record);
  const canDelete = canDeleteRecord();

  const structuredEntries =
    record.content_fields && typeof record.content_fields === "object"
      ? getSchemaForCategory(record.category)
          .map((field) => ({
            label: field.label,
            value: record.content_fields[field.key],
          }))
          .filter((entry) => entry.value)
      : [];

  return (
    <main className="admin-dashboard-page record-reader-page">
      <button type="button" className="record-reader-back" onClick={onBack}>
        <ChevronLeft size={17} />
        Back to records
      </button>

      <section className="record-reader-card">
        <div className="record-reader-top">
          <span>{record.category}</span>
          {record.is_pinned && (
            <strong>
              <Pin size={13} />
              Pinned
            </strong>
          )}
        </div>

        <h1>{record.title}</h1>

        <div className="record-reader-meta">
          <span>{setLabel}</span>
          <span>
            {record.record_date
              ? new Date(record.record_date).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "No date"}
          </span>
          <span>{record.record_type}</span>
        </div>

        {record.summary && (
          <section className="record-reader-summary">
            <h3>Summary</h3>
            <p>{record.summary}</p>
          </section>
        )}

        {record.amount && (
          <section className="record-reader-summary">
            <h3>Amount / Proceeds</h3>
            <p>{record.amount}</p>
          </section>
        )}

        {structuredEntries.length > 0 ? (
          <section className="record-reader-body">
            <h3>Written Record</h3>
            <div className="record-reader-fields">
              {structuredEntries.map((entry) => (
                <div className="record-reader-field" key={entry.label}>
                  <span>{entry.label}</span>
                  <p>{entry.value}</p>
                </div>
              ))}
            </div>
          </section>
        ) : (
          record.content_body && (
            <section className="record-reader-body">
              <h3>Written Record</h3>
              <p>{record.content_body}</p>
            </section>
          )
        )}

        {record.drive_link && (
          <a
            className="record-drive-link"
            href={record.drive_link}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={17} />
            Open attached Google Drive document
          </a>
        )}

        <div className="record-reader-footer">
          <span>Prepared by: {record.prepared_by || "Not stated"}</span>
          <span>Reviewed by: {record.reviewed_by || "Not stated"}</span>
          <span>Office: {record.source_office || "Not stated"}</span>
        </div>

        <div className="record-reader-actions">
          <div className="record-reader-download-row">
            <button
              type="button"
              className="pdf"
              onClick={() => downloadRecordAsPDF(record, setLabel)}
            >
              <Download size={14} />
              PDF
            </button>

            <button
              type="button"
              className="docx"
              onClick={() => downloadRecordAsDocx(record, setLabel)}
            >
              <Download size={14} />
              Word
            </button>

            <button
              type="button"
              className="xlsx"
              onClick={() => downloadRecordAsExcel(record, setLabel)}
            >
              <Download size={14} />
              Excel
            </button>
          </div>

          {(canEdit || canDelete) && (
            <div className="record-reader-edit-row">
              {canEdit && (
                <button type="button" className="edit-btn" onClick={onEdit}>
                  <Pencil size={15} />
                  Edit Record
                </button>
              )}

              {canDelete && (
                <button type="button" className="delete-btn" onClick={onDelete}>
                  <Trash2 size={15} />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default AdminRecords;
