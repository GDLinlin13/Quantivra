import type { StatutorySchemeDef } from '../../data/country-packs/schema';
import type { CalculationStep } from '../types';

export interface CapAppliedResult {
  owBase: number;
  awBase: number;
  totalWageBase: number;
  steps: CalculationStep[];
}

export function applyCaps(
  scheme: StatutorySchemeDef,
  ordinaryWages: number,
  additionalWages: number,
  ytdValues: Record<string, number>,
): CapAppliedResult {
  const steps: CalculationStep[] = [];
  const stepId = scheme.general.code;

  const owCeiling = scheme.caps.find((c) => c.type === 'monthly_ceiling');
  const annualCeiling = scheme.caps.find((c) => c.type === 'annual_ceiling');

  let owBase = ordinaryWages;
  if (owCeiling?.value !== undefined) {
    if (ordinaryWages > owCeiling.value) {
      steps.push({
        id: `${stepId}_CEIL_OW`,
        stage: 'caps',
        label: 'OW Ceiling Applied',
        value: owCeiling.value,
        expression: `MIN(${ordinaryWages}, ${owCeiling.value})`,
        explanation: `OW capped at ${owCeiling.currency}${owCeiling.value} (actual: ${ordinaryWages})`,
      });
      owBase = Math.min(owBase, owCeiling.value);
    } else {
      steps.push({
        id: `${stepId}_CEIL_OW`,
        stage: 'caps',
        label: 'OW Below Ceiling',
        value: ordinaryWages,
        explanation: `OW ${ordinaryWages} <= ceiling ${owCeiling.value}, no cap applied`,
      });
    }
  }

  let awBase = additionalWages;
  if (annualCeiling?.value !== undefined) {
    const ytdOw = ytdValues['OW_TOTAL'] ?? 0;
    const ytdAw = ytdValues['AW_TOTAL'] ?? 0;
    const annualUsed = ytdOw + ytdAw;
    const awRemaining = Math.max(0, annualCeiling.value - annualUsed);
    awBase = Math.min(awBase, awRemaining);

    if (additionalWages > 0) {
      steps.push({
        id: `${stepId}_CEIL_AW`,
        stage: 'caps',
        label: 'AW Ceiling Check',
        value: awRemaining,
        expression: `MAX(0, ${annualCeiling.value} - ${annualUsed})`,
        explanation: `AW remaining from annual ceiling: ${awRemaining} (annual: ${annualCeiling.value}, YTD used: ${annualUsed})`,
      });
      if (additionalWages > awRemaining) {
        steps.push({
          id: `${stepId}_CEIL_AW_CAP`,
          stage: 'caps',
          label: 'AW Ceiling Applied',
          value: awBase,
          explanation: `AW capped from ${additionalWages} to ${awBase}`,
          dependsOn: [`${stepId}_CEIL_AW`],
        });
      }
    }
  }

  const totalWageBase = owBase + awBase;
  steps.push({
    id: `${stepId}_BASE`,
    stage: 'caps',
    label: 'Total Wage Base',
    value: totalWageBase,
    expression: `${owBase} + ${awBase}`,
    explanation: `Total wage base = OW ${owBase} + AW ${awBase} = ${totalWageBase}`,
    dependsOn: [`${stepId}_CEIL_OW`, `${stepId}_CEIL_AW`],
  });

  return { owBase, awBase, totalWageBase, steps };
}
