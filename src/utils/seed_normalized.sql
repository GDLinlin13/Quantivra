-- ============================================================
-- SEED NORMALIZED STATUTORY SCHEMA DATA
-- Run AFTER migration.sql completes successfully
-- ============================================================

-- Ensure migrated tables have all expected columns (safe to re-run)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'country_employee_categories' AND column_name = 'cpf_treatment') THEN
    ALTER TABLE country_employee_categories RENAME COLUMN cpf_treatment TO statutory_treatment;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'country_employee_categories' AND column_name = 'statutory_treatment') THEN
    ALTER TABLE country_employee_categories ADD COLUMN statutory_treatment TEXT NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'country_scheme_employee_categories' AND column_name = 'immigration_status_id') THEN
    ALTER TABLE country_scheme_employee_categories ADD COLUMN immigration_status_id BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'country_scheme_employee_categories' AND column_name = 'pr_stage') THEN
    ALTER TABLE country_scheme_employee_categories ADD COLUMN pr_stage TEXT;
  END IF;
END $$;

-- ============================================================
-- SINGAPORE
-- ============================================================

DO $$
DECLARE
  v_pack_id BIGINT;
  v_scheme_cpf BIGINT;
  v_scheme_sdl BIGINT;
  v_scheme_shg BIGINT;
  v_ver_cpf BIGINT;
  v_ver_sdl BIGINT;
  v_ver_shg BIGINT;
  v_imm_sc BIGINT;
  v_imm_pr BIGINT;
  v_imm_ep BIGINT;
  v_imm_sp BIGINT;
  v_imm_wp BIGINT;
  v_imm_dp BIGINT;
  v_imm_ltvp BIGINT;
BEGIN
  -- Get the SG country pack version
  SELECT id INTO v_pack_id FROM country_pack_versions WHERE country_code = 'SG' AND version = '2026' LIMIT 1;

  -- ============================================================
  -- EMPLOYMENT TYPES
  -- ============================================================
  INSERT INTO country_employment_types (version_id, name, enabled) VALUES
    (v_pack_id, 'Full-Time', true),
    (v_pack_id, 'Part-Time', true),
    (v_pack_id, 'Temporary', true),
    (v_pack_id, 'Contract', true),
    (v_pack_id, 'Internship', true),
    (v_pack_id, 'Casual', true);

  -- ============================================================
  -- EMPLOYEE CATEGORIES
  -- ============================================================
  INSERT INTO country_employee_categories (version_id, name, statutory_treatment) VALUES
    (v_pack_id, 'Singapore Citizen', 'Full CPF'),
    (v_pack_id, 'Singapore PR (Year 1)', 'Graduated'),
    (v_pack_id, 'Singapore PR (Year 2)', 'Graduated'),
    (v_pack_id, 'Singapore PR (Year 3+)', 'Full CPF'),
    (v_pack_id, 'Employment Pass', 'No CPF'),
    (v_pack_id, 'S Pass', 'No CPF'),
    (v_pack_id, 'Work Permit', 'No CPF'),
    (v_pack_id, 'Dependant Pass', 'No CPF');

  -- ============================================================
  -- IMMIGRATION STATUSES (separate from employment)
  -- ============================================================
  INSERT INTO immigration_statuses (version_id, code, name) VALUES
    (v_pack_id, 'SC', 'Singapore Citizen');
  SELECT lastval() INTO v_imm_sc;
  INSERT INTO immigration_statuses (version_id, code, name) VALUES
    (v_pack_id, 'PR', 'Singapore Permanent Resident');
  SELECT lastval() INTO v_imm_pr;
  INSERT INTO immigration_statuses (version_id, code, name) VALUES
    (v_pack_id, 'EP', 'Employment Pass');
  SELECT lastval() INTO v_imm_ep;
  INSERT INTO immigration_statuses (version_id, code, name) VALUES
    (v_pack_id, 'SP', 'S Pass');
  SELECT lastval() INTO v_imm_sp;
  INSERT INTO immigration_statuses (version_id, code, name) VALUES
    (v_pack_id, 'WP', 'Work Permit');
  SELECT lastval() INTO v_imm_wp;
  INSERT INTO immigration_statuses (version_id, code, name) VALUES
    (v_pack_id, 'DP', 'Dependant Pass');
  SELECT lastval() INTO v_imm_dp;
  INSERT INTO immigration_statuses (version_id, code, name) VALUES
    (v_pack_id, 'LTVP', 'Long-Term Visit Pass');
  SELECT lastval() INTO v_imm_ltvp;

  -- ============================================================
  -- EMPLOYMENT STATUSES
  -- ============================================================
  INSERT INTO employment_statuses (version_id, code, name, enabled) VALUES
    (v_pack_id, 'PERMANENT', 'Permanent', true),
    (v_pack_id, 'FULL_TIME', 'Full-Time', true),
    (v_pack_id, 'PART_TIME', 'Part-Time', true),
    (v_pack_id, 'FIXED_TERM', 'Fixed-Term', true),
    (v_pack_id, 'TEMPORARY', 'Temporary', true),
    (v_pack_id, 'CASUAL', 'Casual', true),
    (v_pack_id, 'INTERNSHIP', 'Internship', true);

  -- ============================================================
  -- EMPLOYMENT RULES
  -- ============================================================
  INSERT INTO employment_rules (version_id, rule_key, rule_value, editable_by_company, reference_only, description) VALUES
    (v_pack_id, 'standard_weekly_hours', '44', true, false, 'Maximum standard working hours per week before overtime applies'),
    (v_pack_id, 'minimum_rest_day', '1 per week', false, false, 'Minimum statutory rest day entitlement'),
    (v_pack_id, 'default_probation_months', '3', true, false, 'Default probation period; company may override per employee'),
    (v_pack_id, 'retirement_age', '63', false, true, 'Statutory retirement age — reference only, does not block employment'),
    (v_pack_id, 're_employment_age', '68', false, true, 'Statutory re-employment age — reference only'),
    (v_pack_id, 'overtime_multiplier', '1.5', false, false, 'Statutory minimum overtime pay rate'),
    (v_pack_id, 'public_holiday_entitlement', 'Statutory', false, false, 'Public holiday rules per Employment Act');

  -- ============================================================
  -- NOTICE PERIODS (statutory defaults when contract is silent)
  -- ============================================================
  INSERT INTO notice_periods (version_id, min_service_months, max_service_months, notice_days, description) VALUES
    (v_pack_id, 0, 6, 1, 'Less than 26 weeks of service'),
    (v_pack_id, 6, 24, 7, '26 weeks to less than 2 years'),
    (v_pack_id, 24, 60, 14, '2 years to less than 5 years'),
    (v_pack_id, 60, null, 28, '5 years or more');

  -- ============================================================
  -- PAYROLL COMPONENTS
  -- ============================================================
  INSERT INTO country_payroll_components (version_id, component_type, name, is_taxable, is_mandatory) VALUES
    (v_pack_id, 'earning', 'Basic Salary', true, false),
    (v_pack_id, 'earning', 'Overtime', true, false),
    (v_pack_id, 'earning', 'Bonus', true, false),
    (v_pack_id, 'earning', 'Commission', true, false),
    (v_pack_id, 'earning', 'Allowance', true, false),
    (v_pack_id, 'earning', 'Transport Allowance', true, false),
    (v_pack_id, 'earning', 'Meal Allowance', true, false),
    (v_pack_id, 'earning', 'Mobile Allowance', true, false),
    (v_pack_id, 'earning', 'Housing Allowance', true, false),
    (v_pack_id, 'earning', 'Shift Allowance', true, false),
    (v_pack_id, 'earning', 'Night Shift Allowance', true, false),
    (v_pack_id, 'earning', 'Attendance Incentive', true, false),
    (v_pack_id, 'earning', 'AWS (13th Month)', true, false),
    (v_pack_id, 'earning', 'Back Pay', true, false),
    (v_pack_id, 'earning', 'Leave Encashment', true, false),
    (v_pack_id, 'deduction', 'CPF Employee', false, true),
    (v_pack_id, 'deduction', 'CPF Employer', false, true),
    (v_pack_id, 'deduction', 'SDL', false, true),
    (v_pack_id, 'deduction', 'SHG', false, false),
    (v_pack_id, 'deduction', 'No Pay Leave', false, false),
    (v_pack_id, 'deduction', 'Loan', false, false),
    (v_pack_id, 'deduction', 'Salary Advance', false, false),
    (v_pack_id, 'deduction', 'Income Tax', false, true),
    (v_pack_id, 'deduction', 'Insurance', false, false),
    (v_pack_id, 'deduction', 'Other Deduction', false, false);

  -- ============================================================
  -- STATUTORY LEAVE
  -- ============================================================
  INSERT INTO country_statutory_leave (version_id, name, min_days, carry_forward, encashable) VALUES
    (v_pack_id, 'Annual Leave', 14, 7, true),
    (v_pack_id, 'Sick Leave', 14, 0, false),
    (v_pack_id, 'Hospitalization Leave', 60, 0, false),
    -- working days (5 per week): 16 / 4 / 10 weeks
    (v_pack_id, 'Maternity Leave', 80, 0, false),
    (v_pack_id, 'Paternity Leave', 20, 0, false),
    (v_pack_id, 'Shared Parental Leave', 50, 0, false),
    (v_pack_id, 'Childcare Leave', 6, 0, false),
    (v_pack_id, 'Unpaid Leave', 0, 0, false);

  -- ============================================================
  -- PUBLIC HOLIDAYS
  -- ============================================================
  INSERT INTO country_public_holidays (version_id, name, recurring) VALUES
    (v_pack_id, 'New Year''s Day', true),
    (v_pack_id, 'Chinese New Year (2 days)', true),
    (v_pack_id, 'Good Friday', true),
    (v_pack_id, 'Hari Raya Puasa', true),
    (v_pack_id, 'Hari Raya Haji', true),
    (v_pack_id, 'Labour Day', true),
    (v_pack_id, 'Vesak Day', true),
    (v_pack_id, 'National Day', true),
    (v_pack_id, 'Deepavali', true),
    (v_pack_id, 'Christmas Day', true);

  -- ============================================================
  -- GOVERMENT FORMS
  -- ============================================================
  INSERT INTO country_government_forms (version_id, name, frequency, deadline) VALUES
    (v_pack_id, 'IR8A', 'Annual', '1 Mar'),
    (v_pack_id, 'IR8S', 'Annual', '1 Mar'),
    (v_pack_id, 'Appendix 8A', 'Annual', '1 Mar'),
    (v_pack_id, 'Appendix 8B', 'Annual', '1 Mar'),
    (v_pack_id, 'IR21', 'As required', 'Within 30 days'),
    (v_pack_id, 'CPF Statement', 'Monthly', '14th of month'),
    (v_pack_id, 'ECF', 'Annual', '15 Apr');

  -- ============================================================
  -- TAX CODES
  -- ============================================================
  INSERT INTO country_tax_codes (version_id, code, name, rate, is_default) VALUES
    (v_pack_id, 'SR', 'Standard Rated', 9, true),
    (v_pack_id, 'ZR', 'Zero Rated', 0, false),
    (v_pack_id, 'ES33', 'Exempt', 0, false),
    (v_pack_id, 'TX', 'Out of Scope', 0, false);

  -- ============================================================
  -- TAX BRACKETS
  -- ============================================================
  INSERT INTO country_tax_brackets (version_id, min_income, max_income, rate, fixed_amount) VALUES
    (v_pack_id, 0, 20000, 0, 0),
    (v_pack_id, 20000, 30000, 2, 0),
    (v_pack_id, 30000, 40000, 3.5, 200),
    (v_pack_id, 40000, 80000, 7, 550),
    (v_pack_id, 80000, 120000, 11.5, 3350),
    (v_pack_id, 120000, 200000, 15, 7950),
    (v_pack_id, 200000, 320000, 18, 19950),
    (v_pack_id, 320000, null, 24, 41550);

  -- ============================================================
  -- DOCUMENT NUMBERING
  -- ============================================================
  INSERT INTO country_document_numbering (version_id, entity, format) VALUES
    (v_pack_id, 'employee', 'EMP-{000001}'),
    (v_pack_id, 'payroll', 'PAY-{YYYYMM}-{000001}'),
    (v_pack_id, 'invoice', 'INV-{YYYY}-{000001}'),
    (v_pack_id, 'purchase_order', 'PO-{YYYY}-{000001}'),
    (v_pack_id, 'claim', 'CLM-{YYYY}-{000001}'),
    (v_pack_id, 'leave', 'LV-{YYYY}-{000001}');

  -- ============================================================
  -- WORKFLOW TEMPLATES
  -- ============================================================
  INSERT INTO country_workflow_templates (version_id, name, entity_type) VALUES
    (v_pack_id, 'Leave Approval', 'leave'),
    (v_pack_id, 'Claim Approval', 'claims'),
    (v_pack_id, 'Purchase Order', 'purchase_order');

  -- ============================================================
  -- DASHBOARD WIDGETS
  -- ============================================================
  INSERT INTO country_dashboard_widgets (version_id, name) VALUES
    (v_pack_id, 'CPF Due'),
    (v_pack_id, 'Payroll Due'),
    (v_pack_id, 'IRAS Filing'),
    (v_pack_id, 'Leave Balance'),
    (v_pack_id, 'Pending Claims'),
    (v_pack_id, 'Pending Approvals');

  -- ============================================================
  -- COMPLIANCE ITEMS
  -- ============================================================
  INSERT INTO country_compliance_items (version_id, name, frequency, deadline) VALUES
    (v_pack_id, 'CPF Submission', 'Monthly', '14th of month'),
    (v_pack_id, 'SDL Payment', 'Monthly', '14th of month'),
    (v_pack_id, 'IRAS Filing', 'Annual', '15 Apr'),
    (v_pack_id, 'IR21 Clearance', 'As required', 'Within 30 days'),
    (v_pack_id, 'Payslip Issuance', 'Monthly', 'Within 3 days of payroll'),
    (v_pack_id, 'Employment Contract', 'One-time', 'Before start date'),
    (v_pack_id, 'Foreign Worker Compliance', 'Ongoing', '-');

  -- ============================================================
  -- CPF STATUTORY SCHEME (Normalized)
  -- ============================================================

  INSERT INTO country_statutory_schemes (version_id, name, type, description, employee_rate, employer_rate, min_amount, max_amount, is_mandatory)
  VALUES (v_pack_id, 'Central Provident Fund', 'pension', 'Singapore''s social security savings scheme. Covers retirement, healthcare, and housing.', 20, 17, 0, 6800, true)
  RETURNING id INTO v_scheme_cpf;

  INSERT INTO country_statutory_schemes (version_id, name, type, description, employee_rate, employer_rate, min_amount, max_amount, is_mandatory)
  VALUES (v_pack_id, 'Skills Development Levy', 'training', 'Levy to fund skills development and training programs.', 0, 0.25, 2, 11.25, true)
  RETURNING id INTO v_scheme_sdl;

  INSERT INTO country_statutory_schemes (version_id, name, type, description, employee_rate, employer_rate, min_amount, max_amount, is_mandatory)
  VALUES (v_pack_id, 'Self-Help Group', 'development', 'Voluntary contributions to CDAC, SINDA, MBMF, and ECF community organisations.', 0.5, 0, 0, null, false)
  RETURNING id INTO v_scheme_shg;

  -- Scheme versions
  INSERT INTO country_scheme_versions (scheme_id, version, status, effective_from, notes)
  VALUES (v_scheme_cpf, '2026.1', 'published', '2026-01-01', 'FY2026 CPF rates. OW ceiling S$8,000, AW ceiling S$102,000 annual.')
  RETURNING id INTO v_ver_cpf;

  INSERT INTO country_scheme_versions (scheme_id, version, status, effective_from, notes)
  VALUES (v_scheme_sdl, '2026.1', 'published', '2026-01-01', 'SDL rates unchanged. Min S$2, max S$11.25 per employee per month.')
  RETURNING id INTO v_ver_sdl;

  INSERT INTO country_scheme_versions (scheme_id, version, status, effective_from, notes)
  VALUES (v_scheme_shg, '2026.1', 'published', '2026-01-01', 'SHG rates unchanged. Income-banded contributions.')
  RETURNING id INTO v_ver_shg;

  -- CPF Age bands
  INSERT INTO country_scheme_age_bands (scheme_version_id, min_age, max_age, employee_rate, employer_rate, label) VALUES
    (v_ver_cpf, 0, 55, 20, 17, '≤55'),
    (v_ver_cpf, 55, 60, 16, 15, '>55–60'),
    (v_ver_cpf, 60, 65, 10.5, 11.5, '>60–65'),
    (v_ver_cpf, 65, 70, 7.5, 8.5, '>65–70'),
    (v_ver_cpf, 70, null, 5, 7.5, '>70');

  -- CPF Rates
  INSERT INTO country_scheme_rates (scheme_version_id, rate_type, employee_rate, employer_rate, wage_min, wage_max, display_order) VALUES
    (v_ver_cpf, 'flat_percentage', 20, 17, 0, 8000, 1);

  -- CPF Rules (ceilings & thresholds)
  INSERT INTO country_scheme_rules (scheme_version_id, rule_type, name, value_type, value, formula_ref, frequency, description, display_order) VALUES
    (v_ver_cpf, 'ceiling', 'Ordinary Wage Ceiling', 'fixed_amount', 8000, null, 'monthly', 'Maximum monthly ordinary wages subject to CPF', 1),
    (v_ver_cpf, 'ceiling', 'Annual CPF Ceiling', 'fixed_amount', 102000, null, 'annual', 'Maximum total CPF-attracting wages in a year', 2),
    (v_ver_cpf, 'formula', 'Additional Wage Ceiling', 'formula', null, 'AnnualCPFCeiling - YTDOrdinaryWages', 'annual', 'Annual CPF Ceiling minus year-to-date CPF-attracting Ordinary Wages', 3);

  -- CPF Formulas
  INSERT INTO country_scheme_formulas (scheme_version_id, formula_code, formula_name, formula_type, expression, description, priority) VALUES
    (v_ver_cpf, 'CPF_AW_CEILING', 'Additional Wage Ceiling', 'ceiling', 'MAX(0, AnnualCeiling - YTD_OrdinaryWages)', 'Additional Wage subject to CPF = Annual ceiling minus year-to-date Ordinary Wages that have been subject to CPF.', 1),
    (v_ver_cpf, 'CPF_OW_CALC', 'Ordinary Wage CPF', 'proration', 'MIN(OrdinaryWage, OWCeiling) * Rate', 'CPF on Ordinary Wage = lesser of actual wage and OW ceiling, multiplied by applicable age-based rate.', 2);

  -- CPF Employee Categories (linked to immigration status + PR stage)
  INSERT INTO country_scheme_employee_categories (scheme_version_id, name, treatment, display_order, immigration_status_id, pr_stage) VALUES
    (v_ver_cpf, 'Singapore Citizen', 'Full CPF', 1, v_imm_sc, null),
    (v_ver_cpf, 'Singapore PR (Year 1)', 'Graduated', 2, v_imm_pr, 'year_1'),
    (v_ver_cpf, 'Singapore PR (Year 2)', 'Graduated', 3, v_imm_pr, 'year_2'),
    (v_ver_cpf, 'Singapore PR (Year 3+)', 'Full CPF', 4, v_imm_pr, 'year_3_plus'),
    (v_ver_cpf, 'Employment Pass', 'No CPF', 5, v_imm_ep, null),
    (v_ver_cpf, 'S Pass', 'No CPF', 6, v_imm_sp, null),
    (v_ver_cpf, 'Work Permit', 'No CPF', 7, v_imm_wp, null),
    (v_ver_cpf, 'Dependant Pass', 'No CPF', 8, v_imm_dp, null);

  -- CPF Salary Components
  INSERT INTO country_scheme_salary_components (scheme_version_id, salary_component_id, included, calculation_type)
  SELECT v_ver_cpf, id, true, 'full' FROM salary_components WHERE code IN ('BASIC', 'ALLOWANCE_TRANSPORT', 'ALLOWANCE_MEAL', 'ALLOWANCE_MOBILE', 'ALLOWANCE_SHIFT', 'ALLOWANCE_NIGHT', 'ALLOWANCE_ATTENDANCE', 'ALLOWANCE_HOUSING');
  INSERT INTO country_scheme_salary_components (scheme_version_id, salary_component_id, included, calculation_type)
  SELECT v_ver_cpf, id, true, 'additional' FROM salary_components WHERE code IN ('BONUS', 'COMMISSION', 'AWS', 'BACKPAY', 'LEAVE_ENCASHMENT', 'OVERTIME');

  -- CPF Thresholds
  INSERT INTO country_scheme_rules (scheme_version_id, rule_type, name, value_type, value, frequency, description, display_order) VALUES
    (v_ver_cpf, 'threshold', 'Minimum CPF Earnings', 'fixed_amount', 0, 'monthly', 'No minimum earnings threshold for CPF', 4);

  -- CPF Government Forms
  INSERT INTO country_scheme_government_forms (scheme_version_id, name, frequency, deadline, submission_method) VALUES
    (v_ver_cpf, 'CPF Contribution Return', 'Monthly', '14th of following month', 'online'),
    (v_ver_cpf, 'CPF Annual Statement', 'Annual', '31 Jan', 'api');

  -- CPF Validation Rules
  INSERT INTO country_scheme_validations (scheme_version_id, rule_code, rule_name, validation_type, expression, error_message, severity) VALUES
    (v_ver_cpf, 'CPF_OW_LIMIT', 'Ordinary Wage Ceiling Check', 'range', 'OrdinaryWage <= 8000', 'Ordinary wage exceeds CPF ceiling of S$8,000', 'error'),
    (v_ver_cpf, 'CPF_AW_LIMIT', 'Additional Wage Ceiling Check', 'cross_field', '(OW_CPF + AW_CPF) <= 102000', 'Total CPF-attracting wages exceed annual ceiling', 'error'),
    (v_ver_cpf, 'CPF_AGE_RATE', 'Age Rate Applicability', 'dependency', 'EmployeeAge BETWEEN AgeBand.min_age AND AgeBand.max_age', 'No CPF rate defined for employee age', 'error');

  -- CPF Compliance
  INSERT INTO country_scheme_compliance (scheme_version_id, name, frequency, deadline, responsible_role, penalty) VALUES
    (v_ver_cpf, 'CPF Monthly Submission', 'Monthly', '14th of following month', 'Payroll Manager', 'Late payment interest at prevailing rate'),
    (v_ver_cpf, 'CPF Annual Reporting', 'Annual', '31 Jan', 'Finance Manager', null);

  -- CPF Rounding
  INSERT INTO country_scheme_rounding (scheme_version_id, field, method, decimals, description) VALUES
    (v_ver_cpf, 'employee_contribution', 'round', 2, 'Round CPF employee contribution to nearest cent'),
    (v_ver_cpf, 'employer_contribution', 'round', 2, 'Round CPF employer contribution to nearest cent');

  -- ============================================================
  -- SDL SCHEME DETAILS
  -- ============================================================

  INSERT INTO country_scheme_rates (scheme_version_id, rate_type, employee_rate, employer_rate, wage_min, wage_max, display_order) VALUES
    (v_ver_sdl, 'wage_band', 0, 2, 0, 800, 1),
    (v_ver_sdl, 'wage_band', 0, 0.25, 800, null, 2);

  INSERT INTO country_scheme_rules (scheme_version_id, rule_type, name, value_type, value, frequency, description, display_order) VALUES
    (v_ver_sdl, 'ceiling', 'SDL Maximum Levy', 'fixed_amount', 11.25, 'monthly', 'Maximum SDL levy per employee per month', 1),
    (v_ver_sdl, 'threshold', 'SDL Minimum Levy', 'fixed_amount', 2, 'monthly', 'Minimum SDL levy per employee per month', 2);

  -- ============================================================
  -- SHG SCHEME DETAILS
  -- ============================================================

  INSERT INTO country_scheme_rates (scheme_version_id, rate_type, employee_rate, employer_rate, wage_min, wage_max, display_order) VALUES
    (v_ver_shg, 'wage_band', 0, 0, 0, 1000, 1),
    (v_ver_shg, 'wage_band', 0.5, 0, 1000, 2000, 2),
    (v_ver_shg, 'wage_band', 1, 0, 2000, null, 3);

  INSERT INTO country_scheme_employee_categories (scheme_version_id, name, treatment, display_order) VALUES
    (v_ver_shg, 'Chinese Employee', 'CDAC applicable', 1),
    (v_ver_shg, 'Indian Employee', 'SINDA applicable', 2),
    (v_ver_shg, 'Malay Employee', 'MBMF applicable', 3),
    (v_ver_shg, 'Eurasian Employee', 'ECF applicable', 4);

END $$;

-- ============================================================
-- MALAYSIA
-- ============================================================

DO $$
DECLARE
  v_pack_id BIGINT;
  v_scheme_epf BIGINT;
  v_scheme_socso BIGINT;
  v_scheme_eis BIGINT;
  v_scheme_pcb BIGINT;
  v_scheme_hrd BIGINT;
  v_ver_epf BIGINT;
  v_ver_socso BIGINT;
  v_ver_eis BIGINT;
  v_ver_pcb BIGINT;
  v_ver_hrd BIGINT;
  v_imm_my BIGINT;
  v_imm_pr BIGINT;
  v_imm_nc BIGINT;
  v_imm_nce BIGINT;
  v_imm_exp BIGINT;
BEGIN
  SELECT id INTO v_pack_id FROM country_pack_versions WHERE country_code = 'MY' AND version = '2026' LIMIT 1;

  INSERT INTO country_employment_types (version_id, name, enabled) VALUES
    (v_pack_id, 'Full-Time', true), (v_pack_id, 'Part-Time', true),
    (v_pack_id, 'Contract', true), (v_pack_id, 'Temporary', true),
    (v_pack_id, 'Internship', true), (v_pack_id, 'Probation', true),
    (v_pack_id, 'Casual', true);

  INSERT INTO country_employee_categories (version_id, name, statutory_treatment) VALUES
    (v_pack_id, 'Malaysian Citizen', 'EPF Applicable'),
    (v_pack_id, 'Permanent Resident', 'EPF Applicable'),
    (v_pack_id, 'Non-Citizen (EPF Applicable)', 'EPF Subject to Regulations'),
    (v_pack_id, 'Non-Citizen (EPF Not Applicable)', 'No EPF'),
    (v_pack_id, 'Expatriate', 'Depends on EPF Election');

  -- Immigration Statuses
  INSERT INTO immigration_statuses (version_id, code, name) VALUES (v_pack_id, 'MY_MC', 'Malaysian Citizen'); SELECT lastval() INTO v_imm_my;
  INSERT INTO immigration_statuses (version_id, code, name) VALUES (v_pack_id, 'MY_PR', 'Permanent Resident'); SELECT lastval() INTO v_imm_pr;
  INSERT INTO immigration_statuses (version_id, code, name) VALUES (v_pack_id, 'MY_NC', 'Non-Citizen'); SELECT lastval() INTO v_imm_nc;
  INSERT INTO immigration_statuses (version_id, code, name) VALUES (v_pack_id, 'MY_NCE', 'Non-Citizen (Expat)'); SELECT lastval() INTO v_imm_nce;
  INSERT INTO immigration_statuses (version_id, code, name) VALUES (v_pack_id, 'MY_EXP', 'Expatriate'); SELECT lastval() INTO v_imm_exp;

  -- Employment Statuses
  INSERT INTO employment_statuses (version_id, code, name, enabled) VALUES
    (v_pack_id, 'PERMANENT', 'Permanent', true),
    (v_pack_id, 'FULL_TIME', 'Full-Time', true),
    (v_pack_id, 'PART_TIME', 'Part-Time', true),
    (v_pack_id, 'FIXED_TERM', 'Fixed-Term', true),
    (v_pack_id, 'TEMPORARY', 'Temporary', true),
    (v_pack_id, 'CASUAL', 'Casual', true),
    (v_pack_id, 'INTERNSHIP', 'Internship', true);

  -- Employment Rules
  INSERT INTO employment_rules (version_id, rule_key, rule_value, editable_by_company, reference_only, description) VALUES
    (v_pack_id, 'standard_weekly_hours', '48', true, false, 'Maximum standard working hours per week'),
    (v_pack_id, 'minimum_rest_day', '1 per week', false, false, 'Minimum statutory rest day'),
    (v_pack_id, 'default_probation_months', '3', true, false, 'Default probation period'),
    (v_pack_id, 'retirement_age', '60', false, true, 'Statutory retirement age — reference only'),
    (v_pack_id, 'overtime_multiplier', '1.5', false, false, 'Statutory minimum overtime rate'),
    (v_pack_id, 'public_holiday_entitlement', 'Statutory', false, false, '11 paid public holidays per year');

  -- Notice Periods (Employment Act 1955)
  INSERT INTO notice_periods (version_id, min_service_months, max_service_months, notice_days, description) VALUES
    (v_pack_id, 0, 24, 4, 'Less than 2 years of service'),
    (v_pack_id, 24, 60, 8, '2 years to less than 5 years'),
    (v_pack_id, 60, null, 12, '5 years or more');

  INSERT INTO country_payroll_components (version_id, component_type, name, is_taxable, is_mandatory) VALUES
    (v_pack_id, 'earning', 'Basic Salary', true, false),
    (v_pack_id, 'earning', 'Overtime', true, false),
    (v_pack_id, 'earning', 'Commission', true, false),
    (v_pack_id, 'earning', 'Bonus', true, false),
    (v_pack_id, 'earning', 'Allowance', true, false),
    (v_pack_id, 'earning', 'Transport Allowance', true, false),
    (v_pack_id, 'earning', 'Meal Allowance', true, false),
    (v_pack_id, 'earning', 'Housing Allowance', true, false),
    (v_pack_id, 'earning', 'Shift Allowance', true, false),
    (v_pack_id, 'earning', 'Attendance Allowance', true, false),
    (v_pack_id, 'earning', 'Phone Allowance', true, false),
    (v_pack_id, 'earning', 'Travel Allowance', true, false),
    (v_pack_id, 'earning', 'Back Pay', true, false),
    (v_pack_id, 'earning', 'Leave Encashment', true, false),
    (v_pack_id, 'deduction', 'EPF Employee', false, true),
    (v_pack_id, 'deduction', 'EPF Employer', false, true),
    (v_pack_id, 'deduction', 'SOCSO', false, true),
    (v_pack_id, 'deduction', 'EIS', false, true),
    (v_pack_id, 'deduction', 'PCB (Income Tax)', false, true),
    (v_pack_id, 'deduction', 'Zakat', false, false),
    (v_pack_id, 'deduction', 'Salary Advance', false, false),
    (v_pack_id, 'deduction', 'Loan', false, false),
    (v_pack_id, 'deduction', 'Insurance', false, false),
    (v_pack_id, 'deduction', 'Union Fee', false, false),
    (v_pack_id, 'deduction', 'Other Deduction', false, false);

  INSERT INTO country_statutory_leave (version_id, name, min_days, carry_forward, encashable) VALUES
    (v_pack_id, 'Annual Leave', 14, 7, true),
    (v_pack_id, 'Sick Leave', 14, 0, false),
    (v_pack_id, 'Hospitalization Leave', 60, 0, false),
    (v_pack_id, 'Maternity Leave', 98, 0, false),
    (v_pack_id, 'Paternity Leave', 7, 0, false),
    (v_pack_id, 'Public Holiday', 11, 0, false),
    (v_pack_id, 'Unpaid Leave', 0, 0, false);

  INSERT INTO country_public_holidays (version_id, name, recurring) VALUES
    (v_pack_id, 'New Year''s Day', true), (v_pack_id, 'Thaipusam', true),
    (v_pack_id, 'Chinese New Year (2 days)', true), (v_pack_id, 'Hari Raya Puasa (2 days)', true),
    (v_pack_id, 'Hari Raya Haji', true), (v_pack_id, 'Labour Day', true),
    (v_pack_id, 'Wesak Day', true), (v_pack_id, 'Agong''s Birthday', true),
    (v_pack_id, 'Merdeka Day (31 Aug)', true), (v_pack_id, 'Malaysia Day (16 Sep)', true),
    (v_pack_id, 'Deepavali', true), (v_pack_id, 'Christmas Day', true);

  INSERT INTO country_government_forms (version_id, name, frequency, deadline) VALUES
    (v_pack_id, 'EA Form', 'Annual', '28 Feb'), (v_pack_id, 'E Form', 'Annual', '31 Mar'),
    (v_pack_id, 'CP22/CP22A', 'As required', 'Within 30 days'),
    (v_pack_id, 'CP39', 'Monthly', '10th of month'),
    (v_pack_id, 'EPF Monthly Statement', 'Monthly', '15th of month'),
    (v_pack_id, 'SOCSO Monthly Return', 'Monthly', '15th of month'),
    (v_pack_id, 'EIS Monthly Return', 'Monthly', '15th of month');

  INSERT INTO country_tax_codes (version_id, code, name, rate, is_default) VALUES
    (v_pack_id, 'SR', 'Standard Rated (SST)', 8, true),
    (v_pack_id, 'ZR', 'Zero Rated', 0, false),
    (v_pack_id, 'EX', 'Exempt', 0, false),
    (v_pack_id, 'OS', 'Out of Scope', 0, false),
    (v_pack_id, 'IS', 'Imported Services', 6, false);

  INSERT INTO country_tax_brackets (version_id, min_income, max_income, rate, fixed_amount) VALUES
    (v_pack_id, 0, 5000, 0, 0), (v_pack_id, 5000, 20000, 1, 0),
    (v_pack_id, 20000, 35000, 3, 150), (v_pack_id, 35000, 50000, 8, 600),
    (v_pack_id, 50000, 70000, 13, 1800), (v_pack_id, 70000, 100000, 21, 4400),
    (v_pack_id, 100000, 250000, 24, 10700), (v_pack_id, 250000, 400000, 25, 36500),
    (v_pack_id, 400000, 600000, 26, 48000), (v_pack_id, 600000, null, 28, 100000);

  INSERT INTO country_document_numbering (version_id, entity, format) VALUES
    (v_pack_id, 'employee', 'EMP-{000001}'), (v_pack_id, 'payroll', 'PAY-{YYYYMM}-{000001}'),
    (v_pack_id, 'invoice', 'INV-{YYYY}-{000001}'), (v_pack_id, 'purchase_order', 'PO-{YYYY}-{000001}'),
    (v_pack_id, 'claim', 'CLM-{YYYY}-{000001}'), (v_pack_id, 'leave', 'LV-{YYYY}-{000001}');

  INSERT INTO country_workflow_templates (version_id, name, entity_type) VALUES
    (v_pack_id, 'Leave Approval', 'leave'), (v_pack_id, 'Claim Approval', 'claims'),
    (v_pack_id, 'Purchase Order', 'purchase_order');

  INSERT INTO country_dashboard_widgets (version_id, name) VALUES
    (v_pack_id, 'EPF Due'), (v_pack_id, 'SOCSO Due'), (v_pack_id, 'EIS Due'),
    (v_pack_id, 'PCB Due'), (v_pack_id, 'Payroll Due'), (v_pack_id, 'Pending Leave'),
    (v_pack_id, 'Pending Claims'), (v_pack_id, 'Pending Approvals'),
    (v_pack_id, 'Tax Submission Status');

  INSERT INTO country_compliance_items (version_id, name, frequency, deadline) VALUES
    (v_pack_id, 'EPF Submission', 'Monthly', '15th of month'),
    (v_pack_id, 'SOCSO Submission', 'Monthly', '15th of month'),
    (v_pack_id, 'EIS Submission', 'Monthly', '15th of month'),
    (v_pack_id, 'PCB Submission', 'Monthly', '10th of month'),
    (v_pack_id, 'EA Form Issuance', 'Annual', '28 Feb'),
    (v_pack_id, 'E Form Filing', 'Annual', '31 Mar'),
    (v_pack_id, 'Payslip Issuance', 'Monthly', 'Within 7 days of payroll'),
    (v_pack_id, 'Employment Contract', 'One-time', 'Before start date');

  -- ============================================================
  -- EPF SCHEME
  -- ============================================================
  INSERT INTO country_statutory_schemes (version_id, name, type, description, employee_rate, employer_rate, is_mandatory)
  VALUES (v_pack_id, 'Employees Provident Fund', 'pension', 'Employees Provident Fund (KWSP) — retirement savings for employees under 60.', 11, 13, true)
  RETURNING id INTO v_scheme_epf;

  INSERT INTO country_scheme_versions (scheme_id, version, status, effective_from, notes)
  VALUES (v_scheme_epf, '2026.1', 'published', '2026-01-01', 'Age <60. Wage ceiling RM5,000 for mandatory contributions.')
  RETURNING id INTO v_ver_epf;

  INSERT INTO country_scheme_rates (scheme_version_id, rate_type, employee_rate, employer_rate, display_order) VALUES
    (v_ver_epf, 'flat_percentage', 11, 13, 1);

  INSERT INTO country_scheme_employee_categories (scheme_version_id, name, treatment, display_order) VALUES
    (v_ver_epf, 'Malaysian Citizen', 'Full EPF', 1),
    (v_ver_epf, 'Permanent Resident', 'Full EPF', 2),
    (v_ver_epf, 'Non-Citizen (EPF Applicable)', 'Subject to regulations', 3),
    (v_ver_epf, 'Non-Citizen (Not Applicable)', 'Exempt', 4),
    (v_ver_epf, 'Expatriate (Elected)', 'Voluntary', 5);

  -- ============================================================
  -- SOCSO SCHEME
  -- ============================================================
  INSERT INTO country_statutory_schemes (version_id, name, type, description, employee_rate, employer_rate, max_amount, is_mandatory)
  VALUES (v_pack_id, 'SOCSO (PERKESO)', 'social_security', 'Social Security Organisation — covers employment injury and invalidity.', 0.5, 1.75, 4000, true)
  RETURNING id INTO v_scheme_socso;

  INSERT INTO country_scheme_versions (scheme_id, version, status, effective_from, notes)
  VALUES (v_scheme_socso, '2026.1', 'published', '2026-01-01', 'Ceiling RM4,000 per month. First category covers all employees.')
  RETURNING id INTO v_ver_socso;

  INSERT INTO country_scheme_rates (scheme_version_id, rate_type, employee_rate, employer_rate, wage_min, wage_max, display_order) VALUES
    (v_ver_socso, 'wage_band', 0.5, 1.75, 0, 4000, 1);

  INSERT INTO country_scheme_rules (scheme_version_id, rule_type, name, value_type, value, frequency, description, display_order) VALUES
    (v_ver_socso, 'ceiling', 'SOCSO Wage Ceiling', 'fixed_amount', 4000, 'monthly', 'SOCSO wage ceiling RM4,000/month', 1);

  -- ============================================================
  -- EIS SCHEME
  -- ============================================================
  INSERT INTO country_statutory_schemes (version_id, name, type, description, employee_rate, employer_rate, max_amount, is_mandatory)
  VALUES (v_pack_id, 'Employment Insurance System', 'social_security', 'Employment Insurance System (SIP) — provides financial support to retrenched workers.', 0.2, 0.2, 4000, true)
  RETURNING id INTO v_scheme_eis;

  INSERT INTO country_scheme_versions (scheme_id, version, status, effective_from, notes)
  VALUES (v_scheme_eis, '2026.1', 'published', '2026-01-01', 'Ceiling RM4,000 per month.')
  RETURNING id INTO v_ver_eis;

  INSERT INTO country_scheme_rates (scheme_version_id, rate_type, employee_rate, employer_rate, wage_min, wage_max, display_order) VALUES
    (v_ver_eis, 'wage_band', 0.2, 0.2, 0, 4000, 1);

  INSERT INTO country_scheme_rules (scheme_version_id, rule_type, name, value_type, value, frequency, description, display_order) VALUES
    (v_ver_eis, 'ceiling', 'EIS Wage Ceiling', 'fixed_amount', 4000, 'monthly', 'EIS wage ceiling RM4,000/month', 1);

  -- ============================================================
  -- PCB SCHEME (Monthly Tax Deduction)
  -- ============================================================
  INSERT INTO country_statutory_schemes (version_id, name, type, description, employee_rate, employer_rate, is_mandatory)
  VALUES (v_pack_id, 'PCB (Monthly Tax Deduction)', 'tax', 'Monthly income tax deduction remitted to LHDN.', 0, 0, true)
  RETURNING id INTO v_scheme_pcb;

  INSERT INTO country_scheme_versions (scheme_id, version, status, effective_from, notes)
  VALUES (v_scheme_pcb, '2026.1', 'published', '2026-01-01', 'Bracketed monthly deduction per LHDN schedule.')
  RETURNING id INTO v_ver_pcb;

  -- ============================================================
  -- HRD CORP SCHEME
  -- ============================================================
  INSERT INTO country_statutory_schemes (version_id, name, type, description, employee_rate, employer_rate, max_amount, is_mandatory)
  VALUES (v_pack_id, 'HRD Corp Levy', 'training', 'Human Resource Development Corporation levy — for companies with 10+ employees.', 0, 1, 5000, false)
  RETURNING id INTO v_scheme_hrd;

  INSERT INTO country_scheme_versions (scheme_id, version, status, effective_from, notes)
  VALUES (v_scheme_hrd, '2026.1', 'published', '2026-01-01', 'Levy 1% of monthly wages up to RM5,000 per employee.')
  RETURNING id INTO v_ver_hrd;

  INSERT INTO country_scheme_rates (scheme_version_id, rate_type, employee_rate, employer_rate, display_order) VALUES
    (v_ver_hrd, 'flat_percentage', 0, 1, 1);

  INSERT INTO country_scheme_rules (scheme_version_id, rule_type, name, value_type, value, frequency, description, display_order) VALUES
    (v_ver_hrd, 'ceiling', 'HRD Corp Wage Ceiling', 'fixed_amount', 5000, 'monthly', 'HRD Corp wage ceiling RM5,000/month', 1);

END $$;
