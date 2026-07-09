import {
  Bell,
  ChevronRight,
  FileArchive,
  FolderUp,
  LogOut,
  MessageCircle,
  ShieldCheck,
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
        icon: <MessageCircle size={24} />,
        color: "green",
        allowed: true,
      },
      {
        title: "Uploads",
        text: "Manage academic resources and public files.",
        to: "/naps-admin/uploads",
        icon: <FolderUp size={24} />,
        color: "blue",
        allowed: canUpload(role),
      },
      {
        title: "Executives",
        text: "Create DEC sets and manage executive profiles.",
        to: "/naps-admin/executives",
        icon: <Users size={24} />,
        color: "green",
        allowed: role === "president",
      },
      {
        title: "Admin Management",
        text: "Manage executive login access and roles.",
        to: "/naps-admin/admins",
        icon: <UserCog size={24} />,
        color: "blue",
        allowed: role === "president",
      },
      {
        title: "Announcements",
        text: "Manage official notices and public updates.",
        to: "/naps-admin/announcements",
        icon: <Bell size={24} />,
        color: "blue",
        allowed: canManageAnnouncements(role),
      },
      {
        title: "Internal Records",
        text: "View minutes, reports, handover notes and files.",
        to: "/naps-admin/records",
        icon: <FileArchive size={24} />,
        color: "blue",
        allowed: true,
      },
    ];

    return allActions.filter((item) => item.allowed);
  }, [profile]);

  if (loading) {
    return (
      <main className="admin-dashboard-page">
        <div className="admin-loading-card">Loading dashboard...</div>
      </main>
    );
  }

  return (
    <main className="admin-dashboard-page">
      <header className="admin-dashboard-header">
        <div>
          <p>Welcome back</p>
          <h1>{profile?.full_name || "Executive"}</h1>
          <span>{profile?.office || "Admin"}</span>
        </div>

        <button type="button" onClick={handleLogout}>
          <LogOut size={21} />
        </button>
      </header>

      <section className="admin-office-card">
        <div>
          <ShieldCheck size={26} />
        </div>

        <section>
          <h3>{profile?.office || "Executive"}</h3>
          <p>Available actions are based on the executive office.</p>
        </section>
      </section>

      <section className="admin-stats-grid">
        <article>
          <strong>{stats.requests}</strong>
          <span>New Requests</span>
        </article>

        <article>
          <strong>{stats.uploads}</strong>
          <span>Uploads</span>
        </article>

        <article>
          <strong>{stats.records}</strong>
          <span>Records</span>
        </article>
      </section>

      <section className="admin-section-title">
        <h2>Admin Actions</h2>
        <p>Select a section to manage.</p>
      </section>

      <section className="admin-action-list">
        {actions.map((item) => (
          <Link to={item.to} className="admin-action-card" key={item.title}>
            <div className={`admin-action-icon ${item.color}`}>
              {item.icon}
            </div>

            <section>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </section>

            <ChevronRight size={20} />
          </Link>
        ))}
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