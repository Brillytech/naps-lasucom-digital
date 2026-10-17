import { Search } from "lucide-react";
import { LEVELS } from "../../../utils/finance";

function LedgerFilters({ sessions, filters, setFilters, showSearch = true }) {
  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v, page: 0 }));
  return (
    <div className="atoolbar">
      {showSearch && (
        <label className="asearch">
          <Search size={14} />
          <input
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Search name or matric"
            aria-label="Search students"
          />
        </label>
      )}
      <select className="aselect" value={filters.sessionId} onChange={(e) => set("sessionId", e.target.value)} aria-label="Session">
        {sessions
          .filter((s) => s.status !== "draft")
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}{s.is_active ? " (active)" : ""}
            </option>
          ))}
      </select>
      <select className="aselect" value={filters.level} onChange={(e) => set("level", e.target.value)} aria-label="Level">
        <option value="">All levels</option>
        {LEVELS.map((l) => (
          <option key={l} value={l}>{l}L</option>
        ))}
      </select>
      <select className="aselect" value={filters.status} onChange={(e) => set("status", e.target.value)} aria-label="Status">
        <option value="">Any status</option>
        <option value="unpaid">Unpaid</option>
        <option value="partial">Partial</option>
        <option value="paid">Paid</option>
      </select>
    </div>
  );
}

export default LedgerFilters;
