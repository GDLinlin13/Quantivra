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
