import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Megaphone, Pin, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import "./NoticePopup.css";

/*
  A gentle "new notice" banner.

  - Slides in from the top a moment after the app opens (never blocks the page).
  - Only shows notices this device has not seen, read or deleted, and only
    recent ones, so a brand-new visitor is not buried in old notices.
  - At most 3 per visit, one at a time. Urgent and pinned come first.
  - Dismiss with Later, the X, or a swipe. Hides itself after a while.
  - Each notice is shown once per device (tracked in localStorage).
*/

const SEEN_KEY = "napslasucom_popup_seen";
const READ_KEY = "napslasucom_read_notifications";
const DISMISSED_KEY = "napslasucom_dismissed_notifications";

const RECENT_DAYS = 14;
const MAX_QUEUE = 3;
const SHOW_DELAY = 1600;
const AUTO_HIDE = 12000;
const EXIT_MS = 280;

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
    /* storage unavailable - the banner just may repeat */
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

export default function NewNoticePopup() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState([]);
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const [drag, setDrag] = useState({ x: 0, y: 0, on: false });

  const start = useRef({ x: 0, y: 0 });
  const hideTimer = useRef(null);
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
      setDrag({ x: 0, y: 0, on: false });
    }, EXIT_MS);
  }, []);

  const advance = useCallback(() => {
    if (i < queue.length - 1) {
      setDrag({ x: 0, y: 0, on: false });
      setI(i + 1);
    } else {
      finish();
    }
  }, [i, queue.length, finish]);

  // Quietly leave after a while, unless the person is touching it.
  useEffect(() => {
    if (!open || leaving || paused) return undefined;
    hideTimer.current = setTimeout(advance, AUTO_HIDE);
    return () => clearTimeout(hideTimer.current);
  }, [open, leaving, paused, i, advance]);

  // Esc closes it.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && finish();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish]);

  function read() {
    const id = current.id;
    finish();
    navigate("/notifications", { state: { openId: id } });
  }

  function down(e) {
    if (e.target.closest("button")) return;
    start.current = { x: e.clientX, y: e.clientY };
    setPaused(true);
    setDrag({ x: 0, y: 0, on: true });
  }
  function move(e) {
    if (!drag.on) return;
    const x = e.clientX - start.current.x;
    const y = Math.min(0, e.clientY - start.current.y); // only upward
    setDrag({ x, y, on: true });
  }
  function up() {
    if (!drag.on) return;
    const gone = Math.abs(drag.x) > 90 || drag.y < -50;
    setPaused(false);
    if (gone) advance();
    else setDrag({ x: 0, y: 0, on: false });
  }

  if (!open || !current) return null;

  const urgent = /urgent/i.test(current.category || "");
  const style = drag.on
    ? {
        transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 40}deg)`,
        opacity: Math.max(0.35, 1 - Math.abs(drag.x) / 320),
        transition: "none",
      }
    : undefined;

  return createPortal(
    <div className="np-wrap" role="status" aria-live="polite">
      <section
        className={`np-card${leaving ? " is-out" : ""}${urgent ? " is-urgent" : ""}`}
        style={style}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => !drag.on && setPaused(false)}
      >
        <div className="np-inner" key={current.id}>
          {current.image_url && (
            <img className="np-img" src={current.image_url} alt="" draggable="false" />
          )}

          <div className="np-main">
            {!current.image_url && (
              <span className="np-ico">
                <Megaphone size={18} />
              </span>
            )}

            <div className="np-text">
              <div className="np-tags">
                <span className="np-tag">{urgent ? "Urgent" : "New notice"}</span>
                {current.is_pinned && (
                  <span className="np-pin">
                    <Pin size={11} /> Pinned
                  </span>
                )}
                {queue.length > 1 && (
                  <span className="np-count">
                    {i + 1} of {queue.length}
                  </span>
                )}
              </div>
              <h3>{current.title}</h3>
              <p>{current.body}</p>
            </div>

            <button type="button" className="np-x" onClick={finish} aria-label="Close">
              <X size={16} />
            </button>
          </div>

          <div className="np-actions">
            <button type="button" className="np-btn np-btn--ghost" onClick={advance}>
              {i < queue.length - 1 ? "Next" : "Later"}
            </button>
            <button type="button" className="np-btn np-btn--primary" onClick={read}>
              Read notice
              <ArrowRight size={15} />
            </button>
          </div>

          <span
            className="np-timer"
            style={{
              animationDuration: `${AUTO_HIDE}ms`,
              animationPlayState: paused ? "paused" : "running",
            }}
            key={`t${current.id}`}
          />
        </div>
      </section>
    </div>,
    portalRoot()
  );
}