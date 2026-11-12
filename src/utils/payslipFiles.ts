// File names and PDF creation for downloading payslips.

export const DEFAULT_FILE_NAME = 'Payslip - {name} - {month} {year}';
export const DEFAULT_COMBINED_FILE_NAME = 'Payslips - {company} - {month} {year}';

export const FILE_NAME_TOKENS: { token: string; label: string }[] = [
  { token: '{name}', label: 'Employee name' },
  { token: '{id}', label: 'Employee ID' },
  { token: '{designation}', label: 'Designation' },
  { token: '{month}', label: 'Month name (May)' },
  { token: '{mon}', label: 'Short month (May, Jun)' },
  { token: '{mm}', label: 'Month number (05)' },
  { token: '{year}', label: 'Year (2026)' },
  { token: '{yy}', label: 'Short year (26)' },
  { token: '{company}', label: 'Company name' },
];

export interface FileNameContext {
  name?: string; id?: string; designation?: string;
  year: number; month: number; company?: string;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Fill in a file-name pattern and make it safe for Windows / Mac. Adds ".pdf". */
export function formatFileName(pattern: string | undefined, ctx: FileNameContext, fallback = DEFAULT_FILE_NAME): string {
  const p = (pattern || '').trim() || fallback;
  const values: Record<string, string> = {
    name: ctx.name || '', id: ctx.id || '', designation: ctx.designation || '',
    month: MONTH_NAMES[ctx.month - 1] || '', mon: (MONTH_NAMES[ctx.month - 1] || '').slice(0, 3), mm: String(ctx.month).padStart(2, '0'),
    year: String(ctx.year), yy: String(ctx.year).slice(-2), company: ctx.company || '',
  };
  let out = p.replace(/\{(\w+)\}/g, (m, k: string) => (k.toLowerCase() in values ? values[k.toLowerCase()] : m));
  out = out
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-') // characters not allowed in file names
    .replace(/\s+/g, ' ')
    .replace(/(\s*-\s*){2,}/g, ' - ')           // "a -  - b" left by empty values
    .replace(/^[\s.-]+|[\s.-]+$/g, '')
    .slice(0, 150);
  return `${out || 'Payslip'}.pdf`;
}

// ---- invoices, quotations, credit notes ------------------------------------------------------

export const DEFAULT_DOC_FILE_NAME = '{type} {number} - {customer}';
export const DOC_FILE_NAME_TOKENS: { token: string; label: string }[] = [
  { token: '{type}', label: 'Invoice / Quotation / Credit note' },
  { token: '{number}', label: 'Number' },
  { token: '{customer}', label: 'Customer' },
  { token: '{reference}', label: 'Reference / PO no.' },
  { token: '{date}', label: 'Date (2026-06-01)' },
  { token: '{dd}', label: 'Day (01)' },
  { token: '{mm}', label: 'Month number (06)' },
  { token: '{month}', label: 'Month name (June)' },
  { token: '{mon}', label: 'Short month (Jun)' },
  { token: '{year}', label: 'Year (2026)' },
  { token: '{yy}', label: 'Short year (26)' },
  { token: '{company}', label: 'Company name' },
];
export interface DocFileNameContext { type: string; number?: string | null; customer?: string; reference?: string | null; date: string; company?: string }

/** Fill in an invoice file-name pattern, e.g. "{type} {number} - {customer}". Adds ".pdf". */
export function formatDocFileName(pattern: string | undefined, ctx: DocFileNameContext): string {
  const p = (pattern || '').trim() || DEFAULT_DOC_FILE_NAME;
  const [y, m, d] = (ctx.date || '').split('-');
  const values: Record<string, string> = {
    type: ctx.type, number: ctx.number || '', customer: ctx.customer || '', reference: ctx.reference || '',
    date: ctx.date || '', dd: d || '', mm: m || '', month: MONTH_NAMES[Number(m) - 1] || '', mon: (MONTH_NAMES[Number(m) - 1] || '').slice(0, 3), year: y || '', yy: (y || '').slice(-2), company: ctx.company || '',
  };
  return `${cleanFileName(p.replace(/\{(\w+)\}/g, (x, k: string) => (k.toLowerCase() in values ? values[k.toLowerCase()] : x))) || ctx.type}.pdf`;
}

function cleanFileName(s: string): string {
  return s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/(\s*-\s*){2,}/g, ' - ')
    .replace(/^[\s.-]+|[\s.-]+$/g, '')
    .slice(0, 150);
}

/** Make names unique inside one zip: "A.pdf", "A (2).pdf", … */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map(n => {
    const k = n.toLowerCase();
    const c = (seen.get(k) || 0) + 1;
    seen.set(k, c);
    return c === 1 ? n : n.replace(/\.pdf$/i, ` (${c}).pdf`);
  });
}

const A4 = { w: 210, h: 297, margin: 10 };

/** Where to cut a tall picture so a line of text is not split: the last empty (white) row before the page ends. */
function cutRow(canvas: HTMLCanvasElement, from: number, target: number): number {
  const ctx = canvas.getContext('2d');
  if (!ctx || target >= canvas.height) return Math.min(target, canvas.height);
  const reach = Math.floor((target - from) * 0.2);
  for (let y = target; y > target - reach && y > from; y--) {
    const row = ctx.getImageData(0, y, canvas.width, 1).data;
    let white = true;
    for (let i = 0; i < row.length; i += 4) if (row[i] < 245 || row[i + 1] < 245 || row[i + 2] < 245) { white = false; break; }
    if (white) return y;
  }
  return target;
}

/** Draw a picture on A4 pages: one page when it fits, else as many pages as it needs (never shrunk to fit). */
function addPictureToPdf(pdf: any, canvas: HTMLCanvasElement, firstOnNewPage: boolean) {
  const imgW = A4.w - A4.margin * 2;
  const pxPerMm = canvas.width / imgW;
  const slicePx = Math.floor((A4.h - A4.margin * 2) * pxPerMm);
  let y = 0, page = 0;
  while (y < canvas.height) {
    const end = canvas.height - y <= slicePx ? canvas.height : cutRow(canvas, y, y + slicePx);
    const h = Math.max(1, end - y);
    const part = document.createElement('canvas');
    part.width = canvas.width; part.height = h;
    part.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (page > 0 || firstOnNewPage) pdf.addPage();
    pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', A4.margin, A4.margin, imgW, h / pxPerMm);
    y = end; page++;
  }
}

async function loadPdfTools() {
  return Promise.all([import('jspdf'), import('html2canvas')]).catch(() => {
    throw new Error('Quantivra was just updated. Refresh the page (F5) and try again.');
  });
}

/** Turn rendered documents (one element each) into a PDF on A4 pages: a long one runs over onto more pages. */
export async function elementsToPdf(elements: HTMLElement[]): Promise<Blob> {
  const [{ jsPDF }, { default: html2canvas }] = await loadPdfTools();
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  for (let i = 0; i < elements.length; i++) {
    const canvas = await html2canvas(elements[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    addPictureToPdf(pdf, canvas, i > 0);
  }
  return pdf.output('blob');
}

/** One tall element (a typed document) as a PDF: the picture is cut into A4 pages. */
export async function elementToPagedPdf(el: HTMLElement): Promise<Blob> {
  return elementsToPdf([el]);
}

export async function zipFiles(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.blob);
  return zip.generateAsync({ type: 'blob' });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
