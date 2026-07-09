import {
  Crown,
  FileText,
  HeartHandshake,
  Megaphone,
  Phone,
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
      <section className="page-header executives-header">
        <p>NAPS LASUCOM</p>
        <h1>Executives</h1>
        <span>Current executive council, offices and contact access.</span>
      </section>

      <section className="exec-hero-card">
        <div>
          <h3>{pageTitle}</h3>
          <p>{pageSession}</p>
        </div>

        <img src="/images/naps-logo.png" alt="NAPS LASUCOM" />
      </section>

      {loading && (
        <section className="empty-state">
          <h3>Loading executives...</h3>
          <p>Please wait while we fetch the current executive council.</p>
        </section>
      )}

      {!loading && errorMessage && (
        <section className="empty-state">
          <h3>Unable to load executives</h3>
          <p>{errorMessage}</p>
        </section>
      )}

      {!loading && !errorMessage && executives.length === 0 && (
        <section className="empty-state">
          <h3>No executive profile yet</h3>
          <p>The current executive council will appear here once uploaded.</p>
        </section>
      )}

      {!loading && !errorMessage && executives.length > 0 && (
        <section className="executives-list executive-photo-list">
          {executives.map((exec) => (
            <ExecutiveCard key={exec.id} exec={exec} />
          ))}
        </section>
      )}
    </>
  );
}

function ExecutiveCard({ exec }) {
  const details = officeDetails[exec.office] || {
    role: "Executive council member.",
    icon: <Users size={24} />,
    color: "blue",
  };

  const phoneLink = getPhoneLink(exec.phone);

  return (
    <article className={`exec-photo-card ${details.color}`}>
      <div className="exec-photo-box">
        {exec.image_url && (
          <img
            src={exec.image_url}
            alt={exec.full_name}
            onError={(e) => {
              e.currentTarget.style.display = "none";
              e.currentTarget.nextElementSibling.style.display = "grid";
            }}
          />
        )}

        <div
          className={`exec-photo-fallback ${details.color}`}
          style={{ display: exec.image_url ? "none" : "grid" }}
        >
          {details.icon}
        </div>
      </div>

      <div className="exec-photo-content">
        <span>{exec.office}</span>
        <h3>{exec.full_name}</h3>
        <p>{details.role}</p>
      </div>

      {phoneLink ? (
        <a href={phoneLink} target="_blank" rel="noreferrer">
          <Phone size={15} />
        </a>
      ) : (
        <button type="button" className="exec-phone-disabled" disabled>
          <Phone size={15} />
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