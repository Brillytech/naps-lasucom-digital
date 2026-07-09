import { ArrowLeft, Download, ExternalLink, FileText } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import {
  getDriveDownloadLink,
  getDriveOpenLink,
  getDriveViewLink,
  hasValidDriveFileId,
  isGoogleDriveLink,
} from "../utils/driveLinks";

function ResourceViewer() {
  const [searchParams] = useSearchParams();

  const rawUrl = searchParams.get("url");
  const title = searchParams.get("title") || "Resource";

  const isDrive = isGoogleDriveLink(rawUrl);
  const validDriveFile = isDrive ? hasValidDriveFileId(rawUrl) : true;

  const previewUrl = isDrive ? getDriveViewLink(rawUrl) : rawUrl;
  const openUrl = isDrive ? getDriveOpenLink(rawUrl) : rawUrl;
  const downloadUrl = isDrive ? getDriveDownloadLink(rawUrl) : rawUrl;

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
    <main className="resource-viewer-page">
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

      <section className="resource-viewer-frame">
        <iframe src={previewUrl} title={title} />
      </section>
    </main>
  );
}

export default ResourceViewer;