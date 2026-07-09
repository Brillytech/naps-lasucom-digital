import {
  ArrowLeft,
  BookOpen,
  Download,
  FileText,
  Landmark,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

const constitutionPdfPath = "/constitution.pdf";

const constitutionArticles = [
  {
    id: "preamble",
    label: "Preamble",
    title: "Preamble",
    body: [
      "We, the members of Nigeria Association of Physiotherapy Students, Lagos State University College of Medicine (NAPS-LASUCOM), having firmly and solemnly resolved to associate in unity and harmony as one student body dedicated to the study of Physiotherapy in Nigeria, do enact this Constitution.",
      "This Constitution shall guide and direct the conduct of members and the affairs of the Association, for the purpose of promoting good governance, equity, ethics, justice, fair hearing and unity.",
    ],
  },
  {
    id: "article-1",
    label: "Article 1",
    title: "The Association",
    body: [
      "The Association shall be known, called and addressed as Nigeria Association of Physiotherapy Students, Lagos State University College of Medicine (NAPS-LASUCOM).",
      "The motto of the Association shall be “Strength In Knowledge, Service to Humanity.”",
      "The address of the Association shall be Department of Physiotherapy, Allied Health Sciences, Lagos State University College of Medicine, Ikeja-Lagos.",
    ],
    points: [
      "Unite students with common interests.",
      "Protect rights, promote interests and ensure welfare.",
      "Promote ethics, professionalism and leadership.",
      "Support outreach, public awareness, research and innovation.",
    ],
  },
  {
    id: "article-2",
    label: "Article 2",
    title: "Membership",
    body: [
      "Ordinary membership shall be automatically conferred on any undergraduate student registered for training in the Department of Physiotherapy, Lagos State University College of Medicine.",
      "Ordinary members are expected to attend meetings, participate actively, uphold the integrity of the Association and be bound by the provisions of the Constitution.",
    ],
    points: [
      "Ordinary members may vote and be voted for.",
      "Honorary membership may be conferred on qualified individuals or groups.",
      "Life membership may be conferred on distinguished past members.",
      "Membership may cease by graduation, withdrawal, change of department or disciplinary action.",
    ],
  },
  {
    id: "article-3",
    label: "Article 3",
    title: "Advisory Council",
    body: [
      "The Advisory Council includes advisers, patrons/matrons, grand patrons/matrons and life patrons/matrons.",
      "Their advice may be needed from time to time, and they shall be informed of important issues affecting the Association.",
    ],
  },
  {
    id: "article-4",
    label: "Article 4",
    title: "Congress",
    body: [
      "The general assembly of all undergraduate students of the department shall be referred to as Congress.",
      "Congress meetings shall be held at least once in a session, and decisions taken at any congress meeting shall be binding.",
    ],
    points: [
      "There should be at least 48 hours notice before any congress meeting.",
      "Voting may be by voice vote or show of hands.",
      "Emergency congress may be summoned when necessary.",
      "Congress has power to debate matters relevant to the progress of the Association.",
    ],
  },
  {
    id: "article-5",
    label: "Article 5",
    title: "NAPS-LASUCOM Senate",
    body: [
      "The NAPS-LASUCOM Senate shall be the representative and policy-making body of the Association.",
      "Members of the Senate shall be known and addressed as Senators.",
    ],
    points: [
      "The Senate approves budgets and capital projects.",
      "The Senate may set up disciplinary committees.",
      "The Senate gives reports to Congress when necessary.",
      "The Senate conducts bye-elections within the Association.",
    ],
  },
  {
    id: "article-6",
    label: "Article 6",
    title: "Executive Council",
    body: [
      "The Executive Council shall carry out the day-to-day running of the Association and give consistent updates of its activities to members.",
      "The Executive Council shall be the official representative of the Association to external occasions.",
    ],
    points: [
      "President",
      "Vice President",
      "General Secretary",
      "Assistant General Secretary",
      "Financial Secretary",
      "Treasurer",
      "Public Relations Officer",
      "Social Director",
      "Sports Director",
    ],
  },
  {
    id: "article-7",
    label: "Article 7",
    title: "Committees",
    body: [
      "The standing committees of the Association include the Press Committee, Academic Committee, Social Committee and Financial Committee.",
      "Each committee shall perform its assigned duties and any other function assigned by the Executives.",
    ],
  },
  {
    id: "article-8",
    label: "Article 8",
    title: "Election",
    body: [
      "There shall be an electoral commission whose members shall be chosen by the incumbent Executive Council and approved by the NAPS Senate.",
      "The electoral commission shall conduct elections, screen candidates and publish election results.",
    ],
    points: [
      "Voting shall be by secret ballot.",
      "Campaigns should stop on or before 11:59 pm on manifesto night.",
      "An aspirant shall possess a minimum academic requirement of 3.0 CGPA.",
      "The electoral commission is disbanded after publication of final results.",
    ],
  },
  {
    id: "article-9",
    label: "Article 9",
    title: "Financial Structure",
    body: [
      "The main sources of income for the Association include annual dues, fundraising activities and donations.",
      "The President, Financial Secretary and Treasurer shall be joint signatories to the Association’s account.",
    ],
    points: [
      "Financial records shall be kept properly.",
      "Annual dues shall be charged on every member.",
      "Budgets shall include sources of funds and expected expenditure.",
      "Extra-budgetary expenses require approval.",
    ],
  },
  {
    id: "article-10",
    label: "Article 10",
    title: "Amendment",
    body: [
      "The Association shall have the power to amend its Constitution.",
      "No amendment shall be valid unless passed by the required majority and subsequently approved according to the provisions of the Constitution.",
    ],
  },
  {
    id: "article-11",
    label: "Article 11",
    title: "Oath of Office",
    body: [
      "Every officer of the Association shall take an oath of office and shall discharge their duties faithfully, according to the provisions of the Constitution and in the best interest of NAPS-LASUCOM.",
    ],
  },
];

function Constitution() {
  const [activeArticleId, setActiveArticleId] = useState("preamble");

  const activeArticle = useMemo(() => {
    return (
      constitutionArticles.find((article) => article.id === activeArticleId) ||
      constitutionArticles[0]
    );
  }, [activeArticleId]);

  return (
    <main className="constitution-page-clean">
      <div className="constitution-topbar-clean">
        <Link to="/naps" className="constitution-back-clean">
          <ArrowLeft size={18} />
          About NAPS
        </Link>
      </div>

      <header className="constitution-hero-clean">
        <img src="/images/naps-logo.png" alt="NAPS LASUCOM" />

        <div>
          <span>Official Document</span>
          <h1>NAPS-LASUCOM Constitution</h1>
          <p>
            Nigeria Association of Physiotherapy Students, Lagos State University
            College of Medicine.
          </p>
        </div>
      </header>

      <section className="constitution-motto-clean">
        <Landmark size={20} />
        <strong>Strength In Knowledge, Service to Humanity.</strong>
      </section>

      <section className="constitution-selector-clean">
        <label>Select Article</label>

        <select
          value={activeArticleId}
          onChange={(e) => setActiveArticleId(e.target.value)}
        >
          {constitutionArticles.map((article) => (
            <option key={article.id} value={article.id}>
              {article.label} - {article.title}
            </option>
          ))}
        </select>
      </section>

      <section className="constitution-layout-clean">
        <aside className="constitution-desktop-nav-clean">
          {constitutionArticles.map((article) => (
            <button
              key={article.id}
              type="button"
              className={activeArticleId === article.id ? "active" : ""}
              onClick={() => setActiveArticleId(article.id)}
            >
              <span>{article.label}</span>
              <strong>{article.title}</strong>
            </button>
          ))}
        </aside>

        <article className="constitution-article-clean">
          <div className="constitution-article-head-clean">
            <div>
              <span>{activeArticle.label}</span>
              <h2>{activeArticle.title}</h2>
            </div>

            <BookOpen size={22} />
          </div>

          <div className="constitution-text-clean">
            {activeArticle.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}

            {activeArticle.points && (
              <ul>
                {activeArticle.points.map((point) => (
                  <li key={point}>
                    <ShieldCheck size={16} />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="constitution-footer-note-clean">
            <FileText size={16} />
            <span>
              This is an app-friendly reader. Download the PDF for the original
              full document.
            </span>
          </div>
        </article>

        <section className="constitution-pdf-section-clean">
          <div>
            <span>Original Document</span>
            <h3>Download Full Constitution</h3>
            <p>
              Get the official PDF version of the NAPS-LASUCOM Constitution for
              offline reading or reference.
            </p>
          </div>

          <a
  href={constitutionPdfPath}
  target="_blank"
  rel="noreferrer"
  download="NAPS-LASUCOM-Constitution.pdf"
  className="constitution-pdf-download-wide"
>
  <Download size={18} />
  Download / Open PDF
</a>
        </section>
      </section>
    </main>
  );
}

export default Constitution;