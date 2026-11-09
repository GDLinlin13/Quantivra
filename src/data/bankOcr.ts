// Reading statements that are pictures (a scanned page, or a PDF made with "Print to PDF" that only holds
// images). Each page is drawn, then the text is read in the browser with Tesseract (OCR); the statement
// itself never leaves the browser — only Tesseract's program and English language data are downloaded once.
import type { PdfRow } from './bankPdf';

interface OcrWord { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }

/**
 * Words of one printed line → pieces like a PDF's text items: words close together stay one piece, a wide
 * gap (a new column) starts the next. x / w are in the page's pixels.
 */
export function wordsToRow(words: OcrWord[]): PdfRow {
  const ws = words.filter(w => w.text.trim()).sort((a, b) => a.bbox.x0 - b.bbox.x0);
  if (!ws.length) return [];
  const charW = ws.reduce((t, w) => t + (w.bbox.x1 - w.bbox.x0) / Math.max(1, w.text.length), 0) / ws.length;
  const row: PdfRow = [];
  let cur = { s: ws[0].text, x: ws[0].bbox.x0, end: ws[0].bbox.x1 };
  for (const w of ws.slice(1)) {
    if (w.bbox.x0 - cur.end > charW * 2.2) { row.push({ s: cur.s, x: cur.x, w: cur.end - cur.x }); cur = { s: w.text, x: w.bbox.x0, end: w.bbox.x1 }; }
    else { cur.s += ` ${w.text}`; cur.end = w.bbox.x1; }
  }
  row.push({ s: cur.s, x: cur.x, w: cur.end - cur.x });
  return row;
}

async function canvasesFromFile(file: File): Promise<HTMLCanvasElement[]> {
  if (/^image\//.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name)) {
    const img = await createImageBitmap(file);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d')!.drawImage(img, 0, 0);
    return [c];
  }
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: HTMLCanvasElement[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 2.5 }); // enough detail for small print
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    await page.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp } as any).promise;
    out.push(c);
  }
  return out;
}

/** Read a picture statement into rows, like pdfToRows does for a PDF with text. */
export async function ocrToRows(file: File, onProgress?: (done: number, total: number) => void): Promise<PdfRow[]> {
  const pages = await canvasesFromFile(file);
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  const rows: PdfRow[] = [];
  try {
    for (let i = 0; i < pages.length; i++) {
      onProgress?.(i, pages.length);
      const { data } = await worker.recognize(pages[i], {}, { blocks: true });
      for (const block of (data as any).blocks || []) {
        for (const para of block.paragraphs || []) {
          for (const line of para.lines || []) {
            const row = wordsToRow(line.words || []);
            if (row.length) rows.push(row);
          }
        }
      }
    }
    onProgress?.(pages.length, pages.length);
  } finally {
    await worker.terminate();
  }
  return rows;
}
