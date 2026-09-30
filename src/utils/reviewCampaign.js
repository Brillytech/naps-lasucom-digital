// Per-browser state for the student review popup. Students are anonymous, so
// whether they've reviewed or dismissed lives here, keyed by campaign ID so a
// later campaign starts from a clean slate.

const KEY_PREFIX = "napslasucom_review_";
const DAY = 1000 * 60 * 60 * 24;

export const MAX_APPEARANCES = 3;
// Wait after the 1st and 2nd appearance; the 3rd is the last.
export const COOLDOWN_DAYS = [3, 7];

function storageKey(campaignId) {
  return KEY_PREFIX + campaignId;
}

export function readReviewState(campaignId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(campaignId)));
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // Missing or corrupt -- treat as never seen.
  }
  return { submitted: false, appearances: 0, lastShownAt: null, lastDismissedAt: null };
}

function writeReviewState(campaignId, state) {
  try {
    localStorage.setItem(storageKey(campaignId), JSON.stringify(state));
  } catch {
    // Private mode / full storage: the popup just behaves as first-visit.
  }
}

export function shouldShowReview(state, now = Date.now()) {
  if (state.submitted) return false;
  if (state.appearances >= MAX_APPEARANCES) return false;
  if (state.appearances === 0) return true;

  // A popup that was shown but never answered (tab closed) still counts as
  // seen, so the cooldown runs from whichever happened last.
  const lastSeen = Math.max(state.lastShownAt || 0, state.lastDismissedAt || 0);
  const cooldown = COOLDOWN_DAYS[state.appearances - 1] * DAY;
  return now - lastSeen >= cooldown;
}

export function markReviewShown(campaignId, now = Date.now()) {
  const state = readReviewState(campaignId);
  writeReviewState(campaignId, {
    ...state,
    appearances: (state.appearances || 0) + 1,
    lastShownAt: now,
  });
}

export function markReviewDismissed(campaignId, now = Date.now()) {
  writeReviewState(campaignId, { ...readReviewState(campaignId), lastDismissedAt: now });
}

export function markReviewSubmitted(campaignId) {
  writeReviewState(campaignId, { ...readReviewState(campaignId), submitted: true });
}

// Admin offices that see reviews and run campaigns. Mirrors is_review_admin()
// in supabase/migrations/20260929120000_restrict_review_access.sql.
export const REVIEW_ROLES = ["president", "vice_president", "general_secretary", "pro"];

export function canViewReviews(role) {
  return REVIEW_ROLES.includes(role);
}
