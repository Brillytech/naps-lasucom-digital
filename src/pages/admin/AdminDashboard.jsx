import {
  Bell,
  ChevronRight,
  FileArchive,
  FolderUp,
  LogOut,
  MessageCircle,
  Users,
  UserCog,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

function AdminDashboard() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({
    requests: 0,
    uploads: 0,
    records: 0,
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initDashboard();
  }, []);

  async function initDashboard() {
    setLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      navigate("/naps-admin/login");
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("admin_profiles")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (profileError || !profileData) {
      await supabase.auth.signOut();
      navigate("/naps-admin/login");
      return;
    }

    setProfile(profileData);
    await fetchStats();
    setLoading(false);
  }

  async function fetchStats() {
    const [requestsResult, uploadsResult, recordsResult] = await Promise.all([
      supabase
        .from("requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),

      supabase.from("resources").select("id", { count: "exact", head: true }),

      supabase
        .from("internal_records")
        .select("id", { count: "exact", head: true }),
    ]);

    setStats({
      requests: requestsResult.count || 0,
      uploads: uploadsResult.count || 0,
      records: recordsResult.count || 0,
    });
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/naps-admin/login");
  }

  const actions = useMemo(() => {
    if (!profile) return [];

    const role = profile.role;

    const allActions = [
      {
        title: "Requests",
        text: "View complaints, suggestions and assigned requests.",
        to: "/naps-admin/requests",
        icon: <MessageCircle size={18} />,
        color: "green",
        allowed: true,
      },
      {
        title: "Uploads",
        text: "Manage academic resources and public files.",
        to: "/naps-admin/uploads",
        icon: <FolderUp size={18} />,
        color: "blue",
        allowed: canUpload(role),
      },
      {
        title: "Executives",
        text: "Create DEC sets and manage executive profiles.",
        to: "/naps-admin/executives",
        icon: <Users size={18} />,
        color: "green",
        allowed: role === "president",
      },
      {
        title: "Admin Management",
        text: "Manage executive login access and roles.",
        to: "/naps-admin/admins",
        icon: <UserCog size={18} />,
        color: "blue",
        allowed: role === "president",
      },
      {
        title: "Announcements",
        text: "Manage official notices and public updates.",
        to: "/naps-admin/announcements",
        icon: <Bell size={18} />,
        color: "blue",
        allowed: canManageAnnouncements(role),
      },
      {
        title: "Internal Records",
        text: "View minutes, reports, handover notes and files.",
        to: "/naps-admin/records",
        icon: <FileArchive size={18} />,
        color: "blue",
        allowed: true,
      },
    ];

    return allActions.filter((item) => item.allowed);
  }, [profile]);

  if (loading) {
    return (
      <main className="admin-page">
        <header className="apage-head">
          <div>
            <p className="apage-eyebrow">Overview</p>
            <span className="askel" style={{ width: 210, height: 26, marginTop: 8 }} />
          </div>
        </header>

        <div className="ametrics">
          {[0, 1, 2].map((n) => (
            <div className="ametric" key={n}>
              <span className="askel" style={{ width: 74, height: 10 }} />
              <span className="askel" style={{ width: 52, height: 28, marginTop: 12 }} />
            </div>
          ))}
        </div>

        <div className="apanel">
          <div className="apanel-head">
            <h2>Sections</h2>
          </div>
          {[0, 1, 2].map((n) => (
            <div className="arow" key={n}>
              <span className="askel" style={{ width: 38, height: 38, borderRadius: 10 }} />
              <span>
                <span className="askel" style={{ width: 128, height: 12 }} />
                <span className="askel" style={{ width: 208, height: 10, marginTop: 7 }} />
              </span>
            </div>
          ))}
        </div>
      </main>
    );
  }

  const firstName = (profile?.full_name || "Executive").split(/\s+/)[0];

  return (
    <main className="admin-page">
      <header className="apage-head">
        <div>
          <p className="apage-eyebrow">Overview</p>
          <h1>Good to see you, {firstName}</h1>
          <p>{profile?.office || "Secretariat"} · what you can act on today.</p>
        </div>

        <div className="apage-actions">
          <Link to="/naps-admin/requests" className="abtn">
            <MessageCircle size={15} />
            Requests
          </Link>

          <button type="button" className="abtn abtn--danger" onClick={handleLogout}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </header>

      {/* Counts lead, because they are the thing an admin scans for first.
          Requests carries an alert note when any are waiting. */}
      <div className="ametrics">
        <Link to="/naps-admin/requests" className="ametric">
          <span className="ametric-label">
            <MessageCircle size={13} />
            Pending requests
          </span>
          <strong className="ametric-value">{stats.requests}</strong>
          <span className={stats.requests > 0 ? "ametric-note is-alert" : "ametric-note"}>
            {stats.requests > 0 ? "Needs attention" : "Nothing waiting"}
          </span>
        </Link>

        <Link to="/naps-admin/uploads" className="ametric">
          <span className="ametric-label">
            <FolderUp size={13} />
            Resources
          </span>
          <strong className="ametric-value">{stats.uploads}</strong>
          <span className="ametric-note">Published to students</span>
        </Link>

        <Link to="/naps-admin/records" className="ametric">
          <span className="ametric-label">
            <FileArchive size={13} />
            Internal records
          </span>
          <strong className="ametric-value">{stats.records}</strong>
          <span className="ametric-note">Secretariat archive</span>
        </Link>
      </div>

      <section className="apanel">
        <div className="apanel-head">
          <h2>Sections you can manage</h2>
          <span className="apill apill--muted">{profile?.office || "Executive"}</span>
        </div>

        {actions.length === 0 ? (
          <div className="aempty">
            <h3>No sections available</h3>
            <p>
              This office has no management permissions assigned. Speak to the
              President if that looks wrong.
            </p>
          </div>
        ) : (
          actions.map((item) => (
            <Link to={item.to} className="arow" key={item.title}>
              <span className={`ico ico-sm ico--tint tone-${item.color}`}>
                {item.icon}
              </span>

              <span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </span>

              <ChevronRight size={17} className="arow-chev" />
            </Link>
          ))
        )}
      </section>
    </main>
  );
}

function canUpload(role) {
  return [
    "president",
    "general_secretary",
    "assistant_general_secretary",
    "pro",
    "social_director",
  ].includes(role);
}

function canManageAnnouncements(role) {
  return ["president", "general_secretary", "pro"].includes(role);
}

export default AdminDashboard;