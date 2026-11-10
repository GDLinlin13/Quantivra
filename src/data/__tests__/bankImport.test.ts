import { describe, it, expect } from 'vitest';
import { planImport, nothingNew } from '../bankImport';

describe('importing a statement over lines keyed in by hand', () => {
  const existing = [
    { id: 7, txn_date: '2026-06-30', amount: -35, description: 'Fall Below Fees', status: 'unmatched' },
    { id: 3, txn_date: '2026-05-31', amount: 0.03, description: 'Interest', status: 'matched' },
  ];
  const recorded = [{ id: -12, txn_date: '2026-05-26', amount: 1000, journal_id: 12, payment_id: null }];
  const lines = [
    { txn_date: '2026-05-27', description: 'IBG CR FROM DBS', amount: 1000 },
    { txn_date: '2026-05-31', description: 'INTEREST CREDIT', amount: 0.03 },
    { txn_date: '2026-06-30', description: 'FALL BELOW FEE', amount: -35 },
    { txn_date: '2026-06-30', description: 'SERVICE CHARGE', amount: -5 },
  ];
  it('takes over keyed-in lines, matches recorded transfers, adds the rest — in statement order', () => {
    const plan = planImport(lines, existing, recorded);
    expect(plan.map(p => [p.line.description, p.kind, p.kind === 'keyed' ? p.existing.id : p.kind === 'recorded' ? p.recorded.journal_id : null]))
      .toEqual([['IBG CR FROM DBS', 'recorded', 12], ['INTEREST CREDIT', 'keyed', 3], ['FALL BELOW FEE', 'keyed', 7], ['SERVICE CHARGE', 'new', null]]);
    expect(nothingNew(plan)).toBe(false);
  });
  it('a file already imported word for word has nothing new', () => {
    const again = planImport([{ txn_date: '2026-06-30', description: 'Fall Below Fees', amount: -35 }], existing.map(e => ({ ...e, source: 'statement' })));
    expect(nothingNew(again)).toBe(true);
    // the same line keyed in by hand: importing the statement confirms it
    expect(nothingNew(planImport([{ txn_date: '2026-06-30', description: 'Fall Below Fees', amount: -35 }], existing))).toBe(false);
  });
});

describe('a line keyed in a day or two off', () => {
  it('is taken over by the statement line of the same amount (not one from an earlier statement)', async () => {
    const { planImport } = await import('../bankImport');
    const existing = [
      { id: 1, txn_date: '2026-01-08', amount: 12.8, description: 'Internal Transfer', status: 'matched', source: 'manual' },
      { id: 2, txn_date: '2026-01-05', amount: 50, description: 'FEE', status: 'unmatched', source: 'statement' },
    ];
    const plan = planImport([{ txn_date: '2026-01-09', description: 'FX MARKET', amount: 12.8 }, { txn_date: '2026-01-07', description: 'FEE', amount: 50 }], existing);
    expect(plan.map(p => p.kind)).toEqual(['keyed', 'new']);
  });
});
