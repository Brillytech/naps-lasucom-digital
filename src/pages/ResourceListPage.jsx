import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Download,
  Eye,
  FileQuestion,
  FileText,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getDriveDownloadLink } from "../utils/driveLinks";

const pageData = {
  Materials: {
    eyebrow: "Academic resources",
    title: "Materials",
    description: "Browse available materials by level, semester and course.",
    icon: <FileText size={22} />,
    iconClass: "green",
    cardClass: "material-style",
    pillClass: "green-pill",
    empty: "No material found",
  },

  "Past Questions": {
    eyebrow: "Exam preparation",
    title: "Past Questions",
    description: "Browse past questions and recalls by level, semester and course.",
    icon: <FileQuestion size={22} />,
    iconClass: "blue",
    cardClass: "pq-style",
    pillClass: "blue-pill",
    empty: "No past question found",
  },

  Timetables: {
    eyebrow: "Class schedules",
    title: "Timetables",
    description: "Browse lecture, exam and posting timetables by level and semester.",
    icon: <CalendarDays size={22} />,
    iconClass: "blue",
    cardClass: "timetable-style",
    pillClass: "blue-pill",
    empty: "No timetable found",
  },
};

const levels = ["200L", "300L", "400L", "500L", "600L"];
const semesters = ["First Semester", "Second Semester"];

function ResourceListPage({ category }) {
  const pageInfo = pageData[category];
  const isTimetable = category === "Timetables";

  const [allCategoryResources, setAllCategoryResources] = useState([]);
  const [resources, setResources] = useState([]);

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingResources, setLoadingResources] = useState(false);

  const [selectedLevel, setSelectedLevel] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchCategoryIndex();
  }, [category]);

  useEffect(() => {
    if (selectedLevel && selectedSemester) {
      fetchResourcesForSelection();
    } else {
      setResources([]);
    }
  }, [category, selectedLevel, selectedSemester]);

  async function fetchCategoryIndex() {
    setLoadingInitial(true);

    const { data, error } = await supabase
      .from("resources")
      .select("id, category, level, semester, course_code, title")
      .eq("category", category)
      .eq("is_published", true)
      .order("level", { ascending: true })
      .order("semester", { ascending: true })
      .order("course_code", { ascending: true });

    if (error) {
      console.error(`Error fetching ${category}:`, error.message);
      setAllCategoryResources([]);
    } else {
      setAllCategoryResources(data || []);
    }

    setLoadingInitial(false);
  }

  async function fetchResourcesForSelection() {
    setLoadingResources(true);

    const { data, error } = await supabase
      .from("resources")
      .select("*")
      .eq("category", category)
      .eq("is_published", true)
      .eq("level", selectedLevel)
      .eq("semester", selectedSemester)
      .order("course_code", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.error(`Error fetching selected ${category}:`, error.message);
      setResources([]);
    } else {
      setResources(data || []);
    }

    setLoadingResources(false);
  }

  const levelCards = useMemo(() => {
    return levels.map((level) => ({
      level,
      count: allCategoryResources.filter((item) => item.level === level).length,
    }));
  }, [allCategoryResources]);

  const semesterCards = useMemo(() => {
    if (!selectedLevel) return [];

    return semesters.map((semester) => ({
      semester,
      count: allCategoryResources.filter(
        (item) => item.level === selectedLevel && item.semester === semester
      ).length,
    }));
  }, [allCategoryResources, selectedLevel]);

  const courseCards = useMemo(() => {
    if (!selectedLevel || !selectedSemester || isTimetable) return [];

    const courseMap = {};

    resources.forEach((item) => {
      const course = item.course_code || "General";

      if (!courseMap[course]) {
        courseMap[course] = 0;
      }

      courseMap[course] += 1;
    });

    return Object.keys(courseMap)
      .sort()
      .map((course) => ({
        course,
        count: courseMap[course],
      }));
  }, [resources, selectedLevel, selectedSemester, isTimetable]);

  const visibleResources = useMemo(() => {
    if (!selectedLevel || !selectedSemester) return [];

    const term = searchTerm.trim().toLowerCase();

    return resources.filter((item) => {
      const title = item.title || "";
      const courseCode = item.course_code || "";

      const matchesCourse = isTimetable
        ? true
        : selectedCourse
        ? courseCode === selectedCourse
        : false;

      const matchesSearch =
        !term ||
        title.toLowerCase().includes(term) ||
        courseCode.toLowerCase().includes(term);

      return matchesCourse && matchesSearch;
    });
  }, [
    resources,
    selectedLevel,
    selectedSemester,
    selectedCourse,
    searchTerm,
    isTimetable,
  ]);

  function resetAll() {
    setSelectedLevel("");
    setSelectedSemester("");
    setSelectedCourse("");
    setSearchTerm("");
    setResources([]);
  }

  function chooseLevel(level, count) {
    if (count === 0) return;

    setSelectedLevel(level);
    setSelectedSemester("");
    setSelectedCourse("");
    setSearchTerm("");
    setResources([]);
  }

  function chooseSemester(semester, count) {
    if (count === 0) return;

    setSelectedSemester(semester);
    setSelectedCourse("");
    setSearchTerm("");
  }

  function chooseCourse(course, count) {
    if (count === 0) return;

    setSelectedCourse(course);
    setSearchTerm("");
  }

  function goBackOneStep() {
    if (selectedCourse || searchTerm) {
      setSelectedCourse("");
      setSearchTerm("");
      return;
    }

    if (selectedSemester) {
      setSelectedSemester("");
      setResources([]);
      return;
    }

    if (selectedLevel) {
      setSelectedLevel("");
      return;
    }
  }

  if (!pageInfo) {
    return (
      <section className="empty-state">
        <FileText size={30} />
        <h3>Invalid resource section</h3>
        <p>This resource category does not exist.</p>
      </section>
    );
  }

  return (
    <>
      <section className="page-header materials-header">
        <Link to="/resources" className="back-link">
          <ArrowLeft size={18} />
          Resources
        </Link>

        <p>{pageInfo.eyebrow}</p>
        <h1>{pageInfo.title}</h1>
        <span>{pageInfo.description}</span>
      </section>

      <section className="resource-library-panel">
        <div className="library-panel-header">
          <div>
            <SlidersHorizontal size={18} />
            <span>Select Resource</span>
          </div>

          {(selectedLevel || selectedSemester || selectedCourse || searchTerm) && (
            <button type="button" onClick={resetAll}>
              Reset
            </button>
          )}
        </div>

        <div className="library-current-path">
          <span className={selectedLevel ? "active" : ""}>
            {selectedLevel || "Level"}
          </span>

          <ChevronRight size={14} />

          <span className={selectedSemester ? "active" : ""}>
            {selectedSemester || "Semester"}
          </span>

          <ChevronRight size={14} />

          <span className={selectedCourse ? "active" : ""}>
            {isTimetable ? "Timetable" : selectedCourse || "Course"}
          </span>
        </div>

        {(selectedLevel || selectedSemester || selectedCourse || searchTerm) && (
          <button
            type="button"
            className="library-back-step"
            onClick={goBackOneStep}
          >
            Go back
          </button>
        )}
      </section>

      {!selectedLevel && (
        <section className="resource-picker-section">
          <h2>Select Level</h2>

          {loadingInitial ? (
            <div className="resource-guide-card">
              <p>Loading {pageInfo.title.toLowerCase()}...</p>
            </div>
          ) : (
            <div className="resource-picker-grid">
              {levelCards.map((item) => (
                <PickerCard
                  key={item.level}
                  icon={pageInfo.icon}
                  title={item.level}
                  count={item.count}
                  emptyText="No upload yet"
                  onClick={() => chooseLevel(item.level, item.count)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {selectedLevel && !selectedSemester && (
        <section className="resource-picker-section">
          <h2>Select Semester</h2>

          <div className="resource-picker-grid">
            {semesterCards.map((item) => (
              <PickerCard
                key={item.semester}
                icon={pageInfo.icon}
                title={item.semester}
                count={item.count}
                emptyText="No upload yet"
                onClick={() => chooseSemester(item.semester, item.count)}
              />
            ))}
          </div>
        </section>
      )}

      {selectedLevel &&
        selectedSemester &&
        !isTimetable &&
        !selectedCourse &&
        !searchTerm && (
          <section className="resource-picker-section">
            <h2>Select Course</h2>

            {loadingResources ? (
              <div className="resource-guide-card">
                <p>Loading courses...</p>
              </div>
            ) : courseCards.length > 0 ? (
              <div className="resource-picker-grid">
                {courseCards.map((item) => (
                  <PickerCard
                    key={item.course}
                    icon={pageInfo.icon}
                    title={item.course}
                    count={item.count}
                    emptyText="No item yet"
                    onClick={() => chooseCourse(item.course, item.count)}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                {pageInfo.icon}
                <h3>No course found</h3>
                <p>No resource is available for this semester yet.</p>
              </div>
            )}
          </section>
        )}

      {selectedLevel &&
        selectedSemester &&
        (selectedCourse || isTimetable) &&
        visibleResources.length > 0 && (
          <section className="search-box">
            <Search size={19} />
            <input
              placeholder={
                isTimetable
                  ? "Search timetable..."
                  : "Search within this course..."
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </section>
        )}

      {(selectedCourse || (isTimetable && selectedLevel && selectedSemester)) && (
        <section className="organized-resource-list">
          <div className="result-count">
            <span>{loadingResources ? "Loading..." : `${visibleResources.length} item(s) found`}</span>
          </div>

          {loadingResources ? (
            <div className="resource-guide-card">
              <p>Loading resources...</p>
            </div>
          ) : visibleResources.length > 0 ? (
            <div className="compact-list">
              {visibleResources.map((item) => (
                <ResourceCard key={item.id} item={item} pageInfo={pageInfo} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              {pageInfo.icon}
              <h3>{pageInfo.empty}</h3>
              <p>Try another selection.</p>
            </div>
          )}
        </section>
      )}
    </>
  );
}

function PickerCard({ icon, title, count, emptyText, onClick }) {
  const isEmpty = count === 0;

  return (
    <button
      type="button"
      className={isEmpty ? "resource-picker-card disabled" : "resource-picker-card"}
      onClick={onClick}
      disabled={isEmpty}
    >
      <div className="resource-picker-icon">{icon}</div>

      <section>
        <strong>{title}</strong>
        <span>{isEmpty ? emptyText : `${count} available`}</span>
      </section>

      {!isEmpty && <ChevronRight size={18} />}
    </button>
  );
}

function ResourceCard({ item, pageInfo }) {
  const mainLink = item.external_link || item.file_url;
  const downloadLink = getDriveDownloadLink(mainLink);

  const viewerPath = mainLink
    ? `/resource-viewer?url=${encodeURIComponent(mainLink)}&title=${encodeURIComponent(
        item.title || "Resource"
      )}`
    : "";

  return (
    <article className={`compact-resource-card ${pageInfo.cardClass}`}>
      <div className={`compact-resource-icon ${pageInfo.iconClass}`}>
        {pageInfo.icon}
      </div>

      <div className="compact-resource-content">
        <h3>{item.title}</h3>
        <p>
          {item.course_code || "General"} • {item.level || "No level"}
        </p>

        <span className={`resource-type-pill ${pageInfo.pillClass}`}>
          {item.semester || "No semester"}
        </span>
      </div>

      <div className="compact-actions">
        {mainLink ? (
          <Link to={viewerPath} title="View" aria-label="View resource">
            <Eye size={14} />
          </Link>
        ) : (
          <button disabled>
            <Eye size={14} />
          </button>
        )}

        {mainLink ? (
          <a
            href={downloadLink}
            title="Download"
            aria-label="Download resource"
            target="_blank"
            rel="noreferrer"
          >
            <Download size={14} />
          </a>
        ) : (
          <button disabled>
            <Download size={14} />
          </button>
        )}
      </div>
    </article>
  );
}

export default ResourceListPage;