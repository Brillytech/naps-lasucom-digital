import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  EyeOff,
  Inbox,
  MessageCircle,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const categories = [
  "Academic",
  "Welfare",
  "Complaint",
  "Suggestion",
  "Event",
  "Sports",
  "Finance / Dues",
  "Other",
];

const statuses = [
  { label: "All", value: "all" },
  { label: "New", value: "pending" },
  { label: "In Review", value: "in_progress" },
  { label: "Resolved", value: "resolved" },
];

function AdminRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedCategory, setSelectedCategory] = useState("");
  const [status, setStatus] = useState("all");
  const [hideResolved, setHideResolved] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    fetchRequests();
  }, []);

  async function fetchRequests() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMessage(error.message);
      setRequests([]);
    } else {
      setRequests(data || []);
    }

    setLoading(false);
  }

  async function updateStatus(requestId, newStatus) {
    setActionLoading(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("requests")
      .update({ status: newStatus })
      .eq("id", requestId);

    if (error) {
      setErrorMessage(error.message);
      setActionLoading(false);
      return;
    }

    await fetchRequests();
    setActionLoading(false);
  }

  async function deleteRequest(requestId) {
    const confirmed = window.confirm(
      "Delete this request permanently? This cannot be undone."
    );

    if (!confirmed) return;

    setActionLoading(true);
    setErrorMessage("");

    // Chaining .select() lets us see which rows Supabase actually deleted.
    // Without it, a missing DELETE policy in Row Level Security silently
    // matches zero rows and still reports success — this catches that.
    const { data, error } = await supabase
      .from("requests")
      .delete()
      .eq("id", requestId)
      .select();

    if (error) {
      setErrorMessage(error.message);
      setActionLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setErrorMessage(
        "Delete didn't go through. This usually means your admin account doesn't have a DELETE policy on the requests table in Supabase (Row Level Security) — check Supabase → Authentication → Policies."
      );
      setActionLoading(false);
      return;
    }

    if (selectedId === requestId) setSelectedId(null);

    await fetchRequests();
    setActionLoading(false);
  }

  const stats = useMemo(() => {
    return {
      total: requests.length,
      newRequests: requests.filter(
        (item) => (item.status || "pending") === "pending"
      ).length,
      inProgress: requests.filter((item) => item.status === "in_progress")
        .length,
      resolved: requests.filter((item) => item.status === "resolved").length,
    };
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return requests.filter((item) => {
      const itemCategory = getCategory(item);
      const itemStatus = item.status || "pending";

      // No category chosen now means "all", not "none". The old board
      // required picking one before anything was listed.
      const matchesCategory =
        !selectedCategory || itemCategory === selectedCategory;
      const matchesStatus = status === "all" || itemStatus === status;

      // "Hide resolved" only applies while browsing the "All" tab —
      // explicitly tapping the "Resolved" tab always shows them.
      const matchesResolvedVisibility =
        status !== "all" || !hideResolved || itemStatus !== "resolved";

      const searchableText = [
        item.full_name,
        item.name,
        item.level,
        item.matric_no,
        item.phone,
        item.whatsapp,
        itemCategory,
        item.message,
        item.request,
        item.subject,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !term || searchableText.includes(term);

      return (
        matchesCategory &&
        matchesStatus &&
        matchesResolvedVisibility &&
        matchesSearch
      );
    });
  }, [requests, selectedCategory, status, hideResolved, searchTerm]);

  const selected = useMemo(
    () => requests.find((item) => item.id === selectedId) || null,
    [requests, selectedId]
  );

  const statusCounts = {
    all: stats.total,
    pending: stats.newRequests,
    in_progress: stats.inProgress,
    resolved: stats.resolved,
  };

  return (
    <main className="admin-page">
      <header className="apage-head">
        <div>
          <p className="apage-eyebrow">Secretariat</p>
          <h1>Requests</h1>
          <p>
            {stats.newRequests > 0
              ? `${stats.newRequests} waiting · ${stats.inProgress} in review`
              : `Nothing waiting · ${stats.inProgress} in review`}
          </p>
        </div>

        <div className="apage-actions">
          <button type="button" className="abtn" onClick={fetchRequests}>
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </header>

      {errorMessage && (
        <div className="rq-note is-bad" style={{ marginTop: 16 }}>
          <AlertCircle size={16} />
          {errorMessage}
        </div>
      )}

      {/* Counts double as filters, so the number and the action are the
          same control rather than two competing ones. */}
      <div className="ametrics">
        {[
          ["all", "Total", stats.total, null],
          ["pending", "New", stats.newRequests, "Needs attention"],
          ["in_progress", "In review", stats.inProgress, null],
          ["resolved", "Resolved", stats.resolved, null],
        ].map(([value, label, count, note]) => (
          <button
            type="button"
            key={value}
            className="ametric"
            onClick={() => {
              setStatus(value);
              setSelectedId(null);
            }}
            style={{ textAlign: "left", border: 0, cursor: "pointer", font: "inherit" }}
          >
            <span className="ametric-label">{label}</span>
            <strong className="ametric-value">{count}</strong>
            <span
              className={
                note && count > 0 ? "ametric-note is-alert" : "ametric-note"
              }
            >
              {note && count > 0 ? note : status === value ? "Filtering by this" : " "}
            </span>
          </button>
        ))}
      </div>

      <section className={selectedId ? "ainbox is-reading" : "ainbox"}>
        <div className="ainbox-bar">
          <div className="ainbox-search">
            <Search size={15} />
            <input
              placeholder="Search name, level, matric or message..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="ainbox-filters">
            {statuses.map((item) => (
              <button
                type="button"
                key={item.value}
                className={status === item.value ? "active" : ""}
                onClick={() => {
                  setStatus(item.value);
                  setSelectedId(null);
                }}
              >
                {item.label}
                <span className="count">{statusCounts[item.value] ?? 0}</span>
              </button>
            ))}
          </div>

          <select
            className="ainbox-select"
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setSelectedId(null);
            }}
          >
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <label className="hide-resolved-toggle">
            <input
              type="checkbox"
              checked={hideResolved}
              onChange={(e) => setHideResolved(e.target.checked)}
            />
            <EyeOff size={13} />
            Hide resolved
          </label>
        </div>

        <div className="ainbox-split">
          <div className="ainbox-list">
            {loading ? (
              [0, 1, 2, 3, 4].map((n) => (
                <div className="ainbox-row" key={n}>
                  <span />
                  <span>
                    <span className="askel" style={{ width: "58%", height: 12 }} />
                    <span
                      className="askel"
                      style={{ width: "88%", height: 10, marginTop: 8 }}
                    />
                  </span>
                </div>
              ))
            ) : filteredRequests.length === 0 ? (
              <div className="aempty">
                <span className="ico ico-md ico--tint tone-blue">
                  <Inbox size={22} />
                </span>
                <h3>Nothing here</h3>
                <p>
                  {searchTerm || selectedCategory || status !== "all"
                    ? "No request matches these filters."
                    : "No requests have been submitted yet."}
                </p>
              </div>
            ) : (
              filteredRequests.map((item) => {
                const itemStatus = item.status || "pending";
                const isAnon = item.is_anonymous || item.request_type === "anonymous";

                return (
                  <button
                    type="button"
                    key={item.id}
                    className={[
                      "ainbox-row",
                      itemStatus === "pending" && "is-unread",
                      selectedId === item.id && "is-active",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span className="ainbox-dot" />

                    <span>
                      <span className="ainbox-row-top">
                        <strong>
                          {isAnon
                            ? "Anonymous"
                            : item.full_name || item.name || "No name"}
                        </strong>
                        <span className="ainbox-row-time">
                          {formatWhen(item.created_at)}
                        </span>
                      </span>

                      <p>{getMessage(item)}</p>

                      <span className="ainbox-row-meta">
                        <span className={`apill apill--${pillFor(itemStatus)}`}>
                          {formatStatus(itemStatus)}
                        </span>
                        <span className="ainbox-tag">{getCategory(item)}</span>
                        {item.level && <span className="ainbox-tag">{item.level}</span>}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="ainbox-detail">
            {!selected ? (
              <div className="aempty">
                <span className="ico ico-md ico--tint tone-blue">
                  <MessageCircle size={22} />
                </span>
                <h3>Select a request</h3>
                <p>Pick one from the list to read it in full and act on it.</p>
              </div>
            ) : (
              <div className="ainbox-detail-inner">
                <button
                  type="button"
                  className="ainbox-back"
                  onClick={() => setSelectedId(null)}
                >
                  <ChevronRight size={14} style={{ transform: "rotate(180deg)" }} />
                  Back to list
                </button>

                <h2>
                  {selected.is_anonymous || selected.request_type === "anonymous"
                    ? "Anonymous request"
                    : selected.full_name || selected.name || "No name provided"}
                </h2>

                <div className="ainbox-detail-sub">
                  <span
                    className={`apill apill--${pillFor(selected.status || "pending")}`}
                  >
                    {formatStatus(selected.status || "pending")}
                  </span>
                  <span className="ainbox-tag">{getCategory(selected)}</span>
                  <span className="ainbox-row-time">
                    {formatWhen(selected.created_at)}
                  </span>
                </div>

                <div className="ainbox-facts">
                  <div className="ainbox-fact">
                    <span>Level</span>
                    <strong>{selected.level || "Not given"}</strong>
                  </div>
                  <div className="ainbox-fact">
                    <span>Matric</span>
                    <strong>{selected.matric_no || "Not given"}</strong>
                  </div>
                  <div className="ainbox-fact">
                    <span>Contact</span>
                    <strong>{selected.phone || selected.whatsapp || "Not given"}</strong>
                  </div>
                  <div className="ainbox-fact">
                    <span>Assigned to</span>
                    <strong>{getAssignedOffice(getCategory(selected))}</strong>
                  </div>
                </div>

                <div className="ainbox-message">{getMessage(selected)}</div>

                <div className="ainbox-actions">
                  <button
                    type="button"
                    disabled={actionLoading}
                    className={
                      (selected.status || "pending") === "pending"
                        ? "abtn is-on"
                        : "abtn"
                    }
                    onClick={() => updateStatus(selected.id, "pending")}
                  >
                    <Clock3 size={14} />
                    New
                  </button>

                  <button
                    type="button"
                    disabled={actionLoading}
                    className={
                      selected.status === "in_progress" ? "abtn is-on" : "abtn"
                    }
                    onClick={() => updateStatus(selected.id, "in_progress")}
                  >
                    <AlertCircle size={14} />
                    In review
                  </button>

                  <button
                    type="button"
                    disabled={actionLoading}
                    className={
                      selected.status === "resolved"
                        ? "abtn abtn--done is-on"
                        : "abtn"
                    }
                    onClick={() => updateStatus(selected.id, "resolved")}
                  >
                    <CheckCircle2 size={14} />
                    Resolved
                  </button>

                  <button
                    type="button"
                    disabled={actionLoading}
                    className="abtn abtn--danger spacer"
                    onClick={() => deleteRequest(selected.id)}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function pillFor(status) {
  if (status === "resolved") return "done";
  if (status === "in_progress") return "active";
  return "pending";
}

function formatWhen(value) {
  if (!value) return "";

  const then = new Date(value);
  const mins = Math.floor((Date.now() - then.getTime()) / 60000);

  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  if (mins < 10080) return `${Math.floor(mins / 1440)}d`;

  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function getCategory(item) {
  return item.category || item.request_category || item.type || "Other";
}

function getMessage(item) {
  return item.message || item.request || item.description || "No message provided.";
}

function getAssignedOffice(category) {
  const map = {
    Academic: "Vice President, GS & AGS ",
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

function formatStatus(status) {
  const map = {
    pending: "New",
    in_progress: "In Review",
    resolved: "Resolved",
  };

  return map[status] || "New";
}

export default AdminRequests;
