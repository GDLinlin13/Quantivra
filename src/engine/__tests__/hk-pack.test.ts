import { describe, it, expect } from 'vitest';
import { calculatePayroll } from '../index';
import hkPack from '../../data/country-packs/HK/index';
import type { PayrollPeriod } from '../types';

const period: PayrollPeriod = {
  startDate: '2026-08-01', endDate: '2026-08-31', payDate: '2026-08-31',
  frequency: 'monthly', payYear: 2026, payMonth: 8, payPeriod: 8,
};

const run = (basic: number, opts: { residency?: string; joined?: string; dob?: string; bonus?: number } = {}) => calculatePayroll({
  period, countryPack: hkPack,
  employees: [{
    employeeId: 'E1', name: 'T', dateOfBirth: opts.dob || '1990-01-01', dateOfJoining: opts.joined || '2022-01-01',
    employmentStatusCode: 'FULL_TIME', immigrationStatusCode: opts.residency || 'HK_PR',
    salaryComponents: [{ componentCode: 'BASIC', amount: basic }, ...(opts.bonus ? [{ componentCode: 'BONUS', amount: opts.bonus }] : [])],
  }],
}).employees[0];
const mpf = (r: ReturnType<typeof run>) => r.statutoryContributions.find(s => s.schemeCode === 'MPF');

describe('Hong Kong country pack', () => {
  it('no tax taken off monthly pay (salaries tax is assessed yearly)', () => {
    expect(run(50000).tax.taxWithheld).toBe(0);
  });

  it('MPF 5% each between HK$7,100 and HK$30,000', () => {
    const r = run(20000);
    expect(mpf(r)!.employeeTotal).toBe(1000);
    expect(mpf(r)!.employerTotal).toBe(1000);
    expect(r.netPay).toBe(19000);
    expect(mpf(run(7100))!.employeeTotal).toBe(355);
  });

  it('below HK$7,100 only the employer pays', () => {
    const r = run(6000);
    expect(mpf(r)!.employeeTotal).toBe(0);
    expect(mpf(r)!.employerTotal).toBe(300);
    expect(r.netPay).toBe(6000);
  });

  it('above HK$30,000 each pays HK$1,500, bonuses counted in the month paid', () => {
    expect([mpf(run(45000))!.employeeTotal, mpf(run(45000))!.employerTotal]).toEqual([1500, 1500]);
    const r = run(25000, { bonus: 10000 });
    expect(mpf(r)!.employeeTotal).toBe(1500);
    expect(r.netPay).toBe(33500);
  });

  it('new employees: no employee share for the first 30 days and the incomplete period after; employer pays', () => {
    const fresh = mpf(run(20000, { joined: '2026-07-10' }))!;
    expect(fresh.employeeTotal).toBe(0);
    expect(fresh.employerTotal).toBe(1000);
    expect(mpf(run(20000, { joined: '2026-07-01' }))!.employeeTotal).toBe(1000);
  });

  it('exempt people and those 65 or over are not in MPF', () => {
    expect(mpf(run(20000, { residency: 'MPF_EXEMPT' }))).toBeUndefined();
    expect(mpf(run(20000, { dob: '1960-01-01' }))).toBeUndefined();
  });
});

describe('Hong Kong staff saved before Hong Kong had its own residency choices', () => {
  it('count as MPF members unless marked exempt', async () => {
    const { payrollResidency } = await import('../../data/residency-options');
    expect(payrollResidency('HK', 'CITIZEN')).toBe('HK_PR');
    expect(payrollResidency('HK', null)).toBe('HK_PR');
    expect(payrollResidency('HK', 'SC')).toBe('HK_PR');
    expect(payrollResidency('HK', 'FOREIGNER')).toBe('HK_NON_PR');
    expect(payrollResidency('HK', 'EP')).toBe('HK_NON_PR');
    expect(payrollResidency('HK', 'MPF_EXEMPT')).toBe('MPF_EXEMPT');
    expect(payrollResidency('AE', 'EXPAT')).toBe('EXPAT');
    expect(mpf(run(20000, { residency: payrollResidency('HK', 'FOREIGNER') }))!.employeeTotal).toBe(1000);
  });
});

describe('contributions set by hand', () => {
  it('employer MPF set to 0 for a month (employee share unchanged)', async () => {
    const { toEngineItems } = await import('../../data/payItems');
    const extra = toEngineItems([{ item_code: 'OVERRIDE_EMPLOYER', amount: 0, recurring: false } as any]);
    expect(extra.statutoryOverride).toEqual({ employer: 0 });
    const r = calculatePayroll({
      period, countryPack: hkPack,
      employees: [{ employeeId: 'E1', name: 'T', dateOfBirth: '1990-01-01', dateOfJoining: '2022-01-01', employmentStatusCode: 'FULL_TIME',
        immigrationStatusCode: 'HK_PR', salaryComponents: [{ componentCode: 'BASIC', amount: 20000 }], statutoryOverride: extra.statutoryOverride }],
    }).employees[0];
    expect(mpf(r)!.employerTotal).toBe(0);
    expect(mpf(r)!.employeeTotal).toBe(1000);
    expect(r.totalEmployerCosts).toBe(0);
    expect(r.netPay).toBe(19000);
  });
});
