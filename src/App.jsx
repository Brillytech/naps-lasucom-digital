import { Routes, Route, NavLink, useLocation } from "react-router-dom";
import {
  BookOpen,
  FileArchive,
  FolderUp,
  Home,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  Moon,
  MoreHorizontal,
  Sun,
  Users,
} from "lucide-react";
import { useState } from "react";

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

  const [darkMode, setDarkMode] = useState(false);

  return (
    <div
      className={
        isAdminRoute ? "app admin-shell" : darkMode ? "app dark" : "app"
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
              aria-label="Toggle theme"
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
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

        {isAdminRoute && !isAdminLogin && !isAdminSetPassword && (
          <AdminBottomNav />
        )}
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

function AdminBottomNav() {
  return (
    <nav className="admin-bottom-nav">
      <AdminNavItem
        to="/naps-admin"
        icon={<LayoutDashboard size={21} />}
        label="Home"
        end
      />

      <AdminNavItem
        to="/naps-admin/requests"
        icon={<MessageCircle size={21} />}
        label="Requests"
      />

      <AdminNavItem
        to="/naps-admin/uploads"
        icon={<FolderUp size={21} />}
        label="Uploads"
      />

      <AdminNavItem
        to="/naps-admin/records"
        icon={<FileArchive size={21} />}
        label="Records"
      />

      <AdminNavItem
        to="/naps-admin/more"
        icon={<MoreHorizontal size={21} />}
        label="More"
      />
    </nav>
  );
}

function AdminNavItem({ to, icon, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        isActive ? "admin-nav-item active" : "admin-nav-item"
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