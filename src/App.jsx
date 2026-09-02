import { Routes, Route, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  LogOut,
  ShieldCheck,
  FileArchive,
  FolderUp,
  Home,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  Moon,
  MoreHorizontal,
  PenLine,
  Sun,
  Users,
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";

/* STUDENT / PUBLIC PAGES */
import HomePage from "./pages/Home";
import Resources from "./pages/Resources";
import PastQuestions from "./pages/PastQuestions";
import Materials from "./pages/Materials";
import Timetables from "./pages/Timetables";
import Requests from "./pages/Requests";
import Executives from "./pages/Executives";
import Naps from "./pages/Naps";
import ResourceViewer from "./pages/ResourceViewer";
import Constitution from "./pages/constitution";
import Notifications from "./pages/Notifications";
import Favorites from "./pages/Favorites";
import MaterialExplanation from "./pages/MaterialExplanation";
import InstallPrompt from "./components/InstallPrompt";

/* ADMIN PAGES - ACTIVE */
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUploads from "./pages/admin/AdminUploads";
import AdminRequests from "./pages/admin/AdminRequests";
import AdminResources from "./pages/admin/AdminResources";
import AdminExecutives from "./pages/admin/AdminExecutives";
import AdminAdmins from "./pages/admin/AdminAdmins";
import AdminSetPassword from "./pages/admin/AdminSetPassword";
import AdminRecords from "./pages/admin/AdminRecords";
import AdminAnnouncements from "./pages/admin/AdminAnnouncements";
import AdminCorrespondence from "./pages/admin/AdminCorrespondence";

/* ADMIN PAGES - FUTURE */
// import AdminHandover from "./pages/admin/AdminHandover";
// import AdminEvents from "./pages/admin/AdminEvents";
// import AdminFinance from "./pages/admin/AdminFinance";
// import AdminSports from "./pages/admin/AdminSports";
// import AdminProfile from "./pages/admin/AdminProfile";

import "./App.css";

function App() {
  const location = useLocation();

  const isAdminRoute = location.pathname.startsWith("/naps-admin");
  const isAdminLogin = location.pathname === "/naps-admin/login";
  const isAdminSetPassword = location.pathname === "/naps-admin/set-password";

  // Login and set-password render without the rail, so the shell must not
  // reserve space for it.
  const showAdminNav = isAdminRoute && !isAdminLogin && !isAdminSetPassword;

 const [darkMode, setDarkMode] = useState(() => {
  const savedTheme = localStorage.getItem("theme");

  if (savedTheme === null) {
    return true; // Default to dark mode
  }

  return savedTheme === "dark";
});

useEffect(() => {
  localStorage.setItem("theme", darkMode ? "dark" : "light");
}, [darkMode]);

useEffect(() => {
  if (typeof window.gtag === "function") {
    window.gtag("config", "G-38MG29216W", {
      page_path: location.pathname + location.search,
    });
  }
}, [location]);

  return (
    <div
      className={
        isAdminRoute
          ? showAdminNav
            ? "app admin-shell"
            : "app admin-shell admin-shell--bare"
          : darkMode
            ? "app dark"
            : "app"
      }
    >
      <div className={isAdminRoute ? "admin-screen" : "phone-screen"}>
        {!isAdminRoute && (
          <>
            <div className="soft-brand-mark logo-mark">
              <img src="/images/naps-logo.png" alt="" />
            </div>

            <div className="soft-brand-mark pulse-mark">
              <svg viewBox="0 0 240 80" fill="none">
                <path
                  d="M5 42H45L58 20L76 66L96 8L118 42H150L165 28L178 42H235"
                  stroke="currentColor"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div className="soft-brand-mark cross-mark">+</div>

         <button
  className="theme-toggle"
  onClick={() => setDarkMode(!darkMode)}
>
  {darkMode ? (
    <>
      <Sun size={16}/>
      <span>Light</span>
    </>
  ) : (
    <>
      <Moon size={16}/>
      <span>Dark</span>
    </>
  )}
</button>
          </>
        )}

        <Routes>
          {/* STUDENT / PUBLIC ROUTES */}
          <Route path="/" element={<HomePage />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/past-questions" element={<PastQuestions />} />
          <Route path="/materials" element={<Materials />} />
          <Route path="/timetables" element={<Timetables />} />
          <Route path="/requests" element={<Requests />} />
          <Route path="/executives" element={<Executives />} />
          <Route path="/naps" element={<Naps />} />
          <Route path="/resource-viewer" element={<ResourceViewer />} />
          <Route path="/constitution" element={<Constitution />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route
            path="/material-explanation"
            element={<MaterialExplanation />}
          />

          {/* ADMIN ROUTES */}
          <Route path="/naps-admin/login" element={<AdminLogin />} />
          <Route
            path="/naps-admin/set-password"
            element={<AdminSetPassword />}
          />
          <Route path="/naps-admin" element={<AdminDashboard />} />
          <Route path="/naps-admin/requests" element={<AdminRequests />} />
          <Route path="/naps-admin/uploads" element={<AdminUploads />} />
          <Route path="/naps-admin/resources" element={<AdminResources />} />
          <Route path="/naps-admin/executives" element={<AdminExecutives />} />
          <Route path="/naps-admin/admins" element={<AdminAdmins />} />
          <Route path="/naps-admin/records" element={<AdminRecords />} />
          <Route
            path="/naps-admin/announcements"
            element={<AdminAnnouncements />}
          />

          <Route
            path="/naps-admin/correspondence"
            element={<AdminCorrespondence />}
          />

          <Route path="/naps-admin/more" element={<AdminMore />} />

          {/* ADMIN ROUTES - FUTURE */}
          {/* <Route path="/naps-admin/handover" element={<AdminHandover />} /> */}
          {/* <Route path="/naps-admin/events" element={<AdminEvents />} /> */}
          {/* <Route path="/naps-admin/finance" element={<AdminFinance />} /> */}
          {/* <Route path="/naps-admin/sports" element={<AdminSports />} /> */}
          {/* <Route path="/naps-admin/profile" element={<AdminProfile />} /> */}
        </Routes>

        {!isAdminRoute && (
          <nav className="bottom-nav">
            <StudentNavItem to="/" icon={<Home size={22} />} label="Home" />

            <StudentNavItem
              to="/resources"
              icon={<BookOpen size={22} />}
              label="Resources"
            />

            <NavLink to="/naps" className="center-logo">
              <img src="/images/naps-logo.png" alt="NAPS" />
            </NavLink>

            <StudentNavItem
              to="/requests"
              icon={<MessageCircle size={22} />}
              label="Requests"
            />

            <StudentNavItem
              to="/executives"
              icon={<Users size={22} />}
              label="Executives"
            />
          </nav>
        )}

        {showAdminNav && <AdminConsoleNav />}

        {!isAdminRoute && <InstallPrompt />}
      </div>
    </div>
  );
}

function StudentNavItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

/**
 * One nav element for both form factors: a left rail on desktop, a bar across
 * the foot on small screens. The secondary destinations and the identity block
 * only appear on the rail, where there is room for them -- on mobile they stay
 * behind "More", which is why that entry is desktop-hidden.
 */
function AdminConsoleNav() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data?.user) return;

      supabase
        .from("admin_profiles")
        .select("full_name, office")
        .eq("user_id", data.user.id)
        .single()
        .then(({ data: row }) => {
          if (!cancelled) setProfile(row || null);
        });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/naps-admin/login");
  }

  const initials = (profile?.full_name || "NA")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <nav className="anav">
      <div className="anav-brand">
        <img src="/images/naps-logo.png" alt="" />
        <div>
          <span>NAPS LASUCOM</span>
          <small>Secretariat</small>
        </div>
      </div>

      <AdminNavItem to="/naps-admin" icon={<LayoutDashboard size={19} />} label="Overview" end />
      <AdminNavItem to="/naps-admin/requests" icon={<MessageCircle size={19} />} label="Requests" />
      <AdminNavItem to="/naps-admin/uploads" icon={<FolderUp size={19} />} label="Uploads" />
      <AdminNavItem to="/naps-admin/records" icon={<FileArchive size={19} />} label="Records" />

      <AdminNavItem
        to="/naps-admin/correspondence"
        icon={<PenLine size={19} />}
        label="Correspondence"
      />

      <span className="anav-group">Secretariat</span>

      <AdminNavItem
        to="/naps-admin/announcements"
        icon={<Megaphone size={19} />}
        label="Announcements"
        secondary
      />
      <AdminNavItem
        to="/naps-admin/executives"
        icon={<Users size={19} />}
        label="Executives"
        secondary
      />
      <AdminNavItem
        to="/naps-admin/admins"
        icon={<ShieldCheck size={19} />}
        label="Admin access"
        secondary
      />
      <AdminNavItem
        to="/naps-admin/resources"
        icon={<BookOpen size={19} />}
        label="Resource list"
        secondary
      />

      {/* Small screens only: the rail shows these destinations directly. */}
      <AdminNavItem
        to="/naps-admin/more"
        icon={<MoreHorizontal size={19} />}
        label="More"
        mobileOnly
      />

      <div className="anav-user">
        <span className="anav-avatar">{initials}</span>

        <span>
          <strong>{profile?.full_name || "Executive"}</strong>
          <small>{profile?.office || "Secretariat"}</small>
        </span>

        <button
          type="button"
          className="anav-signout"
          onClick={handleSignOut}
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut size={15} />
        </button>
      </div>
    </nav>
  );
}

function AdminNavItem({ to, icon, label, end, secondary, mobileOnly }) {
  const extra = [secondary && "is-secondary", mobileOnly && "is-mobile-only"]
    .filter(Boolean)
    .join(" ");

  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `anav-item ${extra}${isActive ? " active" : ""}`.trim()
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

function AdminMore() {
  return (
    <main className="admin-dashboard-page">
      <header className="admin-dashboard-header">
        <div>
          <p>Admin Options</p>
          <h1>More</h1>
          <span>Extra management sections for the secretariat.</span>
        </div>
      </header>

      <section className="admin-action-list">
        <NavLink to="/naps-admin/executives" className="admin-action-card">
          <div className="admin-action-icon green">
            <Users size={23} />
          </div>

          <section>
            <h3>Executives</h3>
            <p>Create DEC sets and manage executive profiles.</p>
          </section>

          <span>›</span>
        </NavLink>

        <NavLink to="/naps-admin/admins" className="admin-action-card">
          <div className="admin-action-icon blue">
            <Users size={23} />
          </div>

          <section>
            <h3>Admin Management</h3>
            <p>Invite executives and manage admin access.</p>
          </section>

          <span>›</span>
        </NavLink>

        <NavLink to="/naps-admin/announcements" className="admin-action-card">
          <div className="admin-action-icon blue">
            <Megaphone size={23} />
          </div>

          <section>
            <h3>Announcements</h3>
            <p>Manage official notices and public updates.</p>
          </section>

          <span>›</span>
        </NavLink>
      </section>
    </main>
  );
}

export default App;