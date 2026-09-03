import {
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Filter,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

function AdminResources() {
  const navigate = useNavigate();

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

  function editResource(item) {
    navigate("/naps-admin/uploads", { state: { editItem: item } });
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

  // Grouping existed to give a stacked list some structure. The table
  // carries category as a column, so the rows stay flat and sortable by eye.
  const visibleResources = useMemo(
    () => groupedResources.flatMap((group) => group.items),
    [groupedResources]
  );

  return (
    <main className="admin-page">
      <header className="apage-head">
        <div>
          <p className="apage-eyebrow">Admin resources</p>
          <h1>Resource list</h1>
          <p>Every uploaded material, past question and timetable.</p>
        </div>
      </header>

      <div className="astats">
        <div className="astat astat--soon">
          <span className="astat-ico"><FileText size={16} /></span>
          <span className="astat-body">
            <span className="astat-n">{resources.length}</span>
            <span className="astat-l">Resources</span>
          </span>
        </div>

        <div className="astat astat--live">
          <span className="astat-ico"><Eye size={16} /></span>
          <span className="astat-body">
            <span className="astat-n">
              {resources.filter((r) => r.is_published).length}
            </span>
            <span className="astat-l">Published</span>
          </span>
        </div>

        <div className="astat astat--idle">
          <span className="astat-ico"><EyeOff size={16} /></span>
          <span className="astat-body">
            <span className="astat-n">
              {resources.filter((r) => !r.is_published).length}
            </span>
            <span className="astat-l">Hidden</span>
          </span>
        </div>

        <div className="astat astat--mark">
          <span className="astat-ico"><Filter size={16} /></span>
          <span className="astat-body">
            <span className="astat-n">{visibleResources.length}</span>
            <span className="astat-l">Matching</span>
          </span>
        </div>
      </div>

      <div className="atoolbar">
        <label className="asearch">
          <Search size={14} />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search title or course"
            aria-label="Search resources"
          />
        </label>

        <select
          className="aselect"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Category"
        >
          <option value="All">All categories</option>
          <option>Materials</option>
          <option>Past Questions</option>
          <option>Timetables</option>
        </select>

        <select
          className="aselect"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          aria-label="Level"
        >
          <option value="All">All levels</option>
          <option>200L</option>
          <option>300L</option>
          <option>400L</option>
          <option>500L</option>
          <option>600L</option>
        </select>

        <select
          className="aselect"
          value={semester}
          onChange={(e) => setSemester(e.target.value)}
          aria-label="Semester"
        >
          <option value="All">All semesters</option>
          <option>First Semester</option>
          <option>Second Semester</option>
        </select>
      </div>

      {loading ? (
        <>
          <div className="askel" style={{ height: 44, marginTop: 16 }} />
          <div className="askel" style={{ height: 300, marginTop: 12 }} />
        </>
      ) : (
        <div className="atable-wrap">
          {visibleResources.length === 0 ? (
            <div className="aempty-row">
              <FileText size={26} />
              <strong>Nothing matches</strong>
              <span>Try a shorter search, or widen the filters.</span>
            </div>
          ) : (
            <div className="atable-scroll">
              <table className="atable">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Course</th>
                    <th>Category</th>
                    <th>Level</th>
                    <th>Semester</th>
                    <th>Status</th>
                    <th className="num">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleResources.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="acell-title">
                          <strong>{item.title}</strong>
                        </div>
                      </td>

                      <td>
                        <span className="abadge">
                          {item.course_code || "No code"}
                        </span>
                      </td>

                      <td className="quiet">{item.category}</td>
                      <td className="quiet">{item.level}</td>
                      <td className="quiet">{item.semester}</td>

                      <td>
                        <span
                          className={
                            item.is_published
                              ? "abadge abadge--live"
                              : "abadge abadge--draft"
                          }
                        >
                          <i />
                          {item.is_published ? "Published" : "Hidden"}
                        </span>
                      </td>

                      <td>
                        <div className="acell-actions">
                          <a
                            className="aicon-btn"
                            href={item.external_link || item.file_url}
                            target="_blank"
                            rel="noreferrer"
                            title="Open the file"
                          >
                            <ExternalLink size={14} />
                          </a>

                          <button
                            type="button"
                            className="aicon-btn"
                            title="Edit"
                            onClick={() => editResource(item)}
                          >
                            <Pencil size={14} />
                          </button>

                          <button
                            type="button"
                            className="aicon-btn"
                            title={
                              item.is_published
                                ? "Hide from students"
                                : "Publish to students"
                            }
                            onClick={() => togglePublish(item)}
                          >
                            {item.is_published ? (
                              <EyeOff size={14} />
                            ) : (
                              <Eye size={14} />
                            )}
                          </button>

                          <button
                            type="button"
                            className="aicon-btn is-danger"
                            title="Delete"
                            onClick={() => deleteResource(item)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export default AdminResources;
