import {
  CalendarDays,
  ChevronRight,
  FileQuestion,
  FileText,
  FolderOpen,
  Sparkles,
  Star,
} from "lucide-react";
import { Link } from "react-router-dom";

const resourceCategories = [
  {
    title: "Materials",
    label: "Study resources",
    text: "Lecture slides, notes, handouts and manuals for academic use.",
    link: "/materials",
    icon: <FileText size={24} />,
    tone: "tone-green",
  },
  {
    title: "Past Questions",
    label: "Exam preparation",
    text: "Past questions, recalls and compilations for revision.",
    link: "/past-questions",
    icon: <FileQuestion size={24} />,
    tone: "tone-blue",
  },
  {
    title: "Timetables",
    label: "Schedules",
    text: "Lecture, examination and posting timetables.",
    link: "/timetables",
    icon: <CalendarDays size={24} />,
    tone: "tone-blue",
  },
  {
    title: "Favorites",
    label: "Saved by you",
    text: "Resources you've starred for quick access later.",
    link: "/favorites",
    icon: <Star size={24} />,
    tone: "tone-amber",
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

      <section className="card card--primary res-hero">
        <div className="res-hero-top">
          <div className="ico ico--on-brand">
            <FolderOpen size={24} />
          </div>

          <span className="res-hero-badge">
            <Sparkles size={14} />
            Available
          </span>
        </div>

        <h2>Your academic resources in one place.</h2>

        <div className="res-flow">
          <span>Level</span>
          <ChevronRight size={14} />
          <span>Semester</span>
          <ChevronRight size={14} />
          <span>Course</span>
        </div>
      </section>

      <div className="sec-head">
        <h3>Sections</h3>
      </div>

      <section className="list">
        {resourceCategories.map((item) => (
          <Link to={item.link} className="row res-row" key={item.title}>
            <div className={`ico ico-md ico--tint ${item.tone}`}>
              {item.icon}
            </div>

            <div>
              <span className="res-row-label">{item.label}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </div>

            <ChevronRight size={18} className="home-chev" />
          </Link>
        ))}
      </section>
    </>
  );
}

export default Resources;
