import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Layers,
  Lock,
  Pencil,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const offices = [
  "President",
  "Vice President",
  "General Secretary",
  "Assistant General Secretary",
  "Financial Secretary",
  "Treasurer",
  "PRO",
  "Social Director",
  "Welfare Director",
  "Sports Director",
  "Viewer",
];

const officeToRole = {
  President: "president",
  "Vice President": "vice_president",
  "General Secretary": "general_secretary",
  "Assistant General Secretary": "assistant_general_secretary",
  "Financial Secretary": "financial_secretary",
  Treasurer: "treasurer",
  PRO: "pro",
  "Social Director": "social_director",
  "Welfare Director": "welfare_director",
  "Sports Director": "sports_director",
  Viewer: "viewer",
};

const roleLabels = {
  president: "President",
  vice_president: "Vice President",
  general_secretary: "General Secretary",
  assistant_general_secretary: "Assistant General Secretary",
  financial_secretary: "Financial Secretary",
  treasurer: "Treasurer",
  pro: "PRO",
  social_director: "Social Director",
  welfare_director: "Welfare Director",
  sports_director: "Sports Director",
  viewer: "Viewer",
};

function AdminAdmins() {
  const [profile, setProfile] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [sets, setSets] = useState([]);

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    office: "General Secretary",
    dec_set_id: "",
  });
  const [editingId, setEditingId] = useState("");
  const [view, setView] = useState("active");
  const [showInvite, setShowInvite] = useState(false);
  const [editOffice, setEditOffice] = useState("");
  const [editSetId, setEditSetId] = useState("");

  const [loading, setLoading] = useState(true);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [savingId, setSavingId] = useState("");

  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    initPage();
  }, []);

  async function initPage() {
    setLoading(true);
    setErrorMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setErrorMessage("Login is required to access this page.");
      setLoading(false);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("admin_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (profileError) {
      setErrorMessage(profileError.message);
      setLoading(false);
      return;
    }

    setProfile(profileData);

    if (profileData.role !== "president" || !profileData.is_active) {
      setLoading(false);
      return;
    }

    await Promise.all([fetchAdmins(), fetchSets()]);
    setLoading(false);
  }

  async function fetchAdmins() {
    const { data, error } = await supabase
      .from("admin_profiles")
      .select("*, executive_sets(set_name, academic_session)")
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setAdmins(data || []);
  }

  async function fetchSets() {
    const { data, error } = await supabase
      .from("executive_sets")
      .select("*")
      .order("set_number", { ascending: false });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    const allSets = data || [];
    const currentSet = allSets.find((item) => item.is_current);

    setSets(allSets);

    setForm((prev) => ({
      ...prev,
      dec_set_id: prev.dec_set_id || currentSet?.id || allSets[0]?.id || "",
    }));
  }

  function updateField(name, value) {
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function sendInvite(e) {
    e.preventDefault();

    setSendingInvite(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const fullName = form.full_name.trim();
      const email = form.email.trim().toLowerCase();
      const office = form.office;
      const role = officeToRole[office] || "viewer";

      if (!fullName) throw new Error("Full name is required.");
      if (!email) throw new Error("Email address is required.");
      if (!office) throw new Error("Office is required.");

      const { data, error } = await supabase.functions.invoke("invite-admin", {
        body: {
          full_name: fullName,
          email,
          office,
          role,
          dec_set_id: form.dec_set_id || null,
        },
      });

      if (error) {
        let functionMessage = error.message || "Unable to send invite.";

        try {
          const errorBody = await error.context.json();
          functionMessage = errorBody.message || functionMessage;
        } catch {
          // keep default message
        }

        throw new Error(functionMessage);
      }

      if (data && data.success === false) {
        throw new Error(data.message || "Unable to send invite.");
      }

      setSuccessMessage("Executive invite sent successfully.");

      setForm((prev) => ({
        full_name: "",
        email: "",
        office: "General Secretary",
        dec_set_id: prev.dec_set_id,
      }));

      await fetchAdmins();
    } catch (error) {
      setErrorMessage(error.message || "Unable to send invite.");
    } finally {
      setSendingInvite(false);
    }
  }

  function startEdit(admin) {
    setEditingId(admin.id);
    setEditOffice(admin.office || "Viewer");
    setEditSetId(admin.dec_set_id || "");
    setSuccessMessage("");
    setErrorMessage("");
  }

  function cancelEdit() {
    setEditingId("");
    setEditOffice("");
    setEditSetId("");
  }

  async function saveEdit(admin) {
    setSavingId(admin.id);
    setSuccessMessage("");
    setErrorMessage("");

    const nextOffice = editOffice;
    const nextRole = officeToRole[nextOffice] || "viewer";

    const { error } = await supabase
      .from("admin_profiles")
      .update({
        office: nextOffice,
        role: nextRole,
        dec_set_id: editSetId || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", admin.id);

    if (error) {
      setErrorMessage(error.message);
      setSavingId("");
      return;
    }

    setSuccessMessage("Admin profile updated.");
    setEditingId("");
    setEditOffice("");
    setEditSetId("");

    await fetchAdmins();
    setSavingId("");
  }

  async function toggleStatus(admin) {
  if (admin.role === "president") {
    setErrorMessage("President access cannot be disabled.");
    return;
  }

  setSavingId(admin.id);
  setSuccessMessage("");
  setErrorMessage("");

  const { error } = await supabase
    .from("admin_profiles")
    .update({
      is_active: !admin.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", admin.id);

  if (error) {
    setErrorMessage(error.message);
    setSavingId("");
    return;
  }

  setSuccessMessage(
    admin.is_active ? "Admin access disabled." : "Admin access restored."
  );

  await fetchAdmins();
  setSavingId("");
}

async function resetPassword(admin) {
  if (admin.role === "president") {
    setErrorMessage("President password cannot be reset.");
    return;
  }

  const confirmed = window.confirm(
    `Send a password reset email to ${admin.full_name}?`
  );

  if (!confirmed) return;

  setSavingId(admin.id);
  setSuccessMessage("");
  setErrorMessage("");

  try {
    const { data, error } = await supabase.functions.invoke(
      "reset-admin-password",
      {
        body: {
          email: admin.email,
        },
      }
    );

    if (error) {
      let message = error.message;

      try {
        const body = await error.context.json();
        message = body.message || message;
      } catch {}

      throw new Error(message);
    }

    if (data?.success === false) {
      throw new Error(data.message);
    }

    setSuccessMessage(
      `Password reset email sent to ${admin.full_name}.`
    );
  } catch (err) {
    setErrorMessage(err.message || "Unable to send password reset email.");
  }

  setSavingId("");
}

async function removeDisabledAdmin(admin) {
  if (admin.role === "president") {
    setErrorMessage("President profile cannot be removed.");
    return;
  }

  if (admin.is_active) {
    setErrorMessage("Only disabled admin profiles can be removed.");
    return;
  }

    const confirmRemove = window.confirm(
      `Remove ${admin.full_name || "this admin"} from admin profiles?`
    );

    if (!confirmRemove) return;

    setSavingId(admin.id);
    setSuccessMessage("");
    setErrorMessage("");

    const { error } = await supabase
      .from("admin_profiles")
      .delete()
      .eq("id", admin.id);

    if (error) {
      setErrorMessage(error.message);
      setSavingId("");
      return;
    }

    setSuccessMessage("Disabled admin removed from the list.");
    await fetchAdmins();
    setSavingId("");
  }

  function getSetLabel(admin) {
    if (admin.executive_sets?.set_name) {
      return admin.executive_sets.academic_session
        ? `${admin.executive_sets.set_name} • ${admin.executive_sets.academic_session}`
        : admin.executive_sets.set_name;
    }

    return "No DEC set";
  }

  const activeAdmins = useMemo(() => {
    return admins.filter((admin) => admin.is_active);
  }, [admins]);

  const disabledAdmins = useMemo(() => {
    return admins.filter((admin) => !admin.is_active);
  }, [admins]);

  const shownAdmins =
    view === "active"
      ? activeAdmins
      : view === "disabled"
        ? disabledAdmins
        : admins;


  if (loading) {
    return (
      <main className="admin-dashboard-page">
        <div className="admin-loading-card">Loading admin management...</div>
      </main>
    );
  }

  if (!profile || profile.role !== "president" || !profile.is_active) {
    return (
      <main className="admin-page">
        <section className="admin-empty-panel">
          <ShieldCheck size={34} />
          <h3>Access denied</h3>
          <p>Only the President can manage executive admin access.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="apage-head">
        <div>
          <p className="apage-eyebrow">President control</p>
          <h1>Admin access</h1>
          <p>Invite executives and manage who can sign in to the console.</p>
        </div>

        <div className="apage-actions">
          <button
            type="button"
            className={showInvite ? "abtn" : "abtn abtn--primary"}
            onClick={() => setShowInvite((v) => !v)}
          >
            {showInvite ? <X size={14} /> : <UserPlus size={14} />}
            {showInvite ? "Close" : "Invite executive"}
          </button>
        </div>
      </header>

      {successMessage && (
        <div className="anote is-ok" style={{ margin: "16px 0 0" }}>
          <CheckCircle2 size={15} />
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="anote is-bad" style={{ margin: "16px 0 0" }}>
          <AlertCircle size={15} />
          {errorMessage}
        </div>
      )}

      <div className="astats">
        <div className="astat astat--live">
          <span className="astat-ico"><ShieldCheck size={16} /></span>
          <span className="astat-body">
            <span className="astat-n">{activeAdmins.length}</span>
            <span className="astat-l">Active</span>
          </span>
        </div>

        <div className="astat astat--idle">
          <span className="astat-ico"><UserMinus size={16} /></span>
          <span className="astat-body">
            <span className="astat-n">{disabledAdmins.length}</span>
            <span className="astat-l">Disabled</span>
          </span>
        </div>

        <div className="astat astat--mark">
          <span className="astat-ico"><Users size={16} /></span>
          <span className="astat-body">
            <span className="astat-n">{admins.length}</span>
            <span className="astat-l">Profiles</span>
          </span>
        </div>

        <div className="astat astat--soon">
          <span className="astat-ico"><Layers size={16} /></span>
          <span className="astat-body">
            <span className="astat-n">{sets.length}</span>
            <span className="astat-l">DEC sets</span>
          </span>
        </div>
      </div>

      {/* The invite form is the page's one write action, so it opens from the
          header rather than sitting above the list permanently. */}
      {showInvite && (
        <section className="apanel">
          <div className="apanel-head">
            <div>
              <h2>Invite an executive</h2>
              <p>They set their own password from the invite link.</p>
            </div>
          </div>

          <form className="apanel-body aform-grid" onSubmit={sendInvite}>
            <div className="afield">
              <label htmlFor="i-name">Full name</label>
              <input
                id="i-name"
                value={form.full_name}
                onChange={(e) => updateField("full_name", e.target.value)}
                placeholder="Executive full name"
              />
            </div>

            <div className="afield">
              <label htmlFor="i-email">Email address</label>
              <input
                id="i-email"
                type="email"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder="executive@email.com"
              />
            </div>

            <div className="afield">
              <label htmlFor="i-office">Office</label>
              <select
                id="i-office"
                value={form.office}
                onChange={(e) => updateField("office", e.target.value)}
              >
                {offices.map((office) => (
                  <option key={office}>{office}</option>
                ))}
              </select>
            </div>

            <div className="afield">
              <label htmlFor="i-set">DEC set</label>
              <select
                id="i-set"
                value={form.dec_set_id}
                onChange={(e) => updateField("dec_set_id", e.target.value)}
              >
                <option value="">No DEC set</option>
                {sets.map((set) => (
                  <option key={set.id} value={set.id}>
                    {set.set_name}
                    {set.academic_session ? ` · ${set.academic_session}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="aform-foot">
              <span className="aform-note">
                Role from office:
                <strong>{roleLabels[officeToRole[form.office]] || "Viewer"}</strong>
              </span>

              <button
                type="submit"
                className="abtn abtn--primary"
                disabled={sendingInvite}
              >
                <Send size={14} />
                {sendingInvite ? "Sending…" : "Send invite"}
              </button>
            </div>
          </form>
        </section>
      )}

      <div className="atoolbar">
        <div className="aseg">
          {[
            ["active", "Active", activeAdmins.length],
            ["disabled", "Disabled", disabledAdmins.length],
            ["all", "All", admins.length],
          ].map(([id, label, count]) => (
            <button
              type="button"
              key={id}
              className={view === id ? "is-on" : ""}
              onClick={() => {
                setView(id);
                setEditingId("");
              }}
            >
              {label}
              <em>{count}</em>
            </button>
          ))}
        </div>
      </div>

      <div className="atable-wrap">
        {shownAdmins.length === 0 ? (
          <div className="aempty-row">
            <Users size={26} />
            <strong>Nobody here</strong>
            <span>Invited executives appear once they accept.</span>
          </div>
        ) : (
          <div className="atable-scroll">
            <table className="atable">
              <thead>
                <tr>
                  <th>Executive</th>
                  <th>Office</th>
                  <th>Role</th>
                  <th>DEC set</th>
                  <th>Status</th>
                  <th className="num">Actions</th>
                </tr>
              </thead>

              <tbody>
                {shownAdmins.map((admin) => {
                  const isEditing = editingId === admin.id;
                  const isPresident = admin.role === "president";
                  const busy = savingId === admin.id;

                  return (
                    <tr key={admin.id}>
                      <td>
                        <div className="acell-title">
                          <strong>{admin.full_name || "Unnamed admin"}</strong>
                          <span>{admin.email || "No email saved"}</span>
                        </div>
                      </td>

                      {/* Editing swaps two cells in place rather than opening a
                          form elsewhere, so the row keeps its context. */}
                      <td>
                        {isEditing ? (
                          <select
                            className="aselect"
                            value={editOffice}
                            onChange={(e) => setEditOffice(e.target.value)}
                            aria-label="Office"
                          >
                            {offices.map((office) => (
                              <option key={office}>{office}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="quiet">{admin.office || "No office"}</span>
                        )}
                      </td>

                      <td>
                        <span className="abadge">
                          {isEditing
                            ? roleLabels[officeToRole[editOffice]] || "Viewer"
                            : roleLabels[admin.role] || admin.role}
                        </span>
                      </td>

                      <td>
                        {isEditing ? (
                          <select
                            className="aselect"
                            value={editSetId}
                            onChange={(e) => setEditSetId(e.target.value)}
                            aria-label="DEC set"
                          >
                            <option value="">No DEC set</option>
                            {sets.map((set) => (
                              <option key={set.id} value={set.id}>
                                {set.set_name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="quiet">{getSetLabel(admin)}</span>
                        )}
                      </td>

                      <td>
                        <span
                          className={
                            admin.is_active
                              ? "abadge abadge--live"
                              : "abadge abadge--off"
                          }
                        >
                          <i />
                          {admin.is_active ? "Active" : "Disabled"}
                        </span>
                      </td>

                      <td>
                        <div className="acell-actions">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="aicon-btn"
                                title="Save"
                                disabled={busy}
                                onClick={() => saveEdit(admin)}
                              >
                                <Save size={14} />
                              </button>
                              <button
                                type="button"
                                className="aicon-btn"
                                title="Cancel"
                                onClick={cancelEdit}
                              >
                                <X size={14} />
                              </button>
                            </>
                          ) : isPresident ? (
                            <span className="abadge">
                              <Lock size={9} />
                              Protected
                            </span>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="aicon-btn"
                                title="Edit office and set"
                                onClick={() => startEdit(admin)}
                              >
                                <Pencil size={14} />
                              </button>

                              {admin.is_active && (
                                <button
                                  type="button"
                                  className="aicon-btn"
                                  title="Send password reset"
                                  disabled={busy}
                                  onClick={() => resetPassword(admin)}
                                >
                                  <KeyRound size={14} />
                                </button>
                              )}

                              <button
                                type="button"
                                className={admin.is_active ? "aicon-btn is-danger" : "aicon-btn"}
                                title={admin.is_active ? "Disable access" : "Restore access"}
                                disabled={busy}
                                onClick={() => toggleStatus(admin)}
                              >
                                {admin.is_active ? (
                                  <UserMinus size={14} />
                                ) : (
                                  <UserCheck size={14} />
                                )}
                              </button>

                              {!admin.is_active && (
                                <button
                                  type="button"
                                  className="aicon-btn is-danger"
                                  title="Remove profile"
                                  disabled={busy}
                                  onClick={() => removeDisabledAdmin(admin)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

export default AdminAdmins;
