import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Eye,
  FileText,
  Inbox,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  User,
  X,
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
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRequest, setSelectedRequest] = useState(null);

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

    setSelectedRequest((prev) =>
      prev ? { ...prev, status: newStatus } : prev
    );

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

  const categoryCards = useMemo(() => {
    return categories.map((category) => {
      const items = requests.filter((item) => getCategory(item) === category);

      const newCount = items.filter(
        (item) => (item.status || "pending") === "pending"
      ).length;

      return {
        category,
        total: items.length,
        newCount,
        assignedOffice: getAssignedOffice(category),
      };
    });
  }, [requests]);

  const filteredRequests = useMemo(() => {
    if (!selectedCategory) return [];

    const term = searchTerm.trim().toLowerCase();

    return requests.filter((item) => {
      const itemCategory = getCategory(item);
      const itemStatus = item.status || "pending";

      const matchesCategory = itemCategory === selectedCategory;
      const matchesStatus = status === "all" || itemStatus === status;

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

      return matchesCategory && matchesStatus && matchesSearch;
    });
  }, [requests, selectedCategory, status, searchTerm]);

  function openCategory(category) {
    setSelectedCategory(category);
    setStatus("all");
    setSearchTerm("");
    setSelectedRequest(null);
  }

  function backToCategories() {
    setSelectedCategory("");
    setStatus("all");
    setSearchTerm("");
    setSelectedRequest(null);
  }

  return (
    <main className="admin-dashboard-page">
      <header className="admin-dashboard-header">
        <div>
          <p>Admin Requests</p>
          <h1>Requests</h1>
          <span>Review and manage requests from NAPSITES.</span>
        </div>
      </header>

      <section className="request-alert-card">
        <div>
          <MessageCircle size={22} />
        </div>

        <section>
          <h3>{stats.newRequests} new request(s)</h3>
          <p>
            {stats.newRequests > 0
              ? "Some requests still need attention."
              : "No new request at the moment."}
          </p>
        </section>
      </section>

      <section className="admin-request-summary-grid">
        <SummaryCard label="Total" value={stats.total} />
        <SummaryCard label="New" value={stats.newRequests} active />
        <SummaryCard label="In Review" value={stats.inProgress} />
        <SummaryCard label="Resolved" value={stats.resolved} />
      </section>

      {errorMessage && <div className="admin-error">{errorMessage}</div>}

      {!selectedCategory && (
        <section className="request-category-board">
          <div className="admin-section-title">
            <h2>Request Categories</h2>
            <p>Select a category to view related requests.</p>
          </div>

          {loading ? (
            <div className="admin-loading-card">Loading requests...</div>
          ) : (
            <div className="request-category-board-grid">
              {categoryCards.map((item) => (
                <CategoryCard
                  key={item.category}
                  item={item}
                  onClick={() => openCategory(item.category)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {selectedCategory && (
        <>
          <section className="selected-request-category-card">
            <button type="button" onClick={backToCategories}>
              Back
            </button>

            <div>
              <h2>{selectedCategory}</h2>
              <p>{getAssignedOffice(selectedCategory)}</p>
            </div>

            <span>
              {
                requests.filter((item) => getCategory(item) === selectedCategory)
                  .length
              }
            </span>
          </section>

          <section className="admin-request-control-card">
            <div className="admin-recent-search">
              <Search size={17} />
              <input
                placeholder="Search inside this category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="admin-request-filter-chips">
              {statuses.map((item) => (
                <button
                  type="button"
                  key={item.value}
                  className={status === item.value ? "active" : ""}
                  onClick={() => setStatus(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>

          {selectedRequest && (
            <RequestDetails
              request={selectedRequest}
              onClose={() => setSelectedRequest(null)}
              onUpdateStatus={updateStatus}
              actionLoading={actionLoading}
            />
          )}

          {loading ? (
            <div className="admin-loading-card">Loading requests...</div>
          ) : filteredRequests.length > 0 ? (
            <section className="request-inbox-list">
              <div className="request-inbox-rows">
                {filteredRequests.map((item) => (
                  <RequestRow
                    key={item.id}
                    request={item}
                    onOpen={() => setSelectedRequest(item)}
                  />
                ))}
              </div>
            </section>
          ) : (
            <section className="admin-empty-panel">
              <Inbox size={32} />
              <h3>No request found</h3>
              <p>No request matches this selection.</p>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function SummaryCard({ label, value, active }) {
  return (
    <article className={active ? "summary-card active" : "summary-card"}>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function CategoryCard({ item, onClick }) {
  const isEmpty = item.total === 0;

  return (
    <button
      type="button"
      className={isEmpty ? "request-category-card empty" : "request-category-card"}
      onClick={onClick}
      disabled={isEmpty}
    >
      {item.newCount > 0 && (
        <span className="new-request-tag">{item.newCount} New</span>
      )}

      <div className="request-category-icon">
        <MessageCircle size={21} />
      </div>

      <section>
        <h3>{item.category}</h3>
        <p>{item.assignedOffice}</p>
        <small>
          {item.total === 0 ? "No request yet" : `${item.total} request(s)`}
        </small>
      </section>

      {!isEmpty && <ChevronRight size={18} />}
    </button>
  );
}

function RequestRow({ request, onOpen }) {
  const category = getCategory(request);
  const status = request.status || "pending";
  const isAnonymous = request.is_anonymous || request.anonymous;

  return (
    <article className={status === "pending" ? "request-row new" : "request-row"}>
      <div className="request-row-dot" />

      <section>
        <div className="request-row-top">
          <h3>{trimText(getMessage(request), 44)}</h3>
          <span className={`request-status ${status}`}>
            {formatStatus(status)}
          </span>
        </div>

        <p>
          {isAnonymous
            ? "Anonymous"
            : request.full_name || request.name || "No name"}{" "}
          • {request.level || "No level"}
        </p>

        <small>{getAssignedOffice(category)}</small>
      </section>

      <button type="button" onClick={onOpen}>
        <Eye size={15} />
      </button>
    </article>
  );
}

function RequestDetails({ request, onClose, onUpdateStatus, actionLoading }) {
  const category = getCategory(request);
  const status = request.status || "pending";
  const isAnonymous = request.is_anonymous || request.anonymous;

  return (
    <section className="admin-request-detail-card">
      <div className="admin-request-detail-top">
        <div>
          <span className={`request-status ${status}`}>
            {formatStatus(status)}
          </span>
          <h2>{category}</h2>
        </div>

        <button type="button" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="admin-request-detail-info">
        <InfoRow
          icon={<User size={15} />}
          label="Student"
          value={
            isAnonymous
              ? "Anonymous"
              : request.full_name || request.name || "No name provided"
          }
        />

        <InfoRow
          icon={<FileText size={15} />}
          label="Level"
          value={request.level || "Not provided"}
        />

        <InfoRow
          icon={<Phone size={15} />}
          label="Contact"
          value={request.phone || request.whatsapp || "Not provided"}
        />

        <InfoRow
          icon={<ShieldCheck size={15} />}
          label="Assigned to"
          value={getAssignedOffice(category)}
        />
      </div>

      <div className="admin-request-message-box">
        <h3>Message</h3>
        <p>{getMessage(request)}</p>
      </div>

      <div className="admin-request-actions">
        <button
          type="button"
          disabled={actionLoading}
          onClick={() => onUpdateStatus(request.id, "pending")}
        >
          <Clock3 size={15} />
          New
        </button>

        <button
          type="button"
          disabled={actionLoading}
          onClick={() => onUpdateStatus(request.id, "in_progress")}
        >
          <AlertCircle size={15} />
          In Review
        </button>

        <button
          type="button"
          disabled={actionLoading}
          onClick={() => onUpdateStatus(request.id, "resolved")}
        >
          <CheckCircle2 size={15} />
          Resolved
        </button>
      </div>
    </section>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <div className="admin-request-info-row">
      <div>{icon}</div>

      <section>
        <span>{label}</span>
        <p>{value}</p>
      </section>
    </div>
  );
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

function trimText(text, maxLength) {
  if (!text) return "No message provided.";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

export default AdminRequests;