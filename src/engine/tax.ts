import type { TaxBracketDef } from '../data/country-packs/schema';
import type { TaxResult, CalculationStep } from './types';
import { roundAmount } from './rounding';

export interface CalculateTaxInput {
  brackets: TaxBracketDef[];
  taxableIncome: number;
  isResident: boolean;
  nonResidentRate?: number;
  decimals?: number;
  roundingMethod?: 'round' | 'ceil' | 'floor' | 'truncate';
  rebates?: { amount: number; name?: string }[];
  effectiveDate?: string;
}

function sortBrackets(brackets: TaxBracketDef[]): TaxBracketDef[] {
  return [...brackets].sort((a, b) => a.min - b.min);
}

export function calculateIncomeTax(input: CalculateTaxInput): TaxResult {
  const {
    brackets,
    taxableIncome,
    isResident,
    nonResidentRate,
    decimals = 2,
    roundingMethod = 'round',
    rebates = [],
  } = input;

  const steps: CalculationStep[] = [];
  const sortedBrackets = sortBrackets(brackets);
  const bracketsApplied: TaxResult['bracketsApplied'] = [];

  if (taxableIncome <= 0) {
    steps.push({
      id: 'TAX_ZERO',
      stage: 'tax',
      label: 'Zero Taxable Income',
      value: 0,
      explanation: 'No tax: taxable income is zero or negative',
    });
    return {
      grossPay: 0,
      taxableIncome: 0,
      taxWithheld: 0,
      effectiveRate: 0,
      bracketsApplied: [],
      nonResident: !isResident,
      steps,
    };
  }

  if (isResident) {
    steps.push({
      id: 'TAX_RESIDENT',
      stage: 'tax',
      label: 'Residency Status',
      explanation: 'Resident: progressive tax brackets apply',
    });
  }

  if (!isResident && nonResidentRate !== undefined) {
    const flatTax = roundAmount(taxableIncome * nonResidentRate, decimals, roundingMethod);
    steps.push({
      id: 'TAX_NONRES',
      stage: 'tax',
      label: 'Non-Resident Flat Rate',
      value: flatTax,
      expression: `${taxableIncome} × ${nonResidentRate}`,
      explanation: `Non-resident: ${taxableIncome} × ${nonResidentRate * 100}% = ${flatTax}`,
    });
    return {
      grossPay: taxableIncome,
      taxableIncome,
      taxWithheld: flatTax,
      effectiveRate: flatTax / taxableIncome,
      bracketsApplied: [{
        min: 0,
        max: null,
        rate: nonResidentRate,
        taxable: taxableIncome,
        tax: flatTax,
      }],
      nonResident: true,
      steps,
    };
  }

  // Progressive: find the bracket the income falls into
  let totalTax = 0;

  for (const bracket of sortedBrackets) {
    const upperLimit = bracket.max ?? Infinity;
    if (taxableIncome <= bracket.min) break;

    const taxableInBracket = Math.min(taxableIncome, upperLimit) - bracket.min;
    if (taxableInBracket <= 0) continue;

    const bracketTax = roundAmount(bracket.fixed + taxableInBracket * bracket.rate, decimals, roundingMethod);
    totalTax = bracketTax;

    const bktSteps: string[] = [];
    if (bracket.fixed > 0) {
      bktSteps.push(`fixed ${bracket.fixed}`);
    }
    bktSteps.push(`(${taxableInBracket} × ${bracket.rate * 100}%)`);

    steps.push({
      id: `TAX_BRACKET_${bracket.min}`,
      stage: 'tax',
      label: `Bracket ${bracket.min}-${bracket.max ?? '∞'}`,
      value: bracketTax,
      expression: bracket.fixed > 0
        ? `${bracket.fixed} + (${taxableInBracket} × ${bracket.rate})`
        : `${taxableInBracket} × ${bracket.rate}`,
      explanation: bracket.fixed > 0
        ? `Tax: ${bracket.fixed} + ${taxableInBracket} × ${bracket.rate * 100}% = ${bracketTax}`
        : `Tax: ${taxableInBracket} × ${bracket.rate * 100}% = ${bracketTax}`,
    });

    bracketsApplied.push({
      min: bracket.min,
      max: bracket.max,
      rate: bracket.rate,
      taxable: taxableInBracket,
      tax: bracketTax,
    });

    if (bracket.max !== null && taxableIncome <= bracket.max) break;
  }

  const totalRebates = rebates.reduce((sum, r) => sum + r.amount, 0);
  let taxAfterRebates = totalTax;

  if (totalRebates > 0) {
    taxAfterRebates = Math.max(0, roundAmount(totalTax - totalRebates, decimals, roundingMethod));
    steps.push({
      id: 'TAX_REBATES',
      stage: 'tax',
      label: 'Rebates Applied',
      value: taxAfterRebates,
      expression: `${totalTax} - ${totalRebates}`,
      explanation: `Tax after ${rebates.map((r) => r.name ?? 'rebate').join(', ')}: ${totalTax} - ${totalRebates} = ${taxAfterRebates}`,
      dependsOn: rebates.map((_, i) => `TAX_REBATE_${i}`),
    });
  }

  return {
    grossPay: taxableIncome,
    taxableIncome,
    taxWithheld: taxAfterRebates,
    effectiveRate: taxableIncome > 0 ? taxAfterRebates / taxableIncome : 0,
    bracketsApplied,
    nonResident: false,
    steps,
  };
}
