import { describe, it, expect } from 'vitest';
import { buildStatement, statementCurrencies, customersOwing } from '../soa';
import type { FinDocument } from '../finance';

const doc = (o: Partial<FinDocument>): FinDocument => ({
  id: 1, company_id: 1, doc_type: 'invoice', number: 'INV-1', status: 'sent', contact_id: 7, contact_person_id: null,
  issue_date: '2026-01-10', due_date: '2026-02-09', reference: null, currency: 'SGD', tax_inclusive: false, discounts: [],
  subtotal: 100, discount_total: 0, tax_total: 0, total: 100, amount_paid: 0, notes: null, terms: null, source_id: null, ...o,
} as FinDocument);

const docs = [
  doc({ id: 1, number: 'INV-1', issue_date: '2026-01-10', due_date: '2026-02-09', total: 1000 }),
  doc({ id: 2, number: 'INV-2', issue_date: '2026-03-01', due_date: '2026-03-31', total: 500 }),
  doc({ id: 3, number: 'CN-1', doc_type: 'credit_note', issue_date: '2026-03-15', total: 100 }),
  doc({ id: 4, number: 'INV-3', issue_date: '2026-03-20', total: 800, status: 'draft' }),                // a draft: not on the statement
  doc({ id: 5, number: 'INV-4', issue_date: '2026-03-20', total: 300, status: 'void' }),                 // void: not on it either
  doc({ id: 6, number: 'INV-5', issue_date: '2026-02-01', total: 50, contact_id: 8 }),                   // someone else
  doc({ id: 7, number: 'INV-6', issue_date: '2026-02-01', total: 70, currency: 'USD' }),                 // another currency
];
const payments = [{ id: 1, number: 'RCT-1', payment_date: '2026-02-20', method: 'Bank transfer', reference: 'TT123' }, { id: 2, number: 'RCT-2', payment_date: '2026-04-05' }];
const allocations = [{ payment_id: 1, document_id: 1, amount: 600 }, { payment_id: 2, document_id: 2, amount: 200 }];

describe('buildStatement', () => {
  it('a period lists every invoice, credit note and payment with a running balance', () => {
    const s = buildStatement({ contactId: 7, currency: 'SGD', from: '2026-01-01', to: '2026-04-30', docs, payments, allocations });
    expect(s.rows.map(r => [r.date, r.kind, r.number, r.balance])).toEqual([
      ['2026-01-10', 'invoice', 'INV-1', 1000],
      ['2026-02-20', 'payment', 'RCT-1', 400],
      ['2026-03-01', 'invoice', 'INV-2', 900],
      ['2026-03-15', 'credit_note', 'CN-1', 800],
      ['2026-04-05', 'payment', 'RCT-2', 600],
    ]);
    expect(s.closing).toBe(600);
    expect(s.charges).toBe(1500);
    expect(s.credits).toBe(900);
  });

  it('leaves out drafts, voids, other customers and other currencies', () => {
    const s = buildStatement({ contactId: 7, currency: 'SGD', from: null, to: '2026-04-30', docs, payments, allocations });
    expect(s.rows.some(r => ['INV-3', 'INV-4', 'INV-5', 'INV-6'].includes(r.number))).toBe(false);
    expect(buildStatement({ contactId: 7, currency: 'USD', from: null, to: '2026-04-30', docs, payments, allocations }).closing).toBe(70);
  });

  it('rolls earlier items into an opening balance when a start date is given', () => {
    const s = buildStatement({ contactId: 7, currency: 'SGD', from: '2026-03-01', to: '2026-04-30', docs, payments, allocations });
    expect(s.opening).toBe(400);
    expect(s.rows.map(r => r.number)).toEqual(['INV-2', 'CN-1', 'RCT-2']);
    expect(s.rows[0].balance).toBe(900);
    expect(s.closing).toBe(600);
  });

  it('ignores anything after the statement date, payments included', () => {
    const s = buildStatement({ contactId: 7, currency: 'SGD', from: null, to: '2026-03-31', docs, payments, allocations });
    expect(s.closing).toBe(800);
    expect(s.rows.some(r => r.number === 'RCT-2')).toBe(false);
  });

  it('ages what is still owed by how late it is, and the buckets add up to the balance', () => {
    const s = buildStatement({ contactId: 7, currency: 'SGD', from: null, to: '2026-04-30', docs, payments, allocations });
    // INV-1: 400 owed, due 9 Feb → 80 days late; INV-2: 300 owed, due 31 Mar → 30 days late; CN-1 -100 current
    expect(s.ageing).toEqual({ current: -100, d1_30: 300, d31_60: 0, d61_90: 400, d90plus: 0 });
    expect(s.overdue).toBe(700);
    const sum = Object.values(s.ageing).reduce((a, b) => a + b, 0);
    expect(Math.round(sum * 100) / 100).toBe(s.closing);
  });

  it('one payment against two invoices is one row', () => {
    const s = buildStatement({
      contactId: 7, currency: 'SGD', from: '2026-01-01', to: '2026-05-01', docs, payments,
      allocations: [{ payment_id: 1, document_id: 1, amount: 700 }, { payment_id: 1, document_id: 2, amount: 300 }],
    });
    const pay = s.rows.filter(r => r.kind === 'payment');
    expect(pay).toHaveLength(1);
    expect(pay[0].credit).toBe(1000);
    expect(pay[0].description).toBe('Payment received — INV-1, INV-2');
  });
});

describe('as at a date: only what is outstanding', () => {
  it('lists the invoices still owing at that date, at what is owed, with no payments', () => {
    const s = buildStatement({ contactId: 7, currency: 'SGD', from: null, to: '2026-04-30', docs, payments, allocations });
    expect(s.rows.map(r => [r.kind, r.number, r.debit, r.credit, r.balance])).toEqual([
      ['invoice', 'INV-1', 400, 0, 400],
      ['invoice', 'INV-2', 300, 0, 700],
      ['credit_note', 'CN-1', 0, 100, 600],
    ]);
    expect(s.rows[0].description).toBe('Part paid — invoice total 1000.00');
    expect(s.closing).toBe(600);                                   // the same amount due as the full statement
  });
  it('leaves out an invoice paid in full by that date, and counts it again for an earlier date', () => {
    const paidUp = [{ payment_id: 1, document_id: 1, amount: 1000 }];
    expect(buildStatement({ contactId: 7, currency: 'SGD', from: null, to: '2026-04-30', docs, payments, allocations: paidUp }).rows.some(r => r.number === 'INV-1')).toBe(false);
    expect(buildStatement({ contactId: 7, currency: 'SGD', from: null, to: '2026-02-10', docs, payments, allocations: paidUp }).rows.map(r => r.number)).toEqual(['INV-1']);
  });
});

describe('helpers', () => {
  it('statementCurrencies lists a customer\'s currencies, most used first', () => {
    expect(statementCurrencies(7, docs, 'SGD')).toEqual(['SGD', 'USD']);
    expect(statementCurrencies(99, docs, 'HKD')).toEqual(['HKD']);
  });
  it('customersOwing finds who owes something', () => {
    const owing = customersOwing(docs, payments, allocations, '2026-04-30');
    expect(owing.find(o => o.contactId === 7 && o.currency === 'SGD')?.closing).toBe(600);
    expect(owing.find(o => o.contactId === 8)?.closing).toBe(50);
  });
});
