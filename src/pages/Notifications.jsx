import {
  ArrowLeft,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Megaphone,
  Pin,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { enablePushNotifications } from "../utils/sendPushNotification";

function Notifications() {
  const [announcements, setAnnouncements] = useState([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [loading, setLoading] = useState(true);

  const [pushStatus, setPushStatus] = useState("");
  const [enablingPush, setEnablingPush] = useState(false);

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  async function fetchAnnouncements() {
    setLoading(true);

    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .eq("status", "published")
      .order("is_pinned", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(10);

    if (error) {
      console.log("Notifications fetch error:", error.message);
      setAnnouncements([]);
      setLoading(false);
      return;
    }

    setAnnouncements(data || []);
    setLoading(false);
  }

  async function handleEnablePush() {
    setEnablingPush(true);
    setPushStatus("");

    try {
      await enablePushNotifications();
      setPushStatus("Notifications enabled successfully.");
    } catch (error) {
      setPushStatus(error.message || "Unable to enable notifications.");
    }

    setEnablingPush(false);
  }

  return (
    <>
      <section className="page-header notifications-header">
        <Link to="/" className="back-link">
          <ArrowLeft size={18} />
          Home
        </Link>

        <p>NAPS LASUCOM</p>
        <h1>Notifications</h1>
        <span>
          Official announcements, notices and updates from the association.
        </span>
      </section>

      <section className="notifications-summary-card">
        <div>
          <Bell size={24} />
        </div>

        <section>
          <h3>Latest Updates</h3>
          <p>
            Showing the latest 10 published announcements. Pinned notices appear
            first.
          </p>
        </section>
      </section>

      <section className="push-enable-card">
        <div>
          <h3>Phone Notifications</h3>
          <p>
            Allow NAPS LASUCOM to notify you when important announcements are
            posted.
          </p>

          {pushStatus && <span>{pushStatus}</span>}
        </div>

        <button type="button" onClick={handleEnablePush} disabled={enablingPush}>
          {enablingPush ? "Enabling..." : "Enable Notifications"}
        </button>
      </section>

      <section className="notifications-list-section">
        <div className="section-head">
          <h3>Recent Notices</h3>
          <span>{announcements.length} shown</span>
        </div>

        {loading ? (
          <div className="notifications-loading">Loading notifications...</div>
        ) : announcements.length > 0 ? (
          <div className="notifications-list">
            {announcements.map((announcement) => (
              <NotificationCard
                key={announcement.id}
                announcement={announcement}
                onOpen={() => setSelectedAnnouncement(announcement)}
              />
            ))}
          </div>
        ) : (
          <section className="notifications-empty">
            <Megaphone size={34} />
            <h3>No notification yet</h3>
            <p>Official announcements will appear here once published.</p>
          </section>
        )}
      </section>

      {selectedAnnouncement && (
        <NotificationModal
          announcement={selectedAnnouncement}
          onClose={() => setSelectedAnnouncement(null)}
        />
      )}
    </>
  );
}

function NotificationCard({ announcement, onOpen }) {
  return (
    <button type="button" className="notification-card" onClick={onOpen}>
      {announcement.image_url && (
        <img
          src={announcement.image_url}
          alt=""
          className="notification-card-image"
        />
      )}

      <div className="notification-card-content">
        <div className="notification-icon">
          <Megaphone size={20} />
        </div>

        <section>
          <div className="notification-card-top">
            <h3>{announcement.title}</h3>

            {announcement.is_pinned && (
              <span>
                <Pin size={12} />
                Pinned
              </span>
            )}
          </div>

          <p>{announcement.body}</p>

          <div className="notification-tags">
            <small>{announcement.category || "General Notice"}</small>
            <small>{announcement.audience || "All NAPSITES"}</small>
            <small>
              <CalendarDays size={12} />
              {formatNoticeTime(announcement.published_at)}
            </small>
          </div>
        </section>

        <ChevronRight size={18} className="notification-arrow" />
      </div>
    </button>
  );
}

function NotificationModal({ announcement, onClose }) {
  return (
    <div className="notification-modal-backdrop">
      <section className="notification-modal">
        <button
          type="button"
          className="notification-modal-close"
          onClick={onClose}
        >
          <X size={18} />
        </button>

        {announcement.image_url && (
          <img
            src={announcement.image_url}
            alt=""
            className="notification-modal-image"
          />
        )}

        <div className="notification-modal-content">
          <div className="notification-modal-tags">
            <span>{announcement.category || "General Notice"}</span>

            {announcement.is_pinned && (
              <span>
                <Pin size={12} />
                Pinned
              </span>
            )}
          </div>

          <h2>{announcement.title}</h2>

          <p>{announcement.body}</p>

          <div className="notification-modal-footer">
            <small>{announcement.audience || "All NAPSITES"}</small>
            <small>{formatNoticeTime(announcement.published_at)}</small>
          </div>
        </div>
      </section>
    </div>
  );
}

function formatNoticeTime(dateValue) {
  if (!dateValue) return "New";

  const publishedDate = new Date(dateValue);
  const now = new Date();

  const diffMs = now.getTime() - publishedDate.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "Now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return publishedDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default Notifications;