import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  Megaphone,
  Pin,
  Plus,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { sendPushNotification } from "../../utils/sendPushNotification";

const categories = [
  "General Notice",
  "Academic Notice",
  "Meeting Notice",
  "Event Notice",
  "Financial Notice",
  "Sports Notice",
  "Urgent Notice",
];

const initialForm = {
  title: "",
  body: "",
  category: "General Notice",
  audience: "All NAPSITES",
  status: "published",
  is_pinned: false,
};

function AdminAnnouncements() {
  const [profile, setProfile] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

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
      setErrorMessage("Login is required.");
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
    await fetchAnnouncements();
    setLoading(false);
  }

  async function fetchAnnouncements() {
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .order("is_pinned", { ascending: false })
      .order("published_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setAnnouncements(data || []);
  }

  function canManageAnnouncements() {
    return profile?.role === "president" || profile?.role === "pro";
  }

  function canDeleteAnnouncements() {
    return profile?.role === "president";
  }

  function updateField(name, value) {
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function openCreateForm() {
    setEditing(null);
    setForm({
      ...initialForm,
      audience: "All NAPSITES",
      status: "published",
      is_pinned: false,
    });
    setShowForm(true);
    setSuccessMessage("");
    setErrorMessage("");
  }

  function openEditForm(item) {
    if (!canManageAnnouncements()) {
      setErrorMessage("Only PRO and President can edit announcements.");
      return;
    }

    setEditing(item);
    setForm({
      title: item.title || "",
      body: item.body || "",
      category: item.category || "General Notice",
      audience: item.audience || "All NAPSITES",
      status: item.status || "published",
      is_pinned: Boolean(item.is_pinned),
    });
    setShowForm(true);
    setSuccessMessage("");
    setErrorMessage("");
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm(initialForm);
  }

  async function notifyPublishedAnnouncement({ title, body, image = "" }) {
    try {
      await sendPushNotification({
        title,
        body: body.slice(0, 140),
        image,
      });
    } catch (pushError) {
      console.log("Push notification error:", pushError.message);
    }
  }

  async function saveAnnouncement(e) {
    e.preventDefault();

    if (!canManageAnnouncements()) {
      setErrorMessage("Only PRO and President can manage announcements.");
      return;
    }

    if (!form.title.trim()) {
      setErrorMessage("Announcement title is required.");
      return;
    }

    if (!form.body.trim()) {
      setErrorMessage("Announcement body is required.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const wasDraftBeforeEdit = editing?.status === "draft";
    const isPublishingNow = form.status === "published";

    const payload = {
      title: form.title.trim(),
      body: form.body.trim(),
      category: form.category,
      audience: form.audience.trim() || "All NAPSITES",
      status: form.status,
      is_pinned: Boolean(form.is_pinned),
      source_office: profile?.office || "Public Relations Officer",
      updated_at: new Date().toISOString(),
      published_at:
        form.status === "published" ? new Date().toISOString() : null,
    };

    let error;

    if (editing?.id) {
      const result = await supabase
        .from("announcements")
        .update(payload)
        .eq("id", editing.id);

      error = result.error;
    } else {
      const result = await supabase.from("announcements").insert({
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

    if (isPublishingNow) {
      await notifyPublishedAnnouncement({
        title: payload.title,
        body: payload.body,
      });
    }

    setSuccessMessage(
      editing
        ? wasDraftBeforeEdit && isPublishingNow
          ? "Announcement published successfully."
          : "Announcement updated successfully."
        : isPublishingNow
        ? "Announcement published successfully."
        : "Announcement saved as draft."
    );

    closeForm();
    await fetchAnnouncements();
    setSaving(false);
  }

  async function deleteAnnouncement(item) {
    if (!canDeleteAnnouncements()) {
      setErrorMessage("Only President can delete announcements.");
      return;
    }

    const confirmDelete = window.confirm(`Delete "${item.title}"?`);

    if (!confirmDelete) return;

    const { error } = await supabase
      .from("announcements")
      .delete()
      .eq("id", item.id);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccessMessage("Announcement deleted.");
    await fetchAnnouncements();
  }

  async function togglePin(item) {
    if (!canManageAnnouncements()) {
      setErrorMessage("Only PRO and President can pin announcements.");
      return;
    }

    const { error } = await supabase
      .from("announcements")
      .update({
        is_pinned: !item.is_pinned,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await fetchAnnouncements();
  }

  async function toggleStatus(item) {
    if (!canManageAnnouncements()) {
      setErrorMessage("Only PRO and President can publish announcements.");
      return;
    }

    const nextStatus = item.status === "published" ? "draft" : "published";

    const { error } = await supabase
      .from("announcements")
      .update({
        status: nextStatus,
        published_at:
          nextStatus === "published" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    if (nextStatus === "published") {
      await notifyPublishedAnnouncement({
        title: item.title || "NAPS LASUCOM",
        body: item.body || "New announcement posted.",
        image: item.image_url || "",
      });

      setSuccessMessage("Announcement published and notification sent.");
    } else {
      setSuccessMessage("Announcement moved to draft.");
    }

    await fetchAnnouncements();
  }

  const publishedAnnouncements = useMemo(() => {
    return announcements.filter((item) => item.status === "published");
  }, [announcements]);

  const draftAnnouncements = useMemo(() => {
    return announcements.filter((item) => item.status === "draft");
  }, [announcements]);

  const pinnedAnnouncements = useMemo(() => {
    return announcements.filter((item) => item.is_pinned);
  }, [announcements]);

  if (loading) {
    return (
      <main className="admin-dashboard-page">
        <div className="admin-loading-card">Loading announcements...</div>
      </main>
    );
  }

  return (
    <main className="admin-dashboard-page announcements-page">
      <header className="admin-dashboard-header announcements-header">
        <div>
          <p>Public Communication</p>
          <h1>Announcements</h1>
          <span>Manage official notices displayed to NAPSITES.</span>
        </div>

        {canManageAnnouncements() && (
          <button type="button" onClick={openCreateForm}>
            <Plus size={17} />
            New
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

      <section className="announcements-hero-card">
        <div>
          <Megaphone size={30} />
        </div>

        <section>
          <h2>Official Notice Board</h2>
          <p>
            PRO manages public communication while President keeps oversight
            control. Other executives can view announcements only.
          </p>
        </section>
      </section>

      <section className="announcements-stats-grid">
        <article>
          <strong>{announcements.length}</strong>
          <span>Total</span>
        </article>

        <article>
          <strong>{publishedAnnouncements.length}</strong>
          <span>Published</span>
        </article>

        <article>
          <strong>{draftAnnouncements.length}</strong>
          <span>Drafts</span>
        </article>

        <article>
          <strong>{pinnedAnnouncements.length}</strong>
          <span>Pinned</span>
        </article>
      </section>

      <AnnouncementSection
        title="Published Announcements"
        description="Notices currently visible on the public side."
        items={publishedAnnouncements}
        canManage={canManageAnnouncements()}
        canDelete={canDeleteAnnouncements()}
        onEdit={openEditForm}
        onDelete={deleteAnnouncement}
        onPin={togglePin}
        onStatus={toggleStatus}
      />

      <AnnouncementSection
        title="Draft Announcements"
        description="Saved announcements not visible to the public."
        items={draftAnnouncements}
        canManage={canManageAnnouncements()}
        canDelete={canDeleteAnnouncements()}
        onEdit={openEditForm}
        onDelete={deleteAnnouncement}
        onPin={togglePin}
        onStatus={toggleStatus}
        emptyText="No draft announcement yet."
      />

      {showForm && (
        <AnnouncementModal
          form={form}
          editing={editing}
          saving={saving}
          updateField={updateField}
          closeForm={closeForm}
          saveAnnouncement={saveAnnouncement}
        />
      )}
    </main>
  );
}

function AnnouncementSection({
  title,
  description,
  items,
  canManage,
  canDelete,
  onEdit,
  onDelete,
  onPin,
  onStatus,
  emptyText = "No announcement found.",
}) {
  return (
    <section className="announcements-section">
      <div className="announcements-section-title">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>

      {items.length > 0 ? (
        <div className="announcements-list">
          {items.map((item) => (
            <article className="announcement-card" key={item.id}>
              <div className="announcement-card-top">
                <span>{item.category}</span>

                {item.is_pinned && (
                  <strong>
                    <Pin size={13} />
                    Pinned
                  </strong>
                )}
              </div>

              <h3>{item.title}</h3>
              <p>{item.body}</p>

              <div className="announcement-meta">
                <span>{item.audience || "All NAPSITES"}</span>
                <span>{item.source_office || "PRO"}</span>
                <span>
                  {item.published_at
                    ? new Date(item.published_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "Draft"}
                </span>
              </div>

              {canManage && (
                <div className="announcement-actions">
                  <button type="button" onClick={() => onEdit(item)}>
                    <Edit3 size={14} />
                    Edit
                  </button>

                  <button type="button" onClick={() => onPin(item)}>
                    <Pin size={14} />
                    {item.is_pinned ? "Unpin" : "Pin"}
                  </button>

                  <button type="button" onClick={() => onStatus(item)}>
                    <Send size={14} />
                    {item.status === "published" ? "Draft" : "Publish"}
                  </button>

                  {canDelete && (
                    <button
                      type="button"
                      className="danger"
                      onClick={() => onDelete(item)}
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <section className="admin-empty-panel small">
          <Megaphone size={30} />
          <h3>{emptyText}</h3>
          <p>Announcements will appear here after they are created.</p>
        </section>
      )}
    </section>
  );
}

function AnnouncementModal({
  form,
  editing,
  saving,
  updateField,
  closeForm,
  saveAnnouncement,
}) {
  return (
    <div className="record-modal-backdrop">
      <section className="record-modal announcement-modal">
        <div className="record-modal-header">
          <div>
            <p>{editing ? "Edit Announcement" : "New Announcement"}</p>
            <h2>{editing ? "Update notice" : "Create public notice"}</h2>
          </div>

          <button type="button" onClick={closeForm}>
            <X size={18} />
          </button>
        </div>

        <form className="record-form" onSubmit={saveAnnouncement}>
          <div className="request-form-group">
            <label>Title</label>
            <input
              type="text"
              placeholder="Important notice to all NAPSITES"
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
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div className="request-form-group">
              <label>Status</label>
              <select
                value={form.status}
                onChange={(e) => updateField("status", e.target.value)}
              >
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
            </div>
          </div>

          <div className="request-form-group">
            <label>Audience</label>
            <input
              type="text"
              placeholder="All NAPSITES"
              value={form.audience}
              onChange={(e) => updateField("audience", e.target.value)}
            />
          </div>

          <div className="request-form-group">
            <label>Announcement body</label>
            <textarea
              rows="7"
              placeholder="Write the announcement clearly..."
              value={form.body}
              onChange={(e) => updateField("body", e.target.value)}
            />
          </div>

          <label className="record-pin-toggle">
            <input
              type="checkbox"
              checked={form.is_pinned}
              onChange={(e) => updateField("is_pinned", e.target.checked)}
            />
            <span>Pin as important announcement</span>
          </label>

          <button type="submit" className="record-save-btn" disabled={saving}>
            <Save size={17} />
            {saving
              ? "Saving..."
              : editing
              ? "Update Announcement"
              : "Save Announcement"}
          </button>
        </form>
      </section>
    </div>
  );
}

export default AdminAnnouncements;