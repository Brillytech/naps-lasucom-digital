import {
  AlertTriangle,
  ArrowLeft,
  Bell,
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
const READ_KEY = "napslasucom_read_notifications";

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

function getReadIds() {
  try {
    return JSON.parse(localStorage.getItem(READ_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveReadIds(ids) {
  localStorage.setItem(READ_KEY, JSON.stringify(ids));
}

function Notifications() {
  const [announcements, setAnnouncements] = useState([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const [pushStatus, setPushStatus] = useState("");
  const [pushStatusType, setPushStatusType] = useState("success");
  const [enablingPush, setEnablingPush] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const [readIds, setReadIds] = useState(() => new Set(getReadIds()));

  useEffect(() => {
    fetchAnnouncements();

    if (
      Notification.permission === "granted" &&
      localStorage.getItem("notifications_enabled") === "true"
    ) {
      setNotificationsEnabled(true);
      setPushStatus("Notifications enabled successfully.");
      setPushStatusType("success");
    }
  }, []);

  async function fetchAnnouncements() {
    setLoading(true);

    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .or(
        `status.eq.published,and(status.eq.scheduled,scheduled_for.lte.${nowIso})`
      )
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
      setPushStatusType("success");
    } catch (error) {
      setPushStatus(error.message || "Unable to enable notifications.");
      setPushStatusType("error");
    }

    setEnablingPush(false);
  }

  function markAsRead(id) {
    if (readIds.has(id)) return;

    const updated = [...getReadIds(), id];
    saveReadIds(updated);
    setReadIds((prev) => new Set(prev).add(id));
  }

  function dismissAnnouncement(id) {
    const dismissed = getDismissedIds();
    const updated = [...new Set([...dismissed, id])];
    saveDismissedIds(updated);

    setAnnouncements((prev) => prev.filter((item) => item.id !== id));
  }

  function requestClearAll() {
    if (announcements.length === 0) return;
    setShowClearConfirm(true);
  }

  function confirmClearAll() {
    const dismissed = getDismissedIds();
    const idsToDismiss = announcements.map((item) => item.id);
    const updated = [...new Set([...dismissed, ...idsToDismiss])];

    saveDismissedIds(updated);
    setAnnouncements([]);
    setShowClearConfirm(false);
  }

  return (
    <>
      <header className="rl-head tone-blue">
        <div className="rl-head-top">
          <Link to="/" className="rl-back" aria-label="Back to home">
            <ArrowLeft size={18} />
          </Link>

          <p className="rl-eyebrow">NAPS LASUCOM</p>
        </div>

        <h1>Notifications</h1>

        <p className="rl-meta">
          Official announcements and notices. Pinned first.
        </p>
      </header>

      <section className="nt-push">
        <span className="ico ico-sm ico--tint tone-blue">
          <Bell size={18} />
        </span>

        <div>
          <h3>Phone notifications</h3>
          <p>Get alerted when an important notice is posted.</p>

          {pushStatus && (
            <span
              className={
                pushStatusType === "error"
                  ? "nt-push-status is-bad"
                  : "nt-push-status"
              }
            >
              {pushStatus}
            </span>
          )}
        </div>

        <button
          type="button"
          className={notificationsEnabled ? "nt-push-btn is-on" : "nt-push-btn"}
          onClick={handleEnablePush}
          disabled={enablingPush || notificationsEnabled}
        >
          {notificationsEnabled
            ? "On"
            : enablingPush
            ? "Enabling..."
            : "Turn on"}
        </button>
      </section>

      <div className="sec-head">
        <h3>Recent notices</h3>

        <span className="sec-head-actions">
          <span>{announcements.length} shown</span>

          {announcements.length > 0 && (
            <button type="button" className="nt-clear" onClick={requestClearAll}>
              Clear all
            </button>
          )}
        </span>
      </div>

      {loading ? (
        <section className="list" aria-busy="true">
          <NotificationSkeleton />
          <NotificationSkeleton />
          <NotificationSkeleton />
          <NotificationSkeleton />
        </section>
      ) : announcements.length > 0 ? (
        <section className="list">
          {announcements.map((announcement) => (
            <SwipeableNotification
              key={announcement.id}
              announcement={announcement}
              isRead={readIds.has(announcement.id)}
              onOpen={() => {
                markAsRead(announcement.id);
                setSelectedAnnouncement(announcement);
              }}
              onDismiss={() => dismissAnnouncement(announcement.id)}
            />
          ))}
        </section>
      ) : (
        <section className="rl-empty">
          <div className="ico ico-md ico--tint tone-amber">
            <Megaphone size={24} />
          </div>
          <h3>Nothing yet</h3>
          <p>
            Official announcements from the association will show up here once
            they are published.
          </p>
        </section>
      )}

      {selectedAnnouncement && (
        <NotificationModal
          announcement={selectedAnnouncement}
          onClose={() => setSelectedAnnouncement(null)}
        />
      )}

      {showClearConfirm && (
        <ConfirmModal
          count={announcements.length}
          onCancel={() => setShowClearConfirm(false)}
          onConfirm={confirmClearAll}
        />
      )}
    </>
  );
}

function ConfirmModal({ count, onCancel, onConfirm }) {
  return (
    <div className="confirm-modal-backdrop" onClick={onCancel}>
      <section className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-modal-icon">
          <AlertTriangle size={22} />
        </div>

        <h2>Clear all notifications?</h2>

        <p>
          This removes all {count} notice{count === 1 ? "" : "s"} from your
          list.
        </p>

        <div className="confirm-modal-actions">
          <button type="button" className="confirm-modal-cancel" onClick={onCancel}>
            Cancel
          </button>

          <button type="button" className="confirm-modal-confirm" onClick={onConfirm}>
            <Trash2 size={15} />
            Clear all
          </button>
        </div>
      </section>
    </div>
  );
}

const SWIPE_OPEN_X = -84;
const SWIPE_THRESHOLD = -42;

function SwipeableNotification({ announcement, isRead, onOpen, onDismiss }) {
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
    <div className="nt-swipe">
      <button
        type="button"
        className="nt-swipe-delete"
        onClick={onDismiss}
        aria-label="Delete notification"
      >
        <Trash2 size={18} />
        <span>Delete</span>
      </button>

      <div
        className="nt-swipe-surface"
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragging ? "none" : "transform 0.22s ease",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <NotificationCard
          announcement={announcement}
          isRead={isRead}
          onOpen={handleRowClick}
        />
      </div>
    </div>
  );
}

function NotificationSkeleton() {
  return (
    <div className="row nt-row" aria-hidden="true">
      <span className="skel skel-box" style={{ width: 36, height: 36 }} />

      <span>
        <span className="skel skel-line" style={{ width: "66%" }} />
        <span className="skel skel-line" style={{ width: "40%" }} />
      </span>
    </div>
  );
}

function NotificationCard({ announcement, isRead, onOpen }) {
  return (
    <button
      type="button"
      className={isRead ? "row nt-row" : "row nt-row is-unread"}
      onClick={onOpen}
    >
      {announcement.image_url ? (
        <img src={announcement.image_url} alt="" className="nt-thumb" />
      ) : (
        <span className="ico ico-sm ico--tint tone-amber">
          <Megaphone size={18} />
        </span>
      )}

      <span>
        <span className="nt-row-top">
          <h3>{announcement.title}</h3>
          {announcement.is_pinned && <Pin size={13} className="nt-pin" />}
        </span>

        <p>{announcement.body}</p>
      </span>

      <span className="nt-meta">
        <span>{formatNoticeTime(announcement.published_at)}</span>
        {!isRead && <i className="nt-dot" />}
      </span>
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
