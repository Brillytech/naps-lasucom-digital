import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileQuestion,
  FileText,
  Link2,
  Loader2,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { hasValidDriveFileId } from "../../utils/driveLinks";
import { supabase } from "../../lib/supabase";

const categories = [
  {
    label: "Materials",
    subtitle: "Notes, slides and handouts",
    icon: <BookOpen size={21} />,
    color: "green",
  },
  {
    label: "Past Questions",
    subtitle: "PQ, recalls and compilations",
    icon: <FileQuestion size={21} />,
    color: "blue",
  },
  {
    label: "Timetables",
    subtitle: "Lecture, exam and posting schedules",
    icon: <CalendarDays size={21} />,
    color: "green",
  },
];

const levels = ["200L", "300L", "400L", "500L", "600L"];
const semesters = ["First Semester", "Second Semester"];

function AdminUploads() {
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [resources, setResources] = useState([]);
  const [loadingResources, setLoadingResources] = useState(true);

  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    category: "Materials",
    level: "200L",
    semester: "First Semester",
    course_code: "",
    title: "",
    external_link: "",
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");

  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadAdmin();
    fetchResources();
  }, []);

  async function loadAdmin() {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    if (!user) {
      setLoadingProfile(false);
      return;
    }

    const { data } = await supabase
      .from("admin_profiles")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    setProfile(data);
    setLoadingProfile(false);
  }

  async function fetchResources() {
    setLoadingResources(true);

    const { data, error } = await supabase
      .from("resources")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(3);

    if (error) {
      console.error("Error fetching resources:", error.message);
      setResources([]);
    } else {
      setResources(data || []);
    }

    setLoadingResources(false);
  }

 function canUpload(role) {
  // Open to all active executives — any role in admin_profiles qualifies.
  // profile is already filtered to is_active = true when loaded via loadAdmin()
  return Boolean(role);
}

  function updateField(name, value) {
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

 function resetForm() {
  setEditingId(null);
  setForm((prev) => ({
    ...prev,
    title: "",
    external_link: "",
  }));
}

  function startEdit(item) {
    setEditingId(item.id);

    setForm({
      category: item.category || "Materials",
      level: item.level || "200L",
      semester: item.semester || "First Semester",
      course_code: item.course_code || "",
      title: item.title || "",
      external_link: item.external_link || item.file_url || "",
    });

    setSuccessMessage("");
    setErrorMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function isValidDriveLink(link) {
    return (
      link.includes("drive.google.com") ||
      link.includes("docs.google.com") ||
      link.startsWith("https://")
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();

    setSaving(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      if (!profile) {
        throw new Error("Admin profile not found.");
      }

      if (!canUpload(profile.role)) {
        throw new Error("You do not have permission to add resources.");
      }

      if (!form.course_code.trim()) {
        throw new Error("Please enter the course code.");
      }

      if (!form.title.trim()) {
        throw new Error("Please enter the resource title.");
      }

      if (!form.external_link.trim()) {
        throw new Error("Please paste the Google Drive link.");
      }

      if (!isValidDriveLink(form.external_link.trim())) {
        throw new Error("Please paste a valid Google Drive or secure link.");
      }

      if (
        form.external_link.includes("drive.google.com") &&
        !hasValidDriveFileId(form.external_link)
      ) {
        throw new Error(
          "This Google Drive link does not look correct. Open the file, click Share, set access to Anyone with the link, then copy the link again."
        );
      }

      const payload = {
        category: form.category,
        level: form.level,
        semester: form.semester,
        course_code: form.course_code.trim().toUpperCase(),
        title: form.title.trim(),
        external_link: form.external_link.trim(),
        file_url: null,
        resource_type: null,
        is_published: true,
      };

      if (editingId) {
        const { error } = await supabase
          .from("resources")
          .update(payload)
          .eq("id", editingId);

        if (error) throw error;

        setSuccessMessage("Resource updated successfully.");
      } else {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData.session?.user;

        const { error } = await supabase.from("resources").insert({
          ...payload,
          uploaded_by: user?.id || null,
        });

        if (error) throw error;

        setSuccessMessage("Resource added successfully.");
      }

      resetForm();
      fetchResources();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish(item) {
    const { error } = await supabase
      .from("resources")
      .update({ is_published: !item.is_published })
      .eq("id", item.id);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    fetchResources();
  }

  async function deleteResource(item) {
    const confirmDelete = window.confirm(
      `Delete "${item.title}" permanently?`
    );

    if (!confirmDelete) return;

    const { error } = await supabase
      .from("resources")
      .delete()
      .eq("id", item.id);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    fetchResources();
  }

  const filteredResources = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return resources.filter((item) => {
      const title = item.title || "";
      const course = item.course_code || "";
      const category = item.category || "";
      const level = item.level || "";
      const semester = item.semester || "";

      const matchesCategory =
        filterCategory === "All" || category === filterCategory;

      const matchesSearch =
        !term ||
        title.toLowerCase().includes(term) ||
        course.toLowerCase().includes(term) ||
        level.toLowerCase().includes(term) ||
        semester.toLowerCase().includes(term);

      return matchesCategory && matchesSearch;
    });
  }, [resources, searchTerm, filterCategory]);

  if (loadingProfile) {
    return (
      <main className="admin-dashboard-page">
        <div className="admin-loading-card">Loading uploads...</div>
      </main>
    );
  }

  return (
    <main className="admin-dashboard-page">
      <header className="admin-dashboard-header">
        <div>
          <p>Admin Uploads</p>
          <h1>{editingId ? "Edit Resource" : "Add Resource"}</h1>
          <span>Google Drive link only.</span>
        </div>
      </header>

      {!profile || !canUpload(profile.role) ? (
        <section className="admin-empty-panel">
          <FileText size={32} />
          <h3>Restricted Access</h3>
          <p>Your office does not currently have upload permission.</p>
        </section>
      ) : (
        <>
          <section className="admin-upload-info-card">
            <div>
              <Link2 size={22} />
            </div>

            <section>
              <h3>Before adding a resource</h3>
              <p>
                Upload the file to Google Drive, set access to anyone with the
                link, then paste the link here.
              </p>
            </section>
          </section>

          <form className="admin-resource-form" onSubmit={handleSubmit}>
            {successMessage && (
              <div className="admin-success">
                <CheckCircle2 size={18} />
                {successMessage}
              </div>
            )}

            {errorMessage && <div className="admin-error">{errorMessage}</div>}

            <section className="admin-form-block">
              <div className="admin-form-block-title">
                <span>1</span>
                <h3>Select section</h3>
              </div>

              <div className="admin-category-grid">
                {categories.map((item) => (
                  <button
                    type="button"
                    key={item.label}
                    className={
                      form.category === item.label
                        ? `admin-category-card ${item.color} active`
                        : `admin-category-card ${item.color}`
                    }
                    onClick={() => updateField("category", item.label)}
                  >
                    <div>{item.icon}</div>
                    <section>
                      <strong>{item.label}</strong>
                      <small>{item.subtitle}</small>
                    </section>
                  </button>
                ))}
              </div>
            </section>

            <section className="admin-form-block">
              <div className="admin-form-block-title">
                <span>2</span>
                <h3>Choose level and semester</h3>
              </div>

              <div className="admin-chip-group">
                <label>Level</label>

                <div className="admin-chip-row">
                  {levels.map((item) => (
                    <button
                      type="button"
                      key={item}
                      className={
                        form.level === item ? "admin-chip active" : "admin-chip"
                      }
                      onClick={() => updateField("level", item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div className="admin-chip-group">
                <label>Semester</label>

                <div className="admin-chip-row">
                  {semesters.map((item) => (
                    <button
                      type="button"
                      key={item}
                      className={
                        form.semester === item
                          ? "admin-chip semester active"
                          : "admin-chip semester"
                      }
                      onClick={() => updateField("semester", item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="admin-form-block">
              <div className="admin-form-block-title">
                <span>3</span>
                <h3>Add details</h3>
              </div>

              <div className="admin-form-group">
                <label>Course code</label>
                <input
                  type="text"
                  placeholder="Example: PST 201"
                  value={form.course_code}
                  onChange={(e) => updateField("course_code", e.target.value)}
                />
              </div>

              <div className="admin-form-group">
                <label>Resource title</label>
                <input
                  type="text"
                  placeholder="Example: PST 201 Material Slides"
                  value={form.title}
                  onChange={(e) => updateField("title", e.target.value)}
                />
              </div>

              <div className="admin-form-group">
                <label>Google Drive link</label>
                <div className="admin-drive-input">
                  <Link2 size={18} />
                  <input
                    type="url"
                    placeholder="Paste Google Drive link"
                    value={form.external_link}
                    onChange={(e) =>
                      updateField("external_link", e.target.value)
                    }
                  />
                </div>
              </div>
            </section>

            <section className="admin-resource-preview">
              <p>Preview</p>
              <h3>{form.title || "Resource title"}</h3>
              <span>
                {form.category} • {form.level} • {form.semester}
              </span>
              <strong>{form.course_code || "COURSE CODE"}</strong>
            </section>

            <div className="admin-resource-submit-row">
              {editingId && (
                <button
                  type="button"
                  className="admin-cancel-btn"
                  onClick={resetForm}
                >
                  Cancel Edit
                </button>
              )}

              <button
                className="admin-submit-btn"
                type="submit"
                disabled={saving}
              >
                {saving ? (
                  <Loader2 size={18} className="spin" />
                ) : (
                  <CheckCircle2 size={18} />
                )}
                {saving
                  ? "Saving..."
                  : editingId
                  ? "Save Changes"
                  : "Add Resource"}
              </button>
            </div>
          </form>

          <section className="admin-recent-panel">
            <div className="admin-section-title admin-section-title-row">
              <div>
                <h2>Recent Resources</h2>
                <p>Latest added resources. Edit mistakes or hide wrong uploads.</p>
              </div>

              <Link to="/naps-admin/resources" className="admin-view-all-link">
                View all
              </Link>
            </div>

            <div className="admin-recent-tools">
              <div className="admin-recent-search">
                <Search size={17} />
                <input
                  placeholder="Search recent..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option>All</option>
                <option>Materials</option>
                <option>Past Questions</option>
                <option>Timetables</option>
              </select>
            </div>

            {loadingResources ? (
              <div className="admin-loading-card">Loading recent resources...</div>
            ) : filteredResources.length > 0 ? (
              <div className="admin-recent-list">
                {filteredResources.map((item) => (
                  <article className="admin-recent-item" key={item.id}>
                    <section>
                      <div className="admin-recent-topline">
                        <span
                          className={
                            item.is_published
                              ? "resource-status published"
                              : "resource-status hidden"
                          }
                        >
                          {item.is_published ? "Published" : "Hidden"}
                        </span>

                        <a
                          href={item.external_link || item.file_url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Open link"
                        >
                          <ExternalLink size={14} />
                        </a>
                      </div>

                      <h3>{item.title}</h3>

                      <p>
                        {item.category} • {item.level || "No level"} •{" "}
                        {item.semester || "No semester"}
                      </p>

                      <strong>{item.course_code || "No course code"}</strong>
                    </section>

                    <div className="admin-recent-actions">
                      <button type="button" onClick={() => startEdit(item)}>
                        <Pencil size={15} />
                        Edit
                      </button>

                      <button type="button" onClick={() => togglePublish(item)}>
                        {item.is_published ? "Hide" : "Show"}
                      </button>

                      <button type="button" onClick={() => deleteResource(item)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <section className="admin-empty-panel">
                <FileText size={30} />
                <h3>No recent resource found</h3>
                <p>Added resources will appear here.</p>
              </section>
            )}
          </section>
        </>
      )}
    </main>
  );
}

export default AdminUploads;