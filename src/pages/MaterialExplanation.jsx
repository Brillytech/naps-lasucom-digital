import {
  ArrowLeft,
  BookOpenCheck,
  ChevronDown,
  FileText,
  GraduationCap,
  Lightbulb,
  Search,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

/** Does this section match the search term? Checked across everything a
 *  student might search for, not just the heading. */
function sectionMatches(section, term) {
  if (!term) return true;

  const haystack = [
    section.title,
    section.content,
    section.clinical_relevance,
    ...(section.key_points || []),
    ...(section.exam_focus || []),
    ...(section.examples || []),
    ...(section.important_terms || []).flatMap((t) => [t.term, t.definition]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(term);
}

function MaterialExplanation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const id = searchParams.get("id");

  const [resource, setResource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState("");
  const [openSections, setOpenSections] = useState(() => new Set([0]));

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    supabase
      .from("resources")
      .select(
        "id, title, course_code, level, semester, external_link, file_url, processing_status, generated_explanation"
      )
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.log("Explanation fetch error:", error.message);
        setResource(data || null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const explanation = resource?.generated_explanation || null;
  const sections = useMemo(() => explanation?.sections || [], [explanation]);
  const query = term.trim().toLowerCase();

  const visible = useMemo(
    () =>
      sections
        .map((section, index) => ({ section, index }))
        .filter(({ section }) => sectionMatches(section, query)),
    [sections, query]
  );

  function toggle(index) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function jumpTo(index) {
    setOpenSections((prev) => new Set(prev).add(index));
    requestAnimationFrame(() => {
      document
        .getElementById(`ex-section-${index}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handleBack() {
    if (window.history.length > 1) navigate(-1);
    else navigate("/resources");
  }

  const viewerPath = resource?.id
    ? `/resource-viewer?id=${resource.id}`
    : "";

  /* ---------------- states ---------------- */

  if (loading) {
    return (
      <main className="ex-page">
        <header className="rl-head tone-blue">
          <div className="rl-head-top">
            <button type="button" className="rl-back" onClick={handleBack} aria-label="Back">
              <ArrowLeft size={18} />
            </button>
          </div>
          <div className="skel skel-line" style={{ width: "72%", height: 26, marginTop: 14 }} />
          <div className="skel skel-line" style={{ width: "45%", marginTop: 12 }} />
        </header>

        <div className="ex-skeleton" aria-hidden="true">
          {[0, 1, 2].map((n) => (
            <div key={n} className="ex-skel-block">
              <div className="skel skel-line" style={{ width: "38%", height: 14 }} />
              <div className="skel skel-line" style={{ width: "100%" }} />
              <div className="skel skel-line" style={{ width: "88%" }} />
            </div>
          ))}
        </div>
      </main>
    );
  }

  // No explanation yet: send the student to the document rather than a dead end.
  if (!resource || !explanation) {
    return (
      <main className="ex-page">
        <header className="rl-head tone-blue">
          <div className="rl-head-top">
            <button type="button" className="rl-back" onClick={handleBack} aria-label="Back">
              <ArrowLeft size={18} />
            </button>
          </div>
        </header>

        <section className="rl-empty">
          <div className="ico ico-md ico--tint tone-blue">
            <FileText size={24} />
          </div>
          <h3>No explanation for this one yet</h3>
          <p>
            The original document is still available and unchanged.
          </p>
          {viewerPath && (
            <Link to={viewerPath} className="rv-primary ex-open-original">
              <FileText size={17} />
              Open the document
            </Link>
          )}
        </section>
      </main>
    );
  }

  const meta = explanation.generated_metadata || {};

  return (
    <main className="ex-page">
      <header className="rl-head tone-blue">
        <div className="rl-head-top">
          <button type="button" className="rl-back" onClick={handleBack} aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <p className="rl-eyebrow">Explained</p>
        </div>

        <div className="rl-head-main">
          <span className="ico ico--tint tone-blue">
            <GraduationCap size={24} />
          </span>
          <h1>{explanation.title || resource.title}</h1>
        </div>

        <p className="rl-meta">
          {[resource.course_code, resource.level, resource.semester]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      {viewerPath && (
        <Link to={viewerPath} className="row row--capped ex-original">
          <span className="ico ico-sm ico--tint tone-green">
            <FileText size={18} />
          </span>
          <span>
            <span className="ex-original-title">Read the original</span>
            <span className="ex-original-sub">
              This explanation is a study aid, not a replacement.
            </span>
          </span>
        </Link>
      )}

      {explanation.introduction && (
        <p className="ex-intro">{explanation.introduction}</p>
      )}

      {explanation.learning_objectives?.length > 0 && (
        <>
          <div className="sec-head">
            <h3>What you should be able to do</h3>
          </div>
          <ul className="ex-objectives">
            {explanation.learning_objectives.map((objective) => (
              <li key={objective}>{objective}</li>
            ))}
          </ul>
        </>
      )}

      <div className="rl-search ex-search">
        <Search size={18} />
        <input
          placeholder="Search this explanation..."
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          aria-label="Search within this explanation"
        />
        {term && (
          <button
            type="button"
            className="ex-search-clear"
            onClick={() => setTerm("")}
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {!query && sections.length > 1 && (
        <>
          <div className="sec-head">
            <h3>Contents</h3>
          </div>
          <ol className="ex-toc">
            {sections.map((section, index) => (
              <li key={section.title || index}>
                <button type="button" onClick={() => jumpTo(index)}>
                  <span className="ex-toc-num">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{section.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}

      <div className="sec-head">
        <h3>
          {query
            ? `${visible.length} of ${sections.length} sections match`
            : "The lecture"}
        </h3>
      </div>

      {visible.length === 0 ? (
        <div className="rl-empty">
          <div className="ico ico-md ico--tint tone-blue">
            <Search size={24} />
          </div>
          <h3>Nothing matches “{term}”</h3>
          <p>Try a different word, or clear the search to see everything.</p>
        </div>
      ) : (
        <div className="ex-sections">
          {visible.map(({ section, index }) => {
            const open = openSections.has(index) || Boolean(query);

            return (
              <section
                key={section.title || index}
                id={`ex-section-${index}`}
                className={open ? "ex-section is-open" : "ex-section"}
              >
                <button
                  type="button"
                  className="ex-section-head"
                  onClick={() => toggle(index)}
                  aria-expanded={open}
                >
                  <span className="ex-section-num">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h2>{section.title}</h2>
                  <ChevronDown size={18} className="ex-chevron" />
                </button>

                {open && (
                  <div className="ex-section-body">
                    {section.content && <p className="ex-content">{section.content}</p>}

                    {section.important_terms?.length > 0 && (
                      <dl className="ex-terms">
                        {section.important_terms.map((entry) => (
                          <div key={entry.term} className="ex-term">
                            <dt>{entry.term}</dt>
                            <dd>{entry.definition}</dd>
                          </div>
                        ))}
                      </dl>
                    )}

                    {section.examples?.length > 0 && (
                      <div className="ex-block tone-green">
                        <div className="ex-block-head">
                          <Lightbulb size={16} />
                          <span>In practice</span>
                        </div>
                        <ul>
                          {section.examples.map((example) => (
                            <li key={example}>{example}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {section.clinical_relevance?.trim() && (
                      <div className="ex-block tone-green">
                        <div className="ex-block-head">
                          <Sparkles size={16} />
                          <span>Why it matters clinically</span>
                        </div>
                        <p>{section.clinical_relevance}</p>
                      </div>
                    )}

                    {section.key_points?.length > 0 && (
                      <div className="ex-block tone-blue">
                        <div className="ex-block-head">
                          <BookOpenCheck size={16} />
                          <span>Key points</span>
                        </div>
                        <ul>
                          {section.key_points.map((point) => (
                            <li key={point}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {section.exam_focus?.length > 0 && (
                      <div className="ex-block tone-amber">
                        <div className="ex-block-head">
                          <Target size={16} />
                          <span>Likely to be examined</span>
                        </div>
                        <ul>
                          {section.exam_focus.map((point) => (
                            <li key={point}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {!query && explanation.overall_key_points?.length > 0 && (
        <>
          <div className="sec-head">
            <h3>If you remember nothing else</h3>
          </div>
          <div className="ex-block tone-blue ex-final">
            <ul>
              {explanation.overall_key_points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        </>
      )}

      <p className="ex-footnote">
        Generated with {meta.model || "an AI model"} from the original document.
        Always check anything that matters against the lecture itself.
      </p>
    </main>
  );
}

export default MaterialExplanation;
