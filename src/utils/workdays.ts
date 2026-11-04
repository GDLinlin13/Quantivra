// Counting leave against an employee's work week and the company's public
// holidays.
//   working_days: only days the person normally works count; public holidays
//                 and rest days are skipped. A half working day (e.g. Saturday
//                 morning) counts 0.5.
//   calendar_days: every day counts, weekends and holidays included
//                 (e.g. "98 consecutive days" of maternity leave).
//   weeks:        taken in whole-week blocks of 7 calendar days, weekends and
//                 public holidays included (e.g. Singapore maternity leave). If
//                 the leave type allows single days by agreement, a part-week
//                 is converted from working days.

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type WorkPattern = Record<DayKey, number>; // 1 full day, 0.5 half day, 0 rest day
export type CountMethod = 'working_days' | 'weeks' | 'calendar_days';

export const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_LABELS: Record<DayKey, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

export const WORK_PATTERN_PRESETS: Record<string, { label: string; pattern: WorkPattern }> = {
  mon_fri:          { label: 'Monday to Friday (5 days)', pattern: { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 0, sun: 0 } },
  mon_fri_sat_half: { label: 'Monday to Friday + Saturday half day (5.5 days)', pattern: { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 0.5, sun: 0 } },
  mon_sat:          { label: 'Monday to Saturday (6 days)', pattern: { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 1, sun: 0 } },
};
export const DEFAULT_WORK_PATTERN: WorkPattern = WORK_PATTERN_PRESETS.mon_fri.pattern;

export function normalisePattern(p: Partial<WorkPattern> | null | undefined): WorkPattern {
  const out = { ...DEFAULT_WORK_PATTERN };
  if (p) for (const k of DAY_KEYS) if (typeof p[k] === 'number') out[k] = [0, 0.5, 1].includes(p[k]!) ? p[k]! : out[k];
  return out;
}

export function presetKeyOf(p: WorkPattern): string | null {
  return Object.entries(WORK_PATTERN_PRESETS).find(([, v]) => DAY_KEYS.every(k => v.pattern[k] === p[k]))?.[0] ?? null;
}

export function describePattern(p: WorkPattern): string {
  const key = presetKeyOf(p);
  if (key) return WORK_PATTERN_PRESETS[key].label;
  return DAY_KEYS.filter(k => p[k] > 0).map(k => DAY_LABELS[k] + (p[k] === 0.5 ? ' (½)' : '')).join(', ');
}

export const workDaysPerWeek = (p: WorkPattern) => DAY_KEYS.reduce((s, k) => s + p[k], 0);

const KEY_BY_JS_DAY: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function* eachDate(start: string, end: string) {
  const d = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  for (; d <= e; d.setUTCDate(d.getUTCDate() + 1)) yield { iso: d.toISOString().slice(0, 10), key: KEY_BY_JS_DAY[d.getUTCDay()] };
}

export interface LeaveCountInput {
  start: string; end: string; halfDay?: boolean;
  method: CountMethod; allowSingleDays?: boolean;
  pattern: WorkPattern; holidays: Set<string>;
}

export interface LeaveCount {
  amount: number;                 // in `unit`
  unit: 'days' | 'weeks';
  error?: string;
  calendarDays: number;
  workingDays: number;
  skippedRestDays: string[];
  skippedHolidays: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function countLeave(i: LeaveCountInput): LeaveCount {
  const skippedRestDays: string[] = [];
  const skippedHolidays: string[] = [];
  let working = 0;
  let calendarDays = 0;
  let lastWorkingWeight = 0;
  for (const { iso, key } of eachDate(i.start, i.end)) {
    calendarDays++;
    const w = i.pattern[key];
    if (w <= 0) { skippedRestDays.push(iso); lastWorkingWeight = 0; continue; }
    if (i.holidays.has(iso)) { skippedHolidays.push(iso); lastWorkingWeight = 0; continue; }
    working += w;
    lastWorkingWeight = iso === i.end ? w : 0;
  }
  if (i.halfDay && lastWorkingWeight > 0) working -= Math.min(0.5, lastWorkingWeight);
  working = round2(working);
  const base = { calendarDays, workingDays: working, skippedRestDays, skippedHolidays };

  if (calendarDays === 0) return { ...base, amount: 0, unit: i.method === 'weeks' ? 'weeks' : 'days', error: 'The end date is before the start date' };

  if (i.method === 'calendar_days') return { ...base, amount: calendarDays, unit: 'days' };

  if (i.method === 'weeks') {
    if (calendarDays % 7 === 0 && !i.halfDay) return { ...base, amount: calendarDays / 7, unit: 'weeks' };
    if (i.allowSingleDays) {
      const perWeek = workDaysPerWeek(i.pattern) || 5;
      return { ...base, amount: round2(working / perWeek), unit: 'weeks' };
    }
    return { ...base, amount: 0, unit: 'weeks',
      error: `This leave is taken in whole weeks (7, 14, 21… days in a row, weekends and holidays included). You picked ${calendarDays} day(s).` };
  }

  if (working <= 0) return { ...base, amount: 0, unit: 'days', error: 'None of these dates are working days' };
  return { ...base, amount: working, unit: 'days' };
}

export const unitLabel = (method: CountMethod | undefined | null, n?: number) =>
  method === 'weeks' ? (n === 1 ? 'week' : 'weeks') : (n === 1 ? 'day' : 'days');
