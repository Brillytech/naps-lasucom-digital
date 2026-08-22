import {
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
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

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

        <h1>Executives</h1>

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
          {executives.map((exec) => (
            <ExecutiveRow key={exec.id} exec={exec} />
          ))}
        </section>
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

function ExecutiveRow({ exec }) {
  const details = officeDetails[exec.office] || {
    role: "Executive council member.",
    icon: <Users size={22} />,
    color: "blue",
  };

  const [imageFailed, setImageFailed] = useState(false);

  const phoneLink = getPhoneLink(exec.phone);
  const showPhoto = exec.image_url && !imageFailed;

  return (
    <article className={`row exec-row tone-${details.color}`}>
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
          aria-label="No contact listed"
          title="No contact listed"
        >
          <MessageCircle size={17} />
        </button>
      )}
    </article>
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