import {
  ArrowLeft,
  BookOpen,
  Building2,
  ChevronRight,
  FileText,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";

const aims = [
  "Unite Physiotherapy students and support academic, social and personal development.",
  "Protect students’ rights, promote their interests and support their welfare.",
  "Promote ethics, professionalism, leadership and student-led development.",
  "Provide timely information and updates within the field of Physiotherapy.",
];

function Naps() {
  return (
    <>
      <section className="page-header naps-header">
        <Link to="/" className="back-link">
          <ArrowLeft size={18} />
          Home
        </Link>

        <p>About the association</p>
        <h1>NAPS LASUCOM</h1>
        <span>
          Nigeria Association of Physiotherapy Students, Lagos State University
          College of Medicine.
        </span>
      </section>

      <section className="naps-profile-card">
        <img src="/images/naps-logo.png" alt="NAPS LASUCOM" />

        <div>
          <h3>Strength in Knowledge,</h3>
          <p>Service to Humanity.</p>
        </div>
      </section>

      <section className="naps-info-grid">
        <InfoCard
          icon={<Building2 size={22} />}
          title="Address"
          text="Department of Physiotherapy, Allied Health Sciences, Lagos State University College of Medicine, Ikeja-Lagos."
          color="blue"
        />

        <InfoCard
          icon={<ShieldCheck size={22} />}
          title="Membership"
          text="Ordinary membership applies to undergraduate students registered for training in the Department of Physiotherapy."
          color="green"
        />
      </section>

      <section className="naps-section-card">
        <div className="section-head">
          <h3>Aims & Objectives</h3>
          <Sparkles size={18} />
        </div>

        <div className="aim-list">
          {aims.map((aim) => (
            <div key={aim} className="aim-item">
              <HeartHandshake size={17} />
              <p>{aim}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="naps-actions">
        <Link to="/constitution">
          <FileText size={18} />
          Read Constitution
          <ChevronRight size={18} />
        </Link>

        <Link to="/executives">
          <BookOpen size={18} />
          View Executives
          <ChevronRight size={18} />
        </Link>
      </section>
    </>
  );
}

function InfoCard({ icon, title, text, color }) {
  return (
    <article className="naps-info-card">
      <div className={`naps-info-icon ${color}`}>{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

export default Naps;