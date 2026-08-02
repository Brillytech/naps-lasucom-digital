import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  Flag,
  Maximize2,
  Minimize2,
  Moon,
  RotateCw,
  Share2,
  Sun,
} from "lucide-react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  getDriveDownloadLink,
  getDriveOpenLink,
  getDriveViewLink,
  hasValidDriveFileId,
  isGoogleDriveLink,
} from "../utils/driveLinks";
import { addRecentlyViewed } from "../utils/localLibrary";

function ResourceViewer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const frameWrapperRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  function handleBack() {
    // location.key is "default" when there's no real previous entry in
    // this tab's history (e.g. a shared link opened directly) — in that
    // case navigate(-1) would do nothing, so fall back to Resources.
    if (location.key && location.key !== "default") {
      navigate(-1);
    } else {
      navigate("/resources");
    }
  }

  const rawUrl = searchParams.get("url");
  const title = searchParams.get("title") || "Resource";

  const isDrive = isGoogleDriveLink(rawUrl);
  const validDriveFile = isDrive ? hasValidDriveFileId(rawUrl) : true;

  const previewUrl = isDrive ? getDriveViewLink(rawUrl) : rawUrl;
  const openUrl = isDrive ? getDriveOpenLink(rawUrl) : rawUrl;
  const downloadUrl = isDrive ? getDriveDownloadLink(rawUrl) : rawUrl;

  useEffect(() => {
    if (rawUrl && validDriveFile) {
      addRecentlyViewed({ url: rawUrl, title });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawUrl, validDriveFile]);

  // Keep state in sync if the user exits fullscreen using the device's own
  // back gesture/button/escape key rather than our own toggle button.
  useEffect(() => {
    function handleFullscreenChange() {
      const active = Boolean(
        document.fullscreenElement || document.webkitFullscreenElement
      );

      setIsFullscreen(active);

      if (!active) {
        unlockOrientation();
      }
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener(
      "webkitfullscreenchange",
      handleFullscreenChange
    );

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        handleFullscreenChange
      );
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange
      );
    };
  }, []);

  const [isLandscapeLocked, setIsLandscapeLocked] = useState(false);
  const [isDimmed, setIsDimmed] = useState(false);
  const [shareStatus, setShareStatus] = useState("");

  function toggleDimmer() {
    setIsDimmed((prev) => !prev);
  }

  async function handleShare() {
    const shareUrl = `${window.location.origin}/resource-viewer?url=${encodeURIComponent(
      rawUrl
    )}&title=${encodeURIComponent(title)}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, url: shareUrl });
      } catch (err) {
        // User cancelled the share sheet — nothing to do.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus("Link copied!");
      setTimeout(() => setShareStatus(""), 2000);
    } catch (err) {
      setShareStatus("Could not copy link.");
      setTimeout(() => setShareStatus(""), 2000);
    }
  }

  function handleReportBroken() {
    const message = `The link for "${title}" appears to be broken or invalid.\n\nLink: ${
      rawUrl || "(none provided)"
    }`;

    navigate(
      `/requests?category=${encodeURIComponent(
        "Complaint"
      )}&message=${encodeURIComponent(message)}`
    );
  }

  async function lockLandscape() {
    try {
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock("landscape");
        setIsLandscapeLocked(true);
      }
    } catch (err) {
      // Orientation lock isn't supported on this device/browser
      // (common on iOS Safari) — nothing we can do here, the user
      // can still rotate their phone manually and it'll follow.
    }
  }

  function unlockOrientation() {
    try {
      if (screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
      }
    } catch (err) {
      // ignore — nothing to unlock on unsupported browsers
    }
    setIsLandscapeLocked(false);
  }

  function toggleLandscapeLock() {
    if (isLandscapeLocked) {
      unlockOrientation();
    } else {
      lockLandscape();
    }
  }

  async function enterFullscreen() {
    const el = frameWrapperRef.current;

    try {
      if (el?.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el?.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    } catch (err) {
      // Real Fullscreen API blocked or unsupported (common on iOS Safari) —
      // fall back to the CSS-only immersive mode below.
    }

    // No orientation lock here — fullscreen opens in whatever orientation
    // the phone is already in (usually portrait, with scrolling working
    // normally). Landscape is now an explicit opt-in via the rotate
    // button, not forced on everyone.
    setIsFullscreen(true);
  }

  async function exitFullscreen() {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (
        document.webkitFullscreenElement &&
        document.webkitExitFullscreen
      ) {
        document.webkitExitFullscreen();
      }
    } catch (err) {
      // ignore
    }

    unlockOrientation();
    setIsFullscreen(false);
  }

  function toggleFullscreen() {
    if (isFullscreen) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }

  if (!rawUrl) {
    return (
      <main className="resource-viewer-page">
        <button type="button" className="back-icon-btn" onClick={handleBack} aria-label="Back">
          <ArrowLeft size={20} />
        </button>

        <section className="empty-state">
          <FileText size={32} />
          <h3>No file found</h3>
          <p>This resource does not have a valid link.</p>
        </section>
      </main>
    );
  }

  if (!validDriveFile) {
    return (
      <main className="resource-viewer-page">
        <button type="button" className="back-icon-btn" onClick={handleBack} aria-label="Back">
          <ArrowLeft size={20} />
        </button>

        <section className="empty-state">
          <FileText size={32} />
          <h3>Invalid Google Drive link</h3>
          <p>
            This file link does not look correct. Please report this resource so
            the admin can update the link.
          </p>

          <button
            type="button"
            className="report-broken-btn"
            onClick={handleReportBroken}
          >
            <Flag size={16} />
            Report broken link
          </button>
        </section>
      </main>
    );
  }

  return (
    <main
      className={
        isFullscreen
          ? "resource-viewer-page reader-active"
          : "resource-viewer-page"
      }
    >
      {!isFullscreen && (
        <header className="resource-viewer-header">
          <button type="button" className="back-icon-btn" onClick={handleBack} aria-label="Back">
            <ArrowLeft size={20} />
          </button>

          <h1>{title}</h1>

          <div className="resource-viewer-actions">
            <button type="button" onClick={handleShare}>
              <Share2 size={16} />
              Share
            </button>

            <a href={openUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              Open
            </a>

            <a href={downloadUrl} target="_blank" rel="noreferrer">
              <Download size={16} />
              Download
            </a>
          </div>

          {shareStatus && <span className="share-status-toast">{shareStatus}</span>}
        </header>
      )}

      <section
        ref={frameWrapperRef}
        className={
          isFullscreen
            ? "resource-viewer-frame reader-mode"
            : "resource-viewer-frame"
        }
      >
        <div className="viewer-toolbar">
          <button
            type="button"
            className={isDimmed ? "toolbar-icon-btn active" : "toolbar-icon-btn"}
            onClick={toggleDimmer}
            aria-label={isDimmed ? "Turn off night reading" : "Dim for night reading"}
            title={isDimmed ? "Turn off night reading" : "Dim for night reading"}
          >
            {isDimmed ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          {isFullscreen && (
            <button
              type="button"
              className={
                isLandscapeLocked ? "toolbar-icon-btn active" : "toolbar-icon-btn"
              }
              onClick={toggleLandscapeLock}
              aria-label={
                isLandscapeLocked ? "Return to portrait" : "Rotate to landscape"
              }
              title={
                isLandscapeLocked ? "Return to portrait" : "Rotate to landscape"
              }
            >
              <RotateCw size={17} />
            </button>
          )}

          <button
            type="button"
            className="toolbar-icon-btn"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Read fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
        </div>

        {isDimmed && <div className="viewer-dimmer-overlay" />}

        <iframe src={previewUrl} title={title} allowFullScreen />
      </section>
    </main>
  );
}

export default ResourceViewer;
