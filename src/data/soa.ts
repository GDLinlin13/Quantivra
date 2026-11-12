// Statement of account: what one customer owes, from their invoices, credit notes and payments.
import type { FinDocument } from './finance';

const r2 = (n: number) => Math.round(n * 100) / 100;
const D = 86400000;

export interface SoaPayment { id: number; number: string | null; payment_date: string; method?: string | null; reference?: string | null }
export interface SoaAllocation { payment_id: number; document_id: number; amount: number }

export type SoaKind = 'invoice' | 'credit_note' | 'payment';
export interface SoaRow {
  date: string; kind: SoaKind; number: string; reference: string; description: string;
  debit: number; credit: number; balance: number;
}
export interface Ageing { current: number; d1_30: number; d31_60: number; d61_90: number; d90plus: number }
export interface Soa {
  currency: string; from: string | null; to: string;
  opening: number; rows: SoaRow[];
  /** invoices raised, and payments + credit notes, inside the period */
  charges: number; credits: number;
  closing: number; ageing: Ageing; overdue: number;
}

const KIND_ORDER: Record<SoaKind, number> = { invoice: 0, credit_note: 1, payment: 2 };

/**
 * One statement for one customer in one currency, up to `to` (the statement date). With `from` (a period), earlier
 * items are rolled into the opening balance and every invoice and payment in the period is listed; without it
 * (as at a date), only the invoices still outstanding on that date are listed, at what is still owed.
 * Drafts and voided documents are left out. A payment appears on the day it was received, for the part of it
 * that settled this customer's invoices in this currency.
 */
export function buildStatement(input: {
  contactId: number; currency: string; from: string | null; to: string;
  docs: FinDocument[]; payments: SoaPayment[]; allocations: SoaAllocation[];
}): Soa {
  const { contactId, currency, from, to } = input;
  const mine = input.docs.filter(d => d.contact_id === contactId && (d.currency || '').toUpperCase() === currency.toUpperCase()
    && ['invoice', 'credit_note'].includes(d.doc_type) && !['draft', 'void'].includes(d.status));
  const byId = new Map(mine.map(d => [d.id, d]));
  const paymentById = new Map(input.payments.map(p => [p.id, p]));

  // what each invoice has been paid by the statement date
  const paidBy = new Map<number, number>();
  for (const a of input.allocations) {
    const p = paymentById.get(a.payment_id);
    if (!p || p.payment_date > to) continue;
    paidBy.set(a.document_id, r2((paidBy.get(a.document_id) || 0) + Number(a.amount)));
  }
  // "As at" a date (no period): only what is still outstanding on that date; a period lists every invoice and payment
  const outstandingOnly = !from;

  type Item = Omit<SoaRow, 'balance'> & { order: number };
  const items: Item[] = [];
  for (const d of mine) {
    if (outstandingOnly && d.doc_type === 'invoice' && d.issue_date <= to) {
      const open = r2(Number(d.total) - (paidBy.get(d.id) || 0));
      if (Math.abs(open) < 0.005) continue;            // fully paid by then: not on the statement
      items.push({ date: d.issue_date, kind: 'invoice', number: d.number, reference: d.reference || '',
        description: open < r2(Number(d.total)) - 0.004 ? `Part paid — invoice total ${r2(Number(d.total)).toFixed(2)}` : '', debit: open, credit: 0, order: KIND_ORDER.invoice });
      continue;
    }
    items.push(d.doc_type === 'invoice'
      ? { date: d.issue_date, kind: 'invoice', number: d.number, reference: d.reference || '', description: '', debit: r2(Number(d.total)), credit: 0, order: KIND_ORDER.invoice }
      : { date: d.issue_date, kind: 'credit_note', number: d.number, reference: d.reference || '', description: 'Credit note', debit: 0, credit: r2(Number(d.total)), order: KIND_ORDER.credit_note });
  }
  // payments settling these invoices, one row per payment
  const perPayment = new Map<number, { amount: number; docs: string[] }>();
  for (const a of input.allocations) {
    const d = byId.get(a.document_id);
    if (!d || d.doc_type !== 'invoice' || !paymentById.has(a.payment_id)) continue;
    const g = perPayment.get(a.payment_id) || { amount: 0, docs: [] };
    g.amount = r2(g.amount + Number(a.amount));
    if (!g.docs.includes(d.number)) g.docs.push(d.number);
    perPayment.set(a.payment_id, g);
  }
  for (const [pid, g] of outstandingOnly ? [] : perPayment) {
    const p = paymentById.get(pid)!;
    items.push({
      date: p.payment_date, kind: 'payment', number: p.number || '', reference: p.reference || p.method || '',
      description: `Payment received — ${g.docs.join(', ')}`, debit: 0, credit: g.amount, order: KIND_ORDER.payment,
    });
  }

  const upTo = items.filter(i => i.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.number.localeCompare(b.number));
  const before = from ? upTo.filter(i => i.date < from) : [];
  const inside = from ? upTo.filter(i => i.date >= from) : upTo;
  const opening = r2(before.reduce((s, i) => s + i.debit - i.credit, 0));
  let running = opening;
  const rows: SoaRow[] = inside.map(({ order: _o, ...i }) => { running = r2(running + i.debit - i.credit); return { ...i, balance: running }; });
  const charges = r2(inside.reduce((s, i) => s + i.debit, 0));
  const credits = r2(inside.reduce((s, i) => s + i.credit, 0));
  const closing = r2(opening + charges - credits);

  // ageing at the statement date: what each invoice still owes, by how long past its due date; credits count as current
  const ageing: Ageing = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  const asAt = Date.parse(to);
  for (const d of mine) {
    if (d.issue_date > to) continue;
    if (d.doc_type === 'credit_note') { ageing.current = r2(ageing.current - Number(d.total)); continue; }
    const open = r2(Number(d.total) - (paidBy.get(d.id) || 0));
    if (Math.abs(open) < 0.005) continue;
    const late = Math.floor((asAt - Date.parse(d.due_date || d.issue_date)) / D);
    const k: keyof Ageing = late <= 0 ? 'current' : late <= 30 ? 'd1_30' : late <= 60 ? 'd31_60' : late <= 90 ? 'd61_90' : 'd90plus';
    ageing[k] = r2(ageing[k] + open);
  }
  const overdue = r2(ageing.d1_30 + ageing.d31_60 + ageing.d61_90 + ageing.d90plus);
  return { currency, from, to, opening, rows, charges, credits, closing, ageing, overdue };
}

/** The currencies a customer has statements in, most used first. */
export function statementCurrencies(contactId: number, docs: FinDocument[], fallback: string): string[] {
  const count = new Map<string, number>();
  for (const d of docs) {
    if (d.contact_id !== contactId || !['invoice', 'credit_note'].includes(d.doc_type) || ['draft', 'void'].includes(d.status)) continue;
    const c = (d.currency || fallback).toUpperCase();
    count.set(c, (count.get(c) || 0) + 1);
  }
  const list = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  return list.length ? list : [fallback];
}

/** Customers who owe something as at `to`, with the amount, per currency. */
export function customersOwing(docs: FinDocument[], payments: SoaPayment[], allocations: SoaAllocation[], to: string): { contactId: number; currency: string; closing: number; overdue: number }[] {
  const keys = new Set<string>();
  for (const d of docs) if (d.contact_id && ['invoice', 'credit_note'].includes(d.doc_type) && !['draft', 'void'].includes(d.status)) keys.add(`${d.contact_id}|${(d.currency || '').toUpperCase()}`);
  const out: { contactId: number; currency: string; closing: number; overdue: number }[] = [];
  for (const k of keys) {
    const [id, cur] = k.split('|');
    const s = buildStatement({ contactId: Number(id), currency: cur, from: null, to, docs, payments, allocations });
    if (Math.abs(s.closing) >= 0.005) out.push({ contactId: Number(id), currency: cur, closing: s.closing, overdue: s.overdue });
  }
  return out;
}
