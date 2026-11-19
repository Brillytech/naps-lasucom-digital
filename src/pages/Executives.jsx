import {
  ChevronLeft,
  ChevronRight,
  Crown,
  FileText,
  HeartHandshake,
  Megaphone,
  AlertCircle,
  MessageCircle,
  ShieldCheck,
  Trophy,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import "../components/NoticePopup.css";

const officeDetails = {
  President: {
    role: "Leadership and general oversight.",
    icon: <Crown size={24} />,
    color: "blue",
  },
  "Vice President": {
    role: "Supports the president and association activities.",
    icon: <ShieldCheck size={24} />,
    color: "green",
  },
  "General Secretary": {
    role: "Secretariat, records and official documentation.",
    icon: <FileText size={24} />,
    color: "blue",
  },
  "Assistant General Secretary": {
    role: "Assists with records and administrative duties.",
    icon: <FileText size={24} />,
    color: "green",
  },
  "Financial Secretary": {
    role: "Financial records, dues and accountability.",
    icon: <Wallet size={24} />,
    color: "green",
  },
  Treasurer: {
    role: "Finance support and accountability.",
    icon: <Wallet size={24} />,
    color: "blue",
  },
  PRO: {
    role: "Publicity, announcements and media updates.",
    icon: <Megaphone size={24} />,
    color: "blue",
  },
  "Public Relations Officer": {
    role: "Publicity, announcements and media updates.",
    icon: <Megaphone size={24} />,
    color: "blue",
  },
  "Welfare Director": {
    role: "Welfare support and student concerns.",
    icon: <HeartHandshake size={24} />,
    color: "green",
  },
  "Social Director": {
    role: "Social programmes and student engagement.",
    icon: <Users size={24} />,
    color: "green",
  },
  "Sports Director": {
    role: "Sports activities and competitions.",
    icon: <Trophy size={24} />,
    color: "blue",
  },
};

function Executives() {
  const [currentSet, setCurrentSet] = useState(null);
  const [executives, setExecutives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [open, setOpen] = useState(null); // { index, origin }

  function openSheet(index, e) {
    // Where the tap happened, so the popup grows out of that card.
    const r = e?.currentTarget?.getBoundingClientRect?.();
    const origin = r
      ? {
          x: r.left + r.width / 2 - window.innerWidth / 2,
          y: r.top + r.height / 2 - window.innerHeight / 2,
        }
      : { x: 0, y: 40 };
    setOpen({ index, origin });
  }

  useEffect(() => {
    fetchExecutives();
  }, []);

  async function fetchExecutives() {
    setLoading(true);
    setErrorMessage("");

    const { data: setData, error: setError } = await supabase
      .from("executive_sets")
      .select("*")
      .eq("is_current", true)
      .maybeSingle();

    if (setError) {
      setErrorMessage(setError.message);
      setLoading(false);
      return;
    }

    if (!setData) {
      setCurrentSet(null);
      setExecutives([]);
      setLoading(false);
      return;
    }

    setCurrentSet(setData);

    const { data: executiveData, error: executiveError } = await supabase
      .from("executives")
      .select("*")
      .eq("set_id", setData.id)
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (executiveError) {
      setErrorMessage(executiveError.message);
      setLoading(false);
      return;
    }

    setExecutives(executiveData || []);
    setLoading(false);
  }

  const pageTitle = useMemo(() => {
    if (!currentSet) return "Executive Council";

    return currentSet.set_name || "NAPS-LASUCOM DEC";
  }, [currentSet]);

  const pageSession = useMemo(() => {
    if (!currentSet?.academic_session) return "Current executive council";

    return `${currentSet.academic_session} Academic Session`;
  }, [currentSet]);

  return (
    <>
      <header className="rl-head tone-blue">
        <div className="rl-head-top">
          <p className="rl-eyebrow">{pageTitle}</p>
        </div>

        <div className="rl-head-main">
          <span className="ico ico--tint tone-blue">
            <Users size={24} />
          </span>

          <h1>Executives</h1>
        </div>

        <p className="rl-meta">
          {loading
            ? pageSession
            : `${executives.length} ${
                executives.length === 1 ? "officer" : "officers"
              } · ${pageSession}`}
        </p>
      </header>

      {loading && (
        <section className="list" aria-busy="true">
          <ExecutiveSkeleton />
          <ExecutiveSkeleton />
          <ExecutiveSkeleton />
          <ExecutiveSkeleton />
        </section>
      )}

      {!loading && errorMessage && (
        <section className="rl-empty">
          <div className="ico ico-md ico--tint tone-amber">
            <AlertCircle size={24} />
          </div>
          <h3>Could not load the council</h3>
          <p>{errorMessage}</p>
        </section>
      )}

      {!loading && !errorMessage && executives.length === 0 && (
        <section className="rl-empty">
          <div className="ico ico-md ico--tint tone-blue">
            <Users size={24} />
          </div>
          <h3>No executives listed yet</h3>
          <p>
            The current executive council will show up here once the
            secretariat uploads it.
          </p>
        </section>
      )}

      {!loading && !errorMessage && executives.length > 0 && (
        <section className="list">
          {executives.map((exec, idx) => (
            <ExecutiveRow
              key={exec.id}
              exec={exec}
              onOpen={(e) => openSheet(idx, e)}
            />
          ))}
        </section>
      )}

      {open && executives[open.index] && (
        <ExecutiveSheet
          list={executives}
          index={open.index}
          origin={open.origin}
          onIndex={(index) => setOpen((o) => ({ ...o, index }))}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function ExecutiveSkeleton() {
  return (
    <div className="row exec-row" aria-hidden="true">
      <span className="skel exec-skel-photo" />

      <span>
        <span className="skel skel-line" style={{ width: "34%" }} />
        <span className="skel skel-line" style={{ width: "62%" }} />
      </span>
    </div>
  );
}

function ExecutiveRow({ exec, onOpen }) {
  const details = officeDetails[exec.office] || {
    role: "Executive council member.",
    icon: <Users size={22} />,
    color: "blue",
  };

  const [imageFailed, setImageFailed] = useState(false);

  const phoneLink = getPhoneLink(exec.phone);
  const showPhoto = exec.image_url && !imageFailed;

  return (
    <article
      className={`row exec-row is-tappable tone-${details.color}`}
      role="button"
      tabIndex={0}
      aria-label={`View ${exec.full_name}, ${exec.office}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(e);
        }
      }}
    >
      <div className="exec-photo">
        {showPhoto && (
          <img
            src={exec.image_url}
            alt={exec.full_name}
            onError={() => setImageFailed(true)}
          />
        )}

        {!showPhoto && (
          <div className="exec-photo-fallback">{details.icon}</div>
        )}
      </div>

      <div>
        <span className="exec-office">{exec.office}</span>
        <h3>{exec.full_name}</h3>
        <p>{details.role}</p>
      </div>

      {phoneLink ? (
        <a
          className="exec-contact"
          href={phoneLink}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          aria-label={`Message ${exec.full_name} on WhatsApp`}
          title="Message on WhatsApp"
        >
          <MessageCircle size={17} />
        </a>
      ) : (
        <button
          type="button"
          className="exec-contact"
          disabled
          onClick={(e) => e.stopPropagation()}
          aria-label="No contact listed"
          title="No contact listed"
        >
          <MessageCircle size={17} />
        </button>
      )}
    </article>
  );
}

function ExecutiveSheet({ list, index, origin, onIndex, onClose }) {
  const exec = list[index];
  const [imageFailed, setImageFailed] = useState(false);
  const touch = useRef(null);

  const details = officeDetails[exec.office] || {
    role: "Executive council member.",
    icon: <Users size={22} />,
    color: "blue",
  };
  const phoneLink = getPhoneLink(exec.phone);
  const showPhoto = exec.image_url && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [exec.id]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < list.length - 1) onIndex(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [index, list.length, onClose, onIndex]);

  function onTouchStart(e) {
    touch.current = e.touches[0].clientX;
  }
  function onTouchEnd(e) {
    if (touch.current == null) return;
    const dx = e.changedTouches[0].clientX - touch.current;
    touch.current = null;
    if (dx < -60 && index < list.length - 1) onIndex(index + 1);
    if (dx > 60 && index > 0) onIndex(index - 1);
  }

  return createPortal(
    <div className="es-backdrop" onClick={onClose}>
      <section
        className="es-card"
        role="dialog"
        aria-modal="true"
        aria-label={exec.full_name}
        style={{ "--fx": `${origin.x}px`, "--fy": `${origin.y}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="es-photo" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {showPhoto ? (
            <img
              key={exec.id}
              src={exec.image_url}
              alt={exec.full_name}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="es-photo-fallback">{details.icon}</div>
          )}

          <span className="es-count">
            {index + 1} of {list.length}
          </span>

          <button type="button" className="es-x" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
          <button
            type="button"
            className="es-nav prev"
            onClick={() => onIndex(index - 1)}
            disabled={index === 0}
            aria-label="Previous executive"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            className="es-nav next"
            onClick={() => onIndex(index + 1)}
            disabled={index === list.length - 1}
            aria-label="Next executive"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="es-body" key={exec.id}>
          <span className="es-office">{exec.office}</span>
          <h2>{exec.full_name}</h2>
          <p>{details.role}</p>

          <div className="es-act">
            {phoneLink ? (
              <a className="es-btn es-btn--wa" href={phoneLink} target="_blank" rel="noreferrer">
                <MessageCircle size={18} />
                Message on WhatsApp
              </a>
            ) : (
              <span className="es-btn es-btn--off">No contact listed</span>
            )}
            <button type="button" className="es-btn es-btn--ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.querySelector(".app") || document.body
  );
}

function getPhoneLink(phone) {
  if (!phone) return "";

  if (phone.startsWith("http")) {
    return phone;
  }

  const cleanPhone = phone.replace(/\D/g, "");

  if (!cleanPhone) return "";

  if (cleanPhone.startsWith("0")) {
    return `https://wa.me/234${cleanPhone.slice(1)}`;
  }

  if (cleanPhone.startsWith("234")) {
    return `https://wa.me/${cleanPhone}`;
  }

  return `https://wa.me/${cleanPhone}`;
}

export default Executives;