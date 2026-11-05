// File names and PDF creation for downloading payslips.

export const DEFAULT_FILE_NAME = 'Payslip - {name} - {month} {year}';
export const DEFAULT_COMBINED_FILE_NAME = 'Payslips - {company} - {month} {year}';

export const FILE_NAME_TOKENS: { token: string; label: string }[] = [
  { token: '{name}', label: 'Employee name' },
  { token: '{id}', label: 'Employee ID' },
  { token: '{designation}', label: 'Designation' },
  { token: '{month}', label: 'Month name (May)' },
  { token: '{mm}', label: 'Month number (05)' },
  { token: '{year}', label: 'Year (2026)' },
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
    month: MONTH_NAMES[ctx.month - 1] || '', mm: String(ctx.month).padStart(2, '0'),
    year: String(ctx.year), company: ctx.company || '',
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

/** Turn rendered payslips (one element each) into a PDF with one A4 page per payslip. */
export async function elementsToPdf(elements: HTMLElement[]): Promise<Blob> {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const pageW = 210, pageH = 297, margin = 10;
  for (let i = 0; i < elements.length; i++) {
    const canvas = await html2canvas(elements[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    const img = canvas.toDataURL('image/jpeg', 0.92);
    let w = pageW - margin * 2;
    let h = (canvas.height / canvas.width) * w;
    if (h > pageH - margin * 2) { h = pageH - margin * 2; w = (canvas.width / canvas.height) * h; }
    if (i > 0) pdf.addPage();
    pdf.addImage(img, 'JPEG', (pageW - w) / 2, margin, w, h);
  }
  return pdf.output('blob');
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
