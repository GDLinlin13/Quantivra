import { describe, it, expect } from 'vitest';
import { parseBankCsv, parseDate, splitCsvLine } from '../bankCsv';

describe('bank statement CSV', () => {
  it('reads dates the way Singapore banks write them', () => {
    expect(parseDate('31/12/2026')).toBe('2026-12-31');
    expect(parseDate('2026-12-31')).toBe('2026-12-31');
    expect(parseDate('05 Nov 2026')).toBe('2026-11-05');
    expect(parseDate('5-Nov-26')).toBe('2026-11-05');
    expect(parseDate('nonsense')).toBeNull();
  });
  it('splits quoted fields', () => {
    expect(splitCsvLine('a,"b, c","d ""e"""')).toEqual(['a', 'b, c', 'd "e"']);
  });
  it('separate money-out / money-in columns (DBS style), with lines before the header', () => {
    const csv = `Account Details For:,DBS eMulti-Currency Autosave
Statement as at:,05 Nov 2026

Transaction Date,Reference,Debit Amount,Credit Amount,Transaction Ref1,Transaction Ref2
01 Nov 2026,ICT,,"2,943.00",INV-2026-0001,ACME TRADING
02 Nov 2026,POS,23.40,,GRAB,
03 Nov 2026,Balance B/F,,,,`;
    const r = parseBankCsv(csv);
    expect(r.lines).toEqual([
      { txn_date: '2026-11-01', description: 'ICT · INV-2026-0001 · ACME TRADING', amount: 2943 },
      { txn_date: '2026-11-02', description: 'POS · GRAB', amount: -23.4 },
    ]);
    expect(r.skipped).toBe(1);
  });
  it('one signed amount column', () => {
    const r = parseBankCsv('Date,Description,Amount\n2026-11-01,Salary,-4000.00\n2026-11-02,Client,(150.00)\n2026-11-03,Refund,12.5');
    expect(r.lines.map(l => l.amount)).toEqual([-4000, -150, 12.5]);
  });
  it('explains when the file is not a statement', () => {
    expect(parseBankCsv('hello,world').error).toBeTruthy();
  });
});
