import {
  AlertCircle,
  CheckCircle2,
  FileText,
  MessageCircle,
  Send,
  ShieldCheck,
  User,
} from "lucide-react";
import { useState } from "react";
import { supabase } from "../lib/supabase";

const requestCategories = [
  "Academic",
  "Welfare",
  "Complaint",
  "Suggestion",
  "Event",
  "Sports",
  "Finance / Dues",
  "Other",
];

function Requests() {
  const [requestType, setRequestType] = useState("normal");

  const [form, setForm] = useState({
    full_name: "",
    level: "",
    matric_no: "",
    phone: "",
    category: "Academic",
    message: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function updateField(name, value) {
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function resetForm() {
    setForm({
      full_name: "",
      level: "",
      matric_no: "",
      phone: "",
      category: "Academic",
      message: "",
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();

    setSubmitting(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const isAnonymous = requestType === "anonymous";

      if (!isAnonymous && !form.full_name.trim()) {
        throw new Error("Please enter your full name.");
      }

      if (!form.category) {
        throw new Error("Please select a category.");
      }

      if (!form.message.trim()) {
        throw new Error("Please enter your request.");
      }

      const assignedOffice = getAssignedOffice(form.category);

      const payload = {
        request_type: isAnonymous ? "anonymous" : "identified",
        full_name: isAnonymous ? null : form.full_name.trim(),
        level: isAnonymous ? null : form.level || null,
        matric_no: isAnonymous ? null : form.matric_no.trim() || null,
        phone: isAnonymous ? null : form.phone.trim() || null,
        category: form.category,
        message: form.message.trim(),
        assigned_office: assignedOffice,
        is_anonymous: isAnonymous,
        status: "pending",
      };

      const { error } = await supabase.from("requests").insert(payload);

      if (error) throw error;

      setSuccessMessage("Your request has been submitted successfully.");
      resetForm();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="page-header requests-header">
        <p>NAPSITES Support</p>
        <h1>Requests</h1>
        <span>
          Submit academic, welfare, complaint, event, sports or finance-related
          requests.
        </span>
      </section>

      <section className="request-type-switch">
        <button
          type="button"
          className={requestType === "normal" ? "active" : ""}
          onClick={() => {
            setRequestType("normal");
            setSuccessMessage("");
            setErrorMessage("");
          }}
        >
          <User size={17} />
          Normal
        </button>

        <button
          type="button"
          className={requestType === "anonymous" ? "active" : ""}
          onClick={() => {
            setRequestType("anonymous");
            setSuccessMessage("");
            setErrorMessage("");
          }}
        >
          <ShieldCheck size={17} />
          Anonymous
        </button>
      </section>

      <section className="request-info-card">
        <div>
          <MessageCircle size={22} />
        </div>

        <section>
          <h3>
            {requestType === "anonymous"
              ? "Anonymous Request"
              : "Normal Request"}
          </h3>

          <p>
            {requestType === "anonymous"
              ? "Your name and contact details will not be submitted."
              : "Add your details so you can be contacted if follow-up is needed."}
          </p>
        </section>
      </section>

      <form className="request-form" onSubmit={handleSubmit}>
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

        {requestType === "normal" && (
          <section className="request-form-block">
            <div className="request-form-title">
              <span>1</span>
              <h3>Your details</h3>
            </div>

            <div className="request-form-group">
              <label>Full name</label>
              <input
                type="text"
                placeholder="Enter your full name"
                value={form.full_name}
                onChange={(e) => updateField("full_name", e.target.value)}
              />
            </div>

            <div className="request-form-row">
              <div className="request-form-group">
                <label>Level</label>
                <select
                  value={form.level}
                  onChange={(e) => updateField("level", e.target.value)}
                >
                  <option value="">Select level</option>
                  <option>200L</option>
                  <option>300L</option>
                  <option>400L</option>
                  <option>500L</option>
                  <option>600L</option>
                </select>
              </div>

              <div className="request-form-group">
                <label>Matric No. optional</label>
                <input
                  type="text"
                  placeholder="Matric number"
                  value={form.matric_no}
                  onChange={(e) => updateField("matric_no", e.target.value)}
                />
              </div>
            </div>

            <div className="request-form-group">
              <label>Phone / WhatsApp optional</label>
              <input
                type="tel"
                placeholder="Phone or WhatsApp number"
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
              />
            </div>
          </section>
        )}

        <section className="request-form-block">
          <div className="request-form-title">
            <span>{requestType === "normal" ? "2" : "1"}</span>
            <h3>Request category</h3>
          </div>

          <div className="request-category-grid">
            {requestCategories.map((item) => (
              <button
                type="button"
                key={item}
                className={form.category === item ? "active" : ""}
                onClick={() => updateField("category", item)}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        <section className="request-form-block">
          <div className="request-form-title">
            <span>{requestType === "normal" ? "3" : "2"}</span>
            <h3>Your message</h3>
          </div>

          <div className="request-form-group">
            <label>Request details</label>
            <textarea
              placeholder="Type your request here..."
              value={form.message}
              onChange={(e) => updateField("message", e.target.value)}
            />
          </div>
        </section>

        <section className="request-preview-card">
          <FileText size={20} />
          <div>
            <h3>{form.category}</h3>
            <p>Your request will be reviewed by the appropriate NAPS executive.</p>
          </div>
        </section>

        <button
          className="request-submit-btn"
          type="submit"
          disabled={submitting}
        >
          <Send size={18} />
          {submitting ? "Submitting..." : "Submit Request"}
        </button>
      </form>
    </>
  );
}

function getAssignedOffice(category) {
  const map = {
    Academic: "GS, AGS & Vice President",
    Welfare: "Welfare Director",
    Complaint: "President",
    Suggestion: "President & Welfare Director",
    Event: "Social Director",
    Sports: "Sports Director",
    "Finance / Dues": "Financial Secretary & Treasurer",
    Other: "President",
  };

  return map[category] || "President";
}

export default Requests;