import { describe, it, expect } from 'vitest';
import { calculatePayroll } from '../index';
import sgPack from '../../data/country-packs/SG/index';
import type { PayrollPeriod } from '../types';

const period: PayrollPeriod = {
  startDate: '2026-08-01', endDate: '2026-08-31', payDate: '2026-08-31',
  frequency: 'monthly', payYear: 2026, payMonth: 8, payPeriod: 8,
};

describe('SG self-help group is chosen by ethnicity', () => {
  const run = (ethnicity?: string) => calculatePayroll({
    period, countryPack: sgPack,
    employees: [{
      employeeId: 'E1', name: 'T', dateOfBirth: '1990-01-01', dateOfJoining: '2020-01-01',
      employmentStatusCode: 'FULL_TIME', immigrationStatusCode: 'SC', ethnicity,
      salaryComponents: [{ componentCode: 'BASIC', amount: 4500 }],
    }],
  }).employees[0];

  it('chinese employee → only CDAC', () => {
    const shg = run('chinese').statutoryContributions.filter(s => ['CDAC', 'SINDA', 'MBMF', 'ECF'].includes(s.schemeCode));
    expect(shg.map(s => s.schemeCode)).toEqual(['CDAC']);
  });

  it('indian employee → only SINDA', () => {
    const shg = run('indian').statutoryContributions.filter(s => ['CDAC', 'SINDA', 'MBMF', 'ECF'].includes(s.schemeCode));
    expect(shg.map(s => s.schemeCode)).toEqual(['SINDA']);
  });

  it('no ethnicity → no self-help group', () => {
    const shg = run(undefined).statutoryContributions.filter(s => ['CDAC', 'SINDA', 'MBMF', 'ECF'].includes(s.schemeCode));
    expect(shg).toHaveLength(0);
  });
});

describe('company can absorb the employee share of a scheme', () => {
  const emp = {
    employeeId: 'E1', name: 'T', dateOfBirth: '1990-01-01', dateOfJoining: '2020-01-01',
    employmentStatusCode: 'FULL_TIME', immigrationStatusCode: 'SC', ethnicity: 'chinese',
    salaryComponents: [{ componentCode: 'BASIC', amount: 4500 }],
  };

  it('absorbing CDAC removes it from deductions and raises net pay', () => {
    const normal = calculatePayroll({ period, countryPack: sgPack, employees: [emp] }).employees[0];
    const absorbed = calculatePayroll({ period, countryPack: sgPack, employees: [emp], absorbedSchemes: ['CDAC'] }).employees[0];

    const cdacDed = (r: typeof normal) => r.deductions.find(d => d.componentCode === 'DEDUCTION_CDAC')?.amount ?? 0;
    expect(cdacDed(normal)).toBeGreaterThan(0);
    expect(cdacDed(absorbed)).toBe(0);
    expect(absorbed.netPay).toBe(normal.netPay + cdacDed(normal));
    expect(absorbed.statutoryContributions.find(s => s.schemeCode === 'CDAC')?.absorbedByEmployer).toBe(true);
  });
});
