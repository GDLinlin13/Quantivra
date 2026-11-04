// Company document numbers, e.g. "INV-{YYYY}-{0000}" → INV-2026-0042.
// Tokens: {YYYY} year, {YY} 2-digit year, {MM} month, {0…0} the running
// number padded to that many digits (at least 1).

export type NumberReset = 'never' | 'yearly' | 'monthly';

export interface NumberingFormat {
  entity: string;
  format: string;
  next: number;
  reset?: NumberReset;
}

export function formatDocumentNumber(format: string, n: number, date = new Date()): string {
  const yyyy = String(date.getFullYear());
  return format
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{YY\}/g, yyyy.slice(2))
    .replace(/\{MM\}/g, String(date.getMonth() + 1).padStart(2, '0'))
    .replace(/\{(0+)\}/g, (_, zeros: string) => String(Math.max(0, Math.floor(n))).padStart(zeros.length, '0'));
}

/** Problems with a format, in plain language (empty = OK). */
export function validateFormat(format: string): string[] {
  const issues: string[] = [];
  if (!format.trim()) issues.push('Format is empty');
  if (!/\{0+\}/.test(format)) issues.push('Add a running number, e.g. {0000}');
  const unknown = (format.match(/\{[^}]*\}/g) || []).filter(t => !/^\{(YYYY|YY|MM|0+)\}$/.test(t));
  if (unknown.length) issues.push(`Unknown code ${unknown.join(', ')} — use {YYYY}, {YY}, {MM} or {0000}`);
  return issues;
}

export const DOCUMENT_LABELS: Record<string, string> = {
  employee: 'Employee ID', invoice: 'Invoice', purchase_order: 'Purchase order', claim: 'Expense claim',
  leave: 'Leave application', journal: 'Journal entry', payslip: 'Payslip', quotation: 'Quotation',
  credit_note: 'Credit note', receipt: 'Receipt',
};
