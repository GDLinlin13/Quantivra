export interface Company {
  id: number;
  name: string;
  company_code: string;
  country: string;
  currency: string;
  financial_year_start: string;
  timezone: string;
  modules: string[];
  logo_url?: string;
  is_active: boolean;
  created_at: string;
}

export interface User {
  id: number;
  company_id?: number;
  username: string;
  email: string;
  full_name: string;
  roles: string[];
  is_super_admin: boolean;
  is_active: boolean;
  created_at: string;
}

export interface CountryPack {
  id: number;
  country: string;
  version: string;
  effective_from: string;
  effective_to: string | null;
  config: CountryPackConfig;
  is_active: boolean;
  created_at: string;
}

export interface CountryPackConfig {
  statutory_deductions: StatutoryDeductionDef[];
  tax_brackets: TaxBracket[];
  employment_rules: EmploymentRules;
  public_holidays: string[];
  leave_minimums: LeaveMinimum[];
  payroll_frequencies: string[];
  overtime_rules: OvertimeRule[];
  currency: string;
}

export interface StatutoryDeductionDef {
  name: string;
  employee_rate: number;
  employer_rate: number;
  cap_amount: number | null;
  annual_cap: number | null;
  age_brackets?: AgeBracket[];
  formula_type: 'percentage' | 'bracket' | 'fixed' | 'percentage_minmax';
  min_amount?: number;
  max_amount?: number;
}

export interface AgeBracket {
  max_age: number | null;
  employee_rate: number;
  employer_rate: number;
}

export interface TaxBracket {
  min: number;
  max: number | null;
  rate: number;
  fixed: number;
}

export interface EmploymentRules {
  max_weekly_hours: number;
  probation_months: number;
  notice_period_days: number;
  termination_rules: string;
}

export interface LeaveMinimum {
  name: string;
  min_days: number;
}

export interface OvertimeRule {
  rate_multiplier: number;
  threshold_hours: number;
  description: string;
}

export interface Role {
  id: number;
  company_id: number;
  name: string;
  permissions: string[];
  is_system: boolean;
  created_at: string;
}

export interface AuditLog {
  id: number;
  company_id?: number;
  user_id: number;
  action: string;
  entity_type: string;
  entity_id: string;
  old_value?: any;
  new_value?: any;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface WorkflowTemplate {
  id: number;
  company_id: number;
  name: string;
  entity_type: string;
  steps: WorkflowStep[];
  is_active: boolean;
}

export interface WorkflowStep {
  step_order: number;
  assignee_role: string;
  action: 'approve' | 'review' | 'verify';
  timeout_days?: number;
}

export interface ConfigSetting {
  id: number;
  company_id: number;
  category: string;
  key: string;
  value: any;
  created_at: string;
}

export interface Notification {
  id: number;
  company_id: number;
  user_id: number;
  title: string;
  body: string;
  type: 'email' | 'in_app' | 'push';
  read: boolean;
  created_at: string;
}

export interface FileRecord {
  id: number;
  company_id: number;
  name: string;
  url: string;
  category: string;
  size: number;
  mime_type: string;
  created_at: string;
}

export type ModuleAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export' | 'print' | 'void';

export const MODULES = {
  platform: { label: 'Platform', features: ['companies', 'users', 'audit', 'settings'] },
  company: { label: 'Company', features: ['profile', 'modules', 'branding'] },
  employees: { label: 'Employees', features: ['records', 'documents', 'reports'] },
  leave: { label: 'Leave', features: ['requests', 'calendar', 'reports'] },
  attendance: { label: 'Attendance', features: ['clock', 'logs', 'reports'] },
  claims: { label: 'Claims', features: ['requests', 'payments', 'categories'] },
  payroll: { label: 'Payroll', features: ['run', 'payslips', 'reports', 'components'] },
  finance: { label: 'Finance', features: ['invoices', 'payments', 'banking', 'journal', 'reports'] },
  inventory: { label: 'Catalog', features: ['items', 'movements', 'adjustments'] },
  crm: { label: 'CRM', features: ['leads', 'customers', 'deals'] },
  projects: { label: 'Projects', features: ['tasks', 'milestones', 'timesheets'] },
  users: { label: 'Users', features: ['manage', 'roles', 'permissions'] },
  workflow: { label: 'Workflow', features: ['templates', 'instances'] },
  settings: { label: 'Settings', features: ['general', 'leave', 'payroll', 'approvals'] },
};

// ============================================================
// Normalized Statutory Schema Types (Phase 2A)
// ============================================================

export interface SalaryComponent {
  id: number;
  code: string;
  name: string;
  type: 'earning' | 'deduction' | 'employer_cost';
  category?: string;
  default_taxable: boolean;
  description?: string;
  display_order: number;
  active: boolean;
}

export interface CountryRegion {
  id: number;
  country_code: string;
  code: string;
  name: string;
  type: string;
}

export interface CountrySchemeVersion {
  id: number;
  scheme_id: number;
  version: string;
  status: 'draft' | 'published' | 'superseded';
  effective_from: string;
  effective_to?: string;
  notes?: string;
}

export interface CountrySchemeRate {
  id: number;
  scheme_version_id: number;
  rate_type: 'flat_percentage' | 'wage_band' | 'progressive_table' | 'tiered';
  employee_rate?: number;
  employer_rate?: number;
  wage_min?: number;
  wage_max?: number;
  display_order: number;
}

export interface CountrySchemeThreshold {
  id: number;
  scheme_version_id: number;
  threshold_type: 'lower' | 'primary' | 'upper' | 'secondary' | 'qualifying';
  amount: number;
  frequency: 'monthly' | 'weekly' | 'annual' | 'fortnightly';
  description?: string;
}

export interface CountrySchemeCap {
  id: number;
  scheme_version_id: number;
  cap_type: 'ordinary_wage' | 'additional_wage' | 'annual_contribution' | 'earnings_ceiling' | 'contribution_base' | 'pensionable_salary';
  amount?: number;
  formula_ref?: string;
  frequency: 'monthly' | 'weekly' | 'annual' | 'fortnightly';
  description?: string;
}

export interface CountrySchemeSalaryComponent {
  id: number;
  scheme_version_id: number;
  salary_component_id: number;
  included: boolean;
  calculation_type: 'full' | 'additional' | 'partial' | 'excluded';
  priority: number;
  effective_date?: string;
  expiry_date?: string;
}

export interface CountrySchemeFormula {
  id: number;
  scheme_version_id: number;
  formula_code: string;
  formula_name: string;
  formula_type: 'ceiling' | 'threshold' | 'age_band' | 'proration' | 'aggregation' | 'custom';
  expression: string;
  description?: string;
  priority: number;
  effective_date?: string;
  expiry_date?: string;
}

export interface CountrySchemeRounding {
  id: number;
  scheme_version_id: number;
  field: string;
  method: 'round' | 'ceil' | 'floor' | 'truncate';
  decimals: number;
  description?: string;
}

export interface CountrySchemeEligibility {
  id: number;
  scheme_version_id: number;
  employee_category?: string;
  age_min?: number;
  age_max?: number;
  residency_rule?: string;
  earnings_threshold?: number;
}

export interface CountrySchemeGovernmentForm {
  id: number;
  scheme_version_id: number;
  name: string;
  frequency: string;
  deadline: string;
  submission_method: 'online' | 'file_upload' | 'api' | 'postal';
}

export interface CountrySchemeValidation {
  id: number;
  scheme_version_id: number;
  rule_code: string;
  rule_name: string;
  validation_type: 'range' | 'required' | 'format' | 'dependency' | 'cross_field';
  expression: string;
  error_message?: string;
  severity: 'error' | 'warning' | 'info';
}

export interface CountrySchemeCompliance {
  id: number;
  scheme_version_id: number;
  name: string;
  frequency: string;
  deadline: string;
  responsible_role?: string;
  penalty?: string;
}

export interface CountrySchemeRule {
  id: number;
  scheme_version_id: number;
  rule_type: 'ceiling' | 'threshold' | 'formula';
  name: string;
  value_type: 'fixed_amount' | 'formula' | 'percentage';
  value?: number;
  formula_ref?: string;
  frequency?: string;
  description?: string;
  display_order: number;
}

export interface ImmigrationStatus {
  id: number;
  version_id: number;
  code: string;
  name: string;
  is_active: boolean;
}

export interface EmploymentStatus {
  id: number;
  version_id: number;
  code: string;
  name: string;
  enabled: boolean;
}

export interface EmploymentRule {
  id: number;
  version_id: number;
  rule_key: string;
  rule_value: string;
  editable_by_company: boolean;
  reference_only: boolean;
  description?: string;
}

export interface NoticePeriod {
  id: number;
  version_id: number;
  min_service_months: number;
  max_service_months?: number;
  notice_days: number;
  description?: string;
}

export interface CompanyDefaultSetting {
  id: number;
  company_id: number;
  setting_key: string;
  setting_value: string;
}
