import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";

const DISMISS_KEY = "napslasucom_install_dismissed_at";
const DISMISS_DAYS = 7;
const VISIT_KEY = "napslasucom_visit_count";
const MIN_VISITS_BEFORE_PROMPT = 2;

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function wasDismissedRecently() {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;

  const dismissedAt = Number(raw);
  const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
  return daysSince < DISMISS_DAYS;
}

function bumpVisitCount() {
  const current = Number(localStorage.getItem(VISIT_KEY) || "0") + 1;
  localStorage.setItem(VISIT_KEY, String(current));
  return current;
}

function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || wasDismissedRecently()) return;

    const visits = bumpVisitCount();
    if (visits < MIN_VISITS_BEFORE_PROMPT) return;

    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setDeferredPrompt(event);

      // Small delay so it doesn't appear the instant the page paints —
      // feels far less naggy.
      setTimeout(() => setVisible(true), 4000);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
    };
  }, []);

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }

  async function handleInstall() {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    await deferredPrompt.userChoice;

    setDeferredPrompt(null);
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  }

  if (!visible || !deferredPrompt) return null;

  return (
    <div className="install-prompt-banner">
      <div className="install-prompt-icon">
        <Download size={18} />
      </div>

      <div className="install-prompt-text">
        <strong>Install NAPS LASUCOM</strong>
        <span>Add to your home screen for faster access.</span>
      </div>

      <button
        type="button"
        className="install-prompt-cta"
        onClick={handleInstall}
      >
        Install
      </button>

      <button
        type="button"
        className="install-prompt-close"
        onClick={handleDismiss}
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export default InstallPrompt;
