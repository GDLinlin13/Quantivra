import { describe, it, expect } from 'vitest';
import { countLeave, WORK_PATTERN_PRESETS, normalisePattern } from '../workdays';
import { officialHolidays } from '../../data/public-holidays';

const sg2026 = new Set(officialHolidays('SG', 2026).map(h => h.date));
const p = (k: keyof typeof WORK_PATTERN_PRESETS) => WORK_PATTERN_PRESETS[k].pattern;

describe('counting leave', () => {
  it('4–11 Nov 2026, Mon–Fri: skips the weekend and Deepavali (observed) → 5 days', () => {
    const r = countLeave({ start: '2026-11-04', end: '2026-11-11', method: 'working_days', pattern: p('mon_fri'), holidays: sg2026 });
    expect(r.amount).toBe(5);
    expect(r.skippedRestDays).toEqual(['2026-11-07', '2026-11-08']);
    expect(r.skippedHolidays).toEqual(['2026-11-09']);
  });

  it('Saturday workers: full Saturday counts 1, half Saturday counts 0.5', () => {
    expect(countLeave({ start: '2026-11-04', end: '2026-11-11', method: 'working_days', pattern: p('mon_sat'), holidays: sg2026 }).amount).toBe(6);
    expect(countLeave({ start: '2026-11-04', end: '2026-11-11', method: 'working_days', pattern: p('mon_fri_sat_half'), holidays: sg2026 }).amount).toBe(5.5);
  });

  it('half day on the last day', () => {
    expect(countLeave({ start: '2026-11-10', end: '2026-11-11', halfDay: true, method: 'working_days', pattern: p('mon_fri'), holidays: sg2026 }).amount).toBe(1.5);
  });

  it('only holidays/rest days → error', () => {
    expect(countLeave({ start: '2026-11-07', end: '2026-11-09', method: 'working_days', pattern: p('mon_fri'), holidays: sg2026 }).error).toBeTruthy();
  });

  it('weeks: whole 7-day blocks, weekends and holidays included', () => {
    const r = countLeave({ start: '2026-11-02', end: '2026-11-29', method: 'weeks', pattern: p('mon_fri'), holidays: sg2026 });
    expect(r).toMatchObject({ amount: 4, unit: 'weeks' });
    expect(r.error).toBeUndefined();
  });

  it('weeks: part-week refused unless single days are allowed', () => {
    const base = { start: '2026-11-10', end: '2026-11-12', method: 'weeks' as const, pattern: p('mon_fri'), holidays: sg2026 };
    expect(countLeave(base).error).toMatch(/whole weeks/);
    expect(countLeave({ ...base, allowSingleDays: true }).amount).toBe(0.6); // 3 working days of a 5-day week
  });

  it('bad stored patterns fall back to Mon–Fri', () => {
    expect(normalisePattern({ sat: 3 } as any).sat).toBe(0);
  });
});
