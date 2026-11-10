import type { StatutorySchemeDef } from '../../data/country-packs/schema';
import type {
  EmployeePayrollInput,
  PayrollPeriod,
  StatutoryContributionResult,
  CalculationStep,
  CalculationTrace,
} from '../types';
import { roundByConfig } from '../rounding';
import { checkEligibility } from './eligibility';
import { lookupRateRow } from './rateLookup';
import { applyCaps } from './caps';
import { applyThresholds } from './thresholds';
import dayjs from 'dayjs';

export interface CalculateStatutoryInput {
  scheme: StatutorySchemeDef;
  employee: EmployeePayrollInput;
  period: PayrollPeriod;
  ytdValues: Record<string, number>;
  ordinaryWages: number;
  additionalWages: number;
}

export function calculateStatutoryContribution(
  input: CalculateStatutoryInput,
): StatutoryContributionResult | null {
  const { scheme, employee, period, ytdValues, ordinaryWages, additionalWages } = input;
  const general = scheme.general;
  const allSteps: CalculationStep[] = [];

  // 1. Eligibility
  const eligResult = checkEligibility(scheme, employee, period);
  allSteps.push(...eligResult.steps);
  if (!eligResult.eligible) {
    return null;
  }

  // 2. Rate lookup
  const ageAtPeriod = calculateAge(employee.dateOfBirth, period.endDate);
  const rateResult = lookupRateRow(
    scheme,
    employee.immigrationStatusCode,
    employee.prStage,
    ageAtPeriod,
    period,
    ordinaryWages + additionalWages,
  );
  allSteps.push(...rateResult.steps);

  if (!rateResult.rateRow) {
    return {
      schemeCode: general.code,
      schemeName: general.name,
      employeeTotal: 0,
      employerTotal: 0,
      total: 0,
      employeeBreakdown: [],
      employerBreakdown: [],
      steps: allSteps,
    };
  }

  // 3. Caps
  const capResult = applyCaps(scheme, ordinaryWages, additionalWages, ytdValues);
  allSteps.push(...capResult.steps);

  // 4. Determine rates (PR transition override)
  const prStageRule = scheme.calculationRules.find(
    (r) => r.code === 'CPF_PR_TRANSITION' || r.code === 'PR_STAGE' || r.code === 'PR_TRANSITION',
  );

  let employeeRate = rateResult.rateRow.employeeRate;
  let employerRate = rateResult.rateRow.employerRate;

  if (prStageRule && employee.prStage) {
    const stageParam = prStageRule.parameters?.[employee.prStage] as
      | { employeeRate?: number; employerRate?: number }
      | undefined;
    if (stageParam) {
      if (stageParam.employeeRate !== undefined) {
        allSteps.push({
          id: `${general.code}_PR_EMP`,
          stage: 'rate_lookup',
          label: 'PR Transition - Employee Rate',
          value: stageParam.employeeRate,
          explanation: `PR ${employee.prStage}: employee rate overridden to ${stageParam.employeeRate}%`,
          dependsOn: [`${general.code}_CAT`],
        });
        employeeRate = stageParam.employeeRate;
      }
      if (stageParam.employerRate !== undefined) {
        allSteps.push({
          id: `${general.code}_PR_ER`,
          stage: 'rate_lookup',
          label: 'PR Transition - Employer Rate',
          value: stageParam.employerRate,
          explanation: `PR ${employee.prStage}: employer rate overridden to ${stageParam.employerRate}%`,
          dependsOn: [`${general.code}_CAT`],
        });
        employerRate = stageParam.employerRate;
      }
    }
  }

  // 5. Calculate contributions
  const empRateDecimal = employeeRate / 100;
  const erRateDecimal = employerRate / 100;

  const fixedEmp = rateResult.rateRow.fixedEmployeeAmount;
  const fixedEr = rateResult.rateRow.fixedEmployerAmount;

  let employeeAmount = fixedEmp !== undefined
    ? roundByConfig(fixedEmp, scheme.rounding.employee)
    : roundByConfig(capResult.totalWageBase * empRateDecimal, scheme.rounding.employee);
  let employerAmount = fixedEr !== undefined
    ? roundByConfig(fixedEr, scheme.rounding.employer)
    : roundByConfig(capResult.totalWageBase * erRateDecimal, scheme.rounding.employer);
  // Schemes like CPF round the total (to the nearest dollar), drop the cents from the employee's share,
  // and the employer pays the rest.
  if (scheme.rounding.total && fixedEmp === undefined && fixedEr === undefined) {
    const total = roundByConfig(capResult.totalWageBase * (empRateDecimal + erRateDecimal), scheme.rounding.total);
    employerAmount = Math.round((total - employeeAmount) * 100) / 100;
  }

  allSteps.push({
    id: `${general.code}_CALC_EMP`,
    stage: 'calculation',
    label: 'Employee Contribution',
    value: employeeAmount,
    expression: `${capResult.totalWageBase} × ${employeeRate}%`,
    explanation: `Employee: ${capResult.totalWageBase} × ${employeeRate}% = ${employeeAmount}`,
    dependsOn: [`${general.code}_BASE`],
  });

  allSteps.push({
    id: `${general.code}_CALC_ER`,
    stage: 'calculation',
    label: 'Employer Contribution',
    value: employerAmount,
    expression: `${capResult.totalWageBase} × ${employerRate}%`,
    explanation: `Employer: ${capResult.totalWageBase} × ${employerRate}% = ${employerAmount}`,
    dependsOn: [`${general.code}_BASE`],
  });

  // 5b. New employees exempt from their share for a first stretch of employment (employer still pays)
  const exemptDays = scheme.eligibility.employeeExemptFirstDays;
  if (exemptDays && employee.dateOfJoining && employeeAmount > 0) {
    const startsPaying = dayjs(employee.dateOfJoining).add(exemptDays, 'day');
    if (dayjs(period.startDate).isBefore(startsPaying, 'day')) {
      allSteps.push({
        id: `${general.code}_NEW_EXEMPT`,
        stage: 'calculation',
        label: 'New Employee Exemption',
        value: 0,
        explanation: `Joined ${employee.dateOfJoining}: no employee share for pay periods starting before ${startsPaying.format('YYYY-MM-DD')} (first ${exemptDays} days and the incomplete period after them)`,
      });
      employeeAmount = 0;
    }
  }

  // 6. Apply thresholds
  const thresholdResult = applyThresholds(scheme, employeeAmount, employerAmount, employerRate);
  allSteps.push(...thresholdResult.steps);

  allSteps.push({
    id: `${general.code}_TOTAL`,
    stage: 'calculation',
    label: 'Total Contribution',
    value: thresholdResult.employeeAmount + thresholdResult.employerAmount,
    expression: `${thresholdResult.employeeAmount} + ${thresholdResult.employerAmount}`,
    explanation: `Total: Employee ${thresholdResult.employeeAmount} + Employer ${thresholdResult.employerAmount} = ${thresholdResult.employeeAmount + thresholdResult.employerAmount}`,
    dependsOn: [`${general.code}_CALC_EMP`, `${general.code}_CALC_ER`],
  });

  const empItem = {
    componentCode: `DEDUCTION_${general.code}`,
    amount: thresholdResult.employeeAmount,
    rate: employeeRate,
    wageBase: capResult.totalWageBase,
    ceilingApplied: scheme.caps.find((c) => c.type === 'monthly_ceiling')?.value ??
      scheme.caps.find((c) => c.type === 'annual_ceiling')?.value ?? null,
    steps: allSteps,
  };

  const erItem = {
    componentCode: `COST_${general.code}_EMPLOYER`,
    amount: thresholdResult.employerAmount,
    rate: employerRate,
    wageBase: capResult.totalWageBase,
    ceilingApplied: scheme.caps.find((c) => c.type === 'monthly_ceiling')?.value ??
      scheme.caps.find((c) => c.type === 'annual_ceiling')?.value ?? null,
  };

  return {
    schemeCode: general.code,
    schemeName: general.name,
    employeeTotal: thresholdResult.employeeAmount,
    employerTotal: thresholdResult.employerAmount,
    total: thresholdResult.employeeAmount + thresholdResult.employerAmount,
    employeeBreakdown: [empItem],
    employerBreakdown: [erItem],
    steps: allSteps,
  };
}

function calculateAge(dob: string, onDate: string): number {
  const birth = dayjs(dob);
  const target = dayjs(onDate);
  return target.diff(birth, 'year');
}
