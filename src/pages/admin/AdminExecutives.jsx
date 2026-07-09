import {
  AlertCircle,
  CheckCircle2,
  Crown,
  ImagePlus,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
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
];

function AdminExecutives() {
  const [profile, setProfile] = useState(null);
  const [sets, setSets] = useState([]);
  const [executives, setExecutives] = useState([]);

  const [selectedSetId, setSelectedSetId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingSet, setSavingSet] = useState(false);
  const [savingExecutive, setSavingExecutive] = useState(false);

  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [setForm, setSetForm] = useState({
    set_number: "",
    academic_session: "",
  });

  const [executiveForm, setExecutiveForm] = useState({
    full_name: "",
    office: "President",
    phone: "",
    display_order: "",
    image: null,
  });

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
      setErrorMessage("You must be logged in to access this page.");
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

    if (profileData.role !== "president") {
      setLoading(false);
      return;
    }

    await fetchData();
    setLoading(false);
  }

  async function fetchData() {
    const [setsResult, executivesResult] = await Promise.all([
      supabase
        .from("executive_sets")
        .select("*")
        .order("set_number", { ascending: false }),

      supabase
        .from("executives")
        .select("*")
        .order("display_order", { ascending: true }),
    ]);

    if (setsResult.error) {
      setErrorMessage(setsResult.error.message);
      return;
    }

    if (executivesResult.error) {
      setErrorMessage(executivesResult.error.message);
      return;
    }

    const allSets = setsResult.data || [];
    const allExecutives = executivesResult.data || [];

    setSets(allSets);
    setExecutives(allExecutives);

    const currentSet = allSets.find((item) => item.is_current);
    const firstSet = allSets[0];

    setSelectedSetId((prev) => prev || currentSet?.id || firstSet?.id || "");
  }

  async function createSet(e) {
    e.preventDefault();

    setSavingSet(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      if (!setForm.set_number) {
        throw new Error("Enter DEC set number.");
      }

      if (!setForm.academic_session.trim()) {
        throw new Error("Enter academic session.");
      }

      const setNumber = Number(setForm.set_number);

      if (!setNumber || setNumber < 1) {
        throw new Error("Set number must be valid.");
      }

      const setName = `${getOrdinal(setNumber)} NAPS-LASUCOM DEC`;

      const { error } = await supabase.from("executive_sets").insert({
        set_number: setNumber,
        set_name: setName,
        academic_session: setForm.academic_session.trim(),
        is_current: sets.length === 0,
      });

      if (error) throw error;

      setSuccessMessage("Executive set created successfully.");

      setSetForm({
        set_number: "",
        academic_session: "",
      });

      await fetchData();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSavingSet(false);
    }
  }

  async function markCurrentSet(setId) {
    setSuccessMessage("");
    setErrorMessage("");

    const firstUpdate = await supabase
      .from("executive_sets")
      .update({ is_current: false })
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (firstUpdate.error) {
      setErrorMessage(firstUpdate.error.message);
      return;
    }

    const secondUpdate = await supabase
      .from("executive_sets")
      .update({ is_current: true })
      .eq("id", setId);

    if (secondUpdate.error) {
      setErrorMessage(secondUpdate.error.message);
      return;
    }

    setSuccessMessage("Current DEC set updated.");
    await fetchData();
  }

  async function addExecutive(e) {
    e.preventDefault();

    setSavingExecutive(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      if (!selectedSetId) {
        throw new Error("Create or select a DEC set first.");
      }

      if (!executiveForm.full_name.trim()) {
        throw new Error("Enter executive full name.");
      }

      if (!executiveForm.office) {
        throw new Error("Select office.");
      }

      if (!executiveForm.image) {
        throw new Error("Upload executive image.");
      }

      const imageUrl = await uploadExecutiveImage(
        executiveForm.image,
        selectedSetId,
        executiveForm.office
      );

      const executiveName = executiveForm.full_name.trim();

const { error } = await supabase.from("executives").insert({
  name: executiveName,
  full_name: executiveName,
  set_id: selectedSetId,
  office: executiveForm.office,
  phone: executiveForm.phone.trim() || null,
  image_url: imageUrl,
  display_order:
    executiveForm.display_order === ""
      ? offices.indexOf(executiveForm.office) + 1
      : Number(executiveForm.display_order),
  is_active: true,
});

      if (error) throw error;

      setSuccessMessage("Executive added successfully.");

      setExecutiveForm({
        full_name: "",
        office: "President",
        phone: "",
        display_order: "",
        image: null,
      });

      await fetchData();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSavingExecutive(false);
    }
  }

  async function uploadExecutiveImage(file, setId, office) {
    const fileExt = file.name.split(".").pop();
    const cleanOffice = office.toLowerCase().replaceAll(" ", "-");
    const fileName = `${setId}/${cleanOffice}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("executive-images")
      .upload(fileName, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from("executive-images")
      .getPublicUrl(fileName);

    return data.publicUrl;
  }

  async function toggleExecutiveStatus(item) {
    const { error } = await supabase
      .from("executives")
      .update({ is_active: !item.is_active })
      .eq("id", item.id);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await fetchData();
  }

  async function deleteExecutive(item) {
    const confirmDelete = window.confirm(
      `Delete ${item.full_name} from this executive set?`
    );

    if (!confirmDelete) return;

    const { error } = await supabase
      .from("executives")
      .delete()
      .eq("id", item.id);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccessMessage("Executive deleted.");
    await fetchData();
  }

  const selectedSet = useMemo(() => {
    return sets.find((item) => item.id === selectedSetId);
  }, [sets, selectedSetId]);

  const selectedExecutives = useMemo(() => {
    return executives.filter((item) => item.set_id === selectedSetId);
  }, [executives, selectedSetId]);

  if (loading) {
    return (
      <main className="admin-dashboard-page">
        <div className="admin-loading-card">Loading executives...</div>
      </main>
    );
  }

  if (!profile || profile.role !== "president") {
    return (
      <main className="admin-dashboard-page">
        <section className="admin-empty-panel">
          <ShieldCheck size={34} />
          <h3>Access denied</h3>
          <p>Only the President can manage executive sets and profiles.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-dashboard-page">
      <header className="admin-dashboard-header">
        <div>
          <p>President Control</p>
          <h1>Executives</h1>
          <span>Create DEC sets and manage public executive profiles.</span>
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

      <section className="executive-admin-hero">
        <div>
          <Crown size={23} />
        </div>

        <section>
          <h3>President Access</h3>
          <p>Only the President can create DEC sets and update executives.</p>
        </section>
      </section>

      <section className="executive-admin-card">
        <div className="admin-section-title">
          <h2>Create DEC Set</h2>
          <p>Example: 1st NAPS-LASUCOM DEC, 2026/2027 session.</p>
        </div>

        <form className="executive-admin-form" onSubmit={createSet}>
          <div className="request-form-row">
            <div className="request-form-group">
              <label>DEC set number</label>
              <input
                type="number"
                min="1"
                placeholder="1"
                value={setForm.set_number}
                onChange={(e) =>
                  setSetForm((prev) => ({
                    ...prev,
                    set_number: e.target.value,
                  }))
                }
              />
            </div>

            <div className="request-form-group">
              <label>Academic session</label>
              <input
                type="text"
                placeholder="2026/2027"
                value={setForm.academic_session}
                onChange={(e) =>
                  setSetForm((prev) => ({
                    ...prev,
                    academic_session: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          <button type="submit" disabled={savingSet}>
            <Plus size={17} />
            {savingSet ? "Creating..." : "Create Set"}
          </button>
        </form>
      </section>

      <section className="executive-admin-card">
        <div className="admin-section-title">
          <h2>DEC Sets</h2>
          <p>Select the set you want to manage.</p>
        </div>

        {sets.length > 0 ? (
          <div className="executive-set-list">
            {sets.map((item) => (
              <button
                type="button"
                key={item.id}
                className={
                  selectedSetId === item.id
                    ? "executive-set-card active"
                    : "executive-set-card"
                }
                onClick={() => setSelectedSetId(item.id)}
              >
                <section>
                  <h3>{item.set_name}</h3>
                  <p>{item.academic_session || "No session added"}</p>
                </section>

                <div>
                  {item.is_current && <span>Current</span>}

                  {!item.is_current && (
                    <small
                      onClick={(e) => {
                        e.stopPropagation();
                        markCurrentSet(item.id);
                      }}
                    >
                      Make current
                    </small>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <section className="admin-empty-panel small">
            <Users size={28} />
            <h3>No DEC set yet</h3>
            <p>Create the first NAPS-LASUCOM DEC set.</p>
          </section>
        )}
      </section>

      <section className="executive-admin-card">
        <div className="admin-section-title">
          <h2>Add Executive</h2>
          <p>
            {selectedSet
              ? `Adding to ${selectedSet.set_name}`
              : "Select a DEC set first."}
          </p>
        </div>

        <form className="executive-admin-form" onSubmit={addExecutive}>
          <div className="request-form-group">
            <label>Full name</label>
            <input
              type="text"
              placeholder="Executive full name"
              value={executiveForm.full_name}
              onChange={(e) =>
                setExecutiveForm((prev) => ({
                  ...prev,
                  full_name: e.target.value,
                }))
              }
            />
          </div>

          <div className="request-form-row">
            <div className="request-form-group">
              <label>Office</label>
              <select
                value={executiveForm.office}
                onChange={(e) =>
                  setExecutiveForm((prev) => ({
                    ...prev,
                    office: e.target.value,
                  }))
                }
              >
                {offices.map((office) => (
                  <option key={office}>{office}</option>
                ))}
              </select>
            </div>

            <div className="request-form-group">
              <label>Display order optional</label>
              <input
                type="number"
                min="1"
                placeholder="Auto"
                value={executiveForm.display_order}
                onChange={(e) =>
                  setExecutiveForm((prev) => ({
                    ...prev,
                    display_order: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="request-form-group">
            <label>Phone optional</label>
            <input
              type="tel"
              placeholder="Phone or WhatsApp number"
              value={executiveForm.phone}
              onChange={(e) =>
                setExecutiveForm((prev) => ({
                  ...prev,
                  phone: e.target.value,
                }))
              }
            />
          </div>

          <label className="executive-image-upload">
            <ImagePlus size={21} />
            <span>
              {executiveForm.image
                ? executiveForm.image.name
                : "Upload executive image"}
            </span>

            <input
              type="file"
              accept="image/*"
              onChange={(e) =>
                setExecutiveForm((prev) => ({
                  ...prev,
                  image: e.target.files?.[0] || null,
                }))
              }
            />
          </label>

          <button type="submit" disabled={savingExecutive}>
            <Upload size={17} />
            {savingExecutive ? "Uploading..." : "Add Executive"}
          </button>
        </form>
      </section>

      <section className="executive-admin-card final">
        <div className="admin-section-title">
          <h2>{selectedSet?.set_name || "Executives"}</h2>
          <p>{selectedSet?.academic_session || "No set selected"}</p>
        </div>

        {selectedExecutives.length > 0 ? (
          <div className="admin-executive-list">
            {selectedExecutives.map((item) => (
              <article className="admin-executive-card" key={item.id}>
                <img src={item.image_url} alt={item.full_name} />

                <section>
                  <h3>{item.full_name}</h3>
                  <p>{item.office}</p>
                  <small>{item.is_active ? "Visible" : "Hidden"}</small>
                </section>

                <div>
                  <button type="button" onClick={() => toggleExecutiveStatus(item)}>
                    <RefreshCw size={15} />
                  </button>

                  <button type="button" onClick={() => deleteExecutive(item)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <section className="admin-empty-panel small">
            <Users size={28} />
            <h3>No executive added</h3>
            <p>Add executives under this DEC set.</p>
          </section>
        )}
      </section>
    </main>
  );
}

function getOrdinal(number) {
  const value = Number(number);

  if (value % 100 >= 11 && value % 100 <= 13) {
    return `${value}th`;
  }

  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

export default AdminExecutives;