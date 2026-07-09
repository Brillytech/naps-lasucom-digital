import {
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronRight,
  FileText,
  Megaphone,
  MessageCircle,
  Pin,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

function HomePage() {
  const [announcements, setAnnouncements] = useState([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  async function fetchAnnouncements() {
    setLoadingAnnouncements(true);

    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .eq("status", "published")
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
        <h2>Digital Secretariat</h2>
      </section>

      <section className="home-identity-card">
        <div className="home-identity-icon">
          <Building2 size={24} />
        </div>

        <div>
          <h3>Strength in Knowledge,</h3>
          <p>Service to Humanity.</p>
        </div>
      </section>

      <section className="home-quick-actions">
        <Link to="/resources" className="quick-action-card blue-card">
          <BookOpen size={24} />
          <div>
            <h3>Resources</h3>
            <p>Past questions, materials & timetables</p>
          </div>
          <ChevronRight size={20} className="action-arrow" />
        </Link>

        <Link to="/requests" className="quick-action-card green-card">
          <MessageCircle size={24} />
          <div>
            <h3>Requests</h3>
            <p>Complaints, suggestions & feedback</p>
          </div>
          <ChevronRight size={20} className="action-arrow" />
        </Link>
      </section>

      <section className="home-mini-grid">
        <Link to="/past-questions" className="mini-home-card">
          <FileText size={21} />
          <span>Past Questions</span>
          <ChevronRight size={15} className="mini-arrow" />
        </Link>

        <Link to="/materials" className="mini-home-card">
          <BookOpen size={21} />
          <span>Materials</span>
          <ChevronRight size={15} className="mini-arrow" />
        </Link>

        <Link to="/timetables" className="mini-home-card">
          <CalendarDays size={21} />
          <span>Timetables</span>
          <ChevronRight size={15} className="mini-arrow" />
        </Link>
      </section>

      <section className="notice-card home-announcements-shell">
      <div className="section-head">
  <h3>Recent Announcements</h3>

  <Link to="/notifications" className="section-head-link">
    See all
  </Link>
</div>

        {loadingAnnouncements ? (
          <div className="home-announcement-loading">
            Loading announcements...
          </div>
        ) : announcements.length > 0 ? (
          <div className="home-announcement-stack">
            {announcements.map((announcement) => (
              <AnnouncementPreview
                key={announcement.id}
                announcement={announcement}
                onOpen={() => setSelectedAnnouncement(announcement)}
              />
            ))}
          </div>
        ) : (
          <>
            <NoticeItem
              icon={<Bell size={21} />}
              title="No announcement yet"
              text="Official notices from NAPS LASUCOM will appear here."
              time="Now"
              color="blue"
            />

            <NoticeItem
              icon={<BookOpen size={21} />}
              title="Resources Available"
              text="Check past questions, materials and timetables from the Resources section."
              time="New"
              color="green"
            />
          </>
        )}
      </section>

      <Link to="/naps" className="brand-card brand-card-link clickable-brand-card">
        <img
          src="/images/naps-logo.png"
          alt="NAPS LASUCOM"
          className="small-logo-img"
        />

        <div>
          <h3>About NAPS LASUCOM</h3>
          <p>View association info, motto, aims and constitution.</p>
        </div>

        <ChevronRight size={20} className="brand-arrow" />
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

function AnnouncementPreview({ announcement, onOpen }) {
  return (
    <button type="button" className="home-announcement-preview" onClick={onOpen}>
      {announcement.image_url && (
        <img
          src={announcement.image_url}
          alt=""
          className="home-announcement-thumb"
        />
      )}

      <div className="home-announcement-preview-body">
        <div className="home-announcement-icon">
          <Megaphone size={19} />
        </div>

        <section>
          <div className="home-announcement-preview-top">
            <h4>{announcement.title}</h4>

            {announcement.is_pinned && (
              <span>
                <Pin size={11} />
                Pinned
              </span>
            )}
          </div>

          <p>{announcement.body}</p>

          <div className="home-announcement-preview-meta">
            <small>{announcement.category || "General Notice"}</small>
            <small>{formatNoticeTime(announcement.published_at)}</small>
          </div>
        </section>

        <ChevronRight size={17} className="home-announcement-more-icon" />
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
                <Pin size={12} />
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

function NoticeItem({ icon, title, text, time, color }) {
  return (
    <div className="notice-item">
      <div className={`notice-icon ${color}`}>{icon}</div>

      <div className="notice-text">
        <h4>{title}</h4>
        <p>{text}</p>
      </div>

      <div className="notice-meta">
        <span>{time}</span>
        <i className={color}></i>
      </div>
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