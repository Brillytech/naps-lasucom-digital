import {
  BookOpenCheck,
  CalendarDays,
  ChevronRight,
  FileQuestion,
  FileText,
  FolderOpen,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";

const resourceCategories = [
  {
    title: "Materials",
    label: "Study resources",
    text: "Lecture slides, notes, handouts and manuals for academic use.",
    link: "/materials",
    icon: <FileText size={24} />,
    color: "green",
  },
  {
    title: "Past Questions",
    label: "Exam preparation",
    text: "Past questions, recalls and compilations for revision.",
    link: "/past-questions",
    icon: <FileQuestion size={24} />,
    color: "blue",
  },
  {
    title: "Timetables",
    label: "Schedules",
    text: "Lecture, examination and posting timetables.",
    link: "/timetables",
    icon: <CalendarDays size={24} />,
    color: "green",
  },
];

function Resources() {
  return (
    <>
      <section className="page-header resources-header">
        <p>NAPS Library</p>
        <h1>Resources</h1>
        <span>
          Access academic materials, past questions and timetables for your
          level and semester.
        </span>
      </section>

      <section className="library-hero-card">
        <div className="library-hero-top">
          <div className="library-hero-icon">
            <FolderOpen size={28} />
          </div>

          <div className="library-hero-badge">
            <Sparkles size={14} />
            Available
          </div>
        </div>

        <h2>Your academic resources in one place.</h2>

        <p>
          Browse available files by level, semester and course to find what you
          need faster.
        </p>

        <div className="library-flow">
          <span>Select Level</span>
          <ChevronRight size={14} />
          <span>Choose Semester</span>
          <ChevronRight size={14} />
          <span>Pick Course</span>
        </div>
      </section>

      <section className="library-section-title">
        <div>
          <BookOpenCheck size={18} />
          <span>Resource Sections</span>
        </div>

        <p>Select a category to continue.</p>
      </section>

      <section className="library-resource-grid">
        {resourceCategories.map((item) => (
          <Link to={item.link} className="library-resource-card" key={item.title}>
            <div className={`library-resource-icon ${item.color}`}>
              {item.icon}
            </div>

            <div className="library-resource-content">
              <span>{item.label}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </div>

            <div className="library-card-arrow">
              <ChevronRight size={18} />
            </div>
          </Link>
        ))}
      </section>
    </>
  );
}

export default Resources;
