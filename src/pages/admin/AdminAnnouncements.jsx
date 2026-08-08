import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Edit3,
  ImagePlus,
  Megaphone,
  Pin,
  Plus,
  Save,
  Send,
  Trash2,
  X,
  XCircle,
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
  image_url: "",
  publish_mode: "now",
  scheduled_date: "",
  scheduled_time: "",
};

// Nigeria does not observe daylight saving time, so Africa/Lagos is always
// a fixed UTC+1 offset — no timezone library needed to convert reliably.
const LAGOS_UTC_OFFSET = "+01:00";

function buildLagosTimestamp(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  return new Date(`${dateStr}T${timeStr}:00${LAGOS_UTC_OFFSET}`);
}

function AdminAnnouncements() {
  const [profile, setProfile] = useState(null);
  const [announcements, setAnnouncements] = useState([]);

  const [form, setForm] = useState(initialForm);
  const [imageFile, setImageFile] = useState(null);
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
      .order("scheduled_for", { ascending: true })
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
    setImageFile(null);
    setForm(initialForm);
    setShowForm(true);
    setSuccessMessage("");
    setErrorMessage("");
  }

  function openEditForm(item) {
    if (!canManageAnnouncements()) {
      setErrorMessage("Only PRO and President can edit announcements.");
      return;
    }

    const scheduledDate = item.scheduled_for
      ? new Date(item.scheduled_for)
      : null;

    // Convert the stored UTC timestamp back into Lagos-local date/time
    // strings for the picker inputs.
    let scheduled_date = "";
    let scheduled_time = "";

    if (scheduledDate) {
      const lagosMs = scheduledDate.getTime() + 60 * 60 * 1000; // UTC -> UTC+1
      const lagos = new Date(lagosMs);
      scheduled_date = lagos.toISOString().slice(0, 10);
      scheduled_time = lagos.toISOString().slice(11, 16);
    }

    setEditing(item);
    setImageFile(null);
    setForm({
      title: item.title || "",
      body: item.body || "",
      category: item.category || "General Notice",
      audience: item.audience || "All NAPSITES",
      status: item.status === "scheduled" ? "published" : (item.status || "published"),
      is_pinned: Boolean(item.is_pinned),
      image_url: item.image_url || "",
      publish_mode: item.status === "scheduled" ? "scheduled" : "now",
      scheduled_date,
      scheduled_time,
    });
    setShowForm(true);
    setSuccessMessage("");
    setErrorMessage("");
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setImageFile(null);
    setForm(initialForm);
  }

  async function uploadAnnouncementImage() {
    if (!imageFile) return form.image_url || null;

    const fileExt = imageFile.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${fileExt}`;

    const filePath = `announcements/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("announcement-images")
      .upload(filePath, imageFile, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage
      .from("announcement-images")
      .getPublicUrl(filePath);

    return data.publicUrl;
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

    if (form.status === "published" && form.publish_mode === "scheduled") {
      if (!form.scheduled_date || !form.scheduled_time) {
        setErrorMessage("Please choose both a date and a time to schedule.");
        return;
      }
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const uploadedImageUrl = await uploadAnnouncementImage();

      let status = "draft";
      let published_at = null;
      let scheduled_for = null;
      let publish_mode = "now";
      let shouldSendPushNow = false;

      if (form.status === "draft") {
        // Explicit draft always stays a draft, regardless of publish_mode.
        status = "draft";
      } else if (form.publish_mode === "scheduled") {
        const scheduledDateTime = buildLagosTimestamp(
          form.scheduled_date,
          form.scheduled_time
        );

        if (!scheduledDateTime || scheduledDateTime.getTime() <= Date.now()) {
          // Scheduled time already passed (or invalid) — publish immediately
          // instead, per spec.
          status = "published";
          published_at = new Date().toISOString();
          shouldSendPushNow = true;
        } else {
          status = "scheduled";
          scheduled_for = scheduledDateTime.toISOString();
          publish_mode = "scheduled";
        }
      } else {
        status = "published";
        published_at = new Date().toISOString();
        shouldSendPushNow = true;
      }

      const payload = {
        title: form.title.trim(),
        body: form.body.trim(),
        category: form.category,
        audience: form.audience.trim() || "All NAPSITES",
        status,
        is_pinned: Boolean(form.is_pinned),
        image_url: uploadedImageUrl,
        source_office: profile?.office || "Public Relations Officer",
        updated_at: new Date().toISOString(),
        published_at,
        scheduled_for,
        publish_mode,
        timezone: "Africa/Lagos",
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

      if (error) throw new Error(error.message);

      if (shouldSendPushNow) {
        try {
          await sendPushNotification({
            title: payload.title,
            body: payload.body,
            image: payload.image_url,
          });
        } catch (pushError) {
          console.error("Push notification failed:", pushError);
        }
      }

      setSuccessMessage(
        status === "scheduled"
          ? "Announcement scheduled successfully."
          : editing
          ? "Announcement updated successfully."
          : "Announcement saved successfully."
      );

      closeForm();
      await fetchAnnouncements();
    } catch (error) {
      setErrorMessage(error.message || "Unable to save announcement.");
    }

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
      try {
        await sendPushNotification({
          title: item.title,
          body: item.body,
          image: item.image_url,
        });
      } catch (pushError) {
        console.error("Push notification failed:", pushError);
      }
    }

    await fetchAnnouncements();
  }

  async function publishScheduledNow(item) {
    if (!canManageAnnouncements()) {
      setErrorMessage("Only PRO and President can publish announcements.");
      return;
    }

    const { error } = await supabase
      .from("announcements")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    try {
      await sendPushNotification({
        title: item.title,
        body: item.body,
        image: item.image_url,
      });
    } catch (pushError) {
      console.error("Push notification failed:", pushError);
    }

    setSuccessMessage("Announcement published immediately.");
    await fetchAnnouncements();
  }

  async function cancelScheduling(item) {
    if (!canManageAnnouncements()) {
      setErrorMessage("Only PRO and President can manage announcements.");
      return;
    }

    const confirmCancel = window.confirm(
      `Cancel the schedule for "${item.title}"? It will be moved back to drafts.`
    );
    if (!confirmCancel) return;

    const { error } = await supabase
      .from("announcements")
      .update({
        status: "draft",
        scheduled_for: null,
        publish_mode: "now",
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccessMessage("Scheduling cancelled — moved back to drafts.");
    await fetchAnnouncements();
  }

  const publishedAnnouncements = useMemo(() => {
    return announcements.filter((item) => item.status === "published");
  }, [announcements]);

  const scheduledAnnouncements = useMemo(() => {
    return announcements.filter((item) => item.status === "scheduled");
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
            <span>New</span>
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
          <strong>{scheduledAnnouncements.length}</strong>
          <span>Scheduled</span>
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
        title="Scheduled Announcements"
        description="Will publish automatically at their scheduled time."
        items={scheduledAnnouncements}
        canManage={canManageAnnouncements()}
        canDelete={canDeleteAnnouncements()}
        onEdit={openEditForm}
        onDelete={deleteAnnouncement}
        onPin={togglePin}
        onPublishNow={publishScheduledNow}
        onCancelSchedule={cancelScheduling}
        isScheduledSection
        emptyText="No scheduled announcement yet."
      />

      <AnnouncementSection
        title="Draft Announcements"
        description="Saved announcements not visible to the public."
        items={draftAnnouncements}
        canManage={canManageAnnouncements()}
        canDelete={canDeleteAnnouncements()}
        onEdit={openEditForm}
        onDelete={deleteAnnouncement}
        onStatus={toggleStatus}
        emptyText="No draft announcement yet."
      />

      {showForm && (
        <AnnouncementModal
          form={form}
          editing={editing}
          saving={saving}
          imageFile={imageFile}
          setImageFile={setImageFile}
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
  onPublishNow,
  onCancelSchedule,
  isScheduledSection,
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
              {item.image_url && (
                <img
                  className="announcement-image"
                  src={item.image_url}
                  alt=""
                />
              )}

              <div className="announcement-card-top">
                <span>{item.category}</span>

                <div className="announcement-badge-row">
                  {item.is_pinned && (
                    <strong>
                      <Pin size={13} />
                      Pinned
                    </strong>
                  )}

                  {item.status === "scheduled" && (
                    <strong className="scheduled-badge">
                      <Clock size={13} />
                      Scheduled
                    </strong>
                  )}
                </div>
              </div>

              <h3>{item.title}</h3>
              <p>{item.body}</p>

              <div className="announcement-meta">
                <span>{item.audience || "All NAPSITES"}</span>
                <span>{item.source_office || "PRO"}</span>

                {item.status === "scheduled" && item.scheduled_for ? (
                  <span>
                    Publishes{" "}
                    {new Date(item.scheduled_for).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Africa/Lagos",
                    })}{" "}
                    (WAT)
                  </span>
                ) : (
                  <span>
                    {item.published_at
                      ? new Date(item.published_at).toLocaleDateString(
                          "en-GB",
                          {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          }
                        )
                      : "Draft"}
                  </span>
                )}
              </div>

              {canManage && (
                <div className="announcement-actions">
                  <button type="button" onClick={() => onEdit(item)}>
                    <Edit3 size={14} />
                    Edit
                  </button>

                  {isScheduledSection ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onPublishNow(item)}
                      >
                        <Send size={14} />
                        Publish Now
                      </button>

                      <button
                        type="button"
                        className="danger"
                        onClick={() => onCancelSchedule(item)}
                      >
                        <XCircle size={14} />
                        Cancel Schedule
                      </button>
                    </>
                  ) : (
                    <>
                      {onPin && (
                        <button type="button" onClick={() => onPin(item)}>
                          <Pin size={14} />
                          {item.is_pinned ? "Unpin" : "Pin"}
                        </button>
                      )}

                      <button type="button" onClick={() => onStatus(item)}>
                        <Send size={14} />
                        {item.status === "published" ? "Draft" : "Publish"}
                      </button>
                    </>
                  )}

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
  imageFile,
  setImageFile,
  updateField,
  closeForm,
  saveAnnouncement,
}) {
  const imagePreview = imageFile
    ? URL.createObjectURL(imageFile)
    : form.image_url;

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
          <label className="announcement-image-picker">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
            />

            {imagePreview ? (
              <img src={imagePreview} alt="" />
            ) : (
              <div>
                <ImagePlus size={25} />
                <strong>Add announcement image</strong>
                <span>Optional flyer, notice graphic or event image</span>
              </div>
            )}
          </label>

          {imagePreview && (
            <button
              type="button"
              className="announcement-remove-image"
              onClick={() => {
                setImageFile(null);
                updateField("image_url", "");
              }}
            >
              Remove image
            </button>
          )}

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

          {form.status === "published" && (
            <div className="publish-schedule-block">
              <label>Publish</label>

              <div className="publish-mode-switch">
                <button
                  type="button"
                  className={form.publish_mode === "now" ? "active" : ""}
                  onClick={() => updateField("publish_mode", "now")}
                >
                  <Send size={14} />
                  Publish Now
                </button>

                <button
                  type="button"
                  className={
                    form.publish_mode === "scheduled" ? "active" : ""
                  }
                  onClick={() => updateField("publish_mode", "scheduled")}
                >
                  <Clock size={14} />
                  Schedule for Later
                </button>
              </div>

              {form.publish_mode === "scheduled" && (
                <div className="schedule-picker-grid">
                  <div className="request-form-group">
                    <label>
                      <Calendar size={12} /> Date
                    </label>
                    <input
                      type="date"
                      value={form.scheduled_date}
                      onChange={(e) =>
                        updateField("scheduled_date", e.target.value)
                      }
                    />
                  </div>

                  <div className="request-form-group">
                    <label>
                      <Clock size={12} /> Time
                    </label>
                    <input
                      type="time"
                      value={form.scheduled_time}
                      onChange={(e) =>
                        updateField("scheduled_time", e.target.value)
                      }
                    />
                  </div>

                  <div className="request-form-group timezone-field">
                    <label>Timezone</label>
                    <div className="timezone-display">
                      Africa/Lagos (WAT, GMT+1)
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

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
              : form.publish_mode === "scheduled" && form.status === "published"
              ? "Schedule Announcement"
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
