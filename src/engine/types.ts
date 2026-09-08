import type {
  CountryPackDef,
  StatutorySchemeDef,
} from '../data/country-packs/schema';

export const ENGINE_VERSION = '1.0.0';

// === ENGINE VERSIONING ===

export interface EngineVersionInfo {
  engineVersion: string;
  countryPackVersion: string;
  schemeVersions: Record<string, string>;
  timestamp: string;
}

// === CALCULATION TRACE ===

export interface CalculationStep {
  id: string;
  stage: string;
  label: string;
  value?: number;
  expression?: string;
  explanation: string;
  dependsOn?: string[];
}

export interface CalculationTrace {
  calculationId: string;
  engine: EngineVersionInfo;
  steps: CalculationStep[];
}

// === DATES ===

export interface PayrollPeriod {
  startDate: string;
  endDate: string;
  payDate: string;
  frequency: 'monthly' | 'semi_monthly' | 'weekly' | 'fortnightly' | 'daily';
  payYear: number;
  payMonth: number;
  payPeriod: number;
}

// === EMPLOYEE INPUT ===

export interface EmployeeSalaryComponent {
  componentCode: string;
  amount: number;
  effectiveDate?: string;
}

export interface EmployeePayrollInput {
  employeeId: string;
  name: string;
  dateOfBirth: string;
  dateOfJoining: string;
  dateOfLeaving?: string;
  employmentStatusCode: string;
  immigrationStatusCode: string;
  prStage?: string;
  gender?: string;
  /** chinese | malay | indian | eurasian | other — drives SG self-help group eligibility. */
  ethnicity?: string;
  salaryComponents: EmployeeSalaryComponent[];
  ytdValues?: Record<string, number>;
  previousPeriodValues?: Record<string, number>;
  hoursWorked?: number;
  overtimeHours?: number;
  unpaidLeaveDays?: number;
  sickLeaveDays?: number;
  annualLeaveTaken?: number;
}

// === PAYROLL RUN INPUT ===

export interface PayrollRunInput {
  period: PayrollPeriod;
  countryPack: CountryPackDef;
  employees: EmployeePayrollInput[];
  /** Statutory scheme codes whose employee share the company pays on the employee's behalf
   *  (e.g. ['CDAC','SDL']). The amount moves from the employee's deductions to employer cost. */
  absorbedSchemes?: string[];
}

// === PIPELINE STAGES ===

export enum PipelineStage {
  PRORATION = 'proration',
  SALARY_COMPONENTS = 'salary_components',
  STATUTORY = 'statutory',
  TAX = 'tax',
  LEAVE = 'leave',
  DEDUCTIONS = 'deductions',
  NET_PAY = 'net_pay',
  JOURNALS = 'journals',
}

// === PIPELINE CONTEXT ===

export interface PipelineContext {
  period: PayrollPeriod;
  countryPack: CountryPackDef;
  employee: EmployeePayrollInput;
  absorbedSchemes: string[];
  ytdValues: Record<string, number>;
  earnings: { componentCode: string; amount: number }[];
  deductions: { componentCode: string; amount: number }[];
  employerCosts: { componentCode: string; amount: number }[];
  ordinaryWages: number;
  additionalWages: number;
  grossPay: number;
  prorationFactor: number;
  steps: CalculationStep[];
  trace: CalculationTrace;
}

// === RESULTS ===

export interface StatutoryContributionItem {
  componentCode: string;
  amount: number;
  rate: number;
  wageBase: number;
  ceilingApplied: number | null;
  steps?: CalculationStep[];
}

export interface StatutoryContributionResult {
  schemeCode: string;
  schemeName: string;
  employeeTotal: number;
  employerTotal: number;
  total: number;
  /** True when the company pays the employee share on the employee's behalf. */
  absorbedByEmployer?: boolean;
  employeeBreakdown: StatutoryContributionItem[];
  employerBreakdown: StatutoryContributionItem[];
  steps?: CalculationStep[];
}

export interface TaxResult {
  grossPay: number;
  taxableIncome: number;
  taxWithheld: number;
  effectiveRate: number;
  bracketsApplied: {
    min: number;
    max: number | null;
    rate: number;
    taxable: number;
    tax: number;
  }[];
  nonResident: boolean;
  steps?: CalculationStep[];
}

export interface LeaveResult {
  annualLeaveEntitlement: number;
  annualLeaveTaken: number;
  annualLeaveBalance: number;
  sickLeaveEntitlement: number;
  sickLeaveTaken: number;
  sickLeaveBalance: number;
  unpaidLeaveDays: number;
  maternityLeaveEntitlement?: number;
  paternityLeaveEntitlement?: number;
  steps?: CalculationStep[];
}

// === JOURNAL ENTRY ===

export interface JournalLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  costCenter?: string;
  description: string;
}

export interface JournalEntry {
  entryId: string;
  entryDate: string;
  description: string;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
}

// === EMPLOYEE PAYROLL RESULT ===

export interface EmployeePayrollResult {
  employeeId: string;
  name: string;
  earnings: { componentCode: string; amount: number }[];
  deductions: { componentCode: string; amount: number }[];
  employerCosts: { componentCode: string; amount: number }[];
  grossPay: number;
  totalDeductions: number;
  totalEmployerCosts: number;
  netPay: number;
  statutoryContributions: StatutoryContributionResult[];
  tax: TaxResult;
  leave: LeaveResult;
  journals?: JournalEntry[];
  trace?: CalculationTrace;
  status: 'success' | 'error';
  errors?: string[];
}

export interface PayrollRunSummary {
  totalEmployees: number;
  totalGrossPay: number;
  totalDeductions: number;
  totalEmployerCosts: number;
  totalNetPay: number;
  totalStatutoryEmployee: number;
  totalStatutoryEmployer: number;
}

export interface PayrollRunResult {
  period: PayrollPeriod;
  employees: EmployeePayrollResult[];
  summary: PayrollRunSummary;
  trace?: CalculationTrace;
  status: 'complete' | 'partial' | 'failed';
  errors?: string[];
}

// === INTERNAL CALCULATION CONTEXT ===

export interface CalculationContext {
  period: PayrollPeriod;
  countryPack: CountryPackDef;
  employee: EmployeePayrollInput;
  ytd: Record<string, number>;
}

export interface SchemeRateMatch {
  row: StatutorySchemeDef['rateTables'][number];
  employeeCategory: string;
  ageAtPeriod: number;
}
