// ============================================================
// UNIVERSAL COUNTRY PACK SCHEMA
// Every country pack and every statutory scheme follows this
// shape, regardless of country or scheme type.
// ============================================================

// === SHARED REFERENCE DATA ===

export interface SalaryComponentDef {
  code: string;
  name: string;
  type: 'earning' | 'deduction' | 'employer_cost';
  category: string;
  defaultTaxable: boolean;
  displayOrder: number;
}

export interface EmploymentStatusDef {
  code: string;
  name: string;
  enabled: boolean;
}

export interface ImmigrationStatusDef {
  code: string;
  name: string;
}

// === EMPLOYMENT ===

export interface NoticePeriodDef {
  minServiceMonths: number;
  maxServiceMonths: number | null;
  noticeDays: number;
  description: string;
}

export interface EmploymentDef {
  statuses: EmploymentStatusDef[];
  immigrationStatuses: ImmigrationStatusDef[];
  rules: EmploymentRuleDef[];
  noticePeriods: NoticePeriodDef[];
}

export interface EmploymentRuleDef {
  key: string;
  value: string;
  editableByCompany: boolean;
  referenceOnly: boolean;
  description: string;
}

// === PAYROLL ===

export interface PayrollDef {
  frequencies: string[];
  minimumWage: number;
  payrollCutoff: string;
  payrollLockDate: string;
  thirteenthMonth: string;
  bankFileFormat: string;
}

// === TAX ===

export interface TaxBracketDef {
  min: number;
  max: number | null;
  rate: number;
  fixed: number;
}

export interface TaxDef {
  brackets: TaxBracketDef[];
  residentRules: string;
  /** Bracket/flat rates are expressed as percentages (e.g. 14 for 14%). */
  nonResidentRate?: number;
  filingFrequency: string;
  formTypes: string[];
  /**
   * How employment income tax is withheld each payroll run:
   *  - "monthly": annualise the period's taxable pay, apply the brackets, divide back (PAYE-style)
   *  - "none": no withholding at payroll time (e.g. Singapore residents, UAE, Saudi Arabia)
   */
  withholding?: 'monthly' | 'none';
}

// === ACCOUNTING ===

export interface TaxCodeDef {
  code: string;
  name: string;
  rate: number;
  isDefault: boolean;
}

export interface AccountingDef {
  fiscalYearStart: string;
  defaultTaxCode: string;
  invoiceNumberFormat: string;
  paymentTerms: string;
  taxCodes: TaxCodeDef[];
}

// === PUBLIC HOLIDAYS ===

export interface PublicHolidayDef {
  name: string;
  date?: string;
  type: 'fixed' | 'floating' | 'calculated';
  recurring: boolean;
  calculationRule?: string;
  observedRule?: string;
  region?: string;
}

// === GOVERNMENT FORMS ===

export interface GovernmentFormDef {
  name: string;
  agency: string;
  frequency: string;
  deadline: string;
}

// === STATUTORY SCHEME (UNIVERSAL) ===
// Every scheme — CPF, EPF, MPF, Super, NI, CPP, EI, SOCSO, EIS, PCB, SDL, SHG —
// uses exactly this shape. Fields not applicable to a scheme are left empty/null.

export interface StatutorySchemeGeneralDef {
  code: string;
  name: string;
  description: string;
  agency: string;
  type: string;
  version: string;
  effectiveDate: string;
  expiryDate?: string;
  status: 'draft' | 'published' | 'superseded';
}

export interface StatutorySchemeEligibilityDef {
  citizenship?: string[];
  visaTypes?: string[];
  employmentTypes?: string[];
  /** If set, the employee's ethnicity must be one of these (e.g. SG self-help groups). */
  ethnicities?: string[];
  minimumAge?: number;
  maximumAge?: number;
  minimumServiceMonths?: number;
  minimumSalary?: number;
  maximumSalary?: number;
  excludedCategories?: string[];
  notes?: string;
}

export interface StatutorySchemeEmployeeCategoryDef {
  code: string;
  name: string;
  immigrationStatusCode?: string;
  prStage?: string;
}

export interface StatutorySchemeRateRowDef {
  effectiveDate: string;
  expiryDate?: string;
  employeeCategory?: string;
  ageFrom?: number;
  ageTo?: number | null;
  employeeRate: number;
  employerRate: number;
  wageMin?: number;
  wageMax?: number | null;
  /** Flat monthly dollar amount (e.g. SG self-help groups). When set, overrides the % rate. */
  fixedEmployeeAmount?: number;
  fixedEmployerAmount?: number;
}

export interface StatutorySchemeThresholdDef {
  code: string;
  name: string;
  type: 'minimum_earnings' | 'lower' | 'upper' | 'qualifying_earnings' | 'relevant_income';
  value: number;
  currency: string;
  frequency?: 'monthly' | 'annual' | 'weekly' | 'fortnightly';
}

export interface StatutorySchemeCapDef {
  code: string;
  name: string;
  type: 'monthly_ceiling' | 'annual_ceiling' | 'contribution_ceiling' | 'insurable_wage' | 'maximum_pensionable_earnings';
  value?: number;
  formula?: string;
  currency: string;
}

export interface StatutorySchemeSalaryComponentDef {
  componentCode: string;
  classification: 'ordinary_wage' | 'additional_wage' | 'excluded';
  included: boolean;
  notes?: string;
}

export interface StatutorySchemeCalcRuleDef {
  code: string;
  name: string;
  priority: number;
  condition?: string;
  action: string;
  parameters?: Record<string, unknown>;
  description: string;
}

export interface StatutorySchemeRoundingDef {
  employee: { method: 'round' | 'ceil' | 'floor' | 'truncate'; decimals: number };
  employer: { method: 'round' | 'ceil' | 'floor' | 'truncate'; decimals: number };
}

export interface StatutorySchemeReportingDef {
  agency: string;
  submissionFrequency: string;
  portal?: string;
  fileFormat?: string;
  dueDate: string;
  forms: { name: string; frequency: string; deadline: string }[];
}

export interface StatutorySchemeValidationDef {
  code: string;
  name: string;
  type: 'range' | 'required' | 'dependency' | 'cross_field';
  expression: string;
  errorMessage: string;
  severity: 'error' | 'warning' | 'info';
}

export interface StatutorySchemeDef {
  general: StatutorySchemeGeneralDef;
  eligibility: StatutorySchemeEligibilityDef;
  employeeCategories: StatutorySchemeEmployeeCategoryDef[];
  rateTables: StatutorySchemeRateRowDef[];
  thresholds: StatutorySchemeThresholdDef[];
  caps: StatutorySchemeCapDef[];
  salaryComponents: StatutorySchemeSalaryComponentDef[];
  calculationRules: StatutorySchemeCalcRuleDef[];
  rounding: StatutorySchemeRoundingDef;
  reporting: StatutorySchemeReportingDef;
  validations: StatutorySchemeValidationDef[];
}

// === COUNTRY PACK ===

export interface CountryPackDef {
  general: {
    name: string;
    code: string;
    currency: string;
    currencySymbol: string;
    phoneCode: string;
    timezone: string;
    primaryLanguage: string;
    secondaryLanguage?: string;
    dateFormat: string;
    timeFormat: string;
    weekStartsOn: string;
    financialYear: string;
    taxYear: string;
    defaultPayrollFrequency: string;
  };
  employment: EmploymentDef;
  payroll: PayrollDef;
  tax: TaxDef;
  accounting: AccountingDef;
  publicHolidays: PublicHolidayDef[];
  governmentForms: GovernmentFormDef[];
  statutorySchemes: Record<string, StatutorySchemeDef>;
  documentNumbering: { entity: string; format: string }[];
  workflowTemplates: { name: string; entityType: string; steps: { stepOrder: number; assigneeRole: string; action: string }[] }[];
  dashboardWidgets: string[];
}
