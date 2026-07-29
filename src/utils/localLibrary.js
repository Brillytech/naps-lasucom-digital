// Small localStorage-backed helpers for favorites and recently viewed
// resources. No Supabase/auth involved — this is per-device only, which
// is the right tradeoff since students don't have accounts.

const FAVORITES_KEY = "napslasucom_favorites";
const RECENT_KEY = "napslasucom_recent";
const RECENT_LIMIT = 6;

function safeParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/* ============ FAVORITES ============ */

export function getFavorites() {
  return safeParse(localStorage.getItem(FAVORITES_KEY), []);
}

export function isFavorited(id) {
  if (!id) return false;
  return getFavorites().some((item) => item.id === id);
}

export function toggleFavorite(item) {
  if (!item?.id) return getFavorites();

  const current = getFavorites();
  const exists = current.some((fav) => fav.id === item.id);

  const updated = exists
    ? current.filter((fav) => fav.id !== item.id)
    : [
        {
          id: item.id,
          title: item.title || "Resource",
          category: item.category || "",
          course_code: item.course_code || "",
          level: item.level || "",
          semester: item.semester || "",
          external_link: item.external_link || item.file_url || "",
          saved_at: Date.now(),
        },
        ...current,
      ];

  localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
  return updated;
}

export function removeFavorite(id) {
  const updated = getFavorites().filter((fav) => fav.id !== id);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
  return updated;
}

/* ============ RECENTLY VIEWED ============ */

export function getRecentlyViewed() {
  return safeParse(localStorage.getItem(RECENT_KEY), []);
}

export function addRecentlyViewed({ url, title }) {
  if (!url) return getRecentlyViewed();

  const current = getRecentlyViewed().filter((entry) => entry.url !== url);

  const updated = [
    { url, title: title || "Resource", viewed_at: Date.now() },
    ...current,
  ].slice(0, RECENT_LIMIT);

  localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  return updated;
}

export function clearRecentlyViewed() {
  localStorage.removeItem(RECENT_KEY);
}
