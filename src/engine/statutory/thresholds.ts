import type { StatutorySchemeDef } from '../../data/country-packs/schema';
import type { CalculationStep } from '../types';

export interface ThresholdResult {
  employeeAmount: number;
  employerAmount: number;
  steps: CalculationStep[];
}

export function applyThresholds(
  scheme: StatutorySchemeDef,
  employeeAmount: number,
  employerAmount: number,
  employerRate: number,
): ThresholdResult {
  const steps: CalculationStep[] = [];
  const stepId = scheme.general.code;

  const minThreshold = scheme.thresholds.find((t) => t.type === 'minimum_earnings');
  const maxThreshold = scheme.thresholds.find(
    (t) => t.type === 'lower' || t.type === 'upper' || t.type === 'relevant_income',
  );

  let emp = employeeAmount;
  let er = employerAmount;

  if (minThreshold && employerRate > 0) {
    if (er < minThreshold.value) {
      steps.push({
        id: `${stepId}_THRESH_MIN`,
        stage: 'thresholds',
        label: 'Minimum Threshold Applied',
        value: minThreshold.value,
        expression: `MAX(${er}, ${minThreshold.value})`,
        explanation: `Employer contribution raised from ${er} to minimum ${minThreshold.value}`,
      });
      er = Math.max(er, minThreshold.value);
    }
  }

  if (maxThreshold && employerRate > 0) {
    if (er > maxThreshold.value) {
      steps.push({
        id: `${stepId}_THRESH_MAX`,
        stage: 'thresholds',
        label: 'Maximum Threshold Applied',
        value: maxThreshold.value,
        expression: `MIN(${er}, ${maxThreshold.value})`,
        explanation: `Employer contribution capped from ${er} to maximum ${maxThreshold.value}`,
      });
      er = Math.min(er, maxThreshold.value);
    }
  }

  return { employeeAmount: emp, employerAmount: er, steps };
}
