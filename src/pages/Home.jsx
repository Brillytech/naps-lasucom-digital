import {
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronRight,
  Clock,
  FileText,
  Megaphone,
  MessageCircle,
  Pin,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getRecentlyViewed } from "../utils/localLibrary";

const READ_KEY = "napslasucom_read_notifications";

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

function HomePage() {
  const [announcements, setAnnouncements] = useState([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);

  const [readIds, setReadIds] = useState(() => new Set(getReadIds()));
  const [recentlyViewed, setRecentlyViewed] = useState([]);

  useEffect(() => {
    fetchAnnouncements();
    setRecentlyViewed(getRecentlyViewed());
  }, []);

  async function fetchAnnouncements() {
    setLoadingAnnouncements(true);

    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .or(
        `status.eq.published,and(status.eq.scheduled,scheduled_for.lte.${nowIso})`
      )
      .order("is_pinned", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(3);

    if (error) {
      console.log("Announcements fetch error:", error.message);
      setAnnouncements([]);
      setLoadingAnnouncements(false);
      return;
    }

    setAnnouncements(data || []);
    setLoadingAnnouncements(false);
  }

  function markAsRead(id) {
    if (readIds.has(id)) return;

    const updated = [...getReadIds(), id];
    saveReadIds(updated);
    setReadIds((prev) => new Set(prev).add(id));
  }

  return (
    <>
      <header className="top-header home-top-header">
        <img
          src="/images/naps-logo.png"
          alt="NAPS LASUCOM"
          className="logo-img"
        />
      </header>

      <section className="hero home-hero">
        <p>Welcome back, Dear NAPSITE 👋</p>
        <h1>NAPS LASUCOM</h1>
        <h2>Digital Connect</h2>
      </section>

      <section className="motto">
        <span className="ico ico-md ico--tint tone-blue">
          <Building2 size={22} />
        </span>

        <div>
          <span className="motto-label">Our motto</span>
          <p className="motto-text">
            Strength in Knowledge, <span>Service to Humanity.</span>
          </p>
        </div>
      </section>

      <div className="sec-head">
        <h3>Go to</h3>
      </div>

      <section className="home-quick">
        <Link to="/resources" className="card card--primary home-qcard">
          <div className="ico ico--on-brand">
            <BookOpen size={24} />
          </div>

          <div>
            <h3>Resources</h3>
            <p>Past questions, materials &amp; timetables</p>
          </div>

          <ChevronRight size={18} className="home-chev" />
        </Link>

        <Link
          to="/requests"
          className="card card--primary is-green home-qcard"
        >
          <div className="ico ico--on-brand">
            <MessageCircle size={24} />
          </div>

          <div>
            <h3>Requests</h3>
            <p>Complaints, suggestions &amp; feedback</p>
          </div>

          <ChevronRight size={18} className="home-chev" />
        </Link>
      </section>

      <div className="sec-head">
        <h3>Jump straight in</h3>
      </div>

      <section className="home-mini">
        <Link to="/past-questions" className="row home-mcard">
          <div className="ico ico-md ico--tint tone-blue">
            <FileText size={24} />
          </div>
          <span>Past Questions</span>
        </Link>

        <Link to="/materials" className="row home-mcard">
          <div className="ico ico-md ico--tint tone-green">
            <BookOpen size={24} />
          </div>
          <span>Materials</span>
        </Link>

        <Link to="/timetables" className="row home-mcard">
          <div className="ico ico-md ico--tint tone-blue">
            <CalendarDays size={24} />
          </div>
          <span>Timetables</span>
        </Link>
      </section>

      {recentlyViewed.length > 0 && (
        <>
          <div className="sec-head">
            <h3>Continue reading</h3>
          </div>

          <section className="home-continue">
            {recentlyViewed.map((entry) => (
              <Link
                key={entry.url}
                to={`/resource-viewer?url=${encodeURIComponent(
                  entry.url
                )}&title=${encodeURIComponent(entry.title)}`}
                className="row home-ccard"
              >
                <div className="ico ico-sm ico--tint tone-blue">
                  <Clock size={18} />
                </div>
                <span>{entry.title}</span>
              </Link>
            ))}
          </section>
        </>
      )}

      <div className="sec-head">
        <h3>Announcements</h3>

        <Link to="/notifications">See all</Link>
      </div>

      {loadingAnnouncements ? (
        <section className="list home-list" aria-busy="true">
          <AnnouncementSkeleton />
          <AnnouncementSkeleton />
          <AnnouncementSkeleton />
        </section>
      ) : announcements.length > 0 ? (
        <section className="list home-list">
          {announcements.map((announcement) => (
            <AnnouncementRow
              key={announcement.id}
              announcement={announcement}
              isRead={readIds.has(announcement.id)}
              onOpen={() => {
                markAsRead(announcement.id);
                setSelectedAnnouncement(announcement);
              }}
            />
          ))}
        </section>
      ) : (
        <section className="home-empty">
          <div className="ico ico-md ico--tint tone-blue">
            <Bell size={24} />
          </div>

          <h4>No announcements yet</h4>

          <p>
            Official notices from NAPS LASUCOM will show up here as soon as
            they go out.
          </p>
        </section>
      )}

      <Link to="/naps" className="row row--capped home-brand">
        <img src="/images/naps-logo.png" alt="" />

        <div>
          <h3>About NAPS LASUCOM</h3>
          <p>Association info, motto, aims and constitution.</p>
        </div>

        <ChevronRight size={18} className="home-chev" />
      </Link>

      {selectedAnnouncement && (
        <AnnouncementModal
          announcement={selectedAnnouncement}
          onClose={() => setSelectedAnnouncement(null)}
        />
      )}
    </>
  );
}

function AnnouncementSkeleton() {
  return (
    <div className="row home-skel-row" aria-hidden="true">
      <div className="skel skel-box" />

      <div>
        <div className="skel skel-line" style={{ width: "68%" }} />
        <div className="skel skel-line" style={{ width: "44%" }} />
      </div>
    </div>
  );
}

function AnnouncementRow({ announcement, isRead, onOpen }) {
  return (
    <button
      type="button"
      className={
        isRead
          ? "row home-arow"
          : "row home-arow is-unread"
      }
      onClick={onOpen}
    >
      {announcement.image_url ? (
        <img
          src={announcement.image_url}
          alt=""
          className="home-arow-thumb"
        />
      ) : (
        <div className="ico ico-sm ico--tint tone-amber">
          <Megaphone size={18} />
        </div>
      )}

      <div>
        <div className="home-arow-top">
          <h4>{announcement.title}</h4>

          {announcement.is_pinned && (
            <Pin size={14} className="home-arow-pin" />
          )}
        </div>

        <p>{announcement.body}</p>
      </div>

      <div className="home-arow-meta">
        <span>{formatNoticeTime(announcement.published_at)}</span>
        {!isRead && <i className="home-arow-dot" />}
      </div>
    </button>
  );
}

function AnnouncementModal({ announcement, onClose }) {
  return (
    <div className="home-announcement-modal-backdrop">
      <section className="home-announcement-modal">
        <button
          type="button"
          className="home-announcement-modal-close"
          onClick={onClose}
        >
          <X size={18} />
        </button>

        {announcement.image_url && (
          <img
            src={announcement.image_url}
            alt=""
            className="home-announcement-modal-image"
          />
        )}

        <div className="home-announcement-modal-content">
          <div className="home-announcement-modal-tags">
            <span>{announcement.category || "General Notice"}</span>
            {announcement.is_pinned && (
              <span>
                <Pin size={14} />
                Pinned
              </span>
            )}
          </div>

          <h2>{announcement.title}</h2>

          <p>{announcement.body}</p>

          <div className="home-announcement-modal-footer">
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
  if (diffMinutes < 60) return `${diffMinutes}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;

  return publishedDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export default HomePage;
