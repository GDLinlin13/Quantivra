import { describe, it, expect } from 'vitest';
import { calculatePayroll } from '../index';
import aePack from '../../data/country-packs/AE/index';
import type { PayrollPeriod } from '../types';

const period: PayrollPeriod = {
  startDate: '2026-08-01', endDate: '2026-08-31', payDate: '2026-08-31',
  frequency: 'monthly', payYear: 2026, payMonth: 8, payPeriod: 8,
};

const run = (residency: string, basic = 20000) => calculatePayroll({
  period, countryPack: aePack,
  employees: [{
    employeeId: 'E1', name: 'T', dateOfBirth: '1990-01-01', dateOfJoining: '2022-01-01',
    employmentStatusCode: 'FULL_TIME', immigrationStatusCode: residency,
    salaryComponents: [{ componentCode: 'BASIC', amount: basic }],
  }],
}).employees[0];

describe('UAE country pack', () => {
  it('no personal income tax', () => {
    expect(run('EXPAT').tax.taxWithheld).toBe(0);
  });

  it('UAE national → GPSSA 11% employee / 15% employer, no EOSB', () => {
    const r = run('UAE_NATIONAL', 20000);
    const gpssa = r.statutoryContributions.find(s => s.schemeCode === 'GPSSA');
    expect(gpssa).toBeDefined();
    expect(gpssa!.employeeTotal).toBeCloseTo(2200, 0);   // 11% of 20,000
    expect(gpssa!.employerTotal).toBeCloseTo(3000, 0);   // 15% of 20,000
    expect(r.statutoryContributions.find(s => s.schemeCode === 'EOSB')).toBeUndefined();
    expect(r.netPay).toBeCloseTo(20000 - 2200, 0);
  });

  it('expatriate → no GPSSA, EOSB accrues as an employer cost only', () => {
    const r = run('EXPAT', 20000);
    expect(r.statutoryContributions.find(s => s.schemeCode === 'GPSSA')).toBeUndefined();
    const eosb = r.statutoryContributions.find(s => s.schemeCode === 'EOSB');
    expect(eosb).toBeDefined();
    expect(eosb!.employeeTotal).toBe(0);
    expect(eosb!.employerTotal).toBeGreaterThan(0);   // ~5.83% of basic
    expect(r.netPay).toBe(20000);                     // nothing deducted from the employee
  });

  it('GPSSA contribution salary is capped at AED 100,000', () => {
    const r = run('UAE_NATIONAL', 150000);
    const gpssa = r.statutoryContributions.find(s => s.schemeCode === 'GPSSA')!;
    expect(gpssa.employeeTotal).toBeCloseTo(11000, 0); // 11% of the 100,000 ceiling
  });
});
