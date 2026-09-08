import type { StatutorySchemeDef, StatutorySchemeRateRowDef } from '../../data/country-packs/schema';
import type { PayrollPeriod, CalculationStep } from '../types';

export interface RateLookupResult {
  rateRow: StatutorySchemeRateRowDef | null;
  employeeCategory: string | undefined;
  steps: CalculationStep[];
}

export function lookupRateRow(
  scheme: StatutorySchemeDef,
  employeeImmigrationCode: string,
  employeePrStage: string | undefined,
  ageAtPeriod: number,
  period: PayrollPeriod,
  totalWages: number,
): RateLookupResult {
  const steps: CalculationStep[] = [];
  const stepId = scheme.general.code;

  // Determine employee category
  const category = scheme.employeeCategories.find((cat) => {
    if (cat.immigrationStatusCode && cat.immigrationStatusCode !== employeeImmigrationCode) {
      return false;
    }
    if (cat.prStage && cat.prStage !== employeePrStage) {
      return false;
    }
    return true;
  });

  const categoryCode = category?.code;

  if (category) {
    steps.push({
      id: `${stepId}_CAT`,
      stage: 'rate_lookup',
      label: 'Employee Category',
      explanation: `Category: ${category.name} (${category.code})`,
    });
  } else {
    steps.push({
      id: `${stepId}_CAT`,
      stage: 'rate_lookup',
      label: 'Employee Category',
      explanation: `No matching category for ${employeeImmigrationCode}/${employeePrStage}`,
    });
  }

  // Find applicable rate row
  const applicableRows = scheme.rateTables.filter((row) => {
    const dateOk =
      (!row.effectiveDate || row.effectiveDate <= period.endDate) &&
      (!row.expiryDate || row.expiryDate >= period.endDate);
    if (!dateOk) return false;

    const catOk = !row.employeeCategory || row.employeeCategory === categoryCode;
    if (!catOk) return false;

    const ageOk =
      (row.ageFrom === undefined || ageAtPeriod >= row.ageFrom) &&
      (row.ageTo === undefined || row.ageTo === null || ageAtPeriod <= row.ageTo);
    if (!ageOk) return false;

    // Upper bound is inclusive so official "≤ $X" / "> $X" bands map cleanly;
    // ascending row order makes the lower band win on an exact boundary.
    const wageOk =
      (row.wageMin === undefined || totalWages >= row.wageMin) &&
      (row.wageMax === undefined || row.wageMax === null || totalWages <= row.wageMax);
    if (!wageOk) return false;

    return true;
  });

  const rateRow = applicableRows.length > 0 ? applicableRows[0] : null;

  if (rateRow) {
    steps.push({
      id: `${stepId}_RATE`,
      stage: 'rate_lookup',
      label: 'Rate Row',
      value: rateRow.employeeRate,
      expression: `${rateRow.employeeRate}/${rateRow.employerRate}`,
      explanation: `Rate: Employee ${rateRow.employeeRate}%, Employer ${rateRow.employerRate}%`,
      dependsOn: [`${stepId}_CAT`],
    });
    if (rateRow.ageFrom !== undefined || rateRow.ageTo !== undefined) {
      steps.push({
        id: `${stepId}_AGEBAND`,
        stage: 'rate_lookup',
        label: 'Age Band',
        value: ageAtPeriod,
        explanation: `Age ${ageAtPeriod}: band ${rateRow.ageFrom ?? 0}-${rateRow.ageTo ?? '∞'}`,
      });
    }
  } else {
    steps.push({
      id: `${stepId}_NORATE`,
      stage: 'rate_lookup',
      label: 'No Rate Found',
      explanation: `No rate row matches category=${categoryCode}, age=${ageAtPeriod}`,
    });
  }

  return { rateRow, employeeCategory: categoryCode, steps };
}
