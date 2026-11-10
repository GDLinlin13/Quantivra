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

/**
 * A PDF too big to store (often a scan): every page is redrawn as a picture at print quality and put into a new,
 * much smaller PDF. Pages look the same; text in it can no longer be selected. Tries finer, then coarser.
 */
export async function shrinkPdf(file: File, maxBytes: number, onPage?: (page: number, pages: number) => void): Promise<File | null> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const { jsPDF } = await import('jspdf');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    for (const [dpi, quality] of [[150, 0.75], [110, 0.6], [80, 0.5]] as const) {
      let out: InstanceType<typeof jsPDF> | null = null;
      for (let p = 1; p <= doc.numPages; p++) {
        onPage?.(p, doc.numPages);
        const page = await doc.getPage(p);
        const size = page.getViewport({ scale: 1 }); // in points (1/72 inch)
        const vp = page.getViewport({ scale: dpi / 72 });
        const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        await page.render({ canvas: c, canvasContext: g, viewport: vp } as any).promise;
        const orientation = size.width > size.height ? 'landscape' : 'portrait';
        if (!out) out = new jsPDF({ unit: 'pt', format: [size.width, size.height], orientation, compress: true });
        else out.addPage([size.width, size.height], orientation);
        out.addImage(c.toDataURL('image/jpeg', quality), 'JPEG', 0, 0, size.width, size.height, undefined, 'FAST');
        c.width = c.height = 0; page.cleanup();
      }
      const blob = out!.output('blob');
      if (blob.size <= maxBytes) return new File([blob], file.name, { type: 'application/pdf', lastModified: file.lastModified });
    }
    return null;
  } finally {
    await doc.loadingTask.destroy();
  }
}
