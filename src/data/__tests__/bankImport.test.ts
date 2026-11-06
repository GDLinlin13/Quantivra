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
    const again = planImport([{ txn_date: '2026-06-30', description: 'Fall Below Fees', amount: -35 }], existing);
    expect(nothingNew(again)).toBe(true);
  });
});
