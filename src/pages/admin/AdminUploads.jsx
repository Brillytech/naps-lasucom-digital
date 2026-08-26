import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileQuestion,
  FileText,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
  const location = useLocation();
  const navigate = useNavigate();

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

    if (location.state?.editItem) {
      startEdit(location.state.editItem);
      // Clear the navigation state so a page refresh doesn't
      // re-trigger the edit form.
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <main className="admin-page">
        <header className="apage-head">
          <div>
            <p className="apage-eyebrow">Library</p>
            <span className="askel" style={{ width: 180, height: 26, marginTop: 8 }} />
          </div>
        </header>

        <div className="aworkspace">
          <aside className="aform">
            <div className="aform-body">
              {[0, 1, 2].map((n) => (
                <span key={n} className="askel" style={{ height: 36 }} />
              ))}
            </div>
          </aside>

          <div className="apanel" style={{ marginTop: 0 }}>
            {[0, 1, 2, 3].map((n) => (
              <div className="alib-row" key={n}>
                <span className="askel" style={{ width: 34, height: 34, borderRadius: 8 }} />
                <span>
                  <span className="askel" style={{ width: "62%", height: 12 }} />
                  <span className="askel" style={{ width: "38%", height: 10, marginTop: 7 }} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  const canPost = profile && canUpload(profile.role);

  return (
    <main className="admin-page">
      <header className="apage-head">
        <div>
          <p className="apage-eyebrow">Library</p>
          <h1>{editingId ? "Edit resource" : "Uploads"}</h1>
          <p>
            {editingId
              ? "Changing an existing entry."
              : "Add a Google Drive link and it appears for students."}
          </p>
        </div>

        <div className="apage-actions">
          <Link to="/naps-admin/resources" className="abtn">
            <FileText size={14} />
            Full library
          </Link>
        </div>
      </header>

      {!canPost ? (
        <div className="apanel">
          <div className="aempty">
            <span className="ico ico-md ico--tint tone-blue">
              <FileText size={22} />
            </span>
            <h3>No upload permission</h3>
            <p>
              This office cannot publish resources. Speak to the President if
              that looks wrong.
            </p>
          </div>
        </div>
      ) : (
        <div className="aworkspace">
          {/* Compose on the left, library on the right, both in view. */}
          <aside>
            <form className="aform" onSubmit={handleSubmit}>
              <div className="apanel-head">
                <h2>{editingId ? "Edit resource" : "Add resource"}</h2>
                {editingId && <span className="apill apill--active">Editing</span>}
              </div>

              {successMessage && (
                <div className="anote is-ok" style={{ marginTop: 12 }}>
                  <CheckCircle2 size={15} />
                  {successMessage}
                </div>
              )}

              {errorMessage && (
                <div className="anote is-bad" style={{ marginTop: 12 }}>
                  {errorMessage}
                </div>
              )}

              <div className="aform-body">
                <div className="afield">
                  <label>Section</label>
                  <div className="aoptions">
                    {categories.map((item) => (
                      <button
                        type="button"
                        key={item.label}
                        className={
                          form.category === item.label ? "aoption is-on" : "aoption"
                        }
                        onClick={() => updateField("category", item.label)}
                      >
                        <span
                          className={`ico ico-sm ico--tint tone-${
                            item.color === "green" ? "green" : "blue"
                          }`}
                        >
                          {item.icon}
                        </span>

                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.subtitle}</small>
                        </span>

                        <CheckCircle2 size={15} className="aoption-tick" />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="afield">
                  <label>Level</label>
                  <div className="achips">
                    {levels.map((item) => (
                      <button
                        type="button"
                        key={item}
                        className={form.level === item ? "achip is-on" : "achip"}
                        onClick={() => updateField("level", item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="afield">
                  <label>Semester</label>
                  <div className="achips">
                    {semesters.map((item) => (
                      <button
                        type="button"
                        key={item}
                        className={form.semester === item ? "achip is-on" : "achip"}
                        onClick={() => updateField("semester", item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="afield">
                  <label htmlFor="up-course">Course code</label>
                  <input
                    id="up-course"
                    type="text"
                    placeholder="PST 201"
                    value={form.course_code}
                    onChange={(e) => updateField("course_code", e.target.value)}
                  />
                </div>

                <div className="afield">
                  <label htmlFor="up-title">Title</label>
                  <input
                    id="up-title"
                    type="text"
                    placeholder="PST 201 Material Slides"
                    value={form.title}
                    onChange={(e) => updateField("title", e.target.value)}
                  />
                </div>

                <div className="afield">
                  <label htmlFor="up-link">Google Drive link</label>
                  <div className="afield-icon">
                    <Link2 size={14} />
                    <input
                      id="up-link"
                      type="url"
                      placeholder="Paste the share link"
                      value={form.external_link}
                      onChange={(e) => updateField("external_link", e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="apreview">
                <span>How students will see it</span>
                <strong>{form.title || "Resource title"}</strong>
                <p>
                  {[form.course_code || "No course code", form.category, form.level, form.semester]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>

              <div className="aform-foot">
                {editingId && (
                  <button type="button" className="abtn" onClick={resetForm}>
                    Cancel
                  </button>
                )}

                <button className="abtn abtn--primary" type="submit" disabled={saving}>
                  {saving ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
                  {saving ? "Saving..." : editingId ? "Save changes" : "Add resource"}
                </button>
              </div>
            </form>
          </aside>

          <section className="apanel" style={{ marginTop: 0 }}>
            <div className="apanel-head">
              <h2>Recent uploads</h2>
              <Link to="/naps-admin/resources">View all</Link>
            </div>

            <div className="ainbox-bar">
              <div className="ainbox-search">
                <Search size={15} />
                <input
                  placeholder="Search title, course, level..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <select
                className="ainbox-select"
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
              [0, 1, 2, 3].map((n) => (
                <div className="alib-row" key={n}>
                  <span className="askel" style={{ width: 34, height: 34, borderRadius: 8 }} />
                  <span>
                    <span className="askel" style={{ width: "62%", height: 12 }} />
                    <span className="askel" style={{ width: "38%", height: 10, marginTop: 7 }} />
                  </span>
                </div>
              ))
            ) : filteredResources.length === 0 ? (
              <div className="aempty">
                <span className="ico ico-md ico--tint tone-blue">
                  <FileText size={22} />
                </span>
                <h3>Nothing here</h3>
                <p>
                  {searchTerm || filterCategory !== "All"
                    ? "No resource matches this search."
                    : "Anything you add will appear here."}
                </p>
              </div>
            ) : (
              filteredResources.map((item) => (
                <article className="alib-row" key={item.id}>
                  <span
                    className={`ico ico-sm ico--tint ${
                      item.category === "Materials" ? "tone-green" : "tone-blue"
                    }`}
                  >
                    <FileText size={16} />
                  </span>

                  <span>
                    <h3>{item.title}</h3>
                    <span className="alib-meta">
                      <span
                        className={
                          item.is_published ? "apill apill--done" : "apill apill--muted"
                        }
                      >
                        {item.is_published ? "Published" : "Hidden"}
                      </span>
                      {item.course_code || "No course"} · {item.category} ·{" "}
                      {item.level || "No level"}
                    </span>
                  </span>

                  <span className="alib-actions">
                    <a
                      href={item.external_link || item.file_url}
                      target="_blank"
                      rel="noreferrer"
                      title="Open the file"
                      aria-label="Open the file"
                    >
                      <ExternalLink size={14} />
                    </a>

                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      title="Edit"
                      aria-label="Edit"
                    >
                      <Pencil size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() => togglePublish(item)}
                      title={item.is_published ? "Hide from students" : "Publish"}
                      aria-label={item.is_published ? "Hide from students" : "Publish"}
                    >
                      {item.is_published ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>

                    <button
                      type="button"
                      className="is-danger"
                      onClick={() => deleteResource(item)}
                      title="Delete"
                      aria-label="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </article>
              ))
            )}
          </section>
        </div>
      )}
    </main>
  );
}

export default AdminUploads;
