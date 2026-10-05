import { Lock, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

/*
  Invite and reset emails land here in one of two shapes:

  - #access_token=...  (Supabase's default links). The client signs in from
    the hash as it boots. These links are one-time, so an email scanner that
    opens the link first spends it, and the person arrives with nothing.
  - ?token_hash=...&type=invite|recovery  (when the email template links here
    directly). Nothing is spent until the person presses Set Password, which
    no scanner does.

  A spent or expired link comes back as #error_description=..., which is the
  real reason and is shown as-is, with a way to email a fresh link.
*/
function readLinkParams() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const pick = (key) => query.get(key) || hash.get(key) || "";

  return {
    tokenHash: query.get("token_hash") || "",
    type: query.get("type") || "invite",
    errorCode: pick("error_code"),
    errorDescription: pick("error_description").replace(/\+/g, " "),
  };
}

function AdminSetPassword() {
  const navigate = useNavigate();
  const [link] = useState(readLinkParams);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    // getSession waits for the client to finish reading the URL hash.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setHasSession(Boolean(data?.session));
      setChecking(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled && session) setHasSession(true);
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  // A token_hash link is usable without a session; it is verified on submit.
  const canSetPassword = hasSession || Boolean(link.tokenHash);

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

    if (!hasSession && link.tokenHash) {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: link.tokenHash,
        type: link.type,
      });

      if (verifyError) {
        setErrorMessage(
          "This link has expired or was already used. Request a new one below."
        );
        setHasSession(false);
        setLoading(false);
        return;
      }
      setHasSession(true);
    }

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      if (error.name === "AuthSessionMissingError") {
        setErrorMessage("Your sign-in link is no longer valid. Request a new one below.");
        setHasSession(false);
      } else {
        setErrorMessage(error.message);
      }
      setLoading(false);
      return;
    }

    await supabase.auth.signOut();

    setLoading(false);
    navigate("/naps-admin/login");
  }

  async function handleResend(e) {
    e.preventDefault();
    const email = resendEmail.trim().toLowerCase();
    if (!email) return;

    setResending(true);
    setResendMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/naps-admin/set-password`,
    });

    setResending(false);
    setResendMessage(
      error
        ? error.message
        : "If that email belongs to an executive account, a new link is on its way. Open the newest email only."
    );
  }

  const linkProblem = !checking && !canSetPassword;

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

        {linkProblem && (
          <div className="admin-error">
            {link.errorDescription
              ? `${link.errorDescription}.`
              : "This page needs to be opened from your invite or reset email."}{" "}
            {link.errorCode === "otp_expired" || link.errorDescription
              ? "Links work once, and some email apps open them automatically to scan them. Request a new link below."
              : "If you already used that email, request a new link below."}
          </div>
        )}

        {errorMessage && <div className="admin-error">{errorMessage}</div>}

        {checking ? (
          <div className="admin-loading-card">Checking invite...</div>
        ) : canSetPassword ? (
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
                  autoComplete="new-password"
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
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            <button type="submit" className="admin-login-btn" disabled={loading}>
              <ShieldCheck size={18} />
              {loading ? "Saving Password..." : "Set Password"}
            </button>
          </form>
        ) : (
          <form className="admin-login-form" onSubmit={handleResend}>
            <div className="admin-input-group">
              <label>Your email</label>
              <div>
                <Mail size={18} />
                <input
                  type="email"
                  placeholder="The email your invite was sent to"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {resendMessage && <div className="admin-loading-card">{resendMessage}</div>}

            <button type="submit" className="admin-login-btn" disabled={resending}>
              <Mail size={18} />
              {resending ? "Sending..." : "Email me a new link"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

export default AdminSetPassword;
