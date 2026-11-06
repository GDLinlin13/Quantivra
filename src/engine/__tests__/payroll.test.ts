import { describe, it, expect } from 'vitest';
import { calculatePayroll } from '../payroll';
import sgPack from '../../data/country-packs/SG';
import type { PayrollPeriod, PayrollRunInput } from '../types';

const jan2026: PayrollPeriod = {
  startDate: '2026-01-01', endDate: '2026-01-31', payDate: '2026-01-31',
  frequency: 'monthly', payYear: 2026, payMonth: 1, payPeriod: 1,
};

function run(employees: PayrollRunInput['employees']) {
  return calculatePayroll({ period: jan2026, countryPack: sgPack, employees });
}

describe('calculatePayroll pipeline', () => {
  it('processes a single employee successfully', () => {
    const r = run([{
      employeeId: 'E1', name: 'Alice',
      dateOfBirth: '1990-06-15', dateOfJoining: '2020-01-01',
      employmentStatusCode: 'PERMANENT', immigrationStatusCode: 'SC',
      salaryComponents: [{ componentCode: 'BASIC', amount: 6000 }],
    }]);
    expect(r.status).toBe('complete');
    expect(r.employees.length).toBe(1);
    expect(r.employees[0].status).toBe('success');
  });

  it('calculates CPF correctly for citizen below ceiling', () => {
    const r = run([{
      employeeId: 'E1', name: 'Alice',
      dateOfBirth: '1990-06-15', dateOfJoining: '2020-01-01',
      employmentStatusCode: 'PERMANENT', immigrationStatusCode: 'SC',
      ethnicity: 'chinese',
      salaryComponents: [{ componentCode: 'BASIC', amount: 5500 }],
    }]);
    const emp = r.employees[0];
    // CPF 1100 + CDAC (only the employee's own self-help group): $5,500 wage → $2.00 band
    expect(emp.grossPay).toBe(5500);
    expect(emp.netPay).toBe(5500 - 1100 - 2);
    const cpf = emp.statutoryContributions.find((s) => s.schemeCode === 'CPF');
    expect(cpf).toBeDefined();
    expect(cpf!.employeeTotal).toBe(1100);
    expect(cpf!.employerTotal).toBe(935);
    // Exactly one self-help group, not all four
    const shg = emp.statutoryContributions.filter((s) => ['CDAC', 'SINDA', 'MBMF', 'ECF'].includes(s.schemeCode));
    expect(shg.map((s) => s.schemeCode)).toEqual(['CDAC']);
  });

  it('CPF steps are available for each employee', () => {
    const r = run([{
      employeeId: 'E1', name: 'Alice',
      dateOfBirth: '1990-06-15', dateOfJoining: '2020-01-01',
      employmentStatusCode: 'PERMANENT', immigrationStatusCode: 'SC',
      salaryComponents: [{ componentCode: 'BASIC', amount: 5500 }],
    }]);
    const emp = r.employees[0];
    expect(emp.trace).toBeDefined();
    expect(emp.trace!.steps.length).toBeGreaterThan(0);
    expect(emp.trace!.calculationId).toMatch(/^CALC-/);
  });

  it('trace includes engine version info', () => {
    const r = run([{
      employeeId: 'E1', name: 'Alice',
      dateOfBirth: '1990-06-15', dateOfJoining: '2020-01-01',
      employmentStatusCode: 'PERMANENT', immigrationStatusCode: 'SC',
      salaryComponents: [{ componentCode: 'BASIC', amount: 5500 }],
    }]);
    const emp = r.employees[0];
    expect(emp.trace!.engine.engineVersion).toMatch(/\d+\.\d+\.\d+/);
    expect(emp.trace!.engine.schemeVersions['CPF']).toBe('2026.1');
  });

  it('run-level trace aggregates all steps', () => {
    const r = run([{
      employeeId: 'E1', name: 'Alice',
      dateOfBirth: '1990-06-15', dateOfJoining: '2020-01-01',
      employmentStatusCode: 'PERMANENT', immigrationStatusCode: 'SC',
      salaryComponents: [{ componentCode: 'BASIC', amount: 5500 }],
    }]);
    expect(r.trace).toBeDefined();
    expect(r.trace!.steps.length).toBeGreaterThan(0);
  });

  it('journals are generated for each employee', () => {
    const r = run([{
      employeeId: 'E1', name: 'Alice',
      dateOfBirth: '1990-06-15', dateOfJoining: '2020-01-01',
      employmentStatusCode: 'PERMANENT', immigrationStatusCode: 'SC',
      salaryComponents: [{ componentCode: 'BASIC', amount: 6000 }],
    }]);
    const emp = r.employees[0];
    expect(emp.journals).toBeDefined();
    expect(emp.journals!.length).toBeGreaterThanOrEqual(1);
  });

  it('processes multiple employees', () => {
    const r = run([
      { employeeId: 'E1', name: 'Alice', dateOfBirth: '1990-06-15', dateOfJoining: '2020-01-01', employmentStatusCode: 'PERMANENT', immigrationStatusCode: 'SC', salaryComponents: [{ componentCode: 'BASIC', amount: 5000 }] },
      { employeeId: 'E2', name: 'Bob', dateOfBirth: '1985-03-10', dateOfJoining: '2021-06-01', employmentStatusCode: 'PERMANENT', immigrationStatusCode: 'PR', prStage: 'year_1', salaryComponents: [{ componentCode: 'BASIC', amount: 4000 }] },
    ]);
    expect(r.status).toBe('complete');
    expect(r.employees.length).toBe(2);
    expect(r.employees[0].statutoryContributions.length).toBeGreaterThan(0);
    expect(r.employees[1].statutoryContributions.length).toBeGreaterThan(0);
  });

  it('summary aggregates correctly', () => {
    const r = run([{
      employeeId: 'E1', name: 'Alice',
      dateOfBirth: '1990-06-15', dateOfJoining: '2020-01-01',
      employmentStatusCode: 'PERMANENT', immigrationStatusCode: 'SC',
      salaryComponents: [{ componentCode: 'BASIC', amount: 5000 }],
    }]);
    expect(r.summary.totalGrossPay).toBe(5000);
    expect(r.summary.totalEmployees).toBe(1);
  });

  it('handles mid-period joiner with proration', () => {
    const r = run([{
      employeeId: 'E1', name: 'Joiner',
      dateOfBirth: '1990-06-15', dateOfJoining: '2026-01-15',
      employmentStatusCode: 'PERMANENT', immigrationStatusCode: 'SC',
      salaryComponents: [{ componentCode: 'BASIC', amount: 6000 }],
    }]);
    const emp = r.employees[0];
    expect(emp.grossPay).toBeLessThan(6000); // prorated
    expect(emp.netPay).toBeGreaterThan(0);
  });

  it('handles EP holder — CPF exempt, no self-help group, SDL is employer-only', () => {
    const r = run([{
      employeeId: 'E1', name: 'Foreigner',
      dateOfBirth: '1990-06-15', dateOfJoining: '2023-01-01',
      employmentStatusCode: 'FOREIGN', immigrationStatusCode: 'EP',
      salaryComponents: [{ componentCode: 'BASIC', amount: 10000 }],
    }]);
    const emp = r.employees[0];
    // Foreigners pay no CPF and no self-help group; SDL is an employer cost.
    expect(emp.netPay).toBe(10000);
    const cpf = emp.statutoryContributions.find((s) => s.schemeCode === 'CPF');
    expect(cpf).toBeUndefined();
    const shg = emp.statutoryContributions.filter((s) => ['CDAC', 'SINDA', 'MBMF', 'ECF'].includes(s.schemeCode));
    expect(shg).toHaveLength(0);
  });

  it('keeps the exact SDL per employee (cents are only dropped from the month total)', () => {
    const r = run([{
      employeeId: 'E1', name: 'Alice', dateOfBirth: '1990-06-15', dateOfJoining: '2020-01-01',
      employmentStatusCode: 'PERMANENT', immigrationStatusCode: 'SC',
      salaryComponents: [{ componentCode: 'BASIC', amount: 3333 }],
    }]);
    expect(r.employees[0].statutoryContributions.find((s) => s.schemeCode === 'SDL')!.employerTotal).toBe(8.3325);
  });

  it('rounds each person\'s CPF total to the nearest dollar; the employee share is rounded up to the cent, the employer pays the rest', () => {
    const cpfFor = (wage: number) => {
      const r = run([{ employeeId: 'E1', name: 'A', dateOfBirth: '1990-06-15', dateOfJoining: '2020-01-01',
        employmentStatusCode: 'PERMANENT', immigrationStatusCode: 'SC', salaryComponents: [{ componentCode: 'BASIC', amount: wage }] }]);
      const c = r.employees[0].statutoryContributions.find((s) => s.schemeCode === 'CPF')!;
      return [c.employeeTotal, c.employerTotal];
    };
    // September 2026: 4,181.82 → total 1,547.27 → 1,547; employee 836.364 → 836.37; employer 710.63
    expect(cpfFor(4181.82)).toEqual([836.37, 710.63]);
    // 3,409.09 → total 1,261.36 → 1,261; employee 681.82; employer 579.18
    expect(cpfFor(3409.09)).toEqual([681.82, 579.18]);
    // round wages are unchanged
    expect(cpfFor(3000)).toEqual([600, 510]);
  });

  it('counts overtime as ordinary wages (no extra CPF above the $8,000 ceiling)', () => {
    const r = run([{ employeeId: 'E1', name: 'A', dateOfBirth: '1990-06-15', dateOfJoining: '2020-01-01',
      employmentStatusCode: 'PERMANENT', immigrationStatusCode: 'SC',
      salaryComponents: [{ componentCode: 'BASIC', amount: 8000 }, { componentCode: 'OVERTIME', amount: 600 }] }]);
    const c = r.employees[0].statutoryContributions.find((s) => s.schemeCode === 'CPF')!;
    expect([c.employeeTotal, c.employerTotal]).toEqual([1600, 1360]);
    // SDL still counts the overtime: 0.25% of 8,600 is above the 11.25 cap
    expect(r.employees[0].statutoryContributions.find((s) => s.schemeCode === 'SDL')!.employerTotal).toBe(11.25);
  });
});
