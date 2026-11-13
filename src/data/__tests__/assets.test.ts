import { describe, it, expect } from 'vitest';
import { depreciationSchedule, bookValue } from '../assets';

const base = { cost: 1200, residual_value: 0, life_months: 12, start_month: '2026-01-01', status: 'active' as const, disposed_date: null };

describe('depreciation', () => {
  it('straight-line, one row for each completed month', () => {
    const s = depreciationSchedule(base, '2026-03-15');
    expect(s.map(m => [m.month, m.date, m.amount])).toEqual([['2026-01', '2026-01-31', 100], ['2026-02', '2026-02-28', 100]]);   // March is not over yet
    expect(depreciationSchedule(base, '2026-03-31').length).toBe(3);
  });
  it('stops at the end of the life, with the cents adding up', () => {
    const odd = { ...base, cost: 1000, life_months: 3 };
    const s = depreciationSchedule(odd, '2030-01-01');
    expect(s.map(m => m.amount)).toEqual([333.33, 333.33, 333.34]);
    expect(bookValue(odd, '2030-01-01')).toEqual({ accumulated: 1000, netBookValue: 0 });
  });
  it('leaves the residual value on the books', () => {
    const r = { ...base, residual_value: 200 };
    expect(bookValue(r, '2027-12-31')).toEqual({ accumulated: 1000, netBookValue: 200 });
  });
  it('a disposed asset stops the month before it was disposed of', () => {
    const d = { ...base, status: 'disposed' as const, disposed_date: '2026-03-10' };
    expect(depreciationSchedule(d, '2027-01-01').map(m => m.month)).toEqual(['2026-01', '2026-02']);
  });
});

import { loanSchedule } from '../assets';
describe('loan schedule', () => {
  it('works out the interest from the loan, term and monthly repayment, and clears the loan', () => {
    const l = loanSchedule(100000, 60, 2000, '2026-02-01');
    expect(l.rows.length).toBe(60);
    expect(l.rows[0].month).toBe('2026-02');
    expect(l.rows[l.rows.length - 1].balance).toBe(0);
    const paid = l.rows.reduce((t, r) => t + r.payment, 0);
    expect(Math.round((paid - 100000 - l.totalInterest) * 100)).toBe(0);      // payments = loan + interest
    expect(l.annualRate).toBeGreaterThan(5);
    expect(l.annualRate).toBeLessThan(10);
    expect(l.rows[0].interest).toBeGreaterThan(l.rows[59].interest);          // interest falls as the loan is paid down
  });
  it('no interest when the repayments only add up to the loan', () => {
    const l = loanSchedule(1200, 12, 100, '2026-01-01');
    expect(l.annualRate).toBe(0);
    expect(l.totalInterest).toBe(0);
  });
  it('nothing without a loan, a term and a repayment', () => {
    expect(loanSchedule(0, 12, 100, '2026-01-01').rows).toEqual([]);
  });
});
