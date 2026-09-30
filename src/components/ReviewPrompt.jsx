import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  markReviewDismissed,
  markReviewShown,
  markReviewSubmitted,
  readReviewState,
  shouldShowReview,
} from "../utils/reviewCampaign";

// Let the page settle before asking -- same courtesy as the install prompt.
const SHOW_DELAY_MS = 6000;
const THANKS_MS = 1800;
const LABELS = ["Poor", "Fair", "Good", "Very good", "Excellent"];

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap";

// Only visitors who are about to see the card pay for its fonts. Fetched at
// eligibility, so they are in by the time the delay runs out.
function loadCardFonts() {
  if (document.querySelector(`link[href="${FONT_HREF}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = FONT_HREF;
  document.head.appendChild(link);
}

// Reading a resource is the one place an interruption really costs something.
function isReadingRoute(pathname) {
  return pathname.startsWith("/resource-viewer");
}

function ReviewPrompt() {
  const { pathname } = useLocation();
  const [campaignId, setCampaignId] = useState(null);
  const [step, setStep] = useState(null); // "rate" | "comment" | "thanks"
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCampaign() {
      const { data, error } = await supabase.rpc("get_review_campaign");
      const campaign = Array.isArray(data) ? data[0] : data;
      if (cancelled || error || !campaign?.active || !campaign.campaign_id) return;
      if (!shouldShowReview(readReviewState(campaign.campaign_id))) return;
      loadCardFonts();
      setCampaignId(campaign.campaign_id);
    }

    loadCampaign();
    return () => {
      cancelled = true;
    };
  }, []);

  // Wait out the delay on a non-reading page; navigating resets the timer.
  useEffect(() => {
    if (!campaignId || step || isReadingRoute(pathname)) return;

    const timer = setTimeout(() => {
      markReviewShown(campaignId);
      setStep("rate");
    }, SHOW_DELAY_MS);

    return () => clearTimeout(timer);
  }, [campaignId, step, pathname]);

  useEffect(() => {
    if (step === "rate" || step === "comment") cardRef.current?.focus();
  }, [step]);

  function close() {
    setStep(null);
    setCampaignId(null);
  }

  function handleNotNow() {
    markReviewDismissed(campaignId);
    close();
  }

  async function submit(withComment) {
    if (saving) return;
    setSaving(true);

    const text = withComment ? comment.trim() : "";
    const { error } = await supabase.from("app_reviews").insert({
      campaign_id: campaignId,
      rating,
      comment: text || null,
    });
    if (error) console.error("Review not saved:", error.message);

    // Marked either way: asking again after a failed save would feel like the
    // site forgot them, which is worse than losing one rating.
    markReviewSubmitted(campaignId);
    setSaving(false);
    setStep("thanks");
    setTimeout(close, THANKS_MS);
  }

  function handleKeyDown(event) {
    if (event.key !== "Escape") return;
    if (step === "rate") handleNotNow();
    else if (step === "comment") submit(false);
  }

  if (!step) return null;

  return (
    <div className="review-prompt-layer" role="presentation">
      <div
        className="review-prompt"
        role="dialog"
        aria-modal="false"
        aria-labelledby="review-prompt-title"
        tabIndex={-1}
        ref={cardRef}
        onKeyDown={handleKeyDown}
      >
        {step === "rate" && (
          <>
            <h2 id="review-prompt-title">How would you rate Digital Connect?</h2>

            <div className="review-stars" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={`${value} star${value > 1 ? "s" : ""}, ${LABELS[value - 1]}`}
                  className={value <= rating ? "review-star is-on" : "review-star"}
                  onClick={() => setRating(value)}
                >
                  ★
                </button>
              ))}
            </div>

            <p className="review-prompt-sub">
              {rating ? LABELS[rating - 1] : "Your feedback takes less than 10 seconds."}
            </p>

            <button
              type="button"
              className="review-prompt-cta"
              disabled={!rating}
              onClick={() => setStep("comment")}
            >
              Continue
            </button>

            <button type="button" className="review-prompt-link" onClick={handleNotNow}>
              Not now
            </button>
          </>
        )}

        {step === "comment" && (
          <>
            <h2 id="review-prompt-title">What do you think about Digital Connect?</h2>
            <p className="review-prompt-sub">
              Tell us what you like or what we can improve.
            </p>

            <textarea
              className="review-prompt-input"
              placeholder="Write your feedback..."
              rows={3}
              maxLength={1000}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />

            <button
              type="button"
              className="review-prompt-cta"
              disabled={saving}
              onClick={() => submit(true)}
            >
              {saving ? "Sending..." : "Submit Review"}
            </button>

            <button
              type="button"
              className="review-prompt-link"
              disabled={saving}
              onClick={() => submit(false)}
            >
              Skip
            </button>
          </>
        )}

        {step === "thanks" && (
          <p className="review-prompt-thanks" role="status">
            Thank you for your feedback.
          </p>
        )}

        <p className="review-prompt-credit">Powered by BrillyTech Networks</p>
      </div>
    </div>
  );
}

export default ReviewPrompt;
