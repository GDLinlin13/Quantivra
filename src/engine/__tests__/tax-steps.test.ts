import { describe, it, expect } from 'vitest';
import { calculateIncomeTax } from '../tax';

const sgBrackets = [
  { min: 0, max: 20000, rate: 0, fixed: 0 },
  { min: 20000, max: 30000, rate: 0.02, fixed: 0 },
  { min: 30000, max: 40000, rate: 0.035, fixed: 200 },
  { min: 40000, max: 80000, rate: 0.07, fixed: 550 },
  { min: 80000, max: 120000, rate: 0.115, fixed: 3350 },
  { min: 120000, max: 160000, rate: 0.15, fixed: 7950 },
  { min: 160000, max: 200000, rate: 0.18, fixed: 13950 },
  { min: 200000, max: 240000, rate: 0.19, fixed: 21150 },
  { min: 240000, max: 280000, rate: 0.195, fixed: 28750 },
  { min: 280000, max: 320000, rate: 0.2, fixed: 36550 },
  { min: 320000, max: 500000, rate: 0.22, fixed: 44550 },
  { min: 500000, max: 1000000, rate: 0.23, fixed: 84150 },
  { min: 1000000, max: null, rate: 0.24, fixed: 199150 },
];

describe('calculateIncomeTax explain mode', () => {
  it('produces steps for taxable income', () => {
    const result = calculateIncomeTax({
      brackets: sgBrackets, taxableIncome: 35000, isResident: true,
    });
    expect(result.steps).toBeDefined();
    expect(result.steps!.length).toBeGreaterThanOrEqual(1);
  });

  it('includes residency step', () => {
    const result = calculateIncomeTax({
      brackets: sgBrackets, taxableIncome: 35000, isResident: true,
    });
    const resStep = result.steps!.find((s) => s.stage === 'tax');
    expect(resStep).toBeDefined();
  });

  it('shows bracket breakdown in steps', () => {
    const result = calculateIncomeTax({
      brackets: sgBrackets, taxableIncome: 60000, isResident: true,
    });
    const bracketSteps = result.steps!.filter((s) => s.id.startsWith('TAX_BRACKET'));
    expect(bracketSteps.length).toBeGreaterThanOrEqual(1);
    const lastStep = bracketSteps[bracketSteps.length - 1];
    expect(lastStep.value).toBe(1950);
  });

  it('includes rebate step when rebates applied', () => {
    const result = calculateIncomeTax({
      brackets: sgBrackets, taxableIncome: 50000, isResident: true,
      rebates: [{ amount: 200 }],
    });
    const rebateStep = result.steps!.find((s) => s.id === 'TAX_REBATES');
    expect(rebateStep).toBeDefined();
    expect(rebateStep!.value).toBe(1050);
  });

  it('shows non-resident flat rate step', () => {
    const result = calculateIncomeTax({
      brackets: sgBrackets, taxableIncome: 50000, isResident: false, nonResidentRate: 0.24,
    });
    const nonResStep = result.steps!.find((s) => s.id === 'TAX_NONRES');
    expect(nonResStep).toBeDefined();
    expect(nonResStep!.value).toBe(12000);
    expect(nonResStep!.explanation).toContain('Non-resident');
  });

  it('shows zero income step', () => {
    const result = calculateIncomeTax({
      brackets: sgBrackets, taxableIncome: 0, isResident: true,
    });
    const zeroStep = result.steps!.find((s) => s.id === 'TAX_ZERO');
    expect(zeroStep).toBeDefined();
  });

  it('explain steps have explanation text for every bracket', () => {
    const result = calculateIncomeTax({
      brackets: sgBrackets, taxableIncome: 25000, isResident: true,
    });
    for (const step of result.steps!) {
      expect(step.explanation).toBeTruthy();
      expect(typeof step.explanation).toBe('string');
    }
  });
});
