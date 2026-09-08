import { describe, it, expect } from 'vitest';
import { generatePayrollJournals } from '../journals';
import type { EmployeePayrollResult } from '../types';

const mockResult: EmployeePayrollResult = {
  employeeId: 'EMP001',
  name: 'Test Employee',
  earnings: [{ componentCode: 'BASIC', amount: 6000 }],
  deductions: [{ componentCode: 'DEDUCTION_CPF', amount: 1200 }, { componentCode: 'DEDUCTION_PAYE', amount: 500 }],
  employerCosts: [{ componentCode: 'COST_CPF_EMPLOYER', amount: 1020 }],
  grossPay: 6000,
  totalDeductions: 1700,
  totalEmployerCosts: 1020,
  netPay: 4300,
  statutoryContributions: [{
    schemeCode: 'CPF',
    schemeName: 'CPF',
    employeeTotal: 1200,
    employerTotal: 1020,
    total: 2220,
    employeeBreakdown: [{ componentCode: 'DEDUCTION_CPF', amount: 1200, rate: 20, wageBase: 6000, ceilingApplied: 8000 }],
    employerBreakdown: [{ componentCode: 'COST_CPF_EMPLOYER', amount: 1020, rate: 17, wageBase: 6000, ceilingApplied: 8000 }],
  }],
  tax: { grossPay: 6000, taxableIncome: 6000, taxWithheld: 500, effectiveRate: 0.0833, bracketsApplied: [], nonResident: false },
  leave: { annualLeaveEntitlement: 14, annualLeaveTaken: 0, annualLeaveBalance: 14, sickLeaveEntitlement: 14, sickLeaveTaken: 0, sickLeaveBalance: 14, unpaidLeaveDays: 0 },
  status: 'success',
};

describe('generatePayrollJournals', () => {
  it('returns three journal entries for a full payroll', () => {
    const entries = generatePayrollJournals(mockResult, '2026-01');
    expect(entries.length).toBe(3);
  });

  it('salary accrual entry has balanced debits and credits', () => {
    const entries = generatePayrollJournals(mockResult, '2026-01');
    const accrual = entries.find((e) => e.entryId.startsWith('SAL'))!;
    expect(accrual.totalDebit).toBe(accrual.totalCredit);
    expect(accrual.totalDebit).toBe(6000); // gross pay only
  });

  it('debits salary expense for gross pay', () => {
    const entries = generatePayrollJournals(mockResult, '2026-01');
    const accrual = entries.find((e) => e.entryId.startsWith('SAL'))!;
    const salaryLine = accrual.lines.find((l) => l.accountCode === '5000');
    expect(salaryLine).toBeDefined();
    expect(salaryLine!.debit).toBe(6000);
  });

  it('credits statutory payable for CPF deductions', () => {
    const entries = generatePayrollJournals(mockResult, '2026-01');
    const accrual = entries.find((e) => e.entryId.startsWith('SAL'))!;
    const statutoryLine = accrual.lines.find((l) => l.accountCode === '2110');
    expect(statutoryLine).toBeDefined();
    expect(statutoryLine!.credit).toBe(1200);
  });

  it('credits tax payable for PAYE', () => {
    const entries = generatePayrollJournals(mockResult, '2026-01');
    const accrual = entries.find((e) => e.entryId.startsWith('SAL'))!;
    const taxLine = accrual.lines.find((l) => l.accountCode === '2120');
    expect(taxLine).toBeDefined();
    expect(taxLine!.credit).toBe(500);
  });

  it('credits salary payable for net pay', () => {
    const entries = generatePayrollJournals(mockResult, '2026-01');
    const accrual = entries.find((e) => e.entryId.startsWith('SAL'))!;
    const payLine = accrual.lines.find((l) => l.accountCode === '2100');
    expect(payLine).toBeDefined();
    expect(payLine!.credit).toBe(4300);
  });

  it('creates payment entry from salary payable to cash', () => {
    const entries = generatePayrollJournals(mockResult, '2026-01');
    const payment = entries.find((e) => e.entryId.startsWith('PAY'));
    expect(payment).toBeDefined();
    expect(payment!.totalDebit).toBe(4300);
    expect(payment!.totalCredit).toBe(4300);
  });

  it('debits salary payable and credits cash in payment entry', () => {
    const entries = generatePayrollJournals(mockResult, '2026-01');
    const payment = entries.find((e) => e.entryId.startsWith('PAY'))!;
    expect(payment.lines[0].accountCode).toBe('2100');
    expect(payment.lines[0].debit).toBe(4300);
    expect(payment.lines[1].accountCode).toBe('1100');
    expect(payment.lines[1].credit).toBe(4300);
  });

  it('creates employer cost entry with balanced Dr/Cr', () => {
    const entries = generatePayrollJournals(mockResult, '2026-01');
    const empCost = entries.find((e) => e.entryId.startsWith('EMPCOST'))!;
    expect(empCost).toBeDefined();
    expect(empCost.totalDebit).toBe(1020);
    expect(empCost.totalCredit).toBe(1020);
  });

  it('handles zero net pay gracefully', () => {
    const zeroResult = {
      ...mockResult,
      netPay: 0, grossPay: 6000, totalDeductions: 6000, totalEmployerCosts: 0,
      tax: { ...mockResult.tax, taxWithheld: 0 },
      statutoryContributions: [{
        ...mockResult.statutoryContributions[0],
        employeeTotal: 6000, employerTotal: 0,
      }],
    };
    const entries = generatePayrollJournals(zeroResult, '2026-01');
    expect(entries.length).toBe(1); // only salary accrual, no payment or employer cost
    const payEntry = entries.find((e) => e.entryId.startsWith('PAY'));
    expect(payEntry).toBeUndefined();
  });
});
