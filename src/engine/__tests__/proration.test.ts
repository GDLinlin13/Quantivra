import { describe, it, expect } from 'vitest';
import {
  calculateWorkingDaysInPeriod,
  calculateEmployeeWorkingDays,
  calculateProrationFactor,
  prorateAmount,
} from '../proration';

describe('proration', () => {
  it('calculates working days in a 31-day period', () => {
    const days = calculateWorkingDaysInPeriod('2026-01-01', '2026-01-31');
    expect(days).toBe(31);
  });

  it('calculates working days in a 28-day period', () => {
    const days = calculateWorkingDaysInPeriod('2026-02-01', '2026-02-28');
    expect(days).toBe(28);
  });

  it('calculates employee days for full period', () => {
    const days = calculateEmployeeWorkingDays({
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
    });
    expect(days).toBe(31);
  });

  it('calculates employee days for mid-month joiner', () => {
    const days = calculateEmployeeWorkingDays({
      joinDate: '2026-01-15',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
    });
    expect(days).toBe(17); // 15 to 31 inclusive
  });

  it('calculates employee days for mid-month leaver', () => {
    const days = calculateEmployeeWorkingDays({
      leaveDate: '2026-01-15',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
    });
    expect(days).toBe(15); // 1 to 15 inclusive
  });

  it('handles unpaid leave days', () => {
    const days = calculateEmployeeWorkingDays({
      joinDate: '2026-01-01',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      unpaidLeaveDays: 5,
    });
    expect(days).toBe(26);
  });

  it('calculates proration factor for mid-month joiner', () => {
    const factor = calculateProrationFactor({
      joinDate: '2026-01-15',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
    });
    expect(factor).toBeCloseTo(17 / 31);
  });

  it('prorates amount correctly', () => {
    expect(prorateAmount(6000, 0.5)).toBe(3000);
  });
});
