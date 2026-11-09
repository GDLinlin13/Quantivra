// The kinds of pay item a company can add to a payroll run, and the maths
// for overtime and unpaid leave.
import { DAY_KEYS, type WorkPattern } from '../utils/workdays';

export type PayItemKind = 'earning' | 'deduction';
export type PayItemUnit = 'hours' | 'days';

export interface PayItemType {
  code: string;
  label: string;
  kind: PayItemKind;
  /** Plain-language note shown when picking the item. */
  help: string;
  unit?: PayItemUnit;              // entered as hours / days, amount worked out
  classifyAs?: string;             // for CPF etc. when the country has no rule for this code
  taxable?: boolean;               // default true
  /** Unpaid leave: reduces pay (and so CPF) rather than being taken off afterwards. */
  reducesPay?: boolean;
  canRecur: boolean;               // sensible as a fixed monthly item
  /** Same item entered another way (overtime by day); not listed separately in the picker. */
  variantOf?: string;
}

export const PAY_ITEM_TYPES: PayItemType[] = [
  { code: 'OVERTIME', label: 'Overtime', kind: 'earning', unit: 'hours', canRecur: false,
    help: 'Enter the hours. The hourly rate is worked out from the basic salary (Singapore MOM formula) and the rate multiplier is 1.5× — change either if you pay differently (e.g. 2× on rest days). The amount can be adjusted too.' },
  { code: 'OVERTIME_DAYS', label: 'Overtime', kind: 'earning', unit: 'days', canRecur: false, variantOf: 'OVERTIME', classifyAs: 'OVERTIME',
    help: 'Enter the days. The daily rate is the basic salary ÷ the working days in that month (the same as for unpaid leave) and the rate multiplier is 1.5× — change either if you pay differently (e.g. 2× on rest days). The amount can be adjusted too.' },
  { code: 'ALLOWANCE_TRANSPORT', label: 'Transport allowance', kind: 'earning', canRecur: true, help: 'Counts as wages for CPF.' },
  { code: 'ALLOWANCE_HOUSING', label: 'Housing allowance', kind: 'earning', canRecur: true, help: 'Counts as wages for CPF.' },
  { code: 'ALLOWANCE_MEAL', label: 'Meal allowance', kind: 'earning', canRecur: true, help: 'Counts as wages for CPF.' },
  { code: 'ALLOWANCE_MOBILE', label: 'Phone claim', kind: 'earning', canRecur: true, taxable: false, help: 'Paying back phone bills. No CPF, not taxed.' },
  { code: 'ALLOWANCE_SHIFT', label: 'Shift allowance', kind: 'earning', canRecur: true, help: 'Counts as wages for CPF.' },
  { code: 'ALLOWANCE_OTHER', label: 'Other allowance', kind: 'earning', canRecur: true, classifyAs: 'ALLOWANCE_TRANSPORT',
    help: 'Any other cash allowance. Counts as wages for CPF. Use the note to say what it is.' },
  { code: 'BONUS', label: 'Bonus', kind: 'earning', canRecur: false, help: 'One-off bonus (CPF: additional wages).' },
  { code: 'COMMISSION', label: 'Commission', kind: 'earning', canRecur: false, help: 'Sales commission (CPF: additional wages).' },
  { code: 'AWS', label: '13th month (AWS)', kind: 'earning', canRecur: false, help: 'Annual Wage Supplement (CPF: additional wages).' },
  { code: 'REIMBURSEMENT', label: 'Reimbursement / claim', kind: 'earning', canRecur: false, taxable: false,
    help: 'Paying back money the employee spent for work (taxi, client lunch…). Not wages: no CPF, not taxed.' },
  { code: 'UNPAID_LEAVE', label: 'Unpaid leave', kind: 'deduction', unit: 'days', canRecur: false, reducesPay: true, classifyAs: 'BASIC',
    help: 'Enter the days; the amount is salary × days ÷ working days in the month, and can be adjusted. Lowers CPF too.' },
  { code: 'DEDUCTION_LOAN', label: 'Loan repayment', kind: 'deduction', canRecur: true, help: 'Taken off take-home pay. Does not change CPF.' },
  { code: 'DEDUCTION_ADVANCE', label: 'Salary advance', kind: 'deduction', canRecur: false, help: 'Recovering pay given in advance. Does not change CPF.' },
  { code: 'DEDUCTION_OTHER', label: 'Other deduction', kind: 'deduction', canRecur: true, help: 'Any other deduction. Use the note to say what it is.' },
];

export const PAY_ITEM_BY_CODE: Record<string, PayItemType> = Object.fromEntries(PAY_ITEM_TYPES.map(t => [t.code, t]));

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Hourly basic rate, Singapore Employment Act: (12 × monthly basic) ÷ (52 × 44). */
export function hourlyRate(monthlyBasic: number): number {
  return (12 * (Number(monthlyBasic) || 0)) / (52 * 44);
}

export const DEFAULT_OT_MULTIPLIER = 1.5;

/** hours × hourly rate × multiplier; the rate defaults to the MOM hourly rate of the basic salary. */
/** Daily rate: monthly basic ÷ working days in that month (e.g. 4,000 ÷ 22 = 181.82). */
export function dailyRate(monthlyBasic: number, workingDays: number): number {
  return workingDays > 0 ? (Number(monthlyBasic) || 0) / workingDays : 0;
}

/** Overtime counted in days: days × daily rate × multiplier. */
export function overtimeDaysAmount(monthlyBasic: number, days: number, multiplier: number | null = DEFAULT_OT_MULTIPLIER, rate?: number | null, workingDays = 22): number {
  const r = rate != null && rate >= 0 ? Number(rate) : dailyRate(monthlyBasic, workingDays);
  const m = multiplier != null && multiplier >= 0 ? Number(multiplier) : DEFAULT_OT_MULTIPLIER;
  return round2(r * m * (Number(days) || 0));
}

export const isOvertime = (code: string) => code === 'OVERTIME' || code === 'OVERTIME_DAYS';

export function overtimeAmount(monthlyBasic: number, hours: number, multiplier: number | null = DEFAULT_OT_MULTIPLIER, rate?: number | null): number {
  const r = rate != null && rate >= 0 ? Number(rate) : hourlyRate(monthlyBasic);
  const m = multiplier != null && multiplier >= 0 ? Number(multiplier) : DEFAULT_OT_MULTIPLIER;
  return round2(r * m * (Number(hours) || 0));
}

/** Days the person is meant to work in the month (half days count ½). */
export function workingDaysInMonth(year: number, month: number, pattern: WorkPattern): number {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let n = 0;
  for (let d = 1; d <= days; d++) {
    const js = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    n += pattern[DAY_KEYS[(js + 6) % 7]] || 0;
  }
  return n;
}

/** Singapore MOM: monthly salary × days of unpaid leave ÷ working days in that month. */
export function unpaidLeaveAmount(monthlyBasic: number, days: number, workingDays: number): number {
  if (!(workingDays > 0)) return 0;
  return round2(((Number(monthlyBasic) || 0) * (Number(days) || 0)) / workingDays);
}

/** "Overtime (10 hrs)", "Other allowance – Laptop", … */
export function payItemLabel(item: { item_code: string; label?: string | null; quantity?: number | null; note?: string | null; multiplier?: number | null }): string {
  const t = PAY_ITEM_BY_CODE[item.item_code];
  let s = item.label || t?.label || item.item_code;
  const m = item.multiplier != null && Number(item.multiplier) !== DEFAULT_OT_MULTIPLIER ? ` @ ${Number(item.multiplier)}×` : '';
  if (item.quantity != null && t?.unit) s += ` (${Number(item.quantity)} ${t.unit === 'hours' ? 'hrs' : Number(item.quantity) === 1 ? 'day' : 'days'}${isOvertime(item.item_code) ? m : ''})`;
  if (item.note && (item.item_code.endsWith('_OTHER') || item.item_code === 'REIMBURSEMENT')) s += ` – ${item.note}`;
  return s;
}

export interface PayItemRow {
  id?: number;
  company_id: number;
  employee_id: number;
  item_code: string;
  label?: string | null;
  quantity?: number | null;
  /** Overtime: hourly rate (empty = from basic salary) and multiplier (empty = 1.5). */
  rate?: number | null;
  multiplier?: number | null;
  amount: number;
  note?: string | null;
  recurring: boolean;
  period_year?: number | null;
  period_month?: number | null;
}

/** Turn an employee's pay items into payroll-engine input. */
export function toEngineItems(items: PayItemRow[]) {
  const salaryComponents: { componentCode: string; amount: number; label: string; classifyAs?: string; taxable?: boolean; prorate?: boolean }[] = [];
  const otherDeductions: { componentCode: string; amount: number; label: string }[] = [];
  for (const it of items) {
    const t = PAY_ITEM_BY_CODE[it.item_code];
    const amount = round2(Number(it.amount) || 0);
    if (!t || amount <= 0) continue;
    const label = payItemLabel(it);
    if (t.kind === 'earning' || t.reducesPay) {
      salaryComponents.push({
        componentCode: t.code,
        amount: t.reducesPay ? -amount : amount,
        label,
        ...(t.classifyAs ? { classifyAs: t.classifyAs } : {}),
        ...(t.taxable === false ? { taxable: false } : {}),
        // fixed monthly items behave like salary; one-off items are paid in full
        ...(it.recurring ? {} : { prorate: false }),
      });
    } else {
      otherDeductions.push({ componentCode: t.code, amount, label });
    }
  }
  return { salaryComponents, otherDeductions };
}
