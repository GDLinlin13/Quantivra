import { describe, it, expect } from 'vitest';
import { calculatePayroll } from '../index';
import saPack from '../../data/country-packs/SA/index';
import type { PayrollPeriod } from '../types';

const period: PayrollPeriod = {
  startDate: '2026-08-01', endDate: '2026-08-31', payDate: '2026-08-31',
  frequency: 'monthly', payYear: 2026, payMonth: 8, payPeriod: 8,
};

const run = (residency: string, basic: number, housing = 0) => calculatePayroll({
  period, countryPack: saPack,
  employees: [{
    employeeId: 'E1', name: 'T', dateOfBirth: '1990-01-01', dateOfJoining: '2020-01-01',
    employmentStatusCode: 'FULL_TIME', immigrationStatusCode: residency,
    salaryComponents: [
      { componentCode: 'BASIC', amount: basic },
      ...(housing ? [{ componentCode: 'ALLOWANCE_HOUSING', amount: housing }] : []),
    ],
  }],
}).employees[0];

describe('Saudi Arabia country pack', () => {
  it('no personal income tax', () => {
    expect(run('EXPAT', 10000).tax.taxWithheld).toBe(0);
  });

  it('Saudi national → GOSI 10.75% / 12.75% on basic + housing', () => {
    const r = run('SAUDI_NATIONAL', 8000, 2000);
    const g = r.statutoryContributions.find(s => s.schemeCode === 'GOSI')!;
    expect(g.employeeTotal).toBeCloseTo(1075, 0);  // 10.75% of 10,000
    expect(g.employerTotal).toBeCloseTo(1275, 0);  // 12.75% of 10,000
    expect(r.netPay).toBeCloseTo(10000 - 1075, 0);
  });

  it('GOSI contributory wage capped at SAR 45,000', () => {
    const g = run('SAUDI_NATIONAL', 60000).statutoryContributions.find(s => s.schemeCode === 'GOSI')!;
    expect(g.employeeTotal).toBeCloseTo(4837.5, 1); // 10.75% of 45,000
  });

  it('expatriate → occupational-hazards 2% employer only, plus EOSB accrual, nothing deducted', () => {
    const r = run('EXPAT', 10000);
    expect(r.statutoryContributions.find(s => s.schemeCode === 'GOSI')).toBeUndefined();
    const oh = r.statutoryContributions.find(s => s.schemeCode === 'GOSI_OH')!;
    expect(oh.employeeTotal).toBe(0);
    expect(oh.employerTotal).toBeCloseTo(200, 0);   // 2% of 10,000
    expect(r.statutoryContributions.find(s => s.schemeCode === 'EOSB')!.employerTotal).toBeGreaterThan(0);
    expect(r.netPay).toBe(10000);
  });
});
