import type { CountryPackDef } from '../data/country-packs/schema';
import type {
  PayrollRunInput,
  PayrollRunResult,
  EmployeePayrollInput,
  EmployeePayrollResult,
  PayrollPeriod,
  PipelineContext,
  CalculationStep,
  CalculationTrace,
  EngineVersionInfo,
} from './types';
import { ENGINE_VERSION } from './types';
import { calculateIncomeTax } from './tax';
import { calculateStatutoryContribution } from './statutory';
import { calculateProrationFactor } from './proration';
import { sumAndRound, roundAmount } from './rounding';
import { generatePayrollJournals, DEFAULT_JOURNAL_CONFIG } from './journals';
import dayjs from 'dayjs';

let _calcCounter = 0;

function generateCalculationId(): string {
  _calcCounter++;
  const ts = dayjs().format('YYYYMMDDHHmmss');
  return `CALC-${ts}-${String(_calcCounter).padStart(4, '0')}`;
}

function buildEngineInfo(countryPack: CountryPackDef): EngineVersionInfo {
  const schemeVersions: Record<string, string> = {};
  for (const [, scheme] of Object.entries(countryPack.statutorySchemes)) {
    schemeVersions[scheme.general.code] = scheme.general.version;
  }
  return {
    engineVersion: ENGINE_VERSION,
    countryPackVersion: `${countryPack.general.code}/${countryPack.general.name}`,
    schemeVersions,
    timestamp: new Date().toISOString(),
  };
}

export function calculatePayroll(input: PayrollRunInput): PayrollRunResult {
  const { period, countryPack, employees } = input;
  const absorbedSchemes = input.absorbedSchemes ?? [];
  const calculationId = generateCalculationId();
  const engineInfo = buildEngineInfo(countryPack);
  const employeeResults: EmployeePayrollResult[] = [];
  let totalGrossPay = 0;
  let totalDeductions = 0;
  let totalEmployerCosts = 0;
  let totalNetPay = 0;
  let totalStatutoryEmployee = 0;
  let totalStatutoryEmployer = 0;
  let errorCount = 0;
  const allSteps: CalculationStep[] = [];

  for (const employee of employees) {
    try {
      const ctx = buildPipelineContext(employee, period, countryPack, calculationId, engineInfo, absorbedSchemes);
      const result = runPipeline(ctx);
      employeeResults.push(result);
      totalGrossPay += result.grossPay;
      totalDeductions += result.totalDeductions;
      totalEmployerCosts += result.totalEmployerCosts;
      totalNetPay += result.netPay;
      for (const sc of result.statutoryContributions) {
        totalStatutoryEmployee += sc.employeeTotal;
        totalStatutoryEmployer += sc.employerTotal;
      }
      if (result.trace) allSteps.push(...result.trace.steps);
    } catch (err) {
      errorCount++;
      employeeResults.push({
        employeeId: employee.employeeId,
        name: employee.name,
        earnings: [], deductions: [], employerCosts: [],
        grossPay: 0, totalDeductions: 0, totalEmployerCosts: 0, netPay: 0,
        statutoryContributions: [],
        tax: { grossPay: 0, taxableIncome: 0, taxWithheld: 0, effectiveRate: 0, bracketsApplied: [], nonResident: false },
        leave: { annualLeaveEntitlement: 0, annualLeaveTaken: 0, annualLeaveBalance: 0, sickLeaveEntitlement: 0, sickLeaveTaken: 0, sickLeaveBalance: 0, unpaidLeaveDays: 0 },
        status: 'error',
        errors: [err instanceof Error ? err.message : 'Unknown error'],
      });
    }
  }

  const runTrace: CalculationTrace = {
    calculationId,
    engine: engineInfo,
    steps: allSteps,
  };

  return {
    period,
    employees: employeeResults,
    trace: runTrace,
    summary: {
      totalEmployees: employees.length,
      totalGrossPay, totalDeductions, totalEmployerCosts, totalNetPay,
      totalStatutoryEmployee, totalStatutoryEmployer,
    },
    status: errorCount === 0 ? 'complete' : errorCount < employees.length ? 'partial' : 'failed',
    errors: errorCount > 0 ? [`${errorCount} employee(s) failed`] : undefined,
  };
}

function buildPipelineContext(
  employee: EmployeePayrollInput,
  period: PayrollPeriod,
  countryPack: CountryPackDef,
  calculationId: string,
  engineInfo: EngineVersionInfo,
  absorbedSchemes: string[],
): PipelineContext {
  return {
    period,
    countryPack,
    employee,
    absorbedSchemes,
    ytdValues: { ...employee.ytdValues },
    earnings: [],
    deductions: [],
    employerCosts: [],
    unproratedGross: 0,
    ordinaryWages: 0,
    additionalWages: 0,
    grossPay: 0,
    prorationFactor: 1,
    steps: [],
    trace: {
      calculationId,
      engine: engineInfo,
      steps: [],
    },
  };
}

function runPipeline(ctx: PipelineContext): EmployeePayrollResult {
  const { employee, period, countryPack } = ctx;
  const empSteps: CalculationStep[] = [];
  const step = (s: CalculationStep) => { empSteps.push(s); ctx.steps.push(s); };

  // === Stage 1: Proration ===
  const prorationFactor = calculateProrationFactor({
    joinDate: employee.dateOfJoining,
    leaveDate: employee.dateOfLeaving,
    periodStart: period.startDate,
    periodEnd: period.endDate,
    unpaidLeaveDays: employee.unpaidLeaveDays,
  });
  ctx.prorationFactor = prorationFactor;

  if (prorationFactor < 1) {
    step({
      id: `${employee.employeeId}_PRORATION`,
      stage: 'proration',
      label: 'Proration Factor',
      value: prorationFactor,
      expression: prorationFactor.toFixed(4),
      explanation: `Prorated: ${prorationFactor.toFixed(4)} of full period`,
    });
  }

  // === Stage 2: Salary Component Classification ===
  for (const sc of employee.salaryComponents) {
    ctx.earnings.push({ componentCode: sc.componentCode, amount: sc.amount, ...(sc.label ? { label: sc.label } : {}) });
    if (sc.prorate === false) ctx.unproratedGross += sc.amount;

    const classify = (code: string) => {
      let ow = false, aw = false, known = false;
      for (const schemeDef of Object.values(countryPack.statutorySchemes)) {
        const mapping = schemeDef.salaryComponents.find((m) => m.componentCode === code);
        if (mapping) {
          known = true;
          if (mapping.classification === 'ordinary_wage' && mapping.included) ow = true;
          if (mapping.classification === 'additional_wage' && mapping.included) aw = true;
        }
      }
      return { ow, aw, known };
    };
    let cls = classify(sc.componentCode);
    if (!cls.known && sc.classifyAs) cls = classify(sc.classifyAs);
    const isOW = cls.ow;
    const isAW = cls.aw;

    if (isOW) ctx.ordinaryWages += sc.amount;
    if (isAW) ctx.additionalWages += sc.amount;

    step({
      id: `${employee.employeeId}_COMP_${sc.componentCode}`,
      stage: 'salary_components',
      label: sc.componentCode,
      value: sc.amount,
      explanation: `${sc.componentCode}: ${sc.amount} (${isOW ? 'OW' : isAW ? 'AW' : 'Excluded'})`,
    });
  }

  ctx.grossPay = sumAndRound(ctx.earnings.map((e) => e.amount));
  step({
    id: `${employee.employeeId}_GROSS`,
    stage: 'salary_components',
    label: 'Gross Pay',
    value: ctx.grossPay,
    explanation: `Gross pay: ${ctx.grossPay}`,
  });

  // === Stage 3: Statutory Contributions ===
  const statutoryResults: EmployeePayrollResult['statutoryContributions'] = [];
  for (const [schemeCode, scheme] of Object.entries(countryPack.statutorySchemes)) {
    const result = calculateStatutoryContribution({
      scheme,
      employee,
      period,
      ytdValues: ctx.ytdValues,
      ordinaryWages: ctx.ordinaryWages,
      additionalWages: ctx.additionalWages,
    });
    if (result) {
      const absorbed = ctx.absorbedSchemes.includes(scheme.general.code);
      result.absorbedByEmployer = absorbed;
      statutoryResults.push(result);
      if (result.steps) empSteps.push(...result.steps);
      result.employeeBreakdown.forEach((item) => {
        if (item.amount <= 0) return; // e.g. SDL is employer-only — no employee line
        if (absorbed) {
          // Company pays the employee's share — it becomes an employer cost, not a deduction.
          ctx.employerCosts.push({ componentCode: `${item.componentCode}_ABSORBED`, amount: item.amount });
          step({
            id: `${employee.employeeId}_ABSORB_${item.componentCode}`,
            stage: 'statutory',
            label: `${schemeCode} absorbed by employer`,
            value: item.amount,
            explanation: `${schemeCode} employee share of ${item.amount} paid by the company`,
            dependsOn: [`${schemeCode}_TOTAL`],
          });
          return;
        }
        ctx.deductions.push({ componentCode: item.componentCode, amount: item.amount });
        step({
          id: `${employee.employeeId}_DED_${item.componentCode}`,
          stage: 'statutory',
          label: `${schemeCode} Employee`,
          value: item.amount,
          explanation: `${schemeCode} employee: ${item.amount}`,
          dependsOn: [`${schemeCode}_TOTAL`],
        });
      });
      result.employerBreakdown.forEach((item) => {
        if (item.amount <= 0) return; // don't list zero employer costs (e.g. SHG)
        ctx.employerCosts.push({ componentCode: item.componentCode, amount: item.amount });
        step({
          id: `${employee.employeeId}_COST_${item.componentCode}`,
          stage: 'statutory',
          label: `${schemeCode} Employer`,
          value: item.amount,
          explanation: `${schemeCode} employer: ${item.amount}`,
          dependsOn: [`${schemeCode}_TOTAL`],
        });
      });
    } else {
      step({
        id: `${employee.employeeId}_SCHEME_${schemeCode}`,
        stage: 'statutory',
        label: `${schemeCode} Not Applicable`,
        explanation: `${schemeCode}: employee not eligible`,
      });
    }
  }

  // === Stage 4: Tax ===
  const salaryComponentsTotal = employee.salaryComponents
    .filter((sc) => sc.taxable !== false)
    .reduce((s, sc) => s + sc.amount, 0);
  const taxableDeductionCodes = new Set(
    ctx.deductions
      .filter((d) => {
        const scheme = Object.values(countryPack.statutorySchemes).find((s) =>
          s.salaryComponents.some((sc) => sc.componentCode === d.componentCode),
        );
        if (!scheme) return false;
        const mapping = scheme.salaryComponents.find((sc) => sc.componentCode === d.componentCode);
        return mapping ? !mapping.included : false;
      })
      .map((d) => d.componentCode),
  );

  const taxableDeductions = ctx.deductions
    .filter((d) => !taxableDeductionCodes.has(d.componentCode))
    .reduce((s, d) => s + d.amount, 0);

  const taxableIncome = Math.max(0, salaryComponentsTotal - taxableDeductions);

  // Pack tax rates are percentages (14 = 14%); the engine wants decimals.
  const periodsPerYear = { monthly: 12, semi_monthly: 24, weekly: 52, fortnightly: 26, daily: 260 }[period.frequency] ?? 12;
  const withholding = countryPack.tax.withholding ?? 'monthly';
  const taxResult = withholding === 'none'
    ? { grossPay: taxableIncome, taxableIncome, taxWithheld: 0, effectiveRate: 0, bracketsApplied: [], nonResident: false, steps: [] as CalculationStep[] }
    : (() => {
        // Annualise this period's taxable pay, tax it, then spread back over the year (PAYE-style).
        const annual = calculateIncomeTax({
          brackets: countryPack.tax.brackets.map(b => ({ ...b, rate: b.rate / 100 })),
          taxableIncome: taxableIncome * periodsPerYear,
          isResident: true,
          nonResidentRate: countryPack.tax.nonResidentRate != null ? countryPack.tax.nonResidentRate / 100 : undefined,
        });
        return { ...annual, taxWithheld: roundAmount(annual.taxWithheld / periodsPerYear), taxableIncome };
      })();

  if (taxResult.steps) empSteps.push(...taxResult.steps);

  if (taxResult.taxWithheld > 0) {
    ctx.deductions.push({ componentCode: 'DEDUCTION_PAYE', amount: taxResult.taxWithheld });
    step({
      id: `${employee.employeeId}_TAX`,
      stage: 'tax',
      label: 'Income Tax Withheld',
      value: taxResult.taxWithheld,
      explanation: `PAYE: ${taxResult.taxWithheld} (effective rate: ${(taxResult.effectiveRate * 100).toFixed(2)}%)`,
      dependsOn: taxResult.steps?.map((s) => s.id),
    });
  }

  // === Stage 5: Leave ===
  const leaveResult = calculateLeave(employee, period, countryPack);
  step({
    id: `${employee.employeeId}_LEAVE`,
    stage: 'leave',
    label: 'Leave Accrual',
    explanation: `AL: ${leaveResult.annualLeaveBalance} days remaining, SL: ${leaveResult.sickLeaveBalance} days remaining`,
  });

  // === Stage 6: Net Pay ===
  let finalGrossPay = ctx.grossPay;
  let finalDeductions = ctx.deductions.reduce((s, d) => s + d.amount, 0);
  let finalEmployerCosts = ctx.employerCosts.reduce((s, c) => s + c.amount, 0);

  if (ctx.prorationFactor < 1) {
    // one-off items (overtime, bonus, reimbursements…) are paid in full
    const prorated = finalGrossPay - ctx.unproratedGross;
    finalGrossPay = roundAmount(prorated * ctx.prorationFactor + ctx.unproratedGross);
    finalDeductions = roundAmount(finalDeductions * ctx.prorationFactor);
    finalEmployerCosts = roundAmount(finalEmployerCosts * ctx.prorationFactor);
    step({
      id: `${employee.employeeId}_PRORATED`,
      stage: 'net_pay',
      label: 'Prorated Values',
      value: finalGrossPay,
      explanation: `After proration: Gross ${finalGrossPay}, Deductions ${finalDeductions}, Employer Costs ${finalEmployerCosts}`,
      dependsOn: [`${employee.employeeId}_PRORATION`],
    });
  }

  // Non-statutory deductions (loans, advances…) come off after everything else, in full.
  let otherDeductionsTotal = 0;
  for (const d of employee.otherDeductions ?? []) {
    if (!(d.amount > 0)) continue;
    ctx.deductions.push({ componentCode: d.componentCode, amount: d.amount, ...(d.label ? { label: d.label } : {}) });
    otherDeductionsTotal += d.amount;
    step({
      id: `${employee.employeeId}_OTHER_${d.componentCode}_${otherDeductionsTotal}`,
      stage: 'net_pay',
      label: d.label || d.componentCode,
      value: d.amount,
      explanation: `${d.label || d.componentCode}: ${d.amount}`,
    });
  }
  otherDeductionsTotal = roundAmount(otherDeductionsTotal);
  finalDeductions = roundAmount(finalDeductions + otherDeductionsTotal);

  const netPay = roundAmount(finalGrossPay - finalDeductions);
  step({
    id: `${employee.employeeId}_NETPAY`,
    stage: 'net_pay',
    label: 'Net Pay',
    value: netPay,
    expression: `${finalGrossPay} - ${finalDeductions}`,
    explanation: `Net pay: ${finalGrossPay} - ${finalDeductions} = ${netPay}`,
  });

  // === Stage 7: Journals ===
  const employeeResult: EmployeePayrollResult = {
    employeeId: employee.employeeId,
    name: employee.name,
    earnings: ctx.earnings,
    deductions: ctx.deductions,
    employerCosts: ctx.employerCosts,
    grossPay: finalGrossPay,
    totalDeductions: finalDeductions,
    totalEmployerCosts: finalEmployerCosts,
    netPay,
    ...(otherDeductionsTotal > 0 ? { otherDeductions: otherDeductionsTotal } : {}),
    statutoryContributions: statutoryResults,
    tax: taxResult,
    leave: leaveResult,
    status: 'success',
  };

  const periodLabel = `${period.payYear}-${String(period.payMonth).padStart(2, '0')}`;
  employeeResult.journals = generatePayrollJournals(employeeResult, periodLabel, DEFAULT_JOURNAL_CONFIG);

  employeeResult.trace = {
    calculationId: ctx.trace.calculationId,
    engine: ctx.trace.engine,
    steps: empSteps,
  };

  return employeeResult;
}

function calculateLeave(
  employee: EmployeePayrollInput,
  period: PayrollPeriod,
  countryPack: CountryPackDef,
): EmployeePayrollResult['leave'] {
  const empRules = countryPack.employment.rules;
  const annualLeaveDays = parseInt(
    empRules.find((r) => r.key === 'annual_leave_days')?.value ?? '14',
  );
  const sickLeaveDays = parseInt(
    empRules.find((r) => r.key === 'sick_leave_days')?.value ?? '14',
  );

  const monthsEmployed = dayjs(period.endDate).diff(dayjs(employee.dateOfJoining), 'month', true);
  const yearsEmployed = Math.floor(monthsEmployed / 12);
  const annualEntitlement = yearsEmployed >= 1 ? annualLeaveDays : (annualLeaveDays / 12) * monthsEmployed;
  const sickEntitlement = sickLeaveDays;

  return {
    annualLeaveEntitlement: roundAmount(annualEntitlement, 1),
    annualLeaveTaken: employee.annualLeaveTaken ?? 0,
    annualLeaveBalance: roundAmount(annualEntitlement - (employee.annualLeaveTaken ?? 0), 1),
    sickLeaveEntitlement: sickEntitlement,
    sickLeaveTaken: employee.sickLeaveDays ?? 0,
    sickLeaveBalance: Math.max(0, sickEntitlement - (employee.sickLeaveDays ?? 0)),
    unpaidLeaveDays: employee.unpaidLeaveDays ?? 0,
  };
}
