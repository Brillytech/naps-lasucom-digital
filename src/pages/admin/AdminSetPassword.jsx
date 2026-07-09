import { Lock, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

function AdminSetPassword() {
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    checkInviteSession();
  }, []);

  async function checkInviteSession() {
    setChecking(true);
    setErrorMessage("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setErrorMessage(
        "Invite session not found. Please open this page from the invite email again."
      );
    }

    setChecking(false);
  }

  async function handleSetPassword(e) {
    e.preventDefault();

    setLoading(true);
    setErrorMessage("");

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    await supabase.auth.signOut();

    setLoading(false);
    navigate("/naps-admin/login");
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
          <p>Admin Invite</p>
          <h1>Set Password</h1>
          <span>Create a password to complete admin access setup.</span>
        </div>

        {errorMessage && <div className="admin-error">{errorMessage}</div>}

        {checking ? (
          <div className="admin-loading-card">Checking invite...</div>
        ) : (
          <form className="admin-login-form" onSubmit={handleSetPassword}>
            <div className="admin-input-group">
              <label>New password</label>
              <div>
                <Lock size={18} />
                <input
                  type="password"
                  placeholder="Enter new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="admin-input-group">
              <label>Confirm password</label>
              <div>
                <Lock size={18} />
                <input
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" className="admin-login-btn" disabled={loading}>
              <ShieldCheck size={18} />
              {loading ? "Saving Password..." : "Set Password"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

export default AdminSetPassword;