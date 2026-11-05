// Reading bank statement CSV files (DBS, OCBC, UOB and most other banks' "download as CSV").

export interface BankLine { txn_date: string; description: string; amount: number }

/** Split one CSV line, honouring "quoted, fields". */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** 31/12/2026, 31-12-2026, 2026-12-31, 31 Dec 2026, 31-Dec-26 → 2026-12-31 (day first, as in Singapore). */
export function parseDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  m = t.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-](\d{2,4})/);
  if (m) {
    const mo = MONTHS.indexOf(m[2].toLowerCase());
    if (mo < 0) return null;
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${String(mo + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

const toNum = (s: string | undefined) => {
  if (!s) return 0;
  const t = s.trim();
  const neg = t.startsWith('-') || /^\(.*\)$/.test(t) || /\bDR\b/i.test(t) || /^[A-Z$]{1,4}\s*-/.test(t);
  const n = Number(t.replace(/[^0-9.]/g, '')) || 0;
  return neg ? -n : n;
};

/**
 * Find the header row and the date / description / amount columns (either one signed
 * amount column, or separate money-out and money-in columns), then read every line.
 */
export function parseBankCsv(text: string): { lines: BankLine[]; skipped: number; error?: string } {
  const rows = text.replace(/\r/g, '').split('\n').filter(l => l.trim()).map(splitCsvLine);
  const isHeader = (r: string[]) => r.some(c => /date/i.test(c)) && r.some(c => /amount|debit|credit|withdraw|deposit/i.test(c));
  const h = rows.findIndex(isHeader);
  if (h < 0) return { lines: [], skipped: rows.length, error: 'Could not find the header row (it needs a Date column and Amount, or Debit / Credit columns).' };
  const head = rows[h].map(c => c.toLowerCase());
  const col = (re: RegExp) => head.findIndex(c => re.test(c));
  const date = col(/date/);
  // every column that describes the transaction, in file order
  const descCols = head.map((c, i) => (i !== date && /description|particular|details|narrative|ref|remark|payee|transaction(?! date)/.test(c) ? i : -1)).filter(i => i >= 0);
  const out = col(/debit|withdraw|money out|paid out/);
  const inn = col(/credit|deposit|money in|paid in/);
  const amt = col(/^amount|amount \(|amount$/);
  const lines: BankLine[] = [];
  let skipped = 0;
  for (const r of rows.slice(h + 1)) {
    const d = parseDate(r[date] || '');
    let amount = 0;
    if (out >= 0 || inn >= 0) amount = Math.abs(toNum(r[inn])) - Math.abs(toNum(r[out]));
    else if (amt >= 0) amount = toNum(r[amt]);
    if (!d || !amount) { skipped++; continue; }
    const words = descCols.map(i => r[i]).filter(Boolean);
    lines.push({ txn_date: d, description: words.join(' · ').slice(0, 300), amount: Math.round(amount * 100) / 100 });
  }
  return { lines, skipped };
}
