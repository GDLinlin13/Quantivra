import { describe, it, expect } from 'vitest';
import { checkEligibility } from '../statutory/eligibility';
import { lookupRateRow } from '../statutory/rateLookup';
import { applyCaps } from '../statutory/caps';
import { applyThresholds } from '../statutory/thresholds';
import { calculateStatutoryContribution } from '../statutory/calculator';
import sgPack from '../../data/country-packs/SG';
import type { EmployeePayrollInput, PayrollPeriod } from '../types';

const jan2026: PayrollPeriod = {
  startDate: '2026-01-01', endDate: '2026-01-31', payDate: '2026-01-31',
  frequency: 'monthly', payYear: 2026, payMonth: 1, payPeriod: 1,
};

function emp(overrides: Partial<EmployeePayrollInput> = {}): EmployeePayrollInput {
  return {
    employeeId: 'T1', name: 'Test',
    dateOfBirth: '1990-06-15', dateOfJoining: '2020-01-01',
    employmentStatusCode: 'PERMANENT', immigrationStatusCode: 'SC',
    salaryComponents: [], ytdValues: {},
    ...overrides,
  };
}

describe('eligibility module', () => {
  const cpf = sgPack.statutorySchemes.cpf;

  it('SC is eligible for CPF', () => {
    const r = checkEligibility(cpf, emp({ immigrationStatusCode: 'SC' }), jan2026);
    expect(r.eligible).toBe(true);
  });

  it('PR is eligible for CPF', () => {
    const r = checkEligibility(cpf, emp({ immigrationStatusCode: 'PR', prStage: 'year_1' }), jan2026);
    expect(r.eligible).toBe(true);
  });

  it('EP is not eligible for CPF', () => {
    const r = checkEligibility(cpf, emp({ immigrationStatusCode: 'EP', employmentStatusCode: 'FOREIGN' }), jan2026);
    expect(r.eligible).toBe(false);
  });

  it('SDL is eligible for foreigners', () => {
    const sdl = sgPack.statutorySchemes.sdl;
    const r = checkEligibility(sdl, emp({ immigrationStatusCode: 'EP' }), jan2026);
    expect(r.eligible).toBe(true);
  });

  it('returns explanation steps for eligible', () => {
    const r = checkEligibility(cpf, emp({ immigrationStatusCode: 'SC' }), jan2026);
    expect(r.steps.length).toBeGreaterThan(0);
    expect(r.steps[r.steps.length - 1].explanation).toContain('passed');
  });

  it('returns explanation steps for ineligible', () => {
    const r = checkEligibility(cpf, emp({ immigrationStatusCode: 'EP' }), jan2026);
    expect(r.steps.length).toBeGreaterThan(0);
    expect(r.eligible).toBe(false);
  });
});

describe('rateLookup module', () => {
  const cpf = sgPack.statutorySchemes.cpf;

  it('finds rate row for SC age 35', () => {
    const r = lookupRateRow(cpf, 'SC', undefined, 35, jan2026, 5500);
    expect(r.rateRow).not.toBeNull();
    expect(r.rateRow!.employeeRate).toBe(20);
    expect(r.rateRow!.employerRate).toBe(17);
  });

  it('finds rate row for SC age 56 (55-60 band)', () => {
    const r = lookupRateRow(cpf, 'SC', undefined, 56, jan2026, 6000);
    expect(r.rateRow).not.toBeNull();
    expect(r.rateRow!.employeeRate).toBe(16);
    expect(r.rateRow!.employerRate).toBe(15);
  });

  it('finds rate row for PR Year 1', () => {
    const r = lookupRateRow(cpf, 'PR', 'year_1', 30, jan2026, 5000);
    expect(r.rateRow).not.toBeNull();
    expect(r.rateRow!.employeeRate).toBe(5);
    expect(r.rateRow!.employerRate).toBe(4);
  });

  it('finds rate row for PR Year 3+ age 35', () => {
    const r = lookupRateRow(cpf, 'PR', 'year_3_plus', 35, jan2026, 5000);
    expect(r.rateRow).not.toBeNull();
    expect(r.rateRow!.employeeRate).toBe(20);
    expect(r.rateRow!.employerRate).toBe(17);
  });

  it('returns null for unmatchable category', () => {
    const r = lookupRateRow(cpf, 'EP', undefined, 35, jan2026, 10000);
    expect(r.rateRow).toBeNull();
  });

  it('returns steps with category and rate info', () => {
    const r = lookupRateRow(cpf, 'SC', undefined, 35, jan2026, 5500);
    const catStep = r.steps.find((s) => s.id.endsWith('_CAT'));
    expect(catStep).toBeDefined();
    expect(catStep!.explanation).toContain('Singapore Citizen');
  });
});

describe('caps module', () => {
  const cpf = sgPack.statutorySchemes.cpf;

  it('caps OW at monthly ceiling', () => {
    const r = applyCaps(cpf, 10000, 0, {});
    expect(r.owBase).toBe(8000);
    expect(r.totalWageBase).toBe(8000);
  });

  it('does not cap OW below ceiling', () => {
    const r = applyCaps(cpf, 5000, 0, {});
    expect(r.owBase).toBe(5000);
  });

  it('caps AW using annual ceiling minus YTD', () => {
    const r = applyCaps(cpf, 8000, 20000, { OW_TOTAL: 96000, AW_TOTAL: 0 });
    expect(r.owBase).toBe(8000);
    expect(r.awBase).toBe(6000); // 102000 - 96000 = 6000
    expect(r.totalWageBase).toBe(14000);
  });

  it('produces explanation steps', () => {
    const r = applyCaps(cpf, 10000, 5000, { OW_TOTAL: 80000, AW_TOTAL: 0 });
    const baseStep = r.steps.find((s) => s.id.endsWith('_BASE'));
    expect(baseStep).toBeDefined();
    expect(baseStep!.explanation).toContain('Total wage base');
  });
});

describe('thresholds module', () => {
  const sdl = sgPack.statutorySchemes.sdl;

  it('applies minimum threshold', () => {
    const r = applyThresholds(sdl, 0, 1.5, 0.25);
    expect(r.employerAmount).toBe(2); // min is 2
  });

  it('applies maximum threshold', () => {
    const r = applyThresholds(sdl, 0, 12.5, 0.25);
    expect(r.employerAmount).toBe(11.25); // max is 11.25
  });

  it('does not apply threshold if within range', () => {
    const r = applyThresholds(sdl, 0, 5, 0.25);
    expect(r.employerAmount).toBe(5);
  });

  it('produces explanation for threshold application', () => {
    const r = applyThresholds(sdl, 0, 1.5, 0.25);
    const minStep = r.steps.find((s) => s.id.endsWith('_THRESH_MIN'));
    expect(minStep).toBeDefined();
  });
});

describe('calculator integration (explain mode)', () => {
  it('returns steps for CPF calculation', () => {
    const r = calculateStatutoryContribution({
      scheme: sgPack.statutorySchemes.cpf,
      employee: emp({ immigrationStatusCode: 'SC', salaryComponents: [{ componentCode: 'BASIC', amount: 5500 }] }),
      period: jan2026,
      ytdValues: {},
      ordinaryWages: 5500,
      additionalWages: 0,
    });
    expect(r).not.toBeNull();
    expect(r!.steps).toBeDefined();
    expect(r!.steps!.length).toBeGreaterThan(3);
  });

  it('steps have ids, stage, label, and explanation', () => {
    const r = calculateStatutoryContribution({
      scheme: sgPack.statutorySchemes.cpf,
      employee: emp({ immigrationStatusCode: 'SC', salaryComponents: [{ componentCode: 'BASIC', amount: 5500 }] }),
      period: jan2026,
      ytdValues: {},
      ordinaryWages: 5500,
      additionalWages: 0,
    });
    for (const step of r!.steps!) {
      expect(step.id).toBeTruthy();
      expect(step.stage).toBeTruthy();
      expect(step.label).toBeTruthy();
      expect(step.explanation).toBeTruthy();
    }
  });

  it('CPF steps follow order: eligibility → rate → cap → calculation', () => {
    const r = calculateStatutoryContribution({
      scheme: sgPack.statutorySchemes.cpf,
      employee: emp({ immigrationStatusCode: 'SC', salaryComponents: [{ componentCode: 'BASIC', amount: 5500 }] }),
      period: jan2026,
      ytdValues: {},
      ordinaryWages: 5500,
      additionalWages: 0,
    });
    const stages = r!.steps!.map((s) => s.stage).filter((v, i, a) => a.indexOf(v) === i);
    expect(stages.indexOf('eligibility')).toBeLessThan(stages.indexOf('rate_lookup'));
    expect(stages.indexOf('rate_lookup')).toBeLessThan(stages.indexOf('caps'));
    expect(stages.indexOf('caps')).toBeLessThan(stages.indexOf('calculation'));
  });
});
