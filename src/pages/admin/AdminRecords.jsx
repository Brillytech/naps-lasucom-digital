import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
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
    key: "Letters / Memos",
    title: "Letters / Memos",
    description: "Official letters, internal memos, correspondence and notices.",
    icon: FileText,
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
    "Letters / Memos",
    "Constitution / Policies",
    "Event Records",
    "Sports Records",
    "Other Records",
  ],

  assistant_general_secretary: [
    "Meeting Minutes",
    "Reports",
    "Handover Notes",
    "Letters / Memos",
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
    "Letters / Memos",
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
  content_body: "",
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
      content_body: record.content_body || "",
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

    if (form.record_type !== "drive" && !form.content_body.trim()) {
      setErrorMessage("Written record content is required.");
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
      content_body:
        form.record_type === "drive" ? null : form.content_body.trim(),
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

  function getLastUpdated(category) {
    const categoryRecords = records.filter((record) => record.category === category);

    if (!categoryRecords.length) return "No record yet";

    const latest = categoryRecords[0]?.record_date || categoryRecords[0]?.created_at;

    if (!latest) return "Recently";

    return new Date(latest).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  const pinnedRecords = useMemo(() => {
    return records.filter((record) => record.is_pinned).slice(0, 4);
  }, [records]);

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
      <main className="admin-dashboard-page">
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
    <main className="admin-dashboard-page records-page">
      <header className="admin-dashboard-header records-header">
        <div>
          <p>Digital Secretariat</p>
          <h1>Records Archive</h1>
          <span>Store, search and manage official NAPS LASUCOM records.</span>
        </div>

        {canCreateRecord() && (
          <button type="button" onClick={() => openCreateForm()}>
            <Plus size={17} />
            Add
          </button>
        )}
      </header>

      {successMessage && (
        <div className="request-success">
          <CheckCircle2 size={18} />
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="request-error">
          <AlertCircle size={18} />
          {errorMessage}
        </div>
      )}

      <section className="records-hero-card">
        <div>
          <FileArchive size={28} />
        </div>

        <section>
          <h2>Official Record Book</h2>
          <p>
            Written records, minutes, reports and Drive-backed documents are
            arranged by DEC set, category and office responsibility.
          </p>
        </section>
      </section>

      <section className="records-stats-grid">
        <article>
          <strong>{records.length}</strong>
          <span>Total Records</span>
        </article>

        <article>
          <strong>{pinnedRecords.length}</strong>
          <span>Pinned</span>
        </article>

        <article>
          <strong>{recordCategories.length}</strong>
          <span>Categories</span>
        </article>
      </section>

      <section className="records-filter-card">
        <div className="records-search-box">
          <Search size={17} />
          <input
            type="text"
            placeholder="Search records..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="records-select-row">
          <div>
            <Filter size={15} />
            <select
              value={selectedSet}
              onChange={(e) => setSelectedSet(e.target.value)}
            >
              <option value="">All DEC sets</option>
              {sets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.set_name}{" "}
                  {set.academic_session ? `• ${set.academic_session}` : ""}
                </option>
              ))}
            </select>
          </div>

          {selectedCategory && (
            <button type="button" onClick={() => setSelectedCategory("")}>
              Clear
            </button>
          )}
        </div>
      </section>

      {pinnedRecords.length > 0 && !selectedCategory && (
        <section className="records-section">
          <div className="records-section-title">
            <h2>Pinned Records</h2>
            <p>Important records kept within quick reach.</p>
          </div>

          <div className="pinned-record-list">
            {pinnedRecords.map((record) => (
              <button
                type="button"
                key={record.id}
                onClick={() => setViewRecord(record)}
              >
                <Pin size={15} />
                <span>{record.title}</span>
                <small>{record.category}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {!selectedCategory && (
        <section className="records-section">
          <div className="records-section-title">
            <h2>Record Categories</h2>
            <p>Open a category to view related official records.</p>
          </div>

          <div className="records-category-grid">
            {recordCategories.map((category) => {
              const Icon = category.icon;
              const count = getCategoryCount(category.key);

              return (
                <button
                  type="button"
                  key={category.key}
                  className="records-category-card"
                  onClick={() => setSelectedCategory(category.key)}
                >
                  <div>
                    <Icon size={22} />
                  </div>

                  <section>
                    <h3>{category.title}</h3>
                    <p>{category.description}</p>

                    <span>
                      {count} record{count === 1 ? "" : "s"} •{" "}
                      {getLastUpdated(category.key)}
                    </span>
                  </section>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {selectedCategory && (
        <section className="records-section">
          <div className="records-category-view-title">
            <button type="button" onClick={() => setSelectedCategory("")}>
              <ChevronLeft size={16} />
              Categories
            </button>

            <section>
              <h2>{selectedCategory}</h2>
              <p>{filteredRecords.length} record(s) found.</p>
            </section>

            {canCreateRecord() && canWriteCategory(selectedCategory) && (
              <button type="button" onClick={() => openCreateForm(selectedCategory)}>
                <Plus size={15} />
                Add
              </button>
            )}
          </div>
        </section>
      )}

      <section className="records-section final">
        <div className="records-section-title">
          <h2>{selectedCategory ? "Records" : "Recent Records"}</h2>
          <p>
            {selectedCategory
              ? "Compact archive list for this category."
              : "Latest records across all categories."}
          </p>
        </div>

        {filteredRecords.length > 0 ? (
          <div className="records-list">
            {filteredRecords.slice(0, selectedCategory ? 100 : 8).map((record) => (
              <article className="record-row" key={record.id}>
                <button type="button" onClick={() => setViewRecord(record)}>
                  <div>
                    {record.record_type === "drive" ? (
                      <Link2 size={18} />
                    ) : record.category === "Sports Records" ? (
                      <Trophy size={18} />
                    ) : (
                      <FileText size={18} />
                    )}
                  </div>

                  <section>
                    <h3>{record.title}</h3>
                    <p>
                      {record.category} • {getSetLabel(record)}
                    </p>
                    <span>
                      {record.record_date
                        ? new Date(record.record_date).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "No date"}{" "}
                      • {record.record_type}
                    </span>
                  </section>
                </button>

                <aside>
                  {record.is_pinned && <Pin size={14} />}

                  {canPinRecord() && (
                    <button type="button" onClick={() => togglePin(record)}>
                      {record.is_pinned ? "Unpin" : "Pin"}
                    </button>
                  )}
                </aside>
              </article>
            ))}
          </div>
        ) : (
          <section className="admin-empty-panel small">
            <FileArchive size={30} />
            <h3>No record found</h3>
            <p>Records saved under this filter will appear here.</p>
          </section>
        )}
      </section>

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
                onChange={(e) => updateField("category", e.target.value)}
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
            <div className="request-form-group">
              <label>Full written record</label>
              <textarea
                rows="9"
                placeholder={getBodyPlaceholder(form.category)}
                value={form.content_body}
                onChange={(e) => updateField("content_body", e.target.value)}
              />
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

        {record.content_body && (
          <section className="record-reader-body">
            <h3>Written Record</h3>
            <p>{record.content_body}</p>
          </section>
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

        {(canEdit || canDelete) && (
          <div className="record-reader-actions">
            {canEdit && (
              <button type="button" onClick={onEdit}>
                <Pencil size={15} />
                Edit
              </button>
            )}

            {canDelete && (
              <button type="button" onClick={onDelete}>
                <Trash2 size={15} />
                Delete
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function getBodyPlaceholder(category) {
  if (category === "Meeting Minutes") {
    return `Meeting Title:
Venue / Platform:
Attendance:
Agenda:
Discussion:
Resolutions:
Action Points:
Closing Note:`;
  }

  if (category === "Financial Records") {
    return `Income / Expense:
Purpose:
Amount:
Approved By:
Voucher / Receipt Details:
Breakdown:
Supporting Note:`;
  }

  if (category === "Reports") {
    return `Reporting Period:
Activities Carried Out:
Achievements:
Challenges:
Recommendations:
Pending Action:`;
  }

  if (category === "Handover Notes") {
    return `Outgoing Officer:
Incoming Officer:
Office:
Key Documents:
Pending Tasks:
Important Contacts:
Final Note:`;
  }

  if (category === "Letters / Memos") {
    return `Subject:
Recipient:
Sender:
Body:
Reference Number:`;
  }

  if (category === "Event Records") {
    return `Event Title:
Planning Committee:
Venue / Platform:
Activity Summary:
Attendance:
Income / Proceeds:
Amount Remitted:
Submitted To:
Outcome:
Pending Action:`;
  }

  if (category === "Sports Records") {
    return `Sporting Activity:
Date / Venue:
Participants:
Equipment Used:
Representation Details:
Outcome:
Challenges:
Recommendations:
Pending Action:`;
  }

  if (category === "Constitution / Policies") {
    return `Document Title:
Policy / Constitutional Area:
Summary:
Resolution / Amendment:
Approved By:
Effective Date:
Notes:`;
  }

  return "Write the official record here...";
}

export default AdminRecords;