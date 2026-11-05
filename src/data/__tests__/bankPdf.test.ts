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

describe('taught layouts', () => {
  const P = (s: string, x: number, w = 40) => ({ s, x, w });
  const rows = [
    [P('OCBC Statement November 2026', 20, 200)],
    [P('Date', 20), P('Particulars', 90), P('Withdrawal', 300), P('Deposit', 380), P('Balance', 460)],
    [P('BALANCE B/F', 90, 80), P('10,000.00', 460)],
    [P('02 NOV', 20), P('INWARD PAYMENT', 90, 120), P('3,270.00', 385), P('13,270.00', 460)],
    [P('ACME TRADING', 90, 90)],
    [P('03 NOV', 20), P('CPF BOARD', 90, 70), P('6,000.00', 300), P('7,270.00', 460)],
  ];
  it('learns columns from one row and reads the rest', async () => {
    const { learnLayout, parseWithLayout } = await import('../bankPdf');
    const layout = learnLayout(rows[3], ['date', 'description', 'in', 'balance']);
    // the money-out column wasn't in the example row, so teach it from the header
    layout.columns.push({ role: 'out', x: 320 });
    const r = parseWithLayout(rows, layout);
    expect(r.lines).toEqual([
      { txn_date: '2026-11-02', description: 'INWARD PAYMENT ACME TRADING', amount: 3270, sure: true },
      { txn_date: '2026-11-03', description: 'CPF BOARD', amount: -6000, sure: true },
    ]);
  });
});
