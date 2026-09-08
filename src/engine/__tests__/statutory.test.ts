import { describe, it, expect } from 'vitest';
import { calculateStatutoryContribution } from '../statutory';
import type { EmployeePayrollInput, PayrollPeriod } from '../types';
import sgPack from '../../data/country-packs/SG';

const jan2026: PayrollPeriod = {
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  payDate: '2026-01-31',
  frequency: 'monthly',
  payYear: 2026,
  payMonth: 1,
  payPeriod: 1,
};

function makeEmployee(overrides: Partial<EmployeePayrollInput> = {}): EmployeePayrollInput {
  return {
    employeeId: 'EMP001',
    name: 'Test Employee',
    dateOfBirth: '1990-06-15',
    dateOfJoining: '2020-01-01',
    employmentStatusCode: 'PERMANENT',
    immigrationStatusCode: 'SC',
    salaryComponents: [],
    ytdValues: {},
    ...overrides,
  };
}

describe('CPF', () => {
  const cpfScheme = sgPack.statutorySchemes.cpf;

  it('citizen age 35, salary S$5,500 — below OW ceiling', () => {
    const emp = makeEmployee({
      dateOfBirth: '1990-06-15', // age 35 in Jan 2026
      immigrationStatusCode: 'SC',
      salaryComponents: [{ componentCode: 'BASIC', amount: 5500 }],
    });

    const result = calculateStatutoryContribution({
      scheme: cpfScheme,
      employee: emp,
      period: jan2026,
      ytdValues: {},
      ordinaryWages: 5500,
      additionalWages: 0,
    });

    expect(result).not.toBeNull();
    // 5500 * 20% = 1100
    expect(result!.employeeTotal).toBe(1100);
    // 5500 * 17% = 935
    expect(result!.employerTotal).toBe(935);
    expect(result!.total).toBe(2035);
  });

  it('citizen age 35, salary S$10,000 — OW ceiling applies', () => {
    const emp = makeEmployee({
      dateOfBirth: '1990-06-15',
      immigrationStatusCode: 'SC',
      salaryComponents: [{ componentCode: 'BASIC', amount: 10000 }],
    });

    const result = calculateStatutoryContribution({
      scheme: cpfScheme,
      employee: emp,
      period: jan2026,
      ytdValues: {},
      ordinaryWages: 10000,
      additionalWages: 0,
    });

    expect(result).not.toBeNull();
    // min(10000, 8000) * 20% = 1600
    expect(result!.employeeTotal).toBe(1600);
    // min(10000, 8000) * 17% = 1360
    expect(result!.employerTotal).toBe(1360);
  });

  it('PR Year 1 — reduced rates', () => {
    const emp = makeEmployee({
      dateOfBirth: '1990-06-15',
      immigrationStatusCode: 'PR',
      prStage: 'year_1',
      salaryComponents: [{ componentCode: 'BASIC', amount: 5000 }],
    });

    const result = calculateStatutoryContribution({
      scheme: cpfScheme,
      employee: emp,
      period: jan2026,
      ytdValues: {},
      ordinaryWages: 5000,
      additionalWages: 0,
    });

    expect(result).not.toBeNull();
    // 5000 * 5% = 250
    expect(result!.employeeTotal).toBe(250);
    // 5000 * 4% = 200
    expect(result!.employerTotal).toBe(200);
  });

  it('PR Year 2 — graduated rates', () => {
    const emp = makeEmployee({
      dateOfBirth: '1990-06-15',
      immigrationStatusCode: 'PR',
      prStage: 'year_2',
      salaryComponents: [{ componentCode: 'BASIC', amount: 5000 }],
    });

    const result = calculateStatutoryContribution({
      scheme: cpfScheme,
      employee: emp,
      period: jan2026,
      ytdValues: {},
      ordinaryWages: 5000,
      additionalWages: 0,
    });

    expect(result).not.toBeNull();
    // 5000 * 15% = 750
    expect(result!.employeeTotal).toBe(750);
    // 5000 * 9% = 450
    expect(result!.employerTotal).toBe(450);
  });

  it('PR Year 3+ — full citizen rates', () => {
    const emp = makeEmployee({
      dateOfBirth: '1990-06-15',
      immigrationStatusCode: 'PR',
      prStage: 'year_3_plus',
      salaryComponents: [{ componentCode: 'BASIC', amount: 5000 }],
    });

    const result = calculateStatutoryContribution({
      scheme: cpfScheme,
      employee: emp,
      period: jan2026,
      ytdValues: {},
      ordinaryWages: 5000,
      additionalWages: 0,
    });

    expect(result).not.toBeNull();
    // 5000 * 20% = 1000
    expect(result!.employeeTotal).toBe(1000);
    // 5000 * 17% = 850
    expect(result!.employerTotal).toBe(850);
  });

  it('EP holder — not eligible for CPF', () => {
    const emp = makeEmployee({
      immigrationStatusCode: 'EP',
      salaryComponents: [{ componentCode: 'BASIC', amount: 10000 }],
    });

    const result = calculateStatutoryContribution({
      scheme: cpfScheme,
      employee: emp,
      period: jan2026,
      ytdValues: {},
      ordinaryWages: 10000,
      additionalWages: 0,
    });

    expect(result).toBeNull();
  });

  it('employee over 55 — lower rates', () => {
    const emp = makeEmployee({
      dateOfBirth: '1969-06-15', // age 56 in Jan 2026
      immigrationStatusCode: 'SC',
      salaryComponents: [{ componentCode: 'BASIC', amount: 6000 }],
    });

    const result = calculateStatutoryContribution({
      scheme: cpfScheme,
      employee: emp,
      period: jan2026,
      ytdValues: {},
      ordinaryWages: 6000,
      additionalWages: 0,
    });

    expect(result).not.toBeNull();
    // 6000 * 16% = 960
    expect(result!.employeeTotal).toBe(960);
    // 6000 * 15% = 900
    expect(result!.employerTotal).toBe(900);
  });

  it('bonus with AW ceiling — bonus capped at remaining annual ceiling', () => {
    const emp = makeEmployee({
      dateOfBirth: '1990-06-15',
      immigrationStatusCode: 'SC',
      salaryComponents: [
        { componentCode: 'BASIC', amount: 8000 },
        { componentCode: 'BONUS', amount: 20000 },
      ],
      ytdValues: {
        OW_TOTAL: 96000, // 12 months at 8000
        AW_TOTAL: 0,
      },
    });

    const result = calculateStatutoryContribution({
      scheme: cpfScheme,
      employee: emp,
      period: jan2026,
      ytdValues: { OW_TOTAL: 96000, AW_TOTAL: 0 },
      ordinaryWages: 8000,
      additionalWages: 20000,
    });

    expect(result).not.toBeNull();
    // OW: min(8000, 8000) = 8000
    // AW: 102000 - 96000 = 6000 (remaining annual ceiling)
    // Total wage base = 8000 + 6000 = 14000
    // Employee: 14000 * 20% = 2800
    expect(result!.employeeTotal).toBe(2800);
    // Employer: 14000 * 17% = 2380
    expect(result!.employerTotal).toBe(2380);
  });
});

describe('SDL', () => {
  const sdlScheme = sgPack.statutorySchemes.sdl;

  it('wages below S$800 — min S$2 applies', () => {
    const emp = makeEmployee({
      immigrationStatusCode: 'SC',
      salaryComponents: [{ componentCode: 'BASIC', amount: 600 }],
    });

    const result = calculateStatutoryContribution({
      scheme: sdlScheme,
      employee: emp,
      period: jan2026,
      ytdValues: {},
      ordinaryWages: 600,
      additionalWages: 0,
    });

    expect(result).not.toBeNull();
    // 600 * 0.25% = 1.5, then max(2) → 2
    expect(result!.employerTotal).toBe(2);
    // But wait, our thresholds use minimum_earnings type for min
    // Let me check the logic: we apply max() for minThreshold and min() for maxThreshold
    // 1.5 then max(2) = 2
  });

  it('wages at S$5000 — SDL = 0.25%, capped at S$11.25', () => {
    const emp = makeEmployee({
      immigrationStatusCode: 'SC',
      salaryComponents: [{ componentCode: 'BASIC', amount: 5000 }],
    });

    const result = calculateStatutoryContribution({
      scheme: sdlScheme,
      employee: emp,
      period: jan2026,
      ytdValues: {},
      ordinaryWages: 5000,
      additionalWages: 0,
    });

    expect(result).not.toBeNull();
    // 5000 * 0.25% = 12.5, max threshold 11.25
    expect(result!.employerTotal).toBeCloseTo(11.25);
  });
});

describe('CDAC', () => {
  const cdacScheme = sgPack.statutorySchemes.cdac;

  it('wages at S$3000 — flat S$1.00 band contribution', () => {
    const emp = makeEmployee({
      immigrationStatusCode: 'SC',
      ethnicity: 'chinese',
      salaryComponents: [{ componentCode: 'BASIC', amount: 3000 }],
    });

    const result = calculateStatutoryContribution({
      scheme: cdacScheme,
      employee: emp,
      period: jan2026,
      ytdValues: {},
      ordinaryWages: 3000,
      additionalWages: 0,
    });

    expect(result).not.toBeNull();
    // CDAC 2026: > $2,000 to $3,500 band = $1.00
    expect(result!.employeeTotal).toBe(1);
    expect(result!.employerTotal).toBe(0);
  });
});

describe('SINDA', () => {
  const sindaScheme = sgPack.statutorySchemes.sinda;

  it('wages at S$1500 — flat S$3.00 band contribution', () => {
    const emp = makeEmployee({
      immigrationStatusCode: 'SC',
      ethnicity: 'indian',
      salaryComponents: [{ componentCode: 'BASIC', amount: 1500 }],
    });

    const result = calculateStatutoryContribution({
      scheme: sindaScheme,
      employee: emp,
      period: jan2026,
      ytdValues: {},
      ordinaryWages: 1500,
      additionalWages: 0,
    });

    expect(result).not.toBeNull();
    // SINDA 2026: > $1,000 to $1,500 band = $3.00
    expect(result!.employeeTotal).toBe(3);
    expect(result!.employerTotal).toBe(0);
  });
});
