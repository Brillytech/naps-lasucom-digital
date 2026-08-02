import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  Flag,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  Plus,
  RotateCw,
  Share2,
  Sun,
} from "lucide-react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  getDriveDownloadLink,
  getDriveFileId,
  getDriveOpenLink,
  getDriveViewLink,
  hasValidDriveFileId,
  isGoogleDriveLink,
} from "../utils/driveLinks";
import { addRecentlyViewed } from "../utils/localLibrary";

const ZOOM_MIN = 1;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.25;

function trackEvent(eventName, params) {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", eventName, params);
  }
}

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

  // Short links: if a "fid" (Google Drive file id) param is present, we
  // rebuild a standard Drive URL from it. This goes through the exact
  // same isGoogleDriveLink/getDriveViewLink pipeline as a normal full
  // link — no new fetch, no new code path, so it behaves identically.
  const fidParam = searchParams.get("fid");
  const legacyUrlParam = searchParams.get("url");

  // Some older saved links (Favorites / Continue Reading saved while an
  // earlier version of this page was live) use a database "id" instead
  // of fid/url. This lookup ONLY runs for that specific case — it never
  // touches the fid/url paths above, so it can't affect them.
  const dbIdParam = searchParams.get("id");
  const [dbResource, setDbResource] = useState(null);
  const [dbLookupDone, setDbLookupDone] = useState(
    !dbIdParam || Boolean(fidParam) || Boolean(legacyUrlParam)
  );

  useEffect(() => {
    if (!dbIdParam || fidParam || legacyUrlParam) return;

    let cancelled = false;
    setDbLookupDone(false);

    supabase
      .from("resources")
      .select("title, external_link, file_url")
      .eq("id", dbIdParam)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) {
          setDbResource(data);
        }
        setDbLookupDone(true);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbIdParam]);

  const rawUrl = fidParam
    ? `https://drive.google.com/file/d/${fidParam}/view`
    : legacyUrlParam || dbResource?.external_link || dbResource?.file_url || "";

  const title = searchParams.get("title") || dbResource?.title || "Resource";

  const isDrive = isGoogleDriveLink(rawUrl);
  const validDriveFile = isDrive ? hasValidDriveFileId(rawUrl) : true;

  const previewUrl = isDrive ? getDriveViewLink(rawUrl) : rawUrl;
  const openUrl = isDrive ? getDriveOpenLink(rawUrl) : rawUrl;
  const downloadUrl = isDrive ? getDriveDownloadLink(rawUrl) : rawUrl;

  useEffect(() => {
    if (rawUrl && validDriveFile) {
      addRecentlyViewed({ url: rawUrl, title });
      trackEvent("view_resource", { resource_title: title });
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
  const [zoomLevel, setZoomLevel] = useState(1);

  // ===== Auto-hide toolbar so the icons stop sitting on top of the
  // document once you're actually reading — tapping the frame brings
  // them back for a few seconds. =====
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const hideTimerRef = useRef(null);

  function scheduleToolbarHide() {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setToolbarVisible(false), 3000);
  }

  function revealToolbar() {
    setToolbarVisible(true);
    scheduleToolbarHide();
  }

  useEffect(() => {
    revealToolbar();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen]);

  function toggleDimmer() {
    setIsDimmed((prev) => !prev);
    revealToolbar();
  }

  function zoomIn() {
    setZoomLevel((prev) => Math.min(ZOOM_MAX, +(prev + ZOOM_STEP).toFixed(2)));
    revealToolbar();
  }

  function zoomOut() {
    setZoomLevel((prev) => Math.max(ZOOM_MIN, +(prev - ZOOM_STEP).toFixed(2)));
    revealToolbar();
  }

  function resetZoom() {
    setZoomLevel(1);
    revealToolbar();
  }

  async function handleShare() {
    // Prefer the short fid-based link when this is a Drive file — much
    // cleaner than the old fully-encoded URL. Falls back to the original
    // full-url format for anything that isn't a recognizable Drive link.
    const fileId = isDrive ? getDriveFileId(rawUrl) : "";

    const shareUrl = fileId
      ? `${window.location.origin}/resource-viewer?fid=${fileId}&title=${encodeURIComponent(title)}`
      : `${window.location.origin}/resource-viewer?url=${encodeURIComponent(rawUrl)}&title=${encodeURIComponent(title)}`;

    trackEvent("share_resource", { resource_title: title });

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

  function handleDownloadClick() {
    trackEvent("download_resource", { resource_title: title });
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
    revealToolbar();
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
    revealToolbar();
  }

  if (!dbLookupDone) {
    return (
      <main className="resource-viewer-page">
        <button type="button" className="back-icon-btn" onClick={handleBack} aria-label="Back">
          <ArrowLeft size={20} />
        </button>

        <section className="empty-state">
          <FileText size={32} />
          <h3>Loading...</h3>
          <p>Fetching this resource.</p>
        </section>
      </main>
    );
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

            <a
              href={downloadUrl}
              target="_blank"
              rel="noreferrer"
              onClick={handleDownloadClick}
            >
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
        onClick={revealToolbar}
      >
        <div className={toolbarVisible ? "viewer-toolbar" : "viewer-toolbar hidden"}>
          <button
            type="button"
            className="toolbar-icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              zoomOut();
            }}
            disabled={zoomLevel <= ZOOM_MIN}
            aria-label="Zoom out"
            title="Zoom out"
          >
            <Minus size={16} />
          </button>

          <button
            type="button"
            className="toolbar-icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              resetZoom();
            }}
            aria-label="Reset zoom"
            title={`${Math.round(zoomLevel * 100)}%`}
          >
            <span style={{ fontSize: 10, fontWeight: 900 }}>
              {Math.round(zoomLevel * 100)}%
            </span>
          </button>

          <button
            type="button"
            className="toolbar-icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              zoomIn();
            }}
            disabled={zoomLevel >= ZOOM_MAX}
            aria-label="Zoom in"
            title="Zoom in"
          >
            <Plus size={16} />
          </button>

          <button
            type="button"
            className={isDimmed ? "toolbar-icon-btn active" : "toolbar-icon-btn"}
            onClick={(e) => {
              e.stopPropagation();
              toggleDimmer();
            }}
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
              onClick={(e) => {
                e.stopPropagation();
                toggleLandscapeLock();
              }}
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
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            aria-label={isFullscreen ? "Exit fullscreen" : "Read fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
        </div>

        {isDimmed && <div className="viewer-dimmer-overlay" />}

        <div className="viewer-zoom-wrapper">
          <iframe
            src={previewUrl}
            title={title}
            allowFullScreen
            style={{
              transformOrigin: "0 0",
              transform: `scale(${zoomLevel})`,
              width: "100%",
              height: "100%",
            }}
          />
        </div>
      </section>
    </main>
  );
}

export default ResourceViewer;
