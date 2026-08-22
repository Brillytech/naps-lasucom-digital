import {
  ArrowLeft,
  Building2,
  ChevronRight,
  FileText,
  GraduationCap,
  ShieldCheck,
  Users,
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
      <header className="rl-head tone-blue">
        <div className="rl-head-top">
          <Link to="/" className="rl-back" aria-label="Back to home">
            <ArrowLeft size={18} />
          </Link>

          <p className="rl-eyebrow">About the association</p>
        </div>

        <div className="rl-head-main">
          <span className="ico ico--tint tone-blue">
            <GraduationCap size={24} />
          </span>

          <h1>NAPS LASUCOM</h1>
        </div>

        <p className="rl-meta">
          Nigeria Association of Physiotherapy Students, Lagos State University
          College of Medicine.
        </p>
      </header>

      <section className="motto">
        <span className="ico ico-md ico--tint tone-blue">
          <Building2 size={22} />
        </span>

        <div>
          <span className="motto-label">Our motto</span>
          <p className="motto-text">
            Strength in Knowledge, <span>Service to Humanity.</span>
          </p>
        </div>
      </section>

      <div className="sec-head">
        <h3>The association</h3>
      </div>

      <section className="list">
        <article className="row naps-row tone-blue">
          <span className="ico ico-sm ico--tint tone-blue">
            <Building2 size={18} />
          </span>

          <div>
            <h3>Address</h3>
            <p>
              Department of Physiotherapy, Allied Health Sciences, Lagos State
              University College of Medicine, Ikeja&ndash;Lagos.
            </p>
          </div>
        </article>

        <article className="row naps-row tone-green">
          <span className="ico ico-sm ico--tint tone-green">
            <ShieldCheck size={18} />
          </span>

          <div>
            <h3>Membership</h3>
            <p>
              Ordinary membership applies to undergraduate students registered
              for training in the Department of Physiotherapy.
            </p>
          </div>
        </article>
      </section>

      <div className="sec-head">
        <h3>Aims &amp; objectives</h3>
      </div>

      <section className="naps-aims">
        {aims.map((aim) => (
          <div key={aim} className="naps-aim">
            <p>{aim}</p>
          </div>
        ))}
      </section>

      <div className="sec-head">
        <h3>Go further</h3>
      </div>

      <section className="list">
        <Link to="/constitution" className="row naps-row tone-blue">
          <span className="ico ico-sm ico--tint tone-blue">
            <FileText size={18} />
          </span>

          <div>
            <h3>Read the constitution</h3>
            <p>The full document governing the association.</p>
          </div>

          <ChevronRight size={18} className="home-chev" />
        </Link>

        <Link to="/executives" className="row naps-row tone-green">
          <span className="ico ico-sm ico--tint tone-green">
            <Users size={18} />
          </span>

          <div>
            <h3>View executives</h3>
            <p>The current council, their offices and how to reach them.</p>
          </div>

          <ChevronRight size={18} className="home-chev" />
        </Link>
      </section>
    </>
  );
}

export default Naps;
