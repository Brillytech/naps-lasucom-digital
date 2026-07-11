import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  KeyRound,
  Mail,
  Pencil,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  UserCog,
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

  const [showDisabled, setShowDisabled] = useState(false);
  const [editingId, setEditingId] = useState("");
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

  if (loading) {
    return (
      <main className="admin-dashboard-page">
        <div className="admin-loading-card">Loading admin management...</div>
      </main>
    );
  }

  if (!profile || profile.role !== "president" || !profile.is_active) {
    return (
      <main className="admin-dashboard-page">
        <section className="admin-empty-panel">
          <ShieldCheck size={34} />
          <h3>Access denied</h3>
          <p>Only the President can manage executive admin access.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-dashboard-page">
      <header className="admin-dashboard-header">
        <div>
          <p>President Control</p>
          <h1>Admin Management</h1>
          <span>Invite executives and manage admin access.</span>
        </div>
      </header>

      {successMessage && (
        <div className="request-success">
          <CheckCircle2 size={18} />
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="request-error">
          <AlertCircle size={18} />
          {errorMessage}
        </div>
      )}

      <section className="admin-management-hero">
        <div>
          <UserCog size={24} />
        </div>

        <section>
          <h3>Executive Invite System</h3>
          <p>Invite executives by email. Password setup is handled from the invite link.</p>
        </section>
      </section>

      <section className="admin-admin-stats">
        <article>
          <strong>{activeAdmins.length}</strong>
          <span>Active Admins</span>
        </article>

        <article>
          <strong>{disabledAdmins.length}</strong>
          <span>Disabled</span>
        </article>

        <article>
          <strong>Invite</strong>
          <span>Add Executive</span>
        </article>
      </section>

      <section className="admin-management-card">
        <div className="admin-section-title">
          <h2>Invite Executive</h2>
          <p>Enter executive details and send an admin invite.</p>
        </div>

        <form className="admin-management-form" onSubmit={sendInvite}>
          <div className="request-form-group">
            <label>Full name</label>
            <input
              type="text"
              placeholder="Executive full name"
              value={form.full_name}
              onChange={(e) => updateField("full_name", e.target.value)}
            />
          </div>

          <div className="request-form-group">
            <label>Email address</label>
            <input
              type="email"
              placeholder="executive@email.com"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
            />
          </div>

          <div className="request-form-group">
            <label>Office</label>
            <select
              value={form.office}
              onChange={(e) => updateField("office", e.target.value)}
            >
              {offices.map((office) => (
                <option key={office}>{office}</option>
              ))}
            </select>
          </div>

          <div className="request-form-group">
            <label>DEC set</label>
            <select
              value={form.dec_set_id}
              onChange={(e) => updateField("dec_set_id", e.target.value)}
            >
              <option value="">No DEC set</option>
              {sets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.set_name} {set.academic_session ? `• ${set.academic_session}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-role-preview">
            <span>Role</span>
            <strong>{roleLabels[officeToRole[form.office]] || "Viewer"}</strong>
          </div>

          <button type="submit" disabled={sendingInvite}>
            <Send size={17} />
            {sendingInvite ? "Sending Invite..." : "Send Invite"}
          </button>
        </form>
      </section>

      <section className="admin-management-card final">
        <div className="admin-section-title admin-list-title">
          <div>
            <h2>Active Admins</h2>
            <p>Disabled profiles are hidden from this list.</p>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowDisabled((prev) => !prev);
              setEditingId("");
              setEditOffice("");
              setEditSetId("");
            }}
          >
            {showDisabled ? "Hide Disabled" : `Disabled (${disabledAdmins.length})`}
            <ChevronRight size={15} />
          </button>
        </div>

        {activeAdmins.length > 0 ? (
          <div className="admin-profile-list">
            {activeAdmins.map((admin) => {
              const isEditing = editingId === admin.id;
              const isPresident = admin.role === "president";

              return (
                <article className="admin-profile-card" key={admin.id}>
                  <div className="admin-profile-avatar">
                    <Users size={20} />
                  </div>

                  <section>
                    <div className="admin-profile-main">
                      <h3>{admin.full_name || "Unnamed Admin"}</h3>
                      <small className="active">Active</small>
                    </div>

                    <p>
                      <Mail size={13} />
                      {admin.email || "No email saved"}
                    </p>

                    {!isEditing && (
                      <div className="admin-role-lines">
                        <span>{admin.office || "No office"}</span>
                        <strong>{roleLabels[admin.role] || admin.role}</strong>
                        <em>{getSetLabel(admin)}</em>
                      </div>
                    )}

                    {isEditing && (
                      <div className="admin-edit-box">
                        <label>Change office</label>
                        <select
                          value={editOffice}
                          onChange={(e) => setEditOffice(e.target.value)}
                        >
                          {offices.map((office) => (
                            <option key={office}>{office}</option>
                          ))}
                        </select>

                        <label>DEC set</label>
                        <select
                          value={editSetId}
                          onChange={(e) => setEditSetId(e.target.value)}
                        >
                          <option value="">No DEC set</option>
                          {sets.map((set) => (
                            <option key={set.id} value={set.id}>
                              {set.set_name} {set.academic_session ? `• ${set.academic_session}` : ""}
                            </option>
                          ))}
                        </select>

                        <div className="admin-role-preview compact">
                          <span>Role</span>
                          <strong>
                            {roleLabels[officeToRole[editOffice]] || "Viewer"}
                          </strong>
                        </div>
                      </div>
                    )}

                    <div className="admin-profile-actions">
                      {!isEditing && (
                        <button
                          type="button"
                          className="admin-edit-btn"
                          onClick={() => startEdit(admin)}
                        >
                          <Pencil size={14} />
                          Edit
                        </button>
                      )}

                      {isEditing && (
                        <>
                          <button
                            type="button"
                            className="admin-save-btn"
                            disabled={savingId === admin.id}
                            onClick={() => saveEdit(admin)}
                          >
                            <Save size={14} />
                            Save
                          </button>

                          <button
                            type="button"
                            className="admin-cancel-btn"
                            onClick={cancelEdit}
                          >
                            <X size={14} />
                            Cancel
                          </button>
                        </>
                      )}

                      {!isEditing && !isPresident && (
  <>
    <button
      type="button"
      className="admin-reset-btn"
      disabled={savingId === admin.id}
      onClick={() => resetPassword(admin)}
    >
      <KeyRound size={14} />
      Reset Password
    </button>

    <button
      type="button"
      className="admin-disable-btn"
      disabled={savingId === admin.id}
      onClick={() => toggleStatus(admin)}
    >
      Disable
    </button>
  </>
)}
                      {!isEditing && isPresident && (
                        <button type="button" className="admin-locked-btn" disabled>
                          Protected
                        </button>
                      )}
                    </div>
                  </section>
                </article>
              );
            })}
          </div>
        ) : (
          <section className="admin-empty-panel small">
            <Users size={30} />
            <h3>No active admin</h3>
            <p>Invited executives will appear here after activation.</p>
          </section>
        )}

        {showDisabled && (
          <section className="disabled-admin-panel">
            <div className="disabled-admin-title">
              <h3>Disabled Admins</h3>
              <p>Compact archive for inactive or mistaken admin profiles.</p>
            </div>

            {disabledAdmins.length > 0 ? (
              <div className="disabled-admin-list">
                {disabledAdmins.map((admin) => (
                  <article className="disabled-admin-row" key={admin.id}>
                    <section>
                      <h4>{admin.full_name || "Unnamed Admin"}</h4>
                      <p>{admin.email || "No email saved"}</p>
                      <span>{admin.office || "No office"} • {getSetLabel(admin)}</span>
                    </section>

                    <div>
                      <button
                        type="button"
                        className="admin-activate-btn"
                        disabled={savingId === admin.id}
                        onClick={() => toggleStatus(admin)}
                      >
                        Activate
                      </button>

                      <button
                        type="button"
                        className="admin-remove-btn"
                        disabled={savingId === admin.id}
                        onClick={() => removeDisabledAdmin(admin)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="disabled-admin-empty">No disabled admin profile.</p>
            )}
          </section>
        )}
      </section>
    </main>
  );
}

export default AdminAdmins;
