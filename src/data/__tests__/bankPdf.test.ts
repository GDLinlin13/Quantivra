import { describe, it, expect } from 'vitest';
import { parseStatementText } from '../bankPdf';

const w = (s: string) => s.split(/\s+/);

describe('bank statement PDF text', () => {
  it('uses the running balance to tell money in from money out', () => {
    const r = parseStatementText([
      w('DBS Bank Ltd Statement of Account 01 Nov 2026 to 30 Nov 2026'),
      w('Date Description Withdrawal Deposit Balance'),
      w('01 Nov Balance Brought Forward 10,000.00'),
      w('02 Nov FAST PAYMENT ACME TRADING 2,943.00 12,943.00'),
      w('INV-2026-0001'),
      w('03 Nov GIRO CPF BOARD 12,278.25 664.75'),
      w('04 Nov SERVICE CHARGE 5.00 659.75'),
      w('Total 12,283.25 2,943.00'),
      w('Balance Carried Forward 659.75'),
    ]);
    expect(r.lines).toEqual([
      { txn_date: '2026-11-02', description: 'FAST PAYMENT ACME TRADING INV-2026-0001', amount: 2943, sure: true },
      { txn_date: '2026-11-03', description: 'GIRO CPF BOARD', amount: -12278.25, sure: true },
      { txn_date: '2026-11-04', description: 'SERVICE CHARGE', amount: -5, sure: true },
    ]);
    expect(r.unsure).toBe(0);
  });

  it('full dates and no balance column: guesses from the words and flags it', () => {
    const r = parseStatementText([w('05/11/2026 Interest credit 1.23'), w('06/11/2026 POS purchase 45.60')]);
    expect(r.lines.map(l => [l.txn_date, l.amount, l.sure])).toEqual([['2026-11-05', 1.23, false], ['2026-11-06', -45.6, false]]);
    expect(r.unsure).toBe(2);
  });
});
