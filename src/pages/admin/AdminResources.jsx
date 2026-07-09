import {
  ExternalLink,
  FileText,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

function AdminResources() {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);

  const [category, setCategory] = useState("All");
  const [level, setLevel] = useState("All");
  const [semester, setSemester] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchResources();
  }, []);

  async function fetchResources() {
    setLoading(true);

    const { data, error } = await supabase
      .from("resources")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error.message);
      setResources([]);
    } else {
      setResources(data || []);
    }

    setLoading(false);
  }

  async function togglePublish(item) {
    const { error } = await supabase
      .from("resources")
      .update({ is_published: !item.is_published })
      .eq("id", item.id);

    if (!error) fetchResources();
  }

  async function deleteResource(item) {
    const confirmDelete = window.confirm(`Delete "${item.title}" permanently?`);
    if (!confirmDelete) return;

    const { error } = await supabase
      .from("resources")
      .delete()
      .eq("id", item.id);

    if (!error) fetchResources();
  }

  const filteredResources = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return resources.filter((item) => {
      const matchesCategory = category === "All" || item.category === category;
      const matchesLevel = level === "All" || item.level === level;
      const matchesSemester = semester === "All" || item.semester === semester;

      const matchesSearch =
        !term ||
        item.title?.toLowerCase().includes(term) ||
        item.course_code?.toLowerCase().includes(term);

      return matchesCategory && matchesLevel && matchesSemester && matchesSearch;
    });
  }, [resources, category, level, semester, searchTerm]);

  const groupedResources = useMemo(() => {
    const group = {};

    filteredResources.forEach((item) => {
      const groupKey = `${item.category || "Uncategorized"} • ${
        item.level || "No level"
      } • ${item.semester || "No semester"}`;

      if (!group[groupKey]) group[groupKey] = [];
      group[groupKey].push(item);
    });

    return Object.keys(group).map((key) => ({
      title: key,
      items: group[key],
    }));
  }, [filteredResources]);

  return (
    <main className="admin-dashboard-page">
      <header className="admin-dashboard-header">
        <div>
          <p>Admin Resources</p>
          <h1>All Resources</h1>
          <span>Manage uploaded Drive links.</span>
        </div>
      </header>

      <section className="admin-all-resource-tools">
        <div className="admin-recent-search">
          <Search size={17} />
          <input
            placeholder="Search title or course..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="admin-filter-row">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option>All</option>
            <option>Materials</option>
            <option>Past Questions</option>
            <option>Timetables</option>
          </select>

          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option>All</option>
            <option>200L</option>
            <option>300L</option>
            <option>400L</option>
            <option>500L</option>
            <option>600L</option>
          </select>

          <select value={semester} onChange={(e) => setSemester(e.target.value)}>
            <option>All</option>
            <option>First Semester</option>
            <option>Second Semester</option>
          </select>
        </div>
      </section>

      {loading ? (
        <div className="admin-loading-card">Loading resources...</div>
      ) : groupedResources.length > 0 ? (
        <section className="admin-classified-list">
          {groupedResources.map((group) => (
            <div className="admin-classified-group" key={group.title}>
              <h2>{group.title}</h2>

              <div className="admin-recent-list">
                {group.items.map((item) => (
                  <article className="admin-recent-item" key={item.id}>
                    <section>
                      <div className="admin-recent-topline">
                        <span
                          className={
                            item.is_published
                              ? "resource-status published"
                              : "resource-status hidden"
                          }
                        >
                          {item.is_published ? "Published" : "Hidden"}
                        </span>

                        <a
                          href={item.external_link || item.file_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink size={14} />
                        </a>
                      </div>

                      <h3>{item.title}</h3>

                      <p>
                        {item.category} • {item.level} • {item.semester}
                      </p>

                      <strong>{item.course_code || "No course code"}</strong>
                    </section>

                    <div className="admin-recent-actions">
                      <button type="button">
                        <Pencil size={15} />
                        Edit
                      </button>

                      <button type="button" onClick={() => togglePublish(item)}>
                        {item.is_published ? "Hide" : "Show"}
                      </button>

                      <button type="button" onClick={() => deleteResource(item)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <section className="admin-empty-panel">
          <FileText size={30} />
          <h3>No resource found</h3>
          <p>Try changing your filter.</p>
        </section>
      )}
    </main>
  );
}

export default AdminResources;