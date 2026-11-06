// Reading bank statement PDFs (the ones you download from internet banking — not scans).
// The PDF is turned into text lines; lines that start with a date and end with amounts are
// transactions. Whether money went in or out is worked out from the running balance when the
// statement has one, otherwise from words like "deposit" / "CR"; anything unclear is flagged so
// the person can flip it before importing.
import { parseDate, type BankLine } from './bankCsv';

export interface PdfBankLine extends BankLine { sure: boolean }

const AMOUNT = /^\(?-?(?:S\$|\$)?[\d,]+\.\d{2}\)?(?:\s?(?:CR|DR))?$/i;
const MONTHS = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*$/i;
const r2 = (n: number) => Math.round(n * 100) / 100;
const val = (s: string) => {
  const n = Number(s.replace(/[^\d.]/g, '')) || 0;
  return /^\(|^-|DR$/i.test(s.trim()) ? -n : n;
};

/** Find the date at the start of a line: "01/11/2026", "2026-11-01", "01 Nov 2026" or "01 Nov" (year from the statement). */
function leadingDate(words: string[], year: string | null): { date: string; used: number } | null {
  if (!words.length) return null;
  const one = parseDate(words[0]);
  // 01/11/2026, 2026-11-01, 01/11/26, and DBS-style 19-May-26
  if (one && /\d{4}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2}|^\d{1,2}[-/.][A-Za-z]{3,}[-/.]\d{2,4}$/.test(words[0])) return { date: one, used: 1 };
  if (/^\d{1,2}$/.test(words[0]) && MONTHS.test(words[1] || '')) {
    if (/^\d{2,4}$/.test(words[2] || '')) { const d = parseDate(`${words[0]} ${words[1]} ${words[2]}`); if (d) return { date: d, used: 3 }; }
    if (year) { const d = parseDate(`${words[0]} ${words[1]} ${year}`); if (d) return { date: d, used: 2 }; }
  }
  const dm = words[0].match(/^(\d{1,2})[-/ ]([A-Za-z]{3})$/);
  if (dm && year) { const d = parseDate(`${dm[1]} ${dm[2]} ${year}`); if (d) return { date: d, used: 1 }; }
  return null;
}

/**
 * Turn the text lines of a statement into transactions.
 * `lines` = each line's words in reading order.
 */
export function parseStatementText(lines: string[][]): { lines: PdfBankLine[]; unsure: number } {
  const all = lines.map(w => w.join(' ')).join('\n');
  const year = (all.match(/\b(20\d{2})\b/) || [])[1] || null;
  const out: PdfBankLine[] = [];
  let prevBalance: number | null = null;
  let last: PdfBankLine | null = null;

  for (const words of lines) {
    const text = words.join(' ');
    const amounts = words.filter(w => AMOUNT.test(w));
    if (/balance\s+(brought|b\/f|carried|c\/f)|opening balance|previous balance|balance forward/i.test(text)) {
      if (amounts.length) prevBalance = val(amounts[amounts.length - 1]);
      last = null;
      continue;
    }
    const d = leadingDate(words, year);
    if (!d) {
      // a description carried over to the next line
      if (last && !amounts.length && text.length < 80 && !/total|page \d|balance/i.test(text)) last.description = `${last.description} ${text}`.trim().slice(0, 300);
      continue;
    }
    if (!amounts.length) { last = null; continue; }
    const rest = words.slice(d.used).filter(w => !AMOUNT.test(w));
    const description = rest.join(' ').replace(/\s+/g, ' ').trim().slice(0, 300);
    let amount = Math.abs(val(amounts[0]));
    let sure = false;
    let sign = 0;
    if (amounts.length >= 2) {
      const balance = val(amounts[amounts.length - 1]);
      if (amounts.length >= 3) amount = Math.abs(val(amounts[amounts.length - 2]));
      if (prevBalance != null) {
        const diff = r2(balance - prevBalance);
        if (Math.abs(Math.abs(diff) - amount) < 0.005) { sign = diff > 0 ? 1 : -1; sure = true; }
      }
      prevBalance = balance;
    }
    if (!sign) {
      if (/\bCR\b|deposit|credit|received|interest|refund|inward|giro.*cr/i.test(text + ' ' + amounts[0])) sign = 1;
      else sign = -1;
    }
    if (!amount) continue;
    last = { txn_date: d.date, description, amount: r2(sign * amount), sure };
    out.push(last);
  }
  return { lines: out, unsure: out.filter(l => !l.sure).length };
}

export interface PdfPiece { s: string; x: number; w: number }
export type PdfRow = PdfPiece[];

/** Read a PDF file into rows of text pieces, each with its position across the page. */
export async function pdfToRows(file: File): Promise<PdfRow[]> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const rows: PdfRow[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as any[]).filter(i => typeof i.str === 'string' && i.str.trim())
      .map(i => ({ s: i.str.trim().replace(/\s+/g, ' '), x: Math.round(i.transform[4]), w: Math.round(i.width || 0), y: i.transform[5] }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    let row: typeof items = [];
    const flush = () => { if (row.length) rows.push(row.sort((a, b) => a.x - b.x).map(({ s, x, w }) => ({ s, x, w }))); row = []; };
    for (const it of items) {
      if (row.length && Math.abs(row[0].y - it.y) > 3) flush();
      row.push(it);
    }
    flush();
  }
  return rows;
}

/** Rows as words, for the automatic reader. */
export const rowsToLines = (rows: PdfRow[]): string[][] => rows.map(r => r.flatMap(p => p.s.split(/\s+/)).filter(Boolean));

export async function pdfToLines(file: File): Promise<string[][]> {
  return rowsToLines(await pdfToRows(file));
}

// ---- reading a statement the way the user taught it -----------------------------------------

export type PieceRole = 'date' | 'description' | 'out' | 'in' | 'amount' | 'balance' | 'ignore';
export const ROLE_LABEL: Record<PieceRole, string> = {
  date: 'Date', description: 'Description', out: 'Money out (withdrawal)', in: 'Money in (deposit)',
  amount: 'Amount (+ in / − out)', balance: 'Balance', ignore: 'Ignore',
};

/** Where each kind of information sits across the page (x positions of the column centres). */
export interface PdfLayout { columns: { role: PieceRole; x: number }[] }

const centre = (p: PdfPiece) => p.x + (p.w || 0) / 2;

/** Learn a layout from one transaction row and the roles the user gave its pieces. */
export function learnLayout(row: PdfRow, roles: PieceRole[]): PdfLayout {
  return { columns: row.map((p, i) => ({ role: roles[i], x: centre(p) })).filter(c => c.role && c.role !== 'ignore') };
}

/** Read every row with a taught layout: each piece goes to the nearest taught column. */
export function parseWithLayout(rows: PdfRow[], layout: PdfLayout): { lines: PdfBankLine[]; unsure: number } {
  const cols = layout.columns;
  if (!cols.some(c => c.role === 'date')) return { lines: [], unsure: 0 };
  const all = rows.map(r => r.map(p => p.s).join(' ')).join('\n');
  const year = (all.match(/\b(20\d{2})\b/) || [])[1] || null;
  const out: PdfBankLine[] = [];
  let last: PdfBankLine | null = null;
  let prevBalance: number | null = null;
  for (const row of rows) {
    const parts: Record<string, string[]> = {};
    for (const p of row) {
      let best = cols[0], dist = Infinity;
      for (const c of cols) { const d = Math.abs(c.x - centre(p)); if (d < dist) { dist = d; best = c; } }
      (parts[best.role] ||= []).push(p.s);
    }
    const text = row.map(p => p.s).join(' ');
    const dateText = (parts.date || []).join(' ');
    const d = leadingDate(dateText.split(/\s+/), year);
    // only money-shaped pieces (1,000.00 / (50.00) / 12.30 CR) count — never reference numbers
    const num = (k: string) => {
      const t = (parts[k] || []).join(' ').replace(/\s+(CR|DR)\b/gi, '$1').trim();
      const m = t.split(/\s+/).filter(w => AMOUNT.test(w)).pop();
      return m ? val(m) : null;
    };
    const outAmt = num('out'), inAmt = num('in'), amt = num('amount'), bal = num('balance');
    if (/balance\s+(brought|b\/f|carried|c\/f)|opening balance|previous balance|balance forward/i.test(text)) {
      if (bal != null) prevBalance = bal;
      last = null; continue;
    }
    if (!d) {
      const extra = (parts.description || []).join(' ').trim();
      if (last && extra && outAmt == null && inAmt == null && amt == null && !/total|page \d/i.test(text)) last.description = `${last.description} ${extra}`.trim().slice(0, 300);
      continue;
    }
    let amount = 0, sure = true;
    if (inAmt) amount = Math.abs(inAmt);
    else if (outAmt) amount = -Math.abs(outAmt);
    else if (amt != null) {
      amount = amt;
      if (bal != null && prevBalance != null) {
        const diff = r2(bal - prevBalance);
        if (Math.abs(Math.abs(diff) - Math.abs(amt)) < 0.005) amount = diff; else sure = amt < 0;
      } else sure = amt < 0;
    }
    if (bal != null) prevBalance = bal;
    if (!amount) { last = null; continue; }
    last = { txn_date: d.date, description: (parts.description || []).join(' ').replace(/\s+/g, ' ').trim().slice(0, 300), amount: r2(amount), sure };
    out.push(last);
  }
  return { lines: out, unsure: out.filter(l => !l.sure).length };
}
