import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Megaphone, Pin, X } from "lucide-react";
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

function ago(value) {
  if (!value) return "Now";
  const m = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (m < 1) return "Now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : "This week";
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
  const moved = useRef(false);
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
    if (e.target.closest(".np-x")) return;
    start.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
    setPaused(true);
    setDrag({ x: 0, y: 0, on: true });
  }
  function move(e) {
    if (!drag.on) return;
    const x = e.clientX - start.current.x;
    const y = Math.min(0, e.clientY - start.current.y); // only upward
    if (Math.abs(x) > 6 || y < -6) moved.current = true;
    setDrag({ x, y, on: true });
  }
  function up() {
    if (!drag.on) return;
    const gone = Math.abs(drag.x) > 90 || drag.y < -50;
    setPaused(false);
    if (gone) advance();
    else {
      setDrag({ x: 0, y: 0, on: false });
      if (!moved.current) read(); // a tap opens the notice
    }
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

  const more = Math.max(0, queue.length - i - 1);

  return createPortal(
    <div className="np-wrap" role="status" aria-live="polite">
      <div className="np-pile">
        {more > 0 && !leaving && <span className="np-stack s1" aria-hidden="true" />}
        {more > 1 && !leaving && <span className="np-stack s2" aria-hidden="true" />}

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
            <div className="np-head">
              <img
                className="np-logo"
                src="/images/naps-logo.png"
                alt=""
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
              <span className="np-brand">NAPS LASUCOM</span>
              <span className="np-dot" />
              <span className="np-time">{ago(current.published_at || current.scheduled_for)}</span>
              {queue.length > 1 && (
                <span className="np-count">
                  {i + 1}/{queue.length}
                </span>
              )}
              <button type="button" className="np-x" onClick={finish} aria-label="Dismiss">
                <X size={14} />
              </button>
            </div>

            <div className="np-body">
              {current.image_url ? (
                <img className="np-thumb" src={current.image_url} alt="" draggable="false" />
              ) : (
                <span className="np-thumb np-thumb--ico">
                  <Megaphone size={22} />
                </span>
              )}
              <div className="np-text">
                <h3>{current.title}</h3>
                <p>{current.body}</p>
              </div>
            </div>

            <div className="np-foot">
              <span className="np-chip">
                {urgent ? "Urgent" : current.is_pinned ? (<><Pin size={11} /> Pinned</>) : "New notice"}
              </span>
              <span className="np-go">
                Read notice <ChevronRight size={15} />
              </span>
            </div>
          </div>

          <span
            className="np-timer"
            style={{
              animationDuration: `${AUTO_HIDE}ms`,
              animationPlayState: paused ? "paused" : "running",
            }}
            key={`t${current.id}`}
          />
        </section>
      </div>
    </div>,
    portalRoot()
  );
}