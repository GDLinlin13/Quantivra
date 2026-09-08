import type { StatutorySchemeDef } from '../../data/country-packs/schema';
import type { EmployeePayrollInput, PayrollPeriod, CalculationStep } from '../types';
import dayjs from 'dayjs';

export interface EligibilityResult {
  eligible: boolean;
  steps: CalculationStep[];
}

export function checkEligibility(
  scheme: StatutorySchemeDef,
  employee: EmployeePayrollInput,
  period: PayrollPeriod,
): EligibilityResult {
  const steps: CalculationStep[] = [];
  const elig = scheme.eligibility;
  const empCode = employee.immigrationStatusCode;

  const hasCitizenshipFilter = elig.citizenship && elig.citizenship.length > 0;
  const hasVisaFilter = elig.visaTypes && elig.visaTypes.length > 0;

  if (hasCitizenshipFilter || hasVisaFilter) {
    const matchesCitizen = hasCitizenshipFilter && elig.citizenship!.includes(empCode);
    const matchesVisa = hasVisaFilter && elig.visaTypes!.includes(empCode);
    if (!matchesCitizen && !matchesVisa) {
      steps.push({
        id: `${scheme.general.code}_ELIG_CITIZEN`,
        stage: 'eligibility',
        label: 'Citizenship / Visa Check',
        explanation: `Not eligible: ${empCode} not in ${JSON.stringify(elig.citizenship)} and ${JSON.stringify(elig.visaTypes)}`,
      });
      return { eligible: false, steps };
    }
    steps.push({
      id: `${scheme.general.code}_ELIG_CITIZEN`,
      stage: 'eligibility',
      label: 'Citizenship / Visa Check',
      explanation: `Eligible: ${empCode} matches scheme criteria`,
    });
  }

  if (elig.ethnicities && elig.ethnicities.length > 0) {
    const eth = (employee.ethnicity || '').toLowerCase();
    if (!eth || !elig.ethnicities.map((e) => e.toLowerCase()).includes(eth)) {
      steps.push({
        id: `${scheme.general.code}_ELIG_ETHNICITY`,
        stage: 'eligibility',
        label: 'Ethnicity Check',
        explanation: `Not eligible: ethnicity "${eth || 'unset'}" not in ${JSON.stringify(elig.ethnicities)}`,
      });
      return { eligible: false, steps };
    }
    steps.push({
      id: `${scheme.general.code}_ELIG_ETHNICITY`,
      stage: 'eligibility',
      label: 'Ethnicity Check',
      explanation: `Eligible: ethnicity "${eth}" matches scheme`,
    });
  }

  if (elig.excludedCategories && elig.excludedCategories.length > 0) {
    if (elig.excludedCategories.includes(employee.employmentStatusCode)) {
      steps.push({
        id: `${scheme.general.code}_ELIG_EXCLUDED`,
        stage: 'eligibility',
        label: 'Excluded Categories Check',
        explanation: `Not eligible: ${employee.employmentStatusCode} is in excluded list`,
      });
      return { eligible: false, steps };
    }
    steps.push({
      id: `${scheme.general.code}_ELIG_EXCLUDED`,
      stage: 'eligibility',
      label: 'Excluded Categories Check',
      explanation: `Not excluded: ${employee.employmentStatusCode}`,
    });
  }

  if (elig.minimumAge != null) {
    const age = calculateAge(employee.dateOfBirth, period.endDate);
    if (age < elig.minimumAge) {
      steps.push({
        id: `${scheme.general.code}_ELIG_MINAGE`,
        stage: 'eligibility',
        label: 'Minimum Age Check',
        value: age,
        explanation: `Not eligible: age ${age} < minimum ${elig.minimumAge}`,
      });
      return { eligible: false, steps };
    }
    steps.push({
      id: `${scheme.general.code}_ELIG_MINAGE`,
      stage: 'eligibility',
      label: 'Minimum Age Check',
      value: age,
      explanation: `Age ${age} >= minimum ${elig.minimumAge}`,
    });
  }
  if (elig.maximumAge != null) {
    const age = calculateAge(employee.dateOfBirth, period.endDate);
    if (age > elig.maximumAge) {
      steps.push({
        id: `${scheme.general.code}_ELIG_MAXAGE`,
        stage: 'eligibility',
        label: 'Maximum Age Check',
        value: age,
        explanation: `Not eligible: age ${age} > maximum ${elig.maximumAge}`,
      });
      return { eligible: false, steps };
    }
    steps.push({
      id: `${scheme.general.code}_ELIG_MAXAGE`,
      stage: 'eligibility',
      label: 'Maximum Age Check',
      value: age,
      explanation: `Age ${age} <= maximum ${elig.maximumAge}`,
    });
  }

  if (elig.minimumSalary !== undefined) {
    const totalEarnings = employee.salaryComponents.reduce((s, c) => s + c.amount, 0);
    if (totalEarnings < elig.minimumSalary) {
      steps.push({
        id: `${scheme.general.code}_ELIG_MINSAL`,
        stage: 'eligibility',
        label: 'Minimum Salary Check',
        value: totalEarnings,
        explanation: `Not eligible: earnings ${totalEarnings} < minimum ${elig.minimumSalary}`,
      });
      return { eligible: false, steps };
    }
  }

  steps.push({
    id: `${scheme.general.code}_ELIG_PASS`,
    stage: 'eligibility',
    label: 'Eligibility Result',
    explanation: 'All eligibility checks passed',
  });

  return { eligible: true, steps };
}

function calculateAge(dob: string, onDate: string): number {
  const birth = dayjs(dob);
  const target = dayjs(onDate);
  return target.diff(birth, 'year');
}
