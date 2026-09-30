import { MessageSquareText, ShieldCheck, Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { canViewReviews } from "../../utils/reviewCampaign";

const PAGE_SIZE = 20;

/*
  Ratings for the whole campaign are fetched as bare numbers (cheap even in
  the thousands) so the summary and filter counts are exact. The review list
  itself pages from the server, so a long campaign never loads every comment.
*/
function AdminReviews() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState(null);
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [ratings, setRatings] = useState([]); // { campaign_id, rating }
  const [commentCount, setCommentCount] = useState(0);
  const latestRequest = useRef(0);
  const [rows, setRows] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [ratingFilter, setRatingFilter] = useState(0); // 0 = all
  const [commentsOnly, setCommentsOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: me } = user
      ? await supabase
          .from("admin_profiles")
          .select("role")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle()
      : { data: null };

    setProfile(me || null);
    if (!canViewReviews(me?.role)) {
      setLoading(false);
      return;
    }

    const [{ data: settings }, { data: all }] = await Promise.all([
      supabase
        .from("org_settings")
        .select("review_campaign_active, review_campaign_id")
        .maybeSingle(),
      supabase.from("app_reviews").select("campaign_id, rating").limit(10000),
    ]);

    setCampaign(settings || null);
    setSelectedCampaign(settings?.review_campaign_id || "");
    setRatings(all || []);
    setLoading(false);
  }

  useEffect(() => {
    if (!selectedCampaign) return;
    supabase
      .from("app_reviews")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", selectedCampaign)
      .not("comment", "is", null)
      .then(({ count }) => setCommentCount(count || 0));
  }, [selectedCampaign]);

  const loadPage = useCallback(
    async (offset) => {
      if (!selectedCampaign) return;
      const request = ++latestRequest.current;
      setListLoading(true);

      let query = supabase
        .from("app_reviews")
        .select("id, rating, comment, created_at")
        .eq("campaign_id", selectedCampaign)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (ratingFilter) query = query.eq("rating", ratingFilter);
      if (commentsOnly) query = query.not("comment", "is", null);

      const { data, error: listError } = await query;
      // A filter changed while this was in flight; the newer request owns the list.
      if (request !== latestRequest.current) return;
      setListLoading(false);

      if (listError) {
        setError("Could not load reviews.");
        return;
      }

      setRows((prev) => (offset === 0 ? data : [...prev, ...data]));
      setHasMore(data.length === PAGE_SIZE);
    },
    [selectedCampaign, ratingFilter, commentsOnly]
  );

  useEffect(() => {
    loadPage(0);
  }, [loadPage]);

  // Every campaign that has reviews, plus the live one even before its first.
  const campaigns = useMemo(() => {
    const ids = new Set(ratings.map((r) => r.campaign_id));
    if (campaign?.review_campaign_id) ids.add(campaign.review_campaign_id);
    return [...ids].sort().reverse();
  }, [ratings, campaign]);

  const summary = useMemo(() => {
    const inCampaign = ratings.filter((r) => r.campaign_id === selectedCampaign);
    const byStar = [0, 0, 0, 0, 0, 0];
    for (const r of inCampaign) byStar[r.rating] += 1;
    const total = inCampaign.length;
    const average = total
      ? inCampaign.reduce((sum, r) => sum + r.rating, 0) / total
      : 0;
    return { total, average, byStar, comments: commentCount };
  }, [ratings, selectedCampaign, commentCount]);

  async function saveCampaign(changes) {
    setBusy(true);
    setError("");

    const { error: updateError } = await supabase
      .from("org_settings")
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("id", true);

    setBusy(false);
    if (updateError) {
      setError("Could not update the campaign. Try again.");
      return;
    }

    setCampaign((prev) => ({ ...prev, ...changes }));
    if (changes.review_campaign_id) setSelectedCampaign(changes.review_campaign_id);
  }

  function startNewCampaign() {
    const ok = window.confirm(
      "Start a new review campaign? Every student will be asked again, including those who already reviewed. Past reviews stay available here."
    );
    if (!ok) return;

    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    saveCampaign({ review_campaign_id: `review-${stamp}`, review_campaign_active: true });
  }

  if (loading) {
    return (
      <main className="admin-page">
        <div className="askel" style={{ height: 64, marginBottom: 12 }} />
        <div className="askel" style={{ height: 180 }} />
      </main>
    );
  }

  if (!canViewReviews(profile?.role)) {
    return (
      <main className="admin-page">
        <section className="admin-empty-panel">
          <ShieldCheck size={34} />
          <h3>Access denied</h3>
          <p>Student reviews are for the President, Vice President, General Secretary and PRO.</p>
        </section>
      </main>
    );
  }

  const isLive = Boolean(campaign?.review_campaign_active);
  const viewingLive = selectedCampaign === campaign?.review_campaign_id;

  return (
    <main className="admin-page">
      <header className="apage-head">
        <div>
          <p className="apage-eyebrow">Students</p>
          <h1>Reviews</h1>
          <p>
            {isLive
              ? "The rating popup is live for students."
              : "The rating popup is off. Students are not being asked."}
          </p>
        </div>

        <div className="apage-actions">
          <button
            type="button"
            className="abtn"
            disabled={busy || !campaign}
            onClick={startNewCampaign}
          >
            New campaign
          </button>
          <button
            type="button"
            className={isLive ? "abtn abtn--danger" : "abtn abtn--primary"}
            disabled={busy || !campaign}
            onClick={() => saveCampaign({ review_campaign_active: !isLive })}
          >
            {isLive ? "Turn off popup" : "Turn on popup"}
          </button>
        </div>
      </header>

      {error && <p className="areview-error">{error}</p>}

      <section className="apanel areview-summary">
        <div className="areview-score">
          <strong>{summary.total ? summary.average.toFixed(1) : "–"}</strong>
          <span className="areview-stars" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className={n <= Math.round(summary.average) ? "is-on" : ""}>
                ★
              </span>
            ))}
          </span>
          <small>
            {summary.total} review{summary.total === 1 ? "" : "s"} · {summary.comments} with comments
          </small>
        </div>

        <div className="areview-bars">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = summary.byStar[star];
            const pct = summary.total ? (count / summary.total) * 100 : 0;
            return (
              <button
                type="button"
                key={star}
                className={ratingFilter === star ? "areview-bar is-on" : "areview-bar"}
                onClick={() => setRatingFilter(ratingFilter === star ? 0 : star)}
                aria-label={`${star} star reviews: ${count}. Filter.`}
              >
                <span>{star} ★</span>
                <span className="areview-track">
                  <span style={{ width: `${pct}%` }} />
                </span>
                <em>{count}</em>
              </button>
            );
          })}
        </div>
      </section>

      <div className="atoolbar">
        <div className="aseg">
          <button
            type="button"
            className={!commentsOnly ? "is-on" : ""}
            onClick={() => setCommentsOnly(false)}
          >
            All <em>{summary.total}</em>
          </button>
          <button
            type="button"
            className={commentsOnly ? "is-on" : ""}
            onClick={() => setCommentsOnly(true)}
          >
            With comments <em>{summary.comments}</em>
          </button>
        </div>

        {campaigns.length > 1 && (
          <select
            className="aselect"
            value={selectedCampaign}
            onChange={(e) => {
              setRatingFilter(0);
              setSelectedCampaign(e.target.value);
            }}
            aria-label="Campaign"
          >
            {campaigns.map((id) => (
              <option key={id} value={id}>
                {id}
                {id === campaign?.review_campaign_id ? " (current)" : ""}
              </option>
            ))}
          </select>
        )}

        {ratingFilter > 0 && (
          <button type="button" className="achip-f is-on" onClick={() => setRatingFilter(0)}>
            {ratingFilter} ★ only ✕
          </button>
        )}
      </div>

      <section className="apanel">
        <div className="apanel-head">
          <h2>{viewingLive ? "Current campaign" : "Past campaign"}</h2>
          <span className="apill apill--muted">{selectedCampaign}</span>
        </div>

        {rows.length === 0 && !listLoading ? (
          <div className="aempty-row">
            <MessageSquareText size={26} />
            <strong>
              {summary.total ? "No reviews match this filter" : "No reviews yet"}
            </strong>
            <span>
              {summary.total
                ? "Try another rating or show all reviews."
                : isLive
                  ? "Ratings will appear here as students respond."
                  : "Turn on the popup to start collecting ratings."}
            </span>
          </div>
        ) : (
          <ul className="areview-list">
            {rows.map((review) => (
              <li key={review.id} className="areview-item">
                <span className="areview-item-stars" aria-label={`${review.rating} of 5 stars`}>
                  {"★".repeat(review.rating)}
                  <span className="is-off">{"★".repeat(5 - review.rating)}</span>
                </span>

                {review.comment ? (
                  <ReviewComment text={review.comment} />
                ) : (
                  <p className="areview-text is-empty">Rating only</p>
                )}

                <time className="areview-meta" dateTime={review.created_at}>
                  {formatDate(review.created_at)}
                </time>
              </li>
            ))}
          </ul>
        )}

        {(hasMore || listLoading) && (
          <div className="areview-more">
            <button
              type="button"
              className="abtn"
              disabled={listLoading}
              onClick={() => loadPage(rows.length)}
            >
              <Star size={14} />
              {listLoading ? "Loading..." : "Load more reviews"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

// Clamped to three lines; the toggle appears only when that actually cuts
// text off at the current width, not on a character-count guess.
function ReviewComment({ text }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || open) return;

    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);

  return (
    <div className="areview-comment">
      <p ref={ref} className={open ? "areview-text" : "areview-text is-clamped"}>
        {text}
      </p>
      {(overflows || open) && (
        <button type="button" onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function formatDate(iso) {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default AdminReviews;
