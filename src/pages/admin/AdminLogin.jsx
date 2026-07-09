import { Lock, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

function AdminLogin() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleLogin(e) {
    e.preventDefault();

    setLoading(true);
    setErrorMessage("");

    const cleanEmail = email.trim().toLowerCase();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    const userId = data.user?.id;

    if (!userId) {
      await supabase.auth.signOut();
      setErrorMessage("Unable to verify admin account.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("admin_profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      setErrorMessage("This account is not registered as an admin.");
      setLoading(false);
      return;
    }

    const status = profile.account_status || (profile.is_active ? "active" : "disabled");

    if (status === "disabled") {
      await supabase.auth.signOut();
      setErrorMessage("This admin account has been disabled.");
      setLoading(false);
      return;
    }

    if (status === "invited") {
      const { error: activateError } = await supabase
        .from("admin_profiles")
        .update({
          is_active: true,
          account_status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);

      if (activateError) {
        await supabase.auth.signOut();
        setErrorMessage(activateError.message);
        setLoading(false);
        return;
      }
    }

    if (!profile.is_active && status !== "invited") {
      await supabase.auth.signOut();
      setErrorMessage("This admin account is not active.");
      setLoading(false);
      return;
    }

    setLoading(false);
    navigate("/naps-admin");
  }

  return (
    <main className="admin-login-page">
      <section className="admin-login-panel">
        <img
          src="/images/naps-logo.png"
          alt="NAPS LASUCOM"
          className="admin-login-main-logo"
        />

        <div className="admin-login-title">
          <p>Admin Access</p>
          <h1>NAPS Admin</h1>
          <span>Login to manage the NAPS LASUCOM Digital Secretariat.</span>
        </div>

        {errorMessage && <div className="admin-error">{errorMessage}</div>}

        <form className="admin-login-form" onSubmit={handleLogin}>
          <div className="admin-input-group">
            <label>Email address</label>
            <div>
              <Mail size={18} />
              <input
                type="email"
                placeholder="admin@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="admin-input-group">
            <label>Password</label>
            <div>
              <Lock size={18} />
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" className="admin-login-btn" disabled={loading}>
            <ShieldCheck size={18} />
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default AdminLogin;