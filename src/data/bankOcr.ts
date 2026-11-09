// Reading statements that are pictures (a scanned page, or a PDF made with "Print to PDF" that only holds
// images). Each page is drawn, then the text is read in the browser with Tesseract (OCR); the statement
// itself never leaves the browser — only Tesseract's program and English language data are downloaded once.
import type { PdfRow } from './bankPdf';

interface OcrWord { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }

/**
 * Words of one printed line → pieces like a PDF's text items: words close together stay one piece, a wide
 * gap (a new column) starts the next. x / w are in the page's pixels.
 */
export function wordsToRow(words: OcrWord[], scale = 1): PdfRow {
  const ws = words.filter(w => w.text.trim()).map(w => ({ ...w, text: cleanWord(w.text) })).filter(w => w.text).sort((a, b) => a.bbox.x0 - b.bbox.x0);
  if (!ws.length) return [];
  const charW = ws.reduce((t, w) => t + (w.bbox.x1 - w.bbox.x0) / Math.max(1, w.text.length), 0) / ws.length;
  const row: PdfRow = [];
  let cur = { s: ws[0].text, x: ws[0].bbox.x0, end: ws[0].bbox.x1 };
  for (const w of ws.slice(1)) {
    if (w.bbox.x0 - cur.end > charW * 2.2) { row.push(piece(cur)); cur = { s: w.text, x: w.bbox.x0, end: w.bbox.x1 }; }
    else { cur.s += ` ${w.text}`; cur.end = w.bbox.x1; }
  }
  row.push(piece(cur));
  return row;
  // OCR sometimes leaves a space inside a number: "10,408, 519.33"
  function piece(c: { s: string; x: number; end: number }) { return { s: c.s.replace(/(\d,)\s+(\d{3}\b)/g, '$1$2'), x: c.x * scale, w: (c.end - c.x) * scale }; }
}

/** Scan noise around a word: table lines read as | [ ], quotes; letters misread inside amounts. */
export function cleanWord(raw: string): string {
  let t = raw.trim().replace(/^[|[\]{}'"‘’“”_!]+|[|[\]{}'"‘’“”_!]+$/g, '');
  if (/\d/.test(t) && /^[\d,.OoIlS]+$/.test(t) && /[.,][\dOo]{2}$/.test(t)) {
    t = t.replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/S/g, '5');
    // the last mark before two digits is the decimal point; the others are thousands, whichever OCR saw:
    // 7.350,000.00 → 7,350,000.00 · 2,647.994.33 → 2,647,994.33 · 105,00 → 105.00
    const body = t.slice(0, -3).replace(/[.,]/g, ',');
    if (/^\d{1,3}(,\d{3})*$/.test(body)) t = `${body}.${t.slice(-2)}`;
  }
  return fixDate(t);
}

/** OCR often reads the O of OCT as a zero: 01-0CT-2025 → 01-OCT-2025. */
export function fixDate(t: string): string {
  const m = t.match(/^(\d{1,2})([-/. ])([A-Za-z0-9]{3})([-/. ]\d{2,4})$/);
  if (!m || !/[A-Za-z]/.test(m[3])) return t;
  return `${m[1]}${m[2]}${m[3].replace(/0/g, 'O').replace(/5/g, 'S')}${m[4]}`;
}

/**
 * All the words of a page → printed lines, by their height on the page. Tesseract's own lines follow its
 * text blocks, which can put a table's date, description and amounts on separate lines; a statement row is
 * everything at the same height, across the whole page.
 */
export function wordsToRows(words: OcrWord[], scale = 1): PdfRow[] {
  const ws = words.filter(w => w.text.trim()).map(w => ({ w, mid: (w.bbox.y0 + w.bbox.y1) / 2, h: w.bbox.y1 - w.bbox.y0 }))
    .sort((a, b) => a.mid - b.mid);
  const lines: { mid: number; h: number; words: OcrWord[] }[] = [];
  for (const x of ws) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(x.mid - last.mid) <= Math.max(3, Math.min(last.h, x.h) * 0.5)) {
      last.words.push(x.w);
      last.mid = (last.mid * (last.words.length - 1) + x.mid) / last.words.length;
    } else lines.push({ mid: x.mid, h: x.h, words: [x.w] });
  }
  return lines.map(l => wordsToRow(l.words, scale)).filter(r => r.length);
}

const A4_WIDTH = 595;
/** Pages are read at least this many pixels wide. */
const READ_WIDTH = 2000;

async function canvasesFromFile(file: File): Promise<HTMLCanvasElement[]> {
  if (/^image\//.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name)) {
    const img = await createImageBitmap(file);
    // small pictures are enlarged: the reader misses commas and digits in small print
    const k = Math.max(1, READ_WIDTH / img.width);
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext('2d')!; g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    return [c];
  }
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: HTMLCanvasElement[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: Math.max(2.5, READ_WIDTH / page.getViewport({ scale: 1 }).width) }); // enough detail for small print
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
      const words: OcrWord[] = [];
      for (const block of (data as any).blocks || []) {
        for (const para of block.paragraphs || []) {
          for (const line of para.lines || []) words.push(...(line.words || []));
        }
      }
      // positions on an A4-wide page (like a PDF's), so a taught layout fits every scan whatever its resolution
      rows.push(...wordsToRows(words, A4_WIDTH / pages[i].width));
    }
    onProgress?.(pages.length, pages.length);
  } finally {
    await worker.terminate();
  }
  return rows;
}
