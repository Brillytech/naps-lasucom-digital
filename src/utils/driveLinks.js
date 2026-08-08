export function getDriveFileId(url) {
  if (!url) return "";

  const cleanUrl = decodeURIComponent(url).trim();

  const patterns = [
    /drive\.google\.com\/file\/d\/([^/]+)/,
    /drive\.google\.com\/open\?id=([^&]+)/,
    /drive\.google\.com\/uc\?export=download&id=([^&]+)/,
    /drive\.google\.com\/uc\?id=([^&]+)/,
    /docs\.google\.com\/presentation\/d\/([^/]+)/,
    /docs\.google\.com\/document\/d\/([^/]+)/,
    /docs\.google\.com\/spreadsheets\/d\/([^/]+)/,
  ];

  for (const pattern of patterns) {
    const match = cleanUrl.match(pattern);
    if (match?.[1]) return match[1];
  }

  return "";
}

export function isGoogleDriveLink(url) {
  if (!url) return false;

  return url.includes("drive.google.com") || url.includes("docs.google.com");
}

export function hasValidDriveFileId(url) {
  const fileId = getDriveFileId(url);

  if (!fileId) return false;

  // Google Drive file IDs are usually long and not just plain digits.
  if (fileId.length < 20) return false;
  if (/^\d+$/.test(fileId)) return false;

  return true;
}

export function getDriveViewLink(url) {
  if (!url) return "";

  const fileId = getDriveFileId(url);

  if (!fileId) return url;

  return `https://drive.google.com/file/d/${fileId}/preview`;
}

export function getDriveOpenLink(url) {
  if (!url) return "";

  const fileId = getDriveFileId(url);

  if (!fileId) return url;

  return `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
}

export function getDriveDownloadLink(url) {
  if (!url) return "";

  const fileId = getDriveFileId(url);

  if (!fileId) return url;

  const cleanUrl = decodeURIComponent(url);

  // Native Google Docs/Sheets/Slides aren't files sitting in Drive storage —
  // they're live documents, and Drive's generic file-download endpoint
  // doesn't serve them (it just redirects back to the editor, which is
  // exactly what produced the "can't frame drive.google.com" console error
  // we hit). Each of these has its own dedicated export endpoint instead,
  // exported as a PDF so it opens reliably on any phone without needing
  // Word/PowerPoint/Sheets installed.
  if (/docs\.google\.com\/presentation\//.test(cleanUrl)) {
    return `https://docs.google.com/presentation/d/${fileId}/export/pdf`;
  }

  if (/docs\.google\.com\/document\//.test(cleanUrl)) {
    return `https://docs.google.com/document/d/${fileId}/export?format=pdf`;
  }

  if (/docs\.google\.com\/spreadsheets\//.test(cleanUrl)) {
    return `https://docs.google.com/spreadsheets/d/${fileId}/export?format=pdf`;
  }

  // A regular uploaded file living in Drive storage — this endpoint is
  // correct for that case.
  return `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
}