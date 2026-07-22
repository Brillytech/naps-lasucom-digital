export const categoryFieldSchemas = {
  "Meeting Minutes": [
    { key: "meeting_title", label: "Meeting Title", type: "text" },
    { key: "venue", label: "Venue / Platform", type: "text" },
    { key: "attendance", label: "Attendance", type: "textarea" },
    { key: "agenda", label: "Agenda", type: "textarea" },
    { key: "discussion", label: "Discussion", type: "textarea" },
    { key: "resolutions", label: "Resolutions", type: "textarea" },
    { key: "action_points", label: "Action Points", type: "textarea" },
    { key: "closing_note", label: "Closing Note", type: "textarea" },
  ],
  "Financial Records": [
    { key: "income_expense", label: "Income / Expense", type: "text" },
    { key: "purpose", label: "Purpose", type: "text" },
    { key: "amount_detail", label: "Amount", type: "text" },
    { key: "approved_by", label: "Approved By", type: "text" },
    { key: "voucher_details", label: "Voucher / Receipt Details", type: "text" },
    { key: "breakdown", label: "Breakdown", type: "textarea" },
    { key: "supporting_note", label: "Supporting Note", type: "textarea" },
  ],
  Reports: [
    { key: "reporting_period", label: "Reporting Period", type: "text" },
    { key: "activities", label: "Activities Carried Out", type: "textarea" },
    { key: "achievements", label: "Achievements", type: "textarea" },
    { key: "challenges", label: "Challenges", type: "textarea" },
    { key: "recommendations", label: "Recommendations", type: "textarea" },
    { key: "pending_action", label: "Pending Action", type: "textarea" },
  ],
  "Handover Notes": [
    { key: "outgoing_officer", label: "Outgoing Officer", type: "text" },
    { key: "incoming_officer", label: "Incoming Officer", type: "text" },
    { key: "office", label: "Office", type: "text" },
    { key: "key_documents", label: "Key Documents", type: "textarea" },
    { key: "pending_tasks", label: "Pending Tasks", type: "textarea" },
    { key: "important_contacts", label: "Important Contacts", type: "textarea" },
    { key: "final_note", label: "Final Note", type: "textarea" },
  ],
  "Letters / Memos": [
    { key: "subject", label: "Subject", type: "text" },
    { key: "recipient", label: "Recipient", type: "text" },
    { key: "sender", label: "Sender", type: "text" },
    { key: "body", label: "Body", type: "textarea" },
    { key: "reference_number", label: "Reference Number", type: "text" },
  ],
  "Event Records": [
    { key: "event_title", label: "Event Title", type: "text" },
    { key: "planning_committee", label: "Planning Committee", type: "text" },
    { key: "venue", label: "Venue / Platform", type: "text" },
    { key: "activity_summary", label: "Activity Summary", type: "textarea" },
    { key: "attendance", label: "Attendance", type: "textarea" },
    { key: "proceeds", label: "Income / Proceeds", type: "text" },
    { key: "amount_remitted", label: "Amount Remitted", type: "text" },
    { key: "submitted_to", label: "Submitted To", type: "text" },
    { key: "outcome", label: "Outcome", type: "textarea" },
    { key: "pending_action", label: "Pending Action", type: "textarea" },
  ],
  "Sports Records": [
    { key: "sporting_activity", label: "Sporting Activity", type: "text" },
    { key: "date_venue", label: "Date / Venue", type: "text" },
    { key: "participants", label: "Participants", type: "textarea" },
    { key: "equipment_used", label: "Equipment Used", type: "textarea" },
    { key: "representation_details", label: "Representation Details", type: "textarea" },
    { key: "outcome", label: "Outcome", type: "textarea" },
    { key: "challenges", label: "Challenges", type: "textarea" },
    { key: "recommendations", label: "Recommendations", type: "textarea" },
    { key: "pending_action", label: "Pending Action", type: "textarea" },
  ],
  "Constitution / Policies": [
    { key: "document_title", label: "Document Title", type: "text" },
    { key: "policy_area", label: "Policy / Constitutional Area", type: "text" },
    { key: "summary_detail", label: "Summary", type: "textarea" },
    { key: "resolution_amendment", label: "Resolution / Amendment", type: "textarea" },
    { key: "approved_by", label: "Approved By", type: "text" },
    { key: "effective_date", label: "Effective Date", type: "text" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  "Other Records": [
    { key: "details", label: "Record Details", type: "textarea" },
  ],
};

export function getSchemaForCategory(category) {
  return categoryFieldSchemas[category] || categoryFieldSchemas["Other Records"];
}

export function buildEmptyContentFields(category) {
  const fields = {};
  getSchemaForCategory(category).forEach((f) => {
    fields[f.key] = "";
  });
  return fields;
}

export function normalizeContentFields(record) {
  const empty = buildEmptyContentFields(record.category);
  const existing =
    record.content_fields && typeof record.content_fields === "object"
      ? record.content_fields
      : {};
  return { ...empty, ...existing };
}

export function flattenContentFields(category, contentFields) {
  return getSchemaForCategory(category)
    .map((f) => `${f.label}: ${(contentFields[f.key] || "").trim() || "—"}`)
    .join("\n");
}