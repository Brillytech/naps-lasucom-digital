import {
  AlertCircle,
  CheckCircle2,
  Crown,
  Eye,
  EyeOff,
  ImagePlus,
  Layers,
  Plus,
  ShieldCheck,
  Signature,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import SignaturePad from "../../components/SignaturePad";

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

  // The executive whose signature is being drawn, plus whatever they already
  // have saved -- downloaded on open, since the bucket is private.
  const [signatureFor, setSignatureFor] = useState(null);
  const [signaturePreview, setSignaturePreview] = useState(null);
  const [savingSignature, setSavingSignature] = useState(false);
  const [showSetForm, setShowSetForm] = useState(false);
  const [showExecForm, setShowExecForm] = useState(false);
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

  /*
    Signature capture.

    The bucket is private, so an existing signature has to be downloaded
    with the caller's session and turned into a data URL before it can be
    shown -- there is no public URL to point an <img> at.
  */
  async function openSignature(item) {
    setSignatureFor(item);
    setSignaturePreview(null);

    if (!item.signature_path) return;

    const { data } = await supabase.storage
      .from("signatures")
      .download(item.signature_path);

    if (!data) return;

    const reader = new FileReader();
    reader.onload = () => setSignaturePreview(reader.result);
    reader.readAsDataURL(data);
  }

  async function saveSignature(dataUrl) {
    setSavingSignature(true);
    setErrorMessage("");

    try {
      const blob = await (await fetch(dataUrl)).blob();

      // Overwritten in place per executive, so replacing a signature never
      // leaves the previous one sitting in the bucket.
      const path = `${signatureFor.set_id}/${signatureFor.id}.png`;

      const { error: uploadError } = await supabase.storage
        .from("signatures")
        .upload(path, blob, { contentType: "image/png", upsert: true });

      if (uploadError) throw uploadError;

      const { error } = await supabase
        .from("executives")
        .update({ signature_path: path })
        .eq("id", signatureFor.id);

      if (error) throw error;

      setSuccessMessage(`Signature saved for ${signatureFor.full_name}.`);
      setSignatureFor(null);
      await fetchData();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSavingSignature(false);
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
      <main className="admin-page">
        <section className="admin-empty-panel">
          <ShieldCheck size={34} />
          <h3>Access denied</h3>
          <p>Only the President can manage executive sets and profiles.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="apage-head">
        <div>
          <p className="apage-eyebrow">President control</p>
          <h1>Executives</h1>
          <p>DEC sets and the executive profiles students see.</p>
        </div>

        <div className="apage-actions">
          <button
            type="button"
            className="abtn"
            onClick={() => {
              setShowSetForm((v) => !v);
              setShowExecForm(false);
            }}
          >
            <Layers size={14} />
            New DEC set
          </button>

          <button
            type="button"
            className="abtn abtn--primary"
            disabled={!selectedSetId}
            onClick={() => {
              setShowExecForm((v) => !v);
              setShowSetForm(false);
            }}
          >
            <Plus size={14} />
            Add executive
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
        <div className="astat astat--soon">
          <span className="astat-ico"><Users size={16} /></span>
          <span className="astat-body">
            <span className="astat-n">{selectedExecutives.length}</span>
            <span className="astat-l">In this set</span>
          </span>
        </div>

        <div className="astat astat--live">
          <span className="astat-ico"><Eye size={16} /></span>
          <span className="astat-body">
            <span className="astat-n">
              {selectedExecutives.filter((e) => e.is_active).length}
            </span>
            <span className="astat-l">Visible</span>
          </span>
        </div>

        <div className="astat astat--idle">
          <span className="astat-ico"><EyeOff size={16} /></span>
          <span className="astat-body">
            <span className="astat-n">
              {selectedExecutives.filter((e) => !e.is_active).length}
            </span>
            <span className="astat-l">Hidden</span>
          </span>
        </div>

        <div className="astat astat--mark">
          <span className="astat-ico"><Layers size={16} /></span>
          <span className="astat-body">
            <span className="astat-n">{sets.length}</span>
            <span className="astat-l">DEC sets</span>
          </span>
        </div>
      </div>

      {showSetForm && (
        <section className="apanel">
          <div className="apanel-head">
            <div>
              <h2>New DEC set</h2>
              <p>The name is built from the number: 1st NAPS-LASUCOM DEC.</p>
            </div>
          </div>

          <form className="apanel-body aform-grid" onSubmit={createSet}>
            <div className="afield">
              <label htmlFor="s-num">Set number</label>
              <input
                id="s-num"
                type="number"
                min="1"
                placeholder="1"
                value={setForm.set_number}
                onChange={(e) =>
                  setSetForm((prev) => ({ ...prev, set_number: e.target.value }))
                }
              />
            </div>

            <div className="afield">
              <label htmlFor="s-session">Academic session</label>
              <input
                id="s-session"
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

            <div className="aform-foot">
              <span className="aform-note">
                Will be named
                <strong>
                  {setForm.set_number
                    ? `${getOrdinal(setForm.set_number)} NAPS-LASUCOM DEC`
                    : "—"}
                </strong>
              </span>

              <button
                type="submit"
                className="abtn abtn--primary"
                disabled={savingSet}
              >
                <Plus size={14} />
                {savingSet ? "Creating…" : "Create set"}
              </button>
            </div>
          </form>
        </section>
      )}

      {showExecForm && (
        <section className="apanel">
          <div className="apanel-head">
            <div>
              <h2>Add executive</h2>
              <p>{selectedSet ? `Into ${selectedSet.set_name}` : "Select a set first."}</p>
            </div>
          </div>

          <form className="apanel-body aform-grid" onSubmit={addExecutive}>
            <div className="afield">
              <label htmlFor="e-name">Full name</label>
              <input
                id="e-name"
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

            <div className="afield">
              <label htmlFor="e-office">Office</label>
              <select
                id="e-office"
                value={executiveForm.office}
                onChange={(e) =>
                  setExecutiveForm((prev) => ({ ...prev, office: e.target.value }))
                }
              >
                {offices.map((office) => (
                  <option key={office}>{office}</option>
                ))}
              </select>
            </div>

            <div className="afield">
              <label htmlFor="e-phone">Phone</label>
              <input
                id="e-phone"
                type="tel"
                placeholder="Phone or WhatsApp"
                value={executiveForm.phone}
                onChange={(e) =>
                  setExecutiveForm((prev) => ({ ...prev, phone: e.target.value }))
                }
              />
            </div>

            <div className="afield">
              <label htmlFor="e-order">Display order</label>
              <input
                id="e-order"
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

            <label className="adrop">
              <ImagePlus size={16} />
              <span>
                {executiveForm.image
                  ? executiveForm.image.name
                  : "Choose a portrait"}
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

            <div className="aform-foot">
              <span className="aform-note">Shown on the public Executives page.</span>

              <button
                type="submit"
                className="abtn abtn--primary"
                disabled={savingExecutive}
              >
                <Upload size={14} />
                {savingExecutive ? "Uploading…" : "Add executive"}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Sets were a list of large cards taking a full section. As chips they
          are the filter they always were, above the roster they filter. */}
      <div className="achips">
        {sets.map((item) => (
          <button
            type="button"
            key={item.id}
            className={selectedSetId === item.id ? "achip-f is-on" : "achip-f"}
            onClick={() => setSelectedSetId(item.id)}
          >
            {item.set_name}
            {item.is_current && <em>current</em>}
          </button>
        ))}

        {selectedSet && !selectedSet.is_current && (
          <button
            type="button"
            className="achip-f"
            onClick={() => markCurrentSet(selectedSet.id)}
          >
            <Crown size={12} />
            Make current
          </button>
        )}
      </div>

      {/* A roster, not a table: the portrait is the point on a page whose
         output is the public Executives page. */}
      {selectedExecutives.length === 0 ? (
        <div className="atable-wrap">
          <div className="aempty-row">
            <Users size={26} />
            <strong>{sets.length ? "No executives in this set" : "No DEC set yet"}</strong>
            <span>
              {sets.length
                ? "Add executives and they appear on the public page."
                : "Create the first NAPS-LASUCOM DEC set to begin."}
            </span>
          </div>
        </div>
      ) : (
        <div className="aroster">
          {selectedExecutives.map((item) => (
            <article className="aroster-card" key={item.id}>
              <img src={item.image_url} alt="" />

              <div className="aroster-body">
                <strong>{item.full_name}</strong>
                <span>{item.office}</span>

                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <span
                    className={
                      item.is_active ? "abadge abadge--live" : "abadge abadge--draft"
                    }
                  >
                    <i />
                    {item.is_active ? "Visible" : "Hidden"}
                  </span>

                  {item.signature_path && (
                    <span className="abadge abadge--soon">
                      <Signature size={9} />
                      Signed
                    </span>
                  )}
                </div>
              </div>

              <div className="aroster-actions">
                <button
                  type="button"
                  className={item.signature_path ? "aicon-btn is-set" : "aicon-btn"}
                  title={
                    item.signature_path
                      ? "Replace signature"
                      : "Add a signature"
                  }
                  onClick={() => openSignature(item)}
                >
                  <Signature size={14} />
                </button>

                <button
                  type="button"
                  className="aicon-btn"
                  title={item.is_active ? "Hide from students" : "Show to students"}
                  onClick={() => toggleExecutiveStatus(item)}
                >
                  {item.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>

                <button
                  type="button"
                  className="aicon-btn is-danger"
                  title="Remove"
                  onClick={() => deleteExecutive(item)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {signatureFor && (
        <SignaturePad
          name={signatureFor.full_name}
          existing={signaturePreview}
          saving={savingSignature}
          onCancel={() => setSignatureFor(null)}
          onSave={saveSignature}
        />
      )}
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