// Statements that cover several currencies of one account ("consolidated" statements: an HKD
// section, then a foreign-currency section where every line says CNY / USD). Quantivra keeps a bank account per
// currency, so only the lines of that account's currency are read.
import type { PdfRow } from './bankPdf';

/** Currency codes looked for on statements (the common ones; enough to tell sections apart). */
const CODES = new Set(['HKD', 'USD', 'CNY', 'RMB', 'SGD', 'MYR', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'NZD', 'CHF', 'AED', 'SAR',
  'THB', 'IDR', 'PHP', 'VND', 'TWD', 'KRW', 'INR']);
const norm = (c: string) => (c === 'RMB' ? 'CNY' : c);
const words = (row: PdfRow) => row.map(p => p.s).join(' ');
const codesIn = (text: string) => (text.toUpperCase().match(/\b[A-Z]{3}\b/g) || []).filter(w => CODES.has(w)).map(norm);
const AMOUNT = /\d[\d,]*\.\d{2}\b/;
const DATE = /\b\d{1,2}[\s\-/.]+[A-Za-z]{3,9}[\s\-/.]+\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/;
/** a heading that starts a currency's part, e.g. "HKD Savings Account", "USD Current Account", "Currency: USD" */
const HEADING = /account|savings|current|deposit|currency|戶口|賬戶|账户|存款|儲蓄/i;

/** The currencies the lines of this statement are in (empty when it doesn't say: a one-currency statement). */
export function statementCurrencies(rows: PdfRow[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    const t = words(r);
    if (!DATE.test(t) && !HEADING.test(t)) continue;
    for (const c of codesIn(t)) seen.add(c);
  }
  return [...seen];
}

/**
 * Only the rows of `currency`. A row naming one currency (a "Currency" column, "USD 1,234.00") is that currency's;
 * a heading naming one starts that currency's part; a foreign-currency heading naming none ends it. A statement
 * that names no currencies at all, or only this one, is returned whole; the codes are taken out of the text.
 */
export function rowsForCurrency(rows: PdfRow[], currency: string): PdfRow[] {
  const want = norm(currency.toUpperCase());
  const all = statementCurrencies(rows);
  if (all.length < 2 && (!all.length || all[0] === want)) return stripCodes(rows);
  const out: PdfRow[] = [];
  let section: string | null = null;
  for (const r of rows) {
    const t = words(r);
    const codes = [...new Set(codesIn(t))];
    const isTxn = DATE.test(t) && AMOUNT.test(t);
    if (!isTxn && HEADING.test(t)) {
      // "HKD Savings Account" → HKD; "Foreign Currency Savings Account" (no code) → each line says its own
      if (codes.length === 1) section = codes[0];
      else if (/foreign|外幣|外币/i.test(t)) section = null;
      continue;
    }
    const rowCur = codes.length === 1 ? codes[0] : section;
    if (rowCur === want) out.push(r);
  }
  return stripCodes(out);
}

/** take a currency code standing on its own out of the text ("TRANSFER 轉賬 USD" → "TRANSFER 轉賬") */
function stripCodes(rows: PdfRow[]): PdfRow[] {
  return rows.map(r => r.map(p => ({ ...p, s: p.s.split(/\s+/).filter(w => !CODES.has(w.toUpperCase())).join(' ') })).filter(p => p.s.trim()));
}

/**
 * The exchange rate a bank line states (e.g. "Exchange rate 匯率: 1 HKD=0.129016 USD"), as the company currency per 1 unit
 * of the account's currency, and the company-currency amount it gives for `amount`; null if the text has none.
 */
export function rateFromText(text: string | null | undefined, accCur: string, base: string, amount: number): { rate: number; base: number } | null {
  const m = (text || '').match(/1\s*([A-Za-z]{3})\s*=\s*([\d,]*\.?\d+)\s*([A-Za-z]{3})/);
  if (!m) return null;
  const [from, x, to] = [norm(m[1].toUpperCase()), Number(m[2].replace(/,/g, '')), norm(m[3].toUpperCase())];
  if (!(x > 0)) return null;
  const r2 = (n: number) => Math.round(n * 100) / 100, r6 = (n: number) => Math.round(n * 1e6) / 1e6;
  if (from === accCur && to === base) return { rate: r6(x), base: r2(amount * x) };
  if (from === base && to === accCur) return { rate: r6(1 / x), base: r2(amount / x) };
  return null;
}
