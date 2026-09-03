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
  Search,
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

  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

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

  /*
    One table, filtered -- not three stacked lists.

    Published, scheduled and drafts each had their own heading, description
    and empty panel, which is most of what made this page read as a document.
    They are one dataset in three states, so they belong on one surface with
    the state as a column.
  */
  const visible = useMemo(() => {
    const pool =
      filter === "pinned"
        ? pinnedAnnouncements
        : filter === "all"
          ? announcements
          : announcements.filter((item) => item.status === filter);

    const needle = query.trim().toLowerCase();
    if (!needle) return pool;

    return pool.filter((item) =>
      [item.title, item.body, item.category]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [filter, query, announcements, pinnedAnnouncements]);

  if (loading) {
    return (
      <main className="admin-page">
        <div className="askel" style={{ height: 74 }} />
        <div className="askel" style={{ height: 84, marginTop: 20 }} />
        <div className="askel" style={{ height: 320, marginTop: 16 }} />
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="apage-head">
        <div>
          <p className="apage-eyebrow">Public communication</p>
          <h1>Announcements</h1>
          <p>Notices shown to NAPSITES. The PRO publishes; the President has oversight.</p>
        </div>

        {canManageAnnouncements() && (
          <div className="apage-actions">
            <button type="button" className="abtn abtn--primary" onClick={openCreateForm}>
              <Plus size={14} />
              New notice
            </button>
          </div>
        )}
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
        <div className="astat astat--live">
          <span className="astat-ico"><Send size={16} /></span>
          <span className="astat-body">
            <span className="astat-n">{publishedAnnouncements.length}</span>
            <span className="astat-l">Live</span>
          </span>
        </div>

        <div className="astat astat--soon">
          <span className="astat-ico"><Clock size={16} /></span>
          <span className="astat-body">
            <span className="astat-n">{scheduledAnnouncements.length}</span>
            <span className="astat-l">Scheduled</span>
          </span>
        </div>

        <div className="astat astat--idle">
          <span className="astat-ico"><Edit3 size={16} /></span>
          <span className="astat-body">
            <span className="astat-n">{draftAnnouncements.length}</span>
            <span className="astat-l">Drafts</span>
          </span>
        </div>

        <div className="astat astat--mark">
          <span className="astat-ico"><Pin size={16} /></span>
          <span className="astat-body">
            <span className="astat-n">{pinnedAnnouncements.length}</span>
            <span className="astat-l">Pinned</span>
          </span>
        </div>
      </div>

      <div className="atoolbar">
        <div className="aseg">
          {[
            ["all", "All", announcements.length],
            ["published", "Live", publishedAnnouncements.length],
            ["scheduled", "Scheduled", scheduledAnnouncements.length],
            ["draft", "Drafts", draftAnnouncements.length],
            ["pinned", "Pinned", pinnedAnnouncements.length],
          ].map(([id, label, count]) => (
            <button
              type="button"
              key={id}
              className={filter === id ? "is-on" : ""}
              onClick={() => setFilter(id)}
            >
              {label}
              <em>{count}</em>
            </button>
          ))}
        </div>

        <label className="asearch">
          <Search size={14} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notices"
            aria-label="Search notices"
          />
        </label>
      </div>

      <div className="atable-wrap">
        {visible.length === 0 ? (
          <div className="aempty-row">
            <Megaphone size={26} />
            <strong>{query ? "Nothing matches that search" : "No notices here yet"}</strong>
            <span>
              {query
                ? "Try a shorter search, or switch filter."
                : "Create one and it will appear in this list."}
            </span>
          </div>
        ) : (
          <div className="atable-scroll">
            <table className="atable">
              <thead>
                <tr>
                  <th>Notice</th>
                  <th>Category</th>
                  <th>Audience</th>
                  <th>Status</th>
                  <th className="num">Date</th>
                  {canManageAnnouncements() && <th className="num">Actions</th>}
                </tr>
              </thead>

              <tbody>
                {visible.map((item) => (
                  <AnnouncementRow
                    key={item.id}
                    item={item}
                    canManage={canManageAnnouncements()}
                    canDelete={canDeleteAnnouncements()}
                    onEdit={openEditForm}
                    onDelete={deleteAnnouncement}
                    onPin={togglePin}
                    onStatus={toggleStatus}
                    onPublishNow={publishScheduledNow}
                    onCancelSchedule={cancelScheduling}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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

/**
 * One notice as a table row.
 *
 * The card it replaces carried a hero image, a category chip, a title, the
 * full body, three meta lines and up to five buttons -- roughly 200px per
 * notice. At that size six notices were a scroll. The row keeps what
 * identifies a notice and moves the rest behind the edit action.
 */
function AnnouncementRow({
  item,
  canManage,
  canDelete,
  onEdit,
  onDelete,
  onPin,
  onStatus,
  onPublishNow,
  onCancelSchedule,
}) {
  const scheduled = item.status === "scheduled";

  const when = scheduled
    ? item.scheduled_for &&
      new Date(item.scheduled_for).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Lagos",
      })
    : item.published_at &&
      new Date(item.published_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

  const badge =
    item.status === "published"
      ? ["abadge abadge--live", "Live"]
      : scheduled
        ? ["abadge abadge--soon", "Scheduled"]
        : ["abadge abadge--draft", "Draft"];

  return (
    <tr>
      <td>
        <div className="acell-title">
          <strong>{item.title}</strong>
          <span>{item.body}</span>
        </div>
      </td>

      <td className="quiet">{item.category}</td>
      <td className="quiet">{item.audience || "All NAPSITES"}</td>

      <td>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <span className={badge[0]}>
            <i />
            {badge[1]}
          </span>
          {item.is_pinned && (
            <span className="abadge abadge--pin">
              <Pin size={9} />
              Pinned
            </span>
          )}
        </div>
      </td>

      <td className="num quiet">{when || "—"}</td>

      {canManage && (
        <td>
          <div className="acell-actions">
            <button
              type="button"
              className="aicon-btn"
              title="Edit"
              onClick={() => onEdit(item)}
            >
              <Edit3 size={14} />
            </button>

            {scheduled ? (
              <>
                <button
                  type="button"
                  className="aicon-btn"
                  title="Publish now"
                  onClick={() => onPublishNow(item)}
                >
                  <Send size={14} />
                </button>
                <button
                  type="button"
                  className="aicon-btn is-danger"
                  title="Cancel schedule"
                  onClick={() => onCancelSchedule(item)}
                >
                  <XCircle size={14} />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="aicon-btn"
                  title={item.is_pinned ? "Unpin" : "Pin"}
                  onClick={() => onPin(item)}
                >
                  <Pin size={14} />
                </button>
                <button
                  type="button"
                  className="aicon-btn"
                  title={item.status === "published" ? "Move to drafts" : "Publish"}
                  onClick={() => onStatus(item)}
                >
                  <Send size={14} />
                </button>
              </>
            )}

            {canDelete && (
              <button
                type="button"
                className="aicon-btn is-danger"
                title="Delete"
                onClick={() => onDelete(item)}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
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
