import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { supabase } from "../lib/supabase";
import "./NoticePopup.css";

/*
  "New notice" popup.

  - Appears in the middle of the screen a moment after the app opens.
  - Only notices this device has not seen, read or deleted, and only recent
    ones, so a first-time visitor is not buried in old notices.
  - One at a time, at most 3 per visit. Urgent first, then pinned, then newest.
  - Dismiss with Maybe later, the X, tapping outside, or Esc.
  - Each notice is shown once per device (tracked in localStorage).
*/

const SEEN_KEY = "napslasucom_popup_seen";
const READ_KEY = "napslasucom_read_notifications";
const DISMISSED_KEY = "napslasucom_dismissed_notifications";

const RECENT_DAYS = 14;
const MAX_QUEUE = 3;
const SHOW_DELAY = 1500;
const EXIT_MS = 260;

function readIds(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function markSeen(id) {
  try {
    const next = [...new Set([...readIds(SEEN_KEY), id])].slice(-200);
    localStorage.setItem(SEEN_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable - the popup may repeat */
  }
}

function rank(a, b) {
  const urgent = (x) => (/urgent/i.test(x.category || "") ? 1 : 0);
  if (urgent(a) !== urgent(b)) return urgent(b) - urgent(a);
  if (Boolean(a.is_pinned) !== Boolean(b.is_pinned)) return a.is_pinned ? -1 : 1;
  const t = (x) => new Date(x.published_at || x.scheduled_for || 0).getTime();
  return t(b) - t(a);
}

function portalRoot() {
  return document.querySelector(".app") || document.body;
}

/* A friendly megaphone, drawn here so there is no image to load. */
function Megaphone() {
  return (
    <svg className="np-mega" viewBox="0 0 140 120" aria-hidden="true">
      <defs>
        <linearGradient id="npHorn" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe08a" />
          <stop offset="1" stopColor="#ff9f1c" />
        </linearGradient>
        <linearGradient id="npBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#c9dcff" />
        </linearGradient>
      </defs>
      <g className="np-mega-lines" stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none">
        <path className="l1" d="M112 22 L124 12" />
        <path className="l2" d="M120 46 L135 44" />
        <path className="l3" d="M112 72 L125 80" />
      </g>
      <g transform="rotate(-8 60 60)">
        <rect x="52" y="64" width="18" height="38" rx="7" fill="#0b3d91" />
        <rect x="14" y="44" width="30" height="30" rx="9" fill="url(#npBody)" />
        <path d="M40 46 L98 16 Q112 58 98 100 L40 72 Z" fill="url(#npHorn)" />
        <ellipse cx="99" cy="58" rx="11" ry="40" fill="#0b3d91" />
        <ellipse cx="97" cy="58" rx="6" ry="31" fill="#1e6bff" opacity="0.7" />
      </g>
    </svg>
  );
}

export default function NewNoticePopup() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState([]);
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const current = queue[i];

  // Load once, on open.
  useEffect(() => {
    let dead = false;
    let t;

    (async () => {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .or(
          `status.eq.published,and(status.eq.scheduled,scheduled_for.lte.${nowIso})`
        )
        .order("is_pinned", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(10);

      if (error || dead) return;

      const skip = new Set([
        ...readIds(SEEN_KEY),
        ...readIds(READ_KEY),
        ...readIds(DISMISSED_KEY),
      ]);
      const cutoff = Date.now() - RECENT_DAYS * 86400000;

      const fresh = (data || [])
        .filter((a) => {
          if (skip.has(a.id)) return false;
          const when = new Date(a.published_at || a.scheduled_for || 0).getTime();
          return when >= cutoff;
        })
        .sort(rank)
        .slice(0, MAX_QUEUE);

      if (!fresh.length) return;
      setQueue(fresh);
      t = setTimeout(() => !dead && setOpen(true), SHOW_DELAY);
    })();

    return () => {
      dead = true;
      clearTimeout(t);
    };
  }, []);

  // Whatever was shown counts as seen, so it never comes back.
  useEffect(() => {
    if (open && current) markSeen(current.id);
  }, [open, current]);

  const finish = useCallback(() => {
    setLeaving(true);
    setTimeout(() => {
      setOpen(false);
      setLeaving(false);
    }, EXIT_MS);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && finish();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open, finish]);

  function read() {
    const id = current.id;
    finish();
    navigate("/notifications", { state: { openId: id } });
  }

  if (!open || !current) return null;

  const urgent = /urgent/i.test(current.category || "");
  const more = queue.length - i - 1;

  return createPortal(
    <div
      className={`np-backdrop${leaving ? " is-out" : ""}`}
      onClick={finish}
    >
      <section
        className={`np-card${urgent ? " is-urgent" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="New notice"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="np-glow" aria-hidden="true" />

        <button type="button" className="np-x" onClick={finish} aria-label="Close">
          <X size={15} />
        </button>

        <div className="np-art">
          <Megaphone />
        </div>

        <div className="np-content" key={current.id}>
          <span className="np-tag">
            {urgent ? "Urgent notice" : current.is_pinned ? "Pinned notice" : "New notice"}
          </span>
          <h2>{current.title}</h2>
          <p>{current.body}</p>

          <div className="np-actions">
            <button type="button" className="np-btn np-btn--solid" onClick={read}>
              Read now
            </button>
            <button type="button" className="np-btn np-btn--line" onClick={finish}>
              Maybe later
            </button>
          </div>

          {more > 0 && (
            <button type="button" className="np-more" onClick={() => setI(i + 1)}>
              {i + 1} of {queue.length} · Next notice →
            </button>
          )}
        </div>
      </section>
    </div>,
    portalRoot()
  );
}