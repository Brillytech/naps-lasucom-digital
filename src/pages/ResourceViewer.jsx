import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  Flag,
  Maximize2,
  Minimize2,
  Moon,
  Plus,
  Minus,
  RotateCcw,
  RotateCw,
  Share2,
  Star,
  Sun,
} from "lucide-react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  getDriveDownloadLink,
  getDriveOpenLink,
  getDriveViewLink,
  hasValidDriveFileId,
  isGoogleDriveLink,
} from "../utils/driveLinks";
import {
  addRecentlyViewed,
  isFavorited,
  toggleFavorite,
} from "../utils/localLibrary";

const ZOOM_MIN = 1;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.25;

function ResourceViewer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const frameWrapperRef = useRef(null);

  const resourceId = searchParams.get("id");
  const legacyUrl = searchParams.get("url");
  const legacyTitle = searchParams.get("title");

  // When opened via a short "?id=" link (the normal path from every card
  // in the app), we fetch the resource fresh from Supabase — this keeps
  // shared links short and clean instead of a long encoded Drive URL.
  // Older "?url=&title=" links (already-shared links, or old entries in
  // someone's localStorage) still work as a fallback below.
  const [resource, setResource] = useState(null);
  const [loadingResource, setLoadingResource] = useState(Boolean(resourceId));
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    if (!resourceId) {
      setLoadingResource(false);
      return;
    }

    let cancelled = false;

    async function fetchResource() {
      setLoadingResource(true);
      setFetchError("");

      const { data, error } = await supabase
        .from("resources")
        .select("*")
        .eq("id", resourceId)
        .single();

      if (cancelled) return;

      if (error || !data) {
        setFetchError("This resource could not be found.");
      } else {
        setResource(data);
      }

      setLoadingResource(false);
    }

    fetchResource();

    return () => {
      cancelled = true;
    };
  }, [resourceId]);

  const rawUrl = resource
    ? resource.external_link || resource.file_url
    : legacyUrl;
  const title = resource ? resource.title || "Resource" : legacyTitle || "Resource";

  const isDrive = isGoogleDriveLink(rawUrl);
  const validDriveFile = isDrive ? hasValidDriveFileId(rawUrl) : Boolean(rawUrl);

  const previewUrl = isDrive ? getDriveViewLink(rawUrl) : rawUrl;
  const openUrl = isDrive ? getDriveOpenLink(rawUrl) : rawUrl;
  const downloadUrl = isDrive ? getDriveDownloadLink(rawUrl) : rawUrl;

  function handleBack() {
    if (location.key && location.key !== "default") {
      navigate(-1);
    } else {
      navigate("/resources");
    }
  }

  useEffect(() => {
    if (rawUrl && validDriveFile && !loadingResource) {
      addRecentlyViewed({ url: rawUrl, title, id: resourceId || null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawUrl, validDriveFile, loadingResource]);

  const [isFullscreen, setIsFullscreen] = useState(false);

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
  const [zoom, setZoom] = useState(1);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [favorited, setFavorited] = useState(false);
  const hideTimerRef = useRef(null);

  useEffect(() => {
    if (resource?.id) {
      setFavorited(isFavorited(resource.id));
    }
  }, [resource]);

  // Auto-hides the toolbar shortly after it appears so it stops covering
  // the document — tapping the frame brings it back for a few seconds.
  useEffect(() => {
    scheduleToolbarHide();
    return () => clearTimeout(hideTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen]);

  function scheduleToolbarHide() {
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setToolbarVisible(false), 3000);
  }

  function revealToolbar() {
    setToolbarVisible(true);
    scheduleToolbarHide();
  }

  function handleToggleFavorite() {
    if (!resource) return;
    toggleFavorite(resource);
    setFavorited((prev) => !prev);
  }

  function zoomIn() {
    setZoom((prev) => Math.min(ZOOM_MAX, +(prev + ZOOM_STEP).toFixed(2)));
  }

  function zoomOut() {
    setZoom((prev) => Math.max(ZOOM_MIN, +(prev - ZOOM_STEP).toFixed(2)));
  }

  function resetZoom() {
    setZoom(1);
  }

  function toggleDimmer() {
    setIsDimmed((prev) => !prev);
  }

  async function handleShare() {
    const shareUrl = resourceId
      ? `${window.location.origin}/resource-viewer?id=${resourceId}`
      : `${window.location.origin}/resource-viewer?url=${encodeURIComponent(
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
    // normally). Landscape is an explicit opt-in via the rotate button.
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

  if (loadingResource) {
    return (
      <main className="resource-viewer-page">
        <button type="button" className="back-icon-btn" onClick={handleBack} aria-label="Back">
          <ArrowLeft size={20} />
        </button>

        <div className="admin-loading-card">Loading resource...</div>
      </main>
    );
  }

  if (!rawUrl || fetchError) {
    return (
      <main className="resource-viewer-page">
        <button type="button" className="back-icon-btn" onClick={handleBack} aria-label="Back">
          <ArrowLeft size={20} />
        </button>

        <section className="empty-state">
          <FileText size={32} />
          <h3>{fetchError ? "Resource not found" : "No file found"}</h3>
          <p>
            {fetchError ||
              "This resource does not have a valid link."}
          </p>
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
            {resource && (
              <button
                type="button"
                onClick={handleToggleFavorite}
                className={favorited ? "favorite-active" : ""}
              >
                <Star size={16} fill={favorited ? "currentColor" : "none"} />
                {favorited ? "Saved" : "Save"}
              </button>
            )}

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
            disabled={zoom <= ZOOM_MIN}
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
            title={`Zoom: ${Math.round(zoom * 100)}%`}
          >
            <RotateCcw size={14} />
          </button>

          <button
            type="button"
            className="toolbar-icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              zoomIn();
            }}
            disabled={zoom >= ZOOM_MAX}
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
            {isDimmed ? <Sun size={16} /> : <Moon size={16} />}
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
              <RotateCw size={16} />
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
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>

        {isDimmed && <div className="viewer-dimmer-overlay" />}

        <div className="viewer-zoom-wrapper">
          <iframe
            src={previewUrl}
            title={title}
            allowFullScreen
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
              width: `${100 / zoom}%`,
              height: `${100 / zoom}%`,
            }}
          />
        </div>
      </section>
    </main>
  );
}

export default ResourceViewer;
