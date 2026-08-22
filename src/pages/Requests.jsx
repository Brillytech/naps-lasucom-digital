import {
  Hash,
  Phone,
  AlertCircle,
  CheckCircle2,
  FileText,
  Send,
  ShieldCheck,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

const levels = ["200L", "300L", "400L", "500L", "600L"];
const MESSAGE_LIMIT = 1200;

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
  const [searchParams] = useSearchParams();
  const [requestType, setRequestType] = useState("normal");

  const [form, setForm] = useState({
    full_name: "",
    level: "",
    matric_no: "",
    phone: "",
    category: "Academic",
    message: "",
  });

  useEffect(() => {
    const prefilledCategory = searchParams.get("category");
    const prefilledMessage = searchParams.get("message");

    if (prefilledCategory || prefilledMessage) {
      setForm((prev) => ({
        ...prev,
        category: prefilledCategory || prev.category,
        message: prefilledMessage || prev.message,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <header className="rl-head tone-green">
        <div className="rl-head-top">
          <p className="rl-eyebrow">NAPSITES support</p>
        </div>

        <h1>Requests</h1>

        <p className="rl-meta">
          Academic, welfare, complaints, events, sports and finance.
        </p>
      </header>

      <div className="rq-switch" role="group" aria-label="Request type">
        <button
          type="button"
          className={requestType === "normal" ? "is-on" : ""}
          aria-pressed={requestType === "normal"}
          onClick={() => {
            setRequestType("normal");
            setSuccessMessage("");
            setErrorMessage("");
          }}
        >
          <User size={16} />
          Normal
        </button>

        <button
          type="button"
          className={requestType === "anonymous" ? "is-on" : ""}
          aria-pressed={requestType === "anonymous"}
          onClick={() => {
            setRequestType("anonymous");
            setSuccessMessage("");
            setErrorMessage("");
          }}
        >
          <ShieldCheck size={16} />
          Anonymous
        </button>
      </div>

      <p className="rq-switch-note">
        {requestType === "anonymous" ? (
          <>
            <ShieldCheck size={15} />
            Your name and contact details are not submitted. Nobody can reply
            to you directly.
          </>
        ) : (
          <>
            <User size={15} />
            Your details are attached so an executive can follow up with you.
          </>
        )}
      </p>

      <form className="rq-form" onSubmit={handleSubmit}>
        {successMessage && (
          <div className="rq-note is-ok" role="status">
            <CheckCircle2 size={17} />
            {successMessage}
          </div>
        )}

        {errorMessage && (
          <div className="rq-note is-bad" role="alert">
            <AlertCircle size={17} />
            {errorMessage}
          </div>
        )}

        {requestType === "normal" && (
          <>
            <div className="sec-head">
              <h3>Your details</h3>
            </div>

            <div className="rq-fields">
              <div className="rq-field">
                <label htmlFor="rq-name">Full name</label>
                <div className="rq-input">
                  <User size={15} />
                  <input
                    id="rq-name"
                    type="text"
                    placeholder="Enter your full name"
                    value={form.full_name}
                    onChange={(e) => updateField("full_name", e.target.value)}
                  />
                </div>
              </div>

              <div className="rq-field">
                <label>Level</label>
                <div className="rq-levels" role="group" aria-label="Level">
                  {levels.map((item) => (
                    <button
                      type="button"
                      key={item}
                      className={
                        form.level === item
                          ? "rq-chip rq-chip--sm is-on"
                          : "rq-chip rq-chip--sm"
                      }
                      aria-pressed={form.level === item}
                      onClick={() =>
                        updateField("level", form.level === item ? "" : item)
                      }
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rq-row">
                <div className="rq-field">
                  <label htmlFor="rq-matric">
                    Matric <em>optional</em>
                  </label>
                  <div className="rq-input">
                    <Hash size={15} />
                    <input
                      id="rq-matric"
                      type="text"
                      placeholder="Matric number"
                      value={form.matric_no}
                      onChange={(e) => updateField("matric_no", e.target.value)}
                    />
                  </div>
                </div>

                <div className="rq-field">
                  <label htmlFor="rq-phone">
                    Phone <em>optional</em>
                  </label>
                  <div className="rq-input">
                    <Phone size={15} />
                    <input
                      id="rq-phone"
                      type="tel"
                      placeholder="WhatsApp number"
                      value={form.phone}
                      onChange={(e) => updateField("phone", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="sec-head">
          <h3>Category</h3>
        </div>

        <div className="rq-chips">
          {requestCategories.map((item) => (
            <button
              type="button"
              key={item}
              className={form.category === item ? "rq-chip is-on" : "rq-chip"}
              aria-pressed={form.category === item}
              onClick={() => updateField("category", item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="sec-head">
          <h3>Your message</h3>
        </div>

        <div className="rq-field">
          <label htmlFor="rq-message">Request details</label>
          <textarea
            id="rq-message"
            maxLength={MESSAGE_LIMIT}
            placeholder="Describe your request. The more detail you give, the faster it can be handled."
            value={form.message}
            onChange={(e) => updateField("message", e.target.value)}
          />
          <span
            className={
              form.message.length > MESSAGE_LIMIT - 100
                ? "rq-count is-over"
                : "rq-count"
            }
          >
            {form.message.length} / {MESSAGE_LIMIT}
          </span>
        </div>

        <div className="rq-route">
          <span className="ico ico-sm ico--tint tone-blue">
            <FileText size={18} />
          </span>

          <span>
            <span className="rq-route-label">Goes to</span>
            <span className="rq-route-office">
              {getAssignedOffice(form.category)}
            </span>
          </span>
        </div>

        <button className="rq-submit" type="submit" disabled={submitting}>
          <Send size={17} />
          {submitting ? "Submitting..." : "Submit request"}
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