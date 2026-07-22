import {
  ArrowLeft,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Megaphone,
  Pin,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { enablePushNotifications } from "../utils/sendPushNotification";

const DISMISSED_KEY = "napslasucom_dismissed_notifications";

function getDismissedIds() {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveDismissedIds(ids) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids));
}

function Notifications() {
  const [announcements, setAnnouncements] = useState([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [loading, setLoading] = useState(true);

  const [pushStatus, setPushStatus] = useState("");
  const [enablingPush, setEnablingPush] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    fetchAnnouncements();

    if (
      Notification.permission === "granted" &&
      localStorage.getItem("notifications_enabled") === "true"
    ) {
      setNotificationsEnabled(true);
      setPushStatus("Notifications enabled successfully.");
    }
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

    const dismissed = getDismissedIds();
    const visible = (data || []).filter((item) => !dismissed.includes(item.id));

    setAnnouncements(visible);
    setLoading(false);
  }

  async function handleEnablePush() {
    if (notificationsEnabled) return;

    setEnablingPush(true);
    setPushStatus("");

    try {
      await enablePushNotifications();

      localStorage.setItem("notifications_enabled", "true");

      setNotificationsEnabled(true);

      setPushStatus("Notifications enabled successfully.");
    } catch (error) {
      setPushStatus(error.message || "Unable to enable notifications.");
    }

    setEnablingPush(false);
  }

  function dismissAnnouncement(id) {
    const dismissed = getDismissedIds();
    const updated = [...new Set([...dismissed, id])];
    saveDismissedIds(updated);

    setAnnouncements((prev) => prev.filter((item) => item.id !== id));
  }

  function handleClearAll() {
    if (announcements.length === 0) return;

    const confirmed = window.confirm(
      "Clear all notifications from this list? This only removes them from your device — announcements stay visible to other NAPSITES and can still be managed by admins."
    );

    if (!confirmed) return;

    const dismissed = getDismissedIds();
    const idsToDismiss = announcements.map((item) => item.id);
    const updated = [...new Set([...dismissed, ...idsToDismiss])];

    saveDismissedIds(updated);
    setAnnouncements([]);
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

        <button
          type="button"
          onClick={handleEnablePush}
          disabled={enablingPush || notificationsEnabled}
          className={notificationsEnabled ? "notifications-enabled-btn" : ""}
        >
          {notificationsEnabled
            ? "✓ Notifications Enabled"
            : enablingPush
            ? "Enabling..."
            : "Enable Notifications"}
        </button>
      </section>

      <section className="notifications-list-section">
        <div className="section-head">
          <h3>Recent Notices</h3>

          <div className="notifications-head-actions">
            <span>{announcements.length} shown</span>

            {announcements.length > 0 && (
              <button
                type="button"
                className="notifications-clear-all-btn"
                onClick={handleClearAll}
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="notifications-loading">Loading notifications...</div>
        ) : announcements.length > 0 ? (
          <div className="notifications-list">
            {announcements.map((announcement) => (
              <SwipeableNotification
                key={announcement.id}
                announcement={announcement}
                onOpen={() => setSelectedAnnouncement(announcement)}
                onDismiss={() => dismissAnnouncement(announcement.id)}
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

const SWIPE_OPEN_X = -84;
const SWIPE_THRESHOLD = -42;

function SwipeableNotification({ announcement, onOpen, onDismiss }) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const startXRef = useRef(0);
  const baseXRef = useRef(0);
  const movedRef = useRef(false);

  function handleTouchStart(e) {
    startXRef.current = e.touches[0].clientX;
    baseXRef.current = dragX;
    movedRef.current = false;
    setDragging(true);
  }

  function handleTouchMove(e) {
    const delta = e.touches[0].clientX - startXRef.current;

    if (Math.abs(delta) > 6) {
      movedRef.current = true;
    }

    let next = baseXRef.current + delta;

    if (next > 0) next = 0;
    if (next < SWIPE_OPEN_X) next = SWIPE_OPEN_X;

    setDragX(next);
  }

  function handleTouchEnd() {
    setDragging(false);

    if (dragX <= SWIPE_THRESHOLD) {
      setDragX(SWIPE_OPEN_X);
    } else {
      setDragX(0);
    }
  }

  function handleRowClick() {
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }

    if (dragX !== 0) {
      setDragX(0);
      return;
    }

    onOpen();
  }

  return (
    <div className="notification-swipe-wrap">
      <button
        type="button"
        className="notification-swipe-delete"
        onClick={onDismiss}
        aria-label="Delete notification"
      >
        <Trash2 size={18} />
        <span>Delete</span>
      </button>

      <div
        className="notification-swipe-surface"
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragging ? "none" : "transform 0.22s ease",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <NotificationCard announcement={announcement} onOpen={handleRowClick} />
      </div>
    </div>
  );
}

function NotificationCard({ announcement, onOpen }) {
  return (
    <button type="button" className="notification-row" onClick={onOpen}>
      {announcement.image_url ? (
        <img
          src={announcement.image_url}
          alt=""
          className="notification-row-thumb"
        />
      ) : (
        <div className="notification-row-icon">
          <Megaphone size={18} />
        </div>
      )}

      <section className="notification-row-content">
        <div className="notification-row-top">
          <h3>{announcement.title}</h3>
          {announcement.is_pinned && (
            <Pin size={12} className="notification-row-pin" />
          )}
        </div>

        <p>{announcement.body}</p>
      </section>

      <div className="notification-row-meta">
        <span>{formatNoticeTime(announcement.published_at)}</span>
        <i className="notification-row-dot" />
      </div>

      <ChevronRight size={16} className="notification-row-arrow" />
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
