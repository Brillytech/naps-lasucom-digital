import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  getDriveDownloadLink,
  getDriveOpenLink,
  getDriveViewLink,
  hasValidDriveFileId,
  isGoogleDriveLink,
} from "../utils/driveLinks";

function ResourceViewer() {
  const [searchParams] = useSearchParams();
  const frameWrapperRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const rawUrl = searchParams.get("url");
  const title = searchParams.get("title") || "Resource";

  const isDrive = isGoogleDriveLink(rawUrl);
  const validDriveFile = isDrive ? hasValidDriveFileId(rawUrl) : true;

  const previewUrl = isDrive ? getDriveViewLink(rawUrl) : rawUrl;
  const openUrl = isDrive ? getDriveOpenLink(rawUrl) : rawUrl;
  const downloadUrl = isDrive ? getDriveDownloadLink(rawUrl) : rawUrl;

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

  async function lockOrientation() {
    try {
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock("landscape");
      }
    } catch (err) {
      // Orientation lock isn't supported on this device/browser.
      // The page still works — the user can just rotate manually.
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

    setIsFullscreen(true);
    lockOrientation();
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
        <Link to="/resources" className="back-link">
          <ArrowLeft size={18} />
          Back
        </Link>

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
        <Link to="/resources" className="back-link">
          <ArrowLeft size={18} />
          Back
        </Link>

        <section className="empty-state">
          <FileText size={32} />
          <h3>Invalid Google Drive link</h3>
          <p>
            This file link does not look correct. Please report this resource so
            the admin can update the link.
          </p>
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
          <Link to="/resources" className="back-link">
            <ArrowLeft size={18} />
            Back
          </Link>

          <h1>{title}</h1>

          <div className="resource-viewer-actions">
            <a href={openUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              Open
            </a>

            <a href={downloadUrl} target="_blank" rel="noreferrer">
              <Download size={16} />
              Download
            </a>
          </div>
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
        <button
          type="button"
          className="reader-toggle-btn"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Read fullscreen"}
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>

        <iframe src={previewUrl} title={title} allowFullScreen />
      </section>
    </main>
  );
}

export default ResourceViewer;
