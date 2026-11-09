import { describe, it, expect } from 'vitest';
import { calculatePayroll } from '../payroll';
import sgPack from '../../data/country-packs/SG';
import type { PayrollPeriod, EmployeePayrollInput } from '../types';
import { toEngineItems, overtimeAmount, overtimeDaysAmount, dailyRate, unpaidLeaveAmount, workingDaysInMonth, hourlyRate, type PayItemRow } from '../../data/payItems';
import { DEFAULT_WORK_PATTERN } from '../../utils/workdays';

const aug2026: PayrollPeriod = {
  startDate: '2026-08-01', endDate: '2026-08-31', payDate: '2026-08-31',
  frequency: 'monthly', payYear: 2026, payMonth: 8, payPeriod: 8,
};

const item = (item_code: string, amount: number, extra: Partial<PayItemRow> = {}): PayItemRow =>
  ({ company_id: 1, employee_id: 1, item_code, amount, recurring: false, period_year: 2026, period_month: 8, ...extra });

function pay(items: PayItemRow[], joined = '2020-01-01') {
  const extra = toEngineItems(items);
  const emp: EmployeePayrollInput = {
    employeeId: 'E1', name: 'Alice', dateOfBirth: '1990-06-15', dateOfJoining: joined,
    employmentStatusCode: 'PERMANENT', immigrationStatusCode: 'SC', ethnicity: 'chinese',
    salaryComponents: [{ componentCode: 'BASIC', amount: 4000 }, ...extra.salaryComponents],
    otherDeductions: extra.otherDeductions,
  };
  const r = calculatePayroll({ period: aug2026, countryPack: sgPack, employees: [emp] }).employees[0];
  expect(r.status).toBe('success');
  return { r, cpf: r.statutoryContributions.find(s => s.schemeCode === 'CPF')!.employeeTotal };
}

describe('overtime and unpaid leave maths', () => {
  it('uses the MOM formulas', () => {
    expect(hourlyRate(4000)).toBeCloseTo(20.979, 2);
    expect(overtimeAmount(4000, 10)).toBe(314.69);
    expect(workingDaysInMonth(2026, 8, DEFAULT_WORK_PATTERN)).toBe(21); // Aug 2026: 21 weekdays
    expect(unpaidLeaveAmount(4000, 2, 21)).toBe(380.95);
  });
  it('overtime can use its own hourly rate and multiplier', () => {
    expect(overtimeAmount(4000, 10, 2)).toBe(419.58);          // MOM rate × 2
    expect(overtimeAmount(4000, 10, null, 25)).toBe(375);       // own rate × 1.5
    expect(overtimeAmount(4000, 0.5, 1, 30)).toBe(15);          // own rate × 1
    expect(toEngineItems([item('OVERTIME', 419.58, { quantity: 10, multiplier: 2 })]).salaryComponents[0].label).toBe('Overtime (10 hrs @ 2×)');
    expect(toEngineItems([item('OVERTIME', 300, { quantity: 10, multiplier: 1.5 })]).salaryComponents[0].label).toBe('Overtime (10 hrs)');
  });
  it('overtime can be counted in days', () => {
    expect(dailyRate(4000, 22)).toBeCloseTo(181.818, 2);            // 4000 ÷ 22 working days
    expect(overtimeDaysAmount(4000, 1, 1, null, 22)).toBe(181.82);
    expect(overtimeDaysAmount(4000, 2, null, null, 22)).toBe(545.45); // 2 days × 181.82 × 1.5
    expect(overtimeDaysAmount(4000, 1, 2, 200)).toBe(400);
    expect(toEngineItems([item('OVERTIME_DAYS', 400, { quantity: 1, multiplier: 2 })]).salaryComponents[0])
      .toMatchObject({ componentCode: 'OVERTIME_DAYS', label: 'Overtime (1 day @ 2×)', classifyAs: 'OVERTIME', prorate: false });
  });
});

describe('pay items in a payroll run', () => {
  const base = pay([]);

  it('adds allowances and overtime to gross pay and CPF', () => {
    const { r, cpf } = pay([item('ALLOWANCE_TRANSPORT', 200, { recurring: true }), item('OVERTIME', 300, { quantity: 10 })]);
    expect(r.grossPay).toBe(4500);
    expect(cpf).toBeGreaterThan(base.cpf);
    expect(r.earnings.map(e => e.label).filter(Boolean)).toEqual(['Transport allowance', 'Overtime (10 hrs)']);
  });

  it('pays reimbursements in full with no CPF', () => {
    const { r, cpf } = pay([item('REIMBURSEMENT', 120, { note: 'Taxi' })]);
    expect(cpf).toBe(base.cpf);
    expect(r.netPay).toBe(base.r.netPay + 120);
    expect(r.earnings[1].label).toBe('Reimbursement / claim – Taxi');
  });

  it('pays phone claims in full with no CPF', () => {
    const { r, cpf } = pay([item('ALLOWANCE_MOBILE', 80, { recurring: true })]);
    expect(cpf).toBe(base.cpf);
    expect(r.netPay).toBe(base.r.netPay + 80);
    expect(r.earnings[1].label).toBe('Phone claim');
  });

  it('takes loans and advances off take-home pay without changing CPF', () => {
    const { r, cpf } = pay([item('DEDUCTION_LOAN', 300, { recurring: true })]);
    expect(cpf).toBe(base.cpf);
    expect(r.netPay).toBe(base.r.netPay - 300);
    expect(r.otherDeductions).toBe(300);
    const acc = r.journals![0];
    expect(acc.totalDebit).toBeCloseTo(acc.totalCredit, 2);
  });

  it('unpaid leave lowers pay and CPF', () => {
    const { r, cpf } = pay([item('UNPAID_LEAVE', 380.95, { quantity: 2 })]);
    expect(r.grossPay).toBe(3619.05);
    expect(cpf).toBeLessThan(base.cpf);
    expect(r.earnings[1]).toMatchObject({ componentCode: 'UNPAID_LEAVE', amount: -380.95, label: 'Unpaid leave (2 days)' });
  });

  it('a mid-month joiner gets salary prorated but one-off items in full', () => {
    const joined = pay([], '2026-08-17');
    const withOt = pay([item('OVERTIME', 100, { quantity: 3 })], '2026-08-17');
    expect(withOt.r.grossPay).toBeCloseTo(joined.r.grossPay + 100, 2);
  });

  it('ignores zero amounts and unknown codes', () => {
    expect(toEngineItems([item('BONUS', 0), item('NOPE', 50)])).toEqual({ salaryComponents: [], otherDeductions: [] });
  });
});
