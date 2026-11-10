// Make pictures smaller before uploading: large photos and scans are redrawn at a sensible size and saved as
// JPEG. They look the same on screen and in print but take a fraction of the space. Other files are unchanged.

/** Longest side, in pixels, a picture is shrunk to (sharp enough to read small print on a full page). */
const MAX_SIDE = 2400;
/** Pictures smaller than this are left as they are. */
const SHRINK_FROM = 1.5 * 1024 * 1024;

export function shouldShrink(file: { type: string; name: string; size: number }): boolean {
  return file.size > SHRINK_FROM && (/^image\/(jpeg|png|webp)$/.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name));
}

export async function shrinkFile(file: File): Promise<File> {
  if (!shouldShrink(file) || typeof createImageBitmap !== 'function') return file;
  try {
    const img = await createImageBitmap(file);
    const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); // transparent parts become white, as on paper
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file; // a picture the browser can't read is uploaded as it is
  }
}

/** Print quality first, then coarser: dots per inch and JPEG quality. */
const PDF_SETTINGS: [number, number][] = [[150, 0.75], [120, 0.65], [96, 0.55], [72, 0.5]];
/** No page picture is wider or taller than this (huge pages, e.g. drawings, would otherwise not fit in memory). */
const MAX_PAGE_PX = 3500;

/**
 * A PDF too big to store (often a scan): every page is redrawn as a picture and put into a new, much smaller PDF.
 * Pages look the same; text in it can no longer be selected. A few pages are tried first to pick the finest quality
 * that will fit, so the whole document is normally drawn only once. `onProgress` gets "page 12 of 80".
 */
export async function shrinkPdf(file: File, maxBytes: number, onProgress?: (page: number, pages: number) => void): Promise<File | null> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const { jsPDF } = await import('jspdf');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const n = doc.numPages;
  const breathe = () => new Promise(r => setTimeout(r, 0)); // let the screen update between pages

  /** one page as a JPEG, with its size in points */
  const draw = async (p: number, dpi: number, quality: number) => {
    const page = await doc.getPage(p);
    const size = page.getViewport({ scale: 1 });                     // in points (1/72 inch)
    const scale = Math.min(dpi / 72, MAX_PAGE_PX / Math.max(size.width, size.height));
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(vp.width)); c.height = Math.max(1, Math.ceil(vp.height));
    const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvas: c, canvasContext: g, viewport: vp } as any).promise;
    const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', quality));
    c.width = c.height = 0; page.cleanup();
    if (!blob) throw new Error('A page could not be drawn');
    return { jpeg: new Uint8Array(await blob.arrayBuffer()), w: size.width, h: size.height };
  };

  try {
    // try a few pages spread through the document at each quality; keep the finest that should fit
    const sample = [...new Set([1, Math.ceil(n / 2), n].filter(p => p >= 1 && p <= n))];
    let start = PDF_SETTINGS.length - 1;
    for (let i = 0; i < PDF_SETTINGS.length; i++) {
      let bytes = 0;
      for (const p of sample) { bytes += (await draw(p, ...PDF_SETTINGS[i])).jpeg.length; await breathe(); }
      if ((bytes / sample.length) * n * 1.05 <= maxBytes * 0.85) { start = i; break; }
    }
    for (let i = start; i < PDF_SETTINGS.length; i++) {
      const out = new jsPDF({ unit: 'pt', compress: true });
      out.deletePage(1);
      for (let p = 1; p <= n; p++) {
        onProgress?.(p, n);
        const { jpeg, w, h } = await draw(p, ...PDF_SETTINGS[i]);
        const orientation = w > h ? 'landscape' : 'portrait';
        out.addPage([w, h], orientation);
        out.addImage(jpeg, 'JPEG', 0, 0, w, h, undefined, 'FAST');
        await breathe();
      }
      const blob = out.output('blob');
      if (blob.size <= maxBytes) return new File([blob], file.name, { type: 'application/pdf', lastModified: file.lastModified });
    }
    return null;
  } finally {
    await doc.loadingTask.destroy();
  }
}
