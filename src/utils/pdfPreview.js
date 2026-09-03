/**
 * Rasterises a jsPDF document for on-screen preview.
 *
 * The composer previews by rendering the real PDF and drawing its pages,
 * rather than mirroring the layout in CSS. Two renderers always drift
 * eventually; this way what is on screen while typing is the file that gets
 * exported.
 */

let pdfjs = null;

/**
 * pdf.js is ~350 KB and only ever needed on one admin screen, so it is
 * imported on first use rather than bundled into the main entry.
 */
async function getPdfjs() {
  if (pdfjs) return pdfjs;

  const lib = await import("pdfjs-dist/build/pdf.mjs");

  // The worker has to be addressed as a URL Vite can fingerprint, otherwise
  // pdf.js falls back to running on the main thread and blocks typing.
  const workerUrl = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).href;

  lib.GlobalWorkerOptions.workerSrc = workerUrl;
  pdfjs = lib;
  return pdfjs;
}

/**
 * Render every page of a jsPDF document to PNG data URLs.
 *
 * @param {object} doc      jsPDF instance.
 * @param {number} scale    Render scale; 1.6 is legible without being heavy.
 * @returns {Promise<{pages: string[], blob: Blob}>}
 */
export async function rasterisePdf(doc, scale = 1.6) {
  const bytes = doc.output("arraybuffer");
  const lib = await getPdfjs();

  // pdf.js takes ownership of the buffer it is given, so hand it a copy --
  // otherwise the same ArrayBuffer cannot also be used for the Blob.
  const pdf = await lib.getDocument({ data: new Uint8Array(bytes.slice(0)) })
    .promise;

  const pages = [];

  for (let n = 1; n <= pdf.numPages; n += 1) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: context, viewport, canvas }).promise;
    pages.push(canvas.toDataURL("image/png"));
  }

  return {
    pages,
    blob: new Blob([bytes], { type: "application/pdf" }),
  };
}

/**
 * Join rendered pages into one tall image.
 *
 * A download per page does not work: browsers block the second and later
 * saves from a single gesture, so a three-page export quietly handed over
 * page one alone. One file also matches what the image export is for --
 * posting the notice somewhere that will not take a PDF.
 */
export async function stitchPages(dataUrls, gap = 24) {
  const images = await Promise.all(
    dataUrls.map(
      (src) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = src;
        })
    )
  );

  if (images.length === 1) return dataUrls[0];

  const width = Math.max(...images.map((i) => i.width));
  const height =
    images.reduce((sum, i) => sum + i.height, 0) + gap * (images.length - 1);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  let y = 0;
  for (const image of images) {
    context.drawImage(image, (width - image.width) / 2, y);
    y += image.height + gap;
  }

  return canvas.toDataURL("image/png");
}

/** Hand the browser a file to save. */
export function download(blobOrDataUrl, filename) {
  const url =
    typeof blobOrDataUrl === "string"
      ? blobOrDataUrl
      : URL.createObjectURL(blobOrDataUrl);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  if (typeof blobOrDataUrl !== "string") URL.revokeObjectURL(url);
}

export function safeFileName(text) {
  return (text || "document").replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
}
