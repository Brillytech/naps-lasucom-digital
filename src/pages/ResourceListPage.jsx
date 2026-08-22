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
  Star,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { getDriveDownloadLink } from "../utils/driveLinks";
import { isFavorited, toggleFavorite } from "../utils/localLibrary";

const pageData = {
  Materials: {
    eyebrow: "Academic resources",
    title: "Materials",
    description: "Browse available materials by level, semester and course.",
    icon: <FileText size={22} />,
    iconClass: "green",
    tone: "tone-green",
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
    tone: "tone-blue",
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
    tone: "tone-blue",
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
  const navigate = useNavigate();
  const location = useLocation();

  function handleTopBack() {
    if (selectedCourse || searchTerm || selectedSemester || selectedLevel) {
      goBackOneStep();
      return;
    }

    if (location.key && location.key !== "default") {
      navigate(-1);
    } else {
      navigate("/resources");
    }
  }

  const [allCategoryResources, setAllCategoryResources] = useState([]);
  const [resources, setResources] = useState([]);

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingResources, setLoadingResources] = useState(false);

  const [selectedLevel, setSelectedLevel] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const historyDepthRef = useRef(0);
  const suppressPopCountRef = useRef(0);

  useEffect(() => {
    function handlePopState() {
      if (suppressPopCountRef.current > 0) {
        suppressPopCountRef.current -= 1;
        return;
      }

      if (historyDepthRef.current > 0) {
        historyDepthRef.current -= 1;
      }
      stepBack();
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  });

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

    if (historyDepthRef.current > 0) {
      suppressPopCountRef.current += historyDepthRef.current;
      window.history.go(-historyDepthRef.current);
      historyDepthRef.current = 0;
    }
  }

  function chooseLevel(level, count) {
    if (count === 0) return;

    setSelectedLevel(level);
    setSelectedSemester("");
    setSelectedCourse("");
    setSearchTerm("");
    setResources([]);

    window.history.pushState({}, "");
    historyDepthRef.current += 1;
  }

  function chooseSemester(semester, count) {
    if (count === 0) return;

    setSelectedSemester(semester);
    setSelectedCourse("");
    setSearchTerm("");

    window.history.pushState({}, "");
    historyDepthRef.current += 1;
  }

  function chooseCourse(course, count) {
    if (count === 0) return;

    setSelectedCourse(course);
    setSearchTerm("");

    window.history.pushState({}, "");
    historyDepthRef.current += 1;
  }

  function stepBack() {
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
    }
  }

  function goBackOneStep() {
    stepBack();

    if (historyDepthRef.current > 0) {
      historyDepthRef.current -= 1;
      suppressPopCountRef.current += 1;
      window.history.back();
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
        <button
          type="button"
          className="back-icon-btn"
          onClick={handleTopBack}
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>

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
      </section>

      {!selectedLevel && (
        <section className="resource-picker-section">
          <div className="sec-head">
            <h3>Select level</h3>
          </div>

          {loadingInitial ? (
            <div className="list">
              <PickerSkeleton />
              <PickerSkeleton />
              <PickerSkeleton />
              <PickerSkeleton />
            </div>
          ) : (
            <div className="list">
              {levelCards.map((item) => (
                <PickerRow
                  key={item.level}
                  title={item.level}
                  count={item.count}
                  tone={pageInfo.tone}
                  emptyText="Empty"
                  onClick={() => chooseLevel(item.level, item.count)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {selectedLevel && !selectedSemester && (
        <section className="resource-picker-section">
          <div className="sec-head">
            <h3>Select semester</h3>
          </div>

          <div className="list">
            {semesterCards.map((item) => (
              <PickerRow
                key={item.semester}
                title={item.semester}
                count={item.count}
                tone={pageInfo.tone}
                emptyText="Empty"
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
            <div className="sec-head">
              <h3>Select course</h3>
            </div>

            {loadingResources ? (
              <div className="list">
                <PickerSkeleton />
                <PickerSkeleton />
                <PickerSkeleton />
                <PickerSkeleton />
              </div>
            ) : courseCards.length > 0 ? (
              <div className="list">
                {courseCards.map((item) => (
                  <PickerRow
                    key={item.course}
                    title={item.course}
                    count={item.count}
                    tone={pageInfo.tone}
                    emptyText="Empty"
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

/* Two-tone folder: a back panel with the tab, and a lighter front
   panel over it. Reads as a folder without looking drawn-on. */
function FolderIcon({ open }) {
  return (
    <svg
      className="picker-ico"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 11.5A3.5 3.5 0 0 1 6.5 8h8.26a3.5 3.5 0 0 1 2.45 1l2.04 2a3.5 3.5 0 0 0 2.45 1H33.5A3.5 3.5 0 0 1 37 15.5v13A3.5 3.5 0 0 1 33.5 32h-27A3.5 3.5 0 0 1 3 28.5v-17Z"
        fill="currentColor"
        opacity="0.32"
      />
      <path
        d={
          open
            ? "M6.2 19.6a3 3 0 0 1 2.93-2.35h25.4a3 3 0 0 1 2.9 3.78l-2.2 8.2A3 3 0 0 1 32.3 32H6.5A3.5 3.5 0 0 1 3 28.5v-6.2a3 3 0 0 1 .07-.65l3.13-2.05Z"
            : "M3 20.2a3 3 0 0 1 3-3h28a3 3 0 0 1 3 3v8.3A3.5 3.5 0 0 1 33.5 32h-27A3.5 3.5 0 0 1 3 28.5v-8.3Z"
        }
        fill="currentColor"
      />
    </svg>
  );
}

function PickerRow({ title, count, emptyText, tone, onClick }) {
  const isEmpty = count === 0;

  return (
    <button
      type="button"
      className={`row picker-row ${tone}`}
      onClick={onClick}
      disabled={isEmpty}
    >
      <FolderIcon />

      <span>
        <span className="picker-name">{title}</span>
        <span className="picker-count">
          {isEmpty ? emptyText : `${count} ${count === 1 ? "item" : "items"}`}
        </span>
      </span>

      {!isEmpty && <ChevronRight size={18} className="home-chev" />}
    </button>
  );
}

function PickerSkeleton() {
  return (
    <div className="row picker-row" aria-hidden="true">
      <span className="skel picker-skel-ico" />

      <span>
        <span className="skel skel-line" style={{ width: "42%" }} />
        <span className="skel skel-line" style={{ width: "24%" }} />
      </span>
    </div>
  );
}

function ResourceCard({ item, pageInfo }) {
  const mainLink = item.external_link || item.file_url;
  const downloadLink = getDriveDownloadLink(mainLink);

  const [favorited, setFavorited] = useState(() => isFavorited(item.id));

  const viewerPath = mainLink && item.id ? `/resource-viewer?id=${item.id}` : "";

  function handleToggleFavorite() {
    toggleFavorite(item);
    setFavorited((prev) => !prev);
  }

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
        <button
          type="button"
          className={favorited ? "favorite-toggle active" : "favorite-toggle"}
          onClick={handleToggleFavorite}
          title={favorited ? "Remove from favorites" : "Save to favorites"}
          aria-label={favorited ? "Remove from favorites" : "Save to favorites"}
        >
          <Star size={14} fill={favorited ? "currentColor" : "none"} />
        </button>

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
            onClick={() => {
              if (typeof window.gtag === "function") {
                window.gtag("event", "download_resource", {
                  resource_title: item.title || "Resource",
                });
              }
            }}
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
