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

describe('calculateIncomeTax', () => {
  describe('resident progressive tax (SG brackets)', () => {
    it('zero tax below first bracket threshold', () => {
      const result = calculateIncomeTax({
        brackets: sgBrackets,
        taxableIncome: 15000,
        isResident: true,
      });
      expect(result.taxWithheld).toBe(0);
      expect(result.effectiveRate).toBe(0);
    });

    it('calculates tax within first bracket (0-20000)', () => {
      const result = calculateIncomeTax({
        brackets: sgBrackets,
        taxableIncome: 20000,
        isResident: true,
      });
      expect(result.taxWithheld).toBe(0);
    });

    it('calculates tax in second bracket (20000-30000)', () => {
      const result = calculateIncomeTax({
        brackets: sgBrackets,
        taxableIncome: 25000,
        isResident: true,
      });
      // 0 + (25000 - 20000) * 0.02 = 5000 * 0.02 = 100
      expect(result.taxWithheld).toBe(100);
    });

    it('calculates tax in third bracket (30000-40000)', () => {
      const result = calculateIncomeTax({
        brackets: sgBrackets,
        taxableIncome: 35000,
        isResident: true,
      });
      // 200 + (35000 - 30000) * 0.035 = 200 + 175 = 375
      expect(result.taxWithheld).toBe(375);
    });

    it('calculates tax in fourth bracket (40000-80000)', () => {
      const result = calculateIncomeTax({
        brackets: sgBrackets,
        taxableIncome: 60000,
        isResident: true,
      });
      // 550 + (60000 - 40000) * 0.07 = 550 + 1400 = 1950
      expect(result.taxWithheld).toBe(1950);
    });

    it('calculates tax in sixth bracket (120000-160000)', () => {
      const result = calculateIncomeTax({
        brackets: sgBrackets,
        taxableIncome: 150000,
        isResident: true,
      });
      // 7950 + (150000 - 120000) * 0.15 = 7950 + 4500 = 12450
      expect(result.taxWithheld).toBe(12450);
    });

    it('calculates tax at very high income', () => {
      const result = calculateIncomeTax({
        brackets: sgBrackets,
        taxableIncome: 500000,
        isResident: true,
      });
      // 84150 + (500000 - 500000) * 0.23 = 84150
      expect(result.taxWithheld).toBe(84150);
    });

    it('handles income beyond all brackets', () => {
      const result = calculateIncomeTax({
        brackets: sgBrackets,
        taxableIncome: 2000000,
        isResident: true,
      });
      // 199150 + (2000000 - 1000000) * 0.24 = 199150 + 240000 = 439150
      expect(result.taxWithheld).toBe(439150);
    });

    it('provides bracket breakdown', () => {
      const result = calculateIncomeTax({
        brackets: sgBrackets,
        taxableIncome: 55000,
        isResident: true,
      });
      expect(result.bracketsApplied.length).toBeGreaterThan(1);
      expect(result.bracketsApplied[0].rate).toBe(0);
      expect(result.bracketsApplied[1].rate).toBe(0.02);
    });
  });

  describe('non-resident', () => {
    it('applies flat non-resident rate', () => {
      const result = calculateIncomeTax({
        brackets: sgBrackets,
        taxableIncome: 50000,
        isResident: false,
        nonResidentRate: 0.24, // 24% flat
      });
      expect(result.taxWithheld).toBe(12000); // 50000 * 0.24
      expect(result.nonResident).toBe(true);
    });

    it('returns zero effective rate for zero income', () => {
      const result = calculateIncomeTax({
        brackets: sgBrackets,
        taxableIncome: 0,
        isResident: false,
        nonResidentRate: 0.24,
      });
      expect(result.taxWithheld).toBe(0);
      expect(result.effectiveRate).toBe(0);
    });
  });

  describe('rebates', () => {
    it('subtracts rebate from tax', () => {
      const result = calculateIncomeTax({
        brackets: sgBrackets,
        taxableIncome: 50000,
        isResident: true,
        rebates: [{ amount: 200, name: 'Personal Rebate' }],
      });
      // 550 + (50000 - 40000) * 0.07 = 550 + 700 = 1250
      // 1250 - 200 = 1050
      expect(result.taxWithheld).toBe(1050);
    });

    it('does not go below zero with rebates', () => {
      const result = calculateIncomeTax({
        brackets: sgBrackets,
        taxableIncome: 15000,
        isResident: true,
        rebates: [{ amount: 500 }],
      });
      expect(result.taxWithheld).toBe(0);
    });
  });

  describe('custom brackets', () => {
    it('handles simple two-bracket system', () => {
      const brackets = [
        { min: 0, max: 10000, rate: 0, fixed: 0 },
        { min: 10000, max: null, rate: 0.15, fixed: 0 },
      ];
      const result = calculateIncomeTax({
        brackets,
        taxableIncome: 20000,
        isResident: true,
      });
      // 0 + (20000 - 10000) * 0.15 = 1500
      expect(result.taxWithheld).toBe(1500);
    });
  });
});
