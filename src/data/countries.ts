export interface CountryPackConfig {
  general: {
    name: string; code: string; currency: string; currency_symbol: string;
    phone_code: string; timezone: string; primary_language: string;
    secondary_language?: string;
    date_format: string; time_format: string; week_starts_on: string;
    financial_year: string; tax_year: string; default_payroll_frequency: string;
    payslip_language?: string;
  };
  employment_types?: { name: string; enabled: boolean }[];
  employee_categories?: { name: string; statutory_treatment: string }[];
  employment: {
    max_weekly_hours: number; probation_months: number; notice_period_days: number;
    retirement_age: number; rest_days: string; employment_types: string[];
    contract_types: string[];
  };
  payroll: {
    frequencies: string[]; minimum_wage: number; payroll_cutoff: string;
    payroll_lock_date: string; thirteenth_month: string; bank_file_format: string;
  };
  payroll_components?: {
    earnings: { name: string; is_taxable: boolean; is_mandatory?: boolean }[];
    deductions: { name: string; is_taxable: boolean; is_mandatory?: boolean }[];
  };
  statutory_contributions: {
    scheme_code?: string;
    scheme_name?: string;
    name?: string; // legacy: used as scheme_code for display
    cap?: string | number; // legacy cap display string
    min_amount?: number; // legacy: use min_earnings_threshold
    max_amount?: number; // legacy: use max_earnings_ceiling
    age_brackets?: { max_age: number | null; employee_rate: number; employer_rate: number }[]; // legacy: use age_rules
    employee_rate?: number | string;
    employer_rate?: number | string;
    min_earnings_threshold?: number | null;
    max_earnings_ceiling?: number | null;
    annual_contribution_ceiling?: number | null;
    contribution_frequency?: 'monthly' | 'weekly' | 'annual' | 'fortnightly';
    age_rules?: { label: string; min_age?: number; max_age?: number | null; employee_rate: number | string; employer_rate: number | string }[];
    eligibility_rules?: string;
    effective_date?: string;
    end_date?: string;
    version?: string;
    formula_type?: string;
    currency?: string;
    notes?: string;
    rate_table?: { min_wage: number; max_wage: number | null; employee_rate: number | string; employer_rate: number | string }[];
  }[];
  income_tax: {
    brackets: { min: number; max: number | null; rate: number; fixed: number }[];
    resident_rules: string; non_resident_rate?: number; filing_frequency: string;
    auto_inclusion_scheme?: boolean; form_types?: string[];
  };
  sales_tax: {
    name: string; rate: number; notes: string;
  }[];
  leave: {
    /** min_days: working days (5 per week) for working_days and weeks types; calendar days for calendar_days types */
    types: { name: string; min_days: number; carry_forward: number; encashable: boolean; count_method?: 'working_days' | 'weeks' | 'calendar_days'; allow_single_days?: boolean }[];
  };
  public_holidays: (string | { name: string; date: string; recurring: boolean })[] | string[];
  government_agencies: { name: string; submission_frequency: string; portal: string }[];
  government_forms: { name: string; frequency: string; deadline: string }[];
  accounting: {
    fiscal_year_start: string; default_tax_code: string; invoice_number_format: string;
    payment_terms: string; tax_codes?: { code: string; name: string; rate: number; is_default: boolean }[];
  };
  banking: {
    bank_file_format: string; supported_banks: string[]; payment_methods?: string[];
  };
  compliance: {
    employment_act: string; record_retention_years: number;
    payslip_requirements: string; privacy_law: string;
    checklist?: { name: string; frequency: string; deadline: string }[];
  };
  termination: {
    notice_period: string; severance_pay: string; last_pay_rules: string;
  };
  foreign_workers: {
    work_pass_types: string[]; levy: string; quota: string;
  };
  localisation: {
    address_format: string; postal_code_format: string; phone_format: string; national_id_format: string;
  };
  document_numbering?: { entity: string; format: string }[];
  workflow_templates?: { name: string; entity_type: string; steps: { step_order: number; assignee_role: string; action: string }[] }[];
  dashboard_widgets?: string[];
}

export const COUNTRY_PACKS: Record<string, CountryPackConfig> = {
  SG: {
    general: { name: 'Singapore', code: 'SG', currency: 'SGD', currency_symbol: 'S$', phone_code: '+65', timezone: 'Asia/Singapore', primary_language: 'English', secondary_language: 'Chinese (Mandarin)', date_format: 'DD/MM/YYYY', time_format: '24h', week_starts_on: 'Monday', financial_year: '01-01', tax_year: '01-01', default_payroll_frequency: 'Monthly', payslip_language: 'English' },
    employment_types: [
      { name: 'Full-Time', enabled: true }, { name: 'Part-Time', enabled: true },
      { name: 'Temporary', enabled: true }, { name: 'Contract', enabled: true },
      { name: 'Internship', enabled: true }, { name: 'Casual', enabled: true },
    ],
    employee_categories: [
      { name: 'Singapore Citizen', statutory_treatment: 'Full CPF' },
      { name: 'Singapore PR (Year 1)', statutory_treatment: 'Graduated' },
      { name: 'Singapore PR (Year 2)', statutory_treatment: 'Graduated' },
      { name: 'Singapore PR (Year 3+)', statutory_treatment: 'Full CPF' },
      { name: 'Employment Pass', statutory_treatment: 'No CPF' },
      { name: 'S Pass', statutory_treatment: 'No CPF' },
      { name: 'Work Permit', statutory_treatment: 'No CPF' },
      { name: 'Dependant Pass', statutory_treatment: 'No CPF' },
    ],
    employment: { max_weekly_hours: 44, probation_months: 3, notice_period_days: 30, retirement_age: 63, rest_days: '1 day/week', employment_types: ['Full-Time', 'Part-Time', 'Temporary', 'Contract', 'Internship', 'Casual'], contract_types: ['Full-time', 'Part-time', 'Casual'] },
    payroll: { frequencies: ['Monthly', 'Weekly', 'Fortnightly'], minimum_wage: 0, payroll_cutoff: 'Last day of month', payroll_lock_date: '5th of next month', thirteenth_month: 'Not mandatory', bank_file_format: 'GIRO CSV' },
    payroll_components: {
      earnings: [
        { name: 'Basic Salary', is_taxable: true }, { name: 'Overtime', is_taxable: true },
        { name: 'Bonus', is_taxable: true }, { name: 'Commission', is_taxable: true },
        { name: 'Allowance', is_taxable: true }, { name: 'Transport Allowance', is_taxable: true },
        { name: 'Meal Allowance', is_taxable: true }, { name: 'Mobile Allowance', is_taxable: true },
        { name: 'Housing Allowance', is_taxable: true }, { name: 'Shift Allowance', is_taxable: true },
        { name: 'Night Shift Allowance', is_taxable: true }, { name: 'Attendance Incentive', is_taxable: true },
        { name: 'AWS (13th Month)', is_taxable: true }, { name: 'Back Pay', is_taxable: true },
        { name: 'Leave Encashment', is_taxable: true },
      ],
      deductions: [
        { name: 'CPF Employee', is_taxable: false, is_mandatory: true },
        { name: 'CPF Employer', is_taxable: false, is_mandatory: true },
        { name: 'SDL', is_taxable: false, is_mandatory: true },
        { name: 'SHG', is_taxable: false, is_mandatory: false },
        { name: 'No Pay Leave', is_taxable: false, is_mandatory: false },
        { name: 'Loan', is_taxable: false, is_mandatory: false },
        { name: 'Salary Advance', is_taxable: false, is_mandatory: false },
        { name: 'Income Tax', is_taxable: false, is_mandatory: true },
        { name: 'Insurance', is_taxable: false, is_mandatory: false },
        { name: 'Other Deduction', is_taxable: false, is_mandatory: false },
      ],
    },
    statutory_contributions: [
      {
        scheme_code: 'CPF', scheme_name: 'Central Provident Fund',
        employee_rate: 20, employer_rate: 17,
        min_earnings_threshold: 0, max_earnings_ceiling: 8000,
        annual_contribution_ceiling: 102000,
        contribution_frequency: 'monthly',
        formula_type: 'percentage_minmax',
        currency: 'SGD',
        effective_date: '2026-01-01',
        notes: 'Ordinary Wage ceiling S$6,800/month. Additional Wage ceiling: annual CPF ceiling minus total OW CPF.',
        age_rules: [
          { label: '≤55', min_age: 0, max_age: 55, employee_rate: 20, employer_rate: 17 },
          { label: '>55–60', min_age: 55, max_age: 60, employee_rate: 16, employer_rate: 15 },
          { label: '>60–65', min_age: 60, max_age: 65, employee_rate: 10.5, employer_rate: 11.5 },
          { label: '>65–70', min_age: 65, max_age: 70, employee_rate: 7.5, employer_rate: 8.5 },
          { label: '>70', min_age: 70, max_age: null, employee_rate: 5, employer_rate: 7.5 },
        ],
        eligibility_rules: 'Singapore Citizens and PRs. Graduated rates for PRs in Years 1-2.',
      },
      {
        scheme_code: 'SDL', scheme_name: 'Skills Development Levy',
        employee_rate: 0, employer_rate: 0.25,
        min_earnings_threshold: 0, max_earnings_ceiling: null,
        annual_contribution_ceiling: null,
        contribution_frequency: 'monthly',
        formula_type: 'percentage_minmax',
        currency: 'SGD',
        effective_date: '2026-01-01',
        notes: 'Minimum S$2, maximum S$11.25 per employee per month. Collected with CPF.',
        rate_table: [
          { min_wage: 0, max_wage: 800, employee_rate: 0, employer_rate: 2 },
          { min_wage: 800, max_wage: null, employee_rate: 0, employer_rate: 0.25 },
        ],
      },
      {
        scheme_code: 'SHG', scheme_name: 'Self-Help Group (CDAC/SINDA/MBMF/ECF)',
        employee_rate: 0.5, employer_rate: 0,
        min_earnings_threshold: 0, max_earnings_ceiling: null,
        annual_contribution_ceiling: null,
        contribution_frequency: 'monthly',
        formula_type: 'wage_band',
        currency: 'SGD',
        effective_date: '2026-01-01',
        notes: 'Contributions to CDAC (Chinese), SINDA (Indian), MBMF (Malay), ECF (Eurasian). Income-banded rates apply.',
        rate_table: [
          { min_wage: 0, max_wage: 1000, employee_rate: 0, employer_rate: 0 },
          { min_wage: 1000, max_wage: 2000, employee_rate: 0.5, employer_rate: 0 },
          { min_wage: 2000, max_wage: null, employee_rate: 1, employer_rate: 0 },
        ],
        eligibility_rules: 'Based on employee ethnicity. CDAC for Chinese, SINDA for Indian, MBMF for Malay, ECF for Eurasian.',
      },
    ],
    income_tax: { brackets: [{ min: 0, max: 20000, rate: 0, fixed: 0 }, { min: 20000, max: 30000, rate: 2, fixed: 0 }, { min: 30000, max: 40000, rate: 3.5, fixed: 200 }, { min: 40000, max: 80000, rate: 7, fixed: 550 }, { min: 80000, max: 120000, rate: 11.5, fixed: 3350 }, { min: 120000, max: 200000, rate: 15, fixed: 7950 }, { min: 200000, max: 320000, rate: 18, fixed: 19950 }, { min: 320000, max: null, rate: 24, fixed: 41550 }], resident_rules: '183 days/year', non_resident_rate: 24, filing_frequency: 'Annual (IR8A)', auto_inclusion_scheme: true, form_types: ['IR8A', 'IR8S', 'Appendix 8A', 'Appendix 8B', 'IR21'] },
    sales_tax: [{ name: 'GST', rate: 9, notes: 'Standard rate from 2024 (8% in 2023, 9% from 2024)' }],
    leave: { types: [{ name: 'Annual Leave', min_days: 14, carry_forward: 7, encashable: true }, { name: 'Sick Leave', min_days: 14, carry_forward: 0, encashable: false }, { name: 'Hospitalization Leave', min_days: 60, carry_forward: 0, encashable: false }, { name: 'Maternity Leave', min_days: 80, carry_forward: 0, encashable: false, count_method: 'weeks' }, { name: 'Paternity Leave', min_days: 20, carry_forward: 0, encashable: false, count_method: 'weeks', allow_single_days: true }, { name: 'Shared Parental Leave', min_days: 50, carry_forward: 0, encashable: false, count_method: 'weeks', allow_single_days: true }, { name: 'Childcare Leave', min_days: 6, carry_forward: 0, encashable: false }, { name: 'Unpaid Leave', min_days: 0, carry_forward: 0, encashable: false }] },
    public_holidays: ['New Year\'s Day', 'Chinese New Year (2 days)', 'Good Friday', 'Hari Raya Puasa', 'Hari Raya Haji', 'Labour Day', 'Vesak Day', 'National Day', 'Deepavali', 'Christmas Day'],
    government_agencies: [{ name: 'CPF Board', submission_frequency: 'Monthly', portal: 'CPF e-Cashier' }, { name: 'IRAS', submission_frequency: 'Annual', portal: 'myTax Portal' }, { name: 'Ministry of Manpower', submission_frequency: 'As required', portal: 'MOM Portal' }, { name: 'SkillsFuture Singapore', submission_frequency: 'Monthly', portal: 'CPF e-Cashier' }],
    government_forms: [{ name: 'IR8A', frequency: 'Annual', deadline: '1 Mar' }, { name: 'IR8S', frequency: 'Annual', deadline: '1 Mar' }, { name: 'Appendix 8A', frequency: 'Annual', deadline: '1 Mar' }, { name: 'Appendix 8B', frequency: 'Annual', deadline: '1 Mar' }, { name: 'IR21', frequency: 'As required', deadline: 'Within 30 days' }, { name: 'CPF Statement', frequency: 'Monthly', deadline: '14th of month' }, { name: 'ECF', frequency: 'Annual', deadline: '15 Apr' }],
    accounting: { fiscal_year_start: '01-01', default_tax_code: 'SR', invoice_number_format: 'INV-{YYYY}-{0000}', payment_terms: 'Net 30', tax_codes: [{ code: 'SR', name: 'Standard Rated', rate: 9, is_default: true }, { code: 'ZR', name: 'Zero Rated', rate: 0, is_default: false }, { code: 'ES33', name: 'Exempt', rate: 0, is_default: false }, { code: 'TX', name: 'Out of Scope', rate: 0, is_default: false }] },
    banking: { bank_file_format: 'GIRO CSV', supported_banks: ['DBS', 'OCBC', 'UOB', 'Maybank', 'CIMB'], payment_methods: ['GIRO', 'Bank Transfer', 'FAST'] },
    compliance: { employment_act: 'Employment Act (EA)', record_retention_years: 5, payslip_requirements: 'Itemised payslip mandatory', privacy_law: 'PDPA (Personal Data Protection Act)', checklist: [{ name: 'CPF Submission', frequency: 'Monthly', deadline: '14th of month' }, { name: 'SDL Payment', frequency: 'Monthly', deadline: '14th of month' }, { name: 'IRAS Filing', frequency: 'Annual', deadline: '15 Apr' }, { name: 'IR21 Clearance', frequency: 'As required', deadline: 'Within 30 days' }, { name: 'Payslip Issuance', frequency: 'Monthly', deadline: 'Within 3 days of payroll' }, { name: 'Employment Contract', frequency: 'One-time', deadline: 'Before start date' }, { name: 'Foreign Worker Compliance', frequency: 'Ongoing', deadline: '- ' }] },
    termination: { notice_period: 'Contractual or statutory (1 day to 4 weeks based on service)', severance_pay: 'Not mandatory unless contract provides', last_pay_rules: 'Within 7 days of termination' },
    foreign_workers: { work_pass_types: ['Employment Pass (EP)', 'S Pass (SP)', 'Work Permit (WP)', 'Dependant Pass (DP)', 'Long-Term Visit Pass (LTVP)'], levy: 'S$300-950/month for WP, S$330-650/month for SP', quota: '18-38% for foreign workers (sector dependent)' },
    localisation: { address_format: '#00-00 Block Street, Singapore 000000', postal_code_format: '6 digits', phone_format: '+65 8xxx xxxx', national_id_format: 'S1234567A (NRIC)' },
    document_numbering: [
      { entity: 'employee', format: 'EMP-{000001}' },
      { entity: 'payroll', format: 'PAY-{YYYYMM}-{000001}' },
      { entity: 'invoice', format: 'INV-{YYYY}-{000001}' },
      { entity: 'purchase_order', format: 'PO-{YYYY}-{000001}' },
      { entity: 'claim', format: 'CLM-{YYYY}-{000001}' },
      { entity: 'leave', format: 'LV-{YYYY}-{000001}' },
    ],
    workflow_templates: [
      { name: 'Leave Approval', entity_type: 'leave', steps: [{ step_order: 1, assignee_role: 'Manager', action: 'approve' }, { step_order: 2, assignee_role: 'HR', action: 'approve' }] },
      { name: 'Claim Approval', entity_type: 'claims', steps: [{ step_order: 1, assignee_role: 'Manager', action: 'approve' }, { step_order: 2, assignee_role: 'Finance', action: 'approve' }] },
      { name: 'Purchase Order', entity_type: 'purchase_order', steps: [{ step_order: 1, assignee_role: 'Manager', action: 'approve' }, { step_order: 2, assignee_role: 'Finance', action: 'approve' }] },
    ],
    dashboard_widgets: ['CPF Due', 'Payroll Due', 'IRAS Filing', 'Leave Balance', 'Pending Claims', 'Pending Approvals'],
  },
  MY: {
    general: { name: 'Malaysia', code: 'MY', currency: 'MYR', currency_symbol: 'RM', phone_code: '+60', timezone: 'Asia/Kuala_Lumpur', primary_language: 'Malay', secondary_language: 'English', date_format: 'DD/MM/YYYY', time_format: '24h', week_starts_on: 'Monday', financial_year: '01-01', tax_year: '01-01', default_payroll_frequency: 'Monthly', payslip_language: 'Malay / English' },
    employment_types: [
      { name: 'Full-Time', enabled: true }, { name: 'Part-Time', enabled: true },
      { name: 'Contract', enabled: true }, { name: 'Temporary', enabled: true },
      { name: 'Internship', enabled: true }, { name: 'Probation', enabled: true },
      { name: 'Casual', enabled: true },
    ],
    employee_categories: [
      { name: 'Malaysian Citizen', statutory_treatment: 'EPF Applicable' },
      { name: 'Permanent Resident', statutory_treatment: 'EPF Applicable' },
      { name: 'Non-Citizen (EPF Applicable)', statutory_treatment: 'EPF Subject to Regulations' },
      { name: 'Non-Citizen (EPF Not Applicable)', statutory_treatment: 'No EPF' },
      { name: 'Expatriate', statutory_treatment: 'Depends on EPF Election' },
    ],
    employment: { max_weekly_hours: 48, probation_months: 3, notice_period_days: 30, retirement_age: 60, rest_days: '1 day/week', employment_types: ['Full-Time', 'Part-Time', 'Contract', 'Temporary', 'Internship', 'Probation', 'Casual'], contract_types: ['Full-time', 'Part-time'] },
    payroll: { frequencies: ['Monthly', 'Weekly', 'Fortnightly'], minimum_wage: 1500, payroll_cutoff: 'Last day of month', payroll_lock_date: '5th of next month', thirteenth_month: 'Not mandatory', bank_file_format: 'IBG/FPX CSV' },
    payroll_components: {
      earnings: [
        { name: 'Basic Salary', is_taxable: true }, { name: 'Overtime', is_taxable: true },
        { name: 'Commission', is_taxable: true }, { name: 'Bonus', is_taxable: true },
        { name: 'Allowance', is_taxable: true }, { name: 'Transport Allowance', is_taxable: true },
        { name: 'Meal Allowance', is_taxable: true }, { name: 'Housing Allowance', is_taxable: true },
        { name: 'Shift Allowance', is_taxable: true }, { name: 'Attendance Allowance', is_taxable: true },
        { name: 'Phone Allowance', is_taxable: true }, { name: 'Travel Allowance', is_taxable: true },
        { name: 'Back Pay', is_taxable: true }, { name: 'Leave Encashment', is_taxable: true },
      ],
      deductions: [
        { name: 'EPF Employee', is_taxable: false, is_mandatory: true },
        { name: 'EPF Employer', is_taxable: false, is_mandatory: true },
        { name: 'SOCSO', is_taxable: false, is_mandatory: true },
        { name: 'EIS', is_taxable: false, is_mandatory: true },
        { name: 'PCB (Income Tax)', is_taxable: false, is_mandatory: true },
        { name: 'Zakat', is_taxable: false, is_mandatory: false },
        { name: 'Salary Advance', is_taxable: false, is_mandatory: false },
        { name: 'Loan', is_taxable: false, is_mandatory: false },
        { name: 'Insurance', is_taxable: false, is_mandatory: false },
        { name: 'Union Fee', is_taxable: false, is_mandatory: false },
        { name: 'Other Deduction', is_taxable: false, is_mandatory: false },
      ],
    },
    statutory_contributions: [
      { name: 'EPF', employee_rate: '11%', employer_rate: '13%', cap: 'No cap', notes: 'Employees Provident Fund — age <60, wage < RM5,000', formula_type: 'percentage' },
      { name: 'SOCSO', employee_rate: '0.5%', employer_rate: '1.75%', cap: 'RM 4,000', notes: 'Social Security Organisation (PERKESO)', formula_type: 'percentage' },
      { name: 'EIS', employee_rate: '0.2%', employer_rate: '0.2%', cap: 'RM 4,000', notes: 'Employment Insurance System', formula_type: 'percentage' },
      { name: 'PCB', employee_rate: 'Variable', employer_rate: '0%', cap: 'Based on bracket', notes: 'Monthly Tax Deduction (LHDN)', formula_type: 'bracket' },
      { name: 'HRD Corp', employee_rate: '0%', employer_rate: '1%', cap: 'RM 5,000 per month (for companies ≥10 employees)', notes: 'Human Resource Development Corporation levy', formula_type: 'percentage' },
    ],
    income_tax: { brackets: [{ min: 0, max: 5000, rate: 0, fixed: 0 }, { min: 5000, max: 20000, rate: 1, fixed: 0 }, { min: 20000, max: 35000, rate: 3, fixed: 150 }, { min: 35000, max: 50000, rate: 8, fixed: 600 }, { min: 50000, max: 70000, rate: 13, fixed: 1800 }, { min: 70000, max: 100000, rate: 21, fixed: 4400 }, { min: 100000, max: 250000, rate: 24, fixed: 10700 }, { min: 250000, max: 400000, rate: 25, fixed: 36500 }, { min: 400000, max: 600000, rate: 26, fixed: 48000 }, { min: 600000, max: null, rate: 28, fixed: 100000 }], resident_rules: '182 days/year', non_resident_rate: 30, filing_frequency: 'Annual (EA Form)', form_types: ['EA Form', 'E Form', 'CP39', 'CP22/CP22A'] },
    sales_tax: [{ name: 'SST Sales Tax', rate: 8, notes: 'Sales & Services Tax — sales tax on manufactured goods' }, { name: 'SST Service Tax', rate: 6, notes: 'Service tax on selected services' }],
    leave: { types: [{ name: 'Annual Leave', min_days: 14, carry_forward: 7, encashable: true }, { name: 'Sick Leave', min_days: 14, carry_forward: 0, encashable: false }, { name: 'Hospitalization Leave', min_days: 60, carry_forward: 0, encashable: false }, { name: 'Maternity Leave', min_days: 98, carry_forward: 0, encashable: false }, { name: 'Paternity Leave', min_days: 7, carry_forward: 0, encashable: false }, { name: 'Public Holiday', min_days: 11, carry_forward: 0, encashable: false }, { name: 'Unpaid Leave', min_days: 0, carry_forward: 0, encashable: false }] },
    public_holidays: ['New Year\'s Day', 'Thaipusam', 'Chinese New Year (2 days)', 'Hari Raya Puasa (2 days)', 'Hari Raya Haji', 'Labour Day', 'Wesak Day', 'Agong\'s Birthday', 'Merdeka Day (31 Aug)', 'Malaysia Day (16 Sep)', 'Deepavali', 'Christmas Day'],
    government_agencies: [{ name: 'KWSP (EPF)', submission_frequency: 'Monthly', portal: 'i-Akaun (Employer)' }, { name: 'PERKESO (SOCSO)', submission_frequency: 'Monthly', portal: 'ASSIST' }, { name: 'LHDN', submission_frequency: 'Monthly/Annual', portal: 'MyTax / ePCB' }, { name: 'EIS', submission_frequency: 'Monthly', portal: 'SIP Portal' }, { name: 'HRD Corp', submission_frequency: 'Monthly', portal: 'HRD Corp e-TRiS' }],
    government_forms: [{ name: 'EA Form', frequency: 'Annual', deadline: '28 Feb' }, { name: 'E Form', frequency: 'Annual', deadline: '31 Mar' }, { name: 'CP22/CP22A', frequency: 'As required', deadline: 'Within 30 days' }, { name: 'CP39', frequency: 'Monthly', deadline: '10th of month' }, { name: 'EPF Monthly Statement', frequency: 'Monthly', deadline: '15th of month' }, { name: 'SOCSO Monthly Return', frequency: 'Monthly', deadline: '15th of month' }, { name: 'EIS Monthly Return', frequency: 'Monthly', deadline: '15th of month' }],
    accounting: { fiscal_year_start: '01-01', default_tax_code: 'SR', invoice_number_format: 'INV-{YYYY}-{0000}', payment_terms: 'Net 30', tax_codes: [{ code: 'SR', name: 'Standard Rated (SST)', rate: 8, is_default: true }, { code: 'ZR', name: 'Zero Rated', rate: 0, is_default: false }, { code: 'EX', name: 'Exempt', rate: 0, is_default: false }, { code: 'OS', name: 'Out of Scope', rate: 0, is_default: false }, { code: 'IS', name: 'Imported Services', rate: 6, is_default: false }] },
    banking: { bank_file_format: 'IBG/FPX CSV', supported_banks: ['Maybank', 'CIMB', 'Public Bank', 'RHB', 'Hong Leong', 'AmBank', 'Bank Islam', 'Bank Rakyat'], payment_methods: ['IBG', 'DuitNow', 'RENTAS', 'Bank Transfer'] },
    compliance: { employment_act: 'Employment Act 1955', record_retention_years: 7, payslip_requirements: 'Itemised payslip mandatory', privacy_law: 'PDPA (Personal Data Protection Act 2010)', checklist: [{ name: 'EPF Submission', frequency: 'Monthly', deadline: '15th of month' }, { name: 'SOCSO Submission', frequency: 'Monthly', deadline: '15th of month' }, { name: 'EIS Submission', frequency: 'Monthly', deadline: '15th of month' }, { name: 'PCB Submission', frequency: 'Monthly', deadline: '10th of month' }, { name: 'EA Form Issuance', frequency: 'Annual', deadline: '28 Feb' }, { name: 'E Form Filing', frequency: 'Annual', deadline: '31 Mar' }, { name: 'Payslip Issuance', frequency: 'Monthly', deadline: 'Within 7 days of payroll' }, { name: 'Employment Contract', frequency: 'One-time', deadline: 'Before start date' }] },
    termination: { notice_period: '4-8 weeks based on service (Section 12 of Employment Act)', severance_pay: '10-20 days per year of service', last_pay_rules: 'Within 7 days of termination' },
    foreign_workers: { work_pass_types: ['Employment Pass (Category I/II/III)', 'Work Permit (Foreign Worker)', 'Professional Visit Pass', 'Residence Pass Talent', 'Expatriate Pass'], levy: 'RM 1,850-2,500/month (sector dependent)', quota: 'Industry-dependent — manufacturing, services, construction, plantation, agriculture' },
    localisation: { address_format: 'Lot/Block, Street, Postcode, City, State', postal_code_format: '5 digits', phone_format: '+60 1x-xxx xxxx / +60 3-xxxx xxxx', national_id_format: '000000-00-0000 (MyKad)' },
    document_numbering: [
      { entity: 'employee', format: 'EMP-{000001}' },
      { entity: 'payroll', format: 'PAY-{YYYYMM}-{000001}' },
      { entity: 'invoice', format: 'INV-{YYYY}-{000001}' },
      { entity: 'purchase_order', format: 'PO-{YYYY}-{000001}' },
      { entity: 'claim', format: 'CLM-{YYYY}-{000001}' },
      { entity: 'leave', format: 'LV-{YYYY}-{000001}' },
    ],
    workflow_templates: [
      { name: 'Leave Approval', entity_type: 'leave', steps: [{ step_order: 1, assignee_role: 'Manager', action: 'approve' }, { step_order: 2, assignee_role: 'HR', action: 'approve' }] },
      { name: 'Claim Approval', entity_type: 'claims', steps: [{ step_order: 1, assignee_role: 'Manager', action: 'approve' }, { step_order: 2, assignee_role: 'Finance', action: 'approve' }] },
      { name: 'Purchase Order', entity_type: 'purchase_order', steps: [{ step_order: 1, assignee_role: 'Manager', action: 'approve' }, { step_order: 2, assignee_role: 'Finance', action: 'approve' }] },
    ],
    dashboard_widgets: ['EPF Due', 'SOCSO Due', 'EIS Due', 'PCB Due', 'Payroll Due', 'Pending Leave', 'Pending Claims', 'Pending Approvals', 'Tax Submission Status'],
  },
  HK: {
    general: { name: 'Hong Kong SAR', code: 'HK', currency: 'HKD', currency_symbol: 'HK$', phone_code: '+852', timezone: 'Asia/Hong_Kong', primary_language: 'English', secondary_language: 'Traditional Chinese', date_format: 'DD/MM/YYYY', time_format: '24h', week_starts_on: 'Monday', financial_year: '01-04', tax_year: '01-04', default_payroll_frequency: 'Monthly', payslip_language: 'English / Traditional Chinese' },
    employment_types: [
      { name: 'Full-Time', enabled: true }, { name: 'Part-Time', enabled: true },
      { name: 'Contract', enabled: true }, { name: 'Temporary', enabled: true },
      { name: 'Casual', enabled: true }, { name: 'Internship', enabled: true },
      { name: 'Probation', enabled: true },
    ],
    employee_categories: [
      { name: 'Hong Kong Permanent Resident', statutory_treatment: 'Yes (if applicable)' },
      { name: 'Hong Kong Resident', statutory_treatment: 'Yes (if applicable)' },
      { name: 'Expatriate', statutory_treatment: 'Depends on exemption rules' },
      { name: 'Domestic Helper', statutory_treatment: 'Generally exempt' },
      { name: 'Short-term Employment', statutory_treatment: 'Subject to statutory exemption rules' },
    ],
    employment: { max_weekly_hours: 48, probation_months: 1, notice_period_days: 30, retirement_age: 65, rest_days: '1 day/week (minimum 1 rest day in 7 days)', employment_types: ['Full-Time', 'Part-Time', 'Contract', 'Temporary', 'Casual', 'Internship', 'Probation'], contract_types: ['Full-time', 'Part-time', 'Casual'] },
    payroll: { frequencies: ['Monthly (Default)', 'Weekly', 'Fortnightly'], minimum_wage: 40, payroll_cutoff: 'Last day of month', payroll_lock_date: '3rd of next month', thirteenth_month: 'Common if specified', bank_file_format: 'HSBC CSV' },
    payroll_components: {
      earnings: [
        { name: 'Basic Salary', is_taxable: true }, { name: 'Overtime', is_taxable: true },
        { name: 'Commission', is_taxable: true }, { name: 'Bonus', is_taxable: true },
        { name: 'Allowance', is_taxable: true }, { name: 'Transport Allowance', is_taxable: true },
        { name: 'Meal Allowance', is_taxable: true }, { name: 'Housing Allowance', is_taxable: true },
        { name: 'Shift Allowance', is_taxable: true }, { name: 'Attendance Allowance', is_taxable: true },
        { name: 'Phone Allowance', is_taxable: true }, { name: 'Travel Allowance', is_taxable: true },
        { name: 'Back Pay', is_taxable: true }, { name: 'Leave Encashment', is_taxable: true },
        { name: 'Year-End Bonus', is_taxable: true },
      ],
      deductions: [
        { name: 'MPF Employee', is_taxable: false, is_mandatory: true },
        { name: 'MPF Employer', is_taxable: false, is_mandatory: true },
        { name: 'Salaries Tax', is_taxable: false, is_mandatory: true },
        { name: 'Loan', is_taxable: false, is_mandatory: false },
        { name: 'Salary Advance', is_taxable: false, is_mandatory: false },
        { name: 'Insurance', is_taxable: false, is_mandatory: false },
        { name: 'Union Fee', is_taxable: false, is_mandatory: false },
        { name: 'Other Deduction', is_taxable: false, is_mandatory: false },
      ],
    },
    statutory_contributions: [
      { name: 'MPF Employee', employee_rate: '5%', employer_rate: '0%', cap: 'HK$30,000', notes: 'Mandatory Provident Fund — employee portion', formula_type: 'percentage', min_amount: 0, max_amount: 1500 },
      { name: 'MPF Employer', employee_rate: '0%', employer_rate: '5%', cap: 'HK$30,000', notes: 'Mandatory Provident Fund — employer portion', formula_type: 'percentage', min_amount: 0, max_amount: 1500 },
    ],
    income_tax: {
      brackets: [
        { min: 0, max: 50000, rate: 2, fixed: 0 },
        { min: 50000, max: 100000, rate: 6, fixed: 1000 },
        { min: 100000, max: 150000, rate: 10, fixed: 4000 },
        { min: 150000, max: 200000, rate: 14, fixed: 9000 },
        { min: 200000, max: null, rate: 17, fixed: 16000 },
      ],
      resident_rules: '183 days/year',
      non_resident_rate: 15,
      filing_frequency: 'Annual (IR56B)',
      form_types: ['IR56B', 'IR56E', 'IR56F', 'IR56G', 'Employer\'s Return'],
    },
    sales_tax: [{ name: 'Not Applicable', rate: 0, notes: 'Hong Kong has no GST/VAT' }],
    leave: {
      types: [
        { name: 'Annual Leave', min_days: 7, carry_forward: 0, encashable: true },
        { name: 'Sick Leave', min_days: 12, carry_forward: 0, encashable: false },
        { name: 'Maternity Leave', min_days: 14, carry_forward: 0, encashable: false },
        { name: 'Paternity Leave', min_days: 5, carry_forward: 0, encashable: false },
        { name: 'Statutory Holidays', min_days: 12, carry_forward: 0, encashable: false },
        { name: 'Compassionate Leave', min_days: 3, carry_forward: 0, encashable: false },
        { name: 'Unpaid Leave', min_days: 0, carry_forward: 0, encashable: false },
      ],
    },
    public_holidays: ['New Year\'s Day', 'Lunar New Year (3 days)', 'Ching Ming Festival', 'Good Friday', 'Easter Monday', 'Labour Day', 'Buddha\'s Birthday', 'Tuen Ng Festival', 'HKSAR Establishment Day', 'Mid-Autumn Festival', 'National Day', 'Chung Yeung Festival', 'Christmas Day', 'Boxing Day'],
    government_agencies: [
      { name: 'Inland Revenue Department (IRD)', submission_frequency: 'Annual', portal: 'eTAX' },
      { name: 'Mandatory Provident Fund Schemes Authority (MPFA)', submission_frequency: 'Monthly', portal: 'MPFA Portal' },
      { name: 'Labour Department', submission_frequency: 'As required', portal: 'Labour Portal' },
    ],
    government_forms: [
      { name: 'Employer\'s Return (IR56B)', frequency: 'Annual', deadline: '1 May' },
      { name: 'IR56E', frequency: 'As required', deadline: '3 months after hire' },
      { name: 'IR56F', frequency: 'As required', deadline: '1 month after termination' },
      { name: 'IR56G', frequency: 'As required', deadline: '1 month before employee departure' },
      { name: 'MPF Remittance Statement', frequency: 'Monthly', deadline: '10th of month' },
    ],
    accounting: {
      fiscal_year_start: '01-04', default_tax_code: 'SR', invoice_number_format: 'INV-{YYYY}-{0000}', payment_terms: 'Net 30',
      tax_codes: [
        { code: 'SR', name: 'Standard Rated', rate: 0, is_default: true },
        { code: 'ZR', name: 'Zero Rated', rate: 0, is_default: false },
        { code: 'EX', name: 'Exempt', rate: 0, is_default: false },
        { code: 'OS', name: 'Out of Scope', rate: 0, is_default: false },
      ],
    },
    banking: {
      bank_file_format: 'HSBC CSV', supported_banks: ['HSBC', 'Standard Chartered', 'Bank of China', 'Hang Seng', 'Citibank'],
      payment_methods: ['FPS', 'Bank Transfer', 'Autopay'],
    },
    compliance: {
      employment_act: 'Employment Ordinance (Cap. 57)',
      record_retention_years: 7,
      payslip_requirements: 'Itemised payslip mandatory',
      privacy_law: 'PDPO (Personal Data Privacy Ordinance)',
      checklist: [
        { name: 'MPF Contributions', frequency: 'Monthly', deadline: '10th of month' },
        { name: 'Employer\'s Return', frequency: 'Annual', deadline: '1 May' },
        { name: 'IR56B Filing', frequency: 'Annual', deadline: '1 May' },
        { name: 'IR56E (New Hire)', frequency: 'As required', deadline: '3 months after hire' },
        { name: 'IR56F (Termination)', frequency: 'As required', deadline: '1 month after termination' },
        { name: 'IR56G (Departure)', frequency: 'As required', deadline: '1 month before departure' },
        { name: 'Payslip Issuance', frequency: 'Monthly', deadline: 'Within 7 days of payroll' },
        { name: 'Employment Contract', frequency: 'One-time', deadline: 'Before start date' },
        { name: 'Termination Compliance', frequency: 'As required', deadline: 'Upon termination' },
      ],
    },
    termination: { notice_period: '7-30 days based on service (Employment Ordinance Cap. 57)', severance_pay: '2/3 of final month salary per year of service (if applicable)', last_pay_rules: 'Within 7 days of termination' },
    foreign_workers: { work_pass_types: ['Employment Visa (Top Tier)', 'Employment Visa (General)', 'Working Holiday Visa', 'Investment Visa'], levy: 'HK$400/month per domestic helper', quota: 'Case-by-case approval' },
    localisation: { address_format: 'Flat/Floor, Block, Street, District, Hong Kong', postal_code_format: 'Not used', phone_format: '+852 xxxx xxxx', national_id_format: 'A123456(X) (HKID)' },
    document_numbering: [
      { entity: 'employee', format: 'EMP-{000001}' },
      { entity: 'payroll', format: 'PAY-{YYYYMM}-{000001}' },
      { entity: 'invoice', format: 'INV-{YYYY}-{000001}' },
      { entity: 'purchase_order', format: 'PO-{YYYY}-{000001}' },
      { entity: 'claim', format: 'CLM-{YYYY}-{000001}' },
      { entity: 'leave', format: 'LV-{YYYY}-{000001}' },
    ],
    workflow_templates: [
      { name: 'Leave Approval', entity_type: 'leave', steps: [{ step_order: 1, assignee_role: 'Manager', action: 'approve' }, { step_order: 2, assignee_role: 'HR', action: 'approve' }] },
      { name: 'Claim Approval', entity_type: 'claims', steps: [{ step_order: 1, assignee_role: 'Manager', action: 'approve' }, { step_order: 2, assignee_role: 'Finance', action: 'approve' }] },
      { name: 'Purchase Order', entity_type: 'purchase_order', steps: [{ step_order: 1, assignee_role: 'Manager', action: 'approve' }, { step_order: 2, assignee_role: 'Finance', action: 'approve' }] },
    ],
    dashboard_widgets: ['MPF Due', 'Payroll Due', 'IRD Filing', 'Pending Leave', 'Pending Claims', 'Pending Approvals', 'Year-End Tax Forms', 'Employee Headcount'],
  },
  AE: {
    general: { name: 'United Arab Emirates', code: 'AE', currency: 'AED', currency_symbol: 'AED', phone_code: '+971', timezone: 'Asia/Dubai', primary_language: 'Arabic', secondary_language: 'English', date_format: 'DD/MM/YYYY', time_format: '24h', week_starts_on: 'Monday', financial_year: '01-01', tax_year: '01-01', default_payroll_frequency: 'Monthly', payslip_language: 'English / Arabic' },
    employment_types: [
      { name: 'Full-Time', enabled: true }, { name: 'Part-Time', enabled: true },
      { name: 'Limited Contract', enabled: true }, { name: 'Unlimited Contract (Legacy)', enabled: true },
      { name: 'Temporary', enabled: true }, { name: 'Internship', enabled: true },
      { name: 'Probation', enabled: true },
    ],
    employee_categories: [
      { name: 'UAE National', statutory_treatment: 'Pension applies' },
      { name: 'GCC National', statutory_treatment: 'Subject to home-country social insurance' },
      { name: 'Expatriate', statutory_treatment: 'No pension (EOSG applies)' },
      { name: 'Domestic Worker', statutory_treatment: 'Special regulations' },
    ],
    employment: { max_weekly_hours: 48, probation_months: 6, notice_period_days: 30, retirement_age: 65, rest_days: 'Friday (minimum 1 day/week)', employment_types: ['Full-Time', 'Part-Time', 'Limited Contract', 'Unlimited Contract (Legacy)', 'Temporary', 'Internship', 'Probation'], contract_types: ['Full-time', 'Part-time', 'Limited', 'Unlimited'] },
    payroll: { frequencies: ['Monthly (Default)', 'Weekly'], minimum_wage: 0, payroll_cutoff: 'Last day of month', payroll_lock_date: '5th of next month', thirteenth_month: 'Not mandatory', bank_file_format: 'WPS SIF' },
    payroll_components: {
      earnings: [
        { name: 'Basic Salary', is_taxable: true }, { name: 'Housing Allowance', is_taxable: true },
        { name: 'Transport Allowance', is_taxable: true }, { name: 'Food Allowance', is_taxable: true },
        { name: 'Mobile Allowance', is_taxable: true }, { name: 'Overtime', is_taxable: true },
        { name: 'Commission', is_taxable: true }, { name: 'Bonus', is_taxable: true },
        { name: 'Leave Salary', is_taxable: true }, { name: 'Air Ticket Allowance', is_taxable: true },
        { name: 'Shift Allowance', is_taxable: true }, { name: 'Back Pay', is_taxable: true },
        { name: 'Leave Encashment', is_taxable: true },
      ],
      deductions: [
        { name: 'Employee Pension', is_taxable: false, is_mandatory: true },
        { name: 'Employer Pension', is_taxable: false, is_mandatory: true },
        { name: 'Salary Advance', is_taxable: false, is_mandatory: false },
        { name: 'Loan', is_taxable: false, is_mandatory: false },
        { name: 'Insurance', is_taxable: false, is_mandatory: false },
        { name: 'Court Order', is_taxable: false, is_mandatory: false },
        { name: 'Other Deduction', is_taxable: false, is_mandatory: false },
      ],
    },
    statutory_contributions: [
      { name: 'Pension (UAE National) — Employee', employee_rate: '5%', employer_rate: '0%', cap: 'AED 50,000', notes: 'GPSSA — UAE National employee contribution', formula_type: 'percentage', min_amount: 0, max_amount: 2500 },
      { name: 'Pension (UAE National) — Employer', employee_rate: '0%', employer_rate: '12.5%', cap: 'AED 50,000', notes: 'GPSSA — UAE National employer contribution', formula_type: 'percentage', min_amount: 0, max_amount: 6250 },
      { name: 'End-of-Service Gratuity', employee_rate: '0%', employer_rate: 'Variable', cap: '2 years+ service', notes: 'Calculated on termination — 21 days salary per year (first 5 years), 30 days thereafter', formula_type: 'eosg' },
      { name: 'Corporate Tax (CTA 2022)', employee_rate: '0%', employer_rate: '9%', cap: 'AED 375,000 threshold', notes: '9% on taxable profit exceeding AED 375,000', formula_type: 'percentage' },
      { name: 'VAT', employee_rate: '0%', employer_rate: '5%', cap: 'AED 375,000 registration threshold', notes: 'Standard rate — quarterly filing', formula_type: 'percentage' },
    ],
    income_tax: { brackets: [{ min: 0, max: null, rate: 0, fixed: 0 }], resident_rules: 'No personal income tax', filing_frequency: 'Corporate Tax: Annual (from 2023)' },
    sales_tax: [{ name: 'VAT', rate: 5, notes: 'Standard rate — 5% on taxable supplies' }, { name: 'Zero Rated', rate: 0, notes: 'Exports, international transport' }, { name: 'Exempt', rate: 0, notes: 'Residential property, certain financial services' }],
    leave: {
      types: [
        { name: 'Annual Leave', min_days: 30, carry_forward: 0, encashable: true },
        { name: 'Sick Leave', min_days: 15, carry_forward: 0, encashable: false },
        { name: 'Maternity Leave', min_days: 45, carry_forward: 0, encashable: false },
        { name: 'Paternity Leave', min_days: 5, carry_forward: 0, encashable: false },
        { name: 'Bereavement Leave', min_days: 3, carry_forward: 0, encashable: false },
        { name: 'Study Leave', min_days: 10, carry_forward: 0, encashable: false },
        { name: 'Unpaid Leave', min_days: 0, carry_forward: 0, encashable: false },
      ],
    },
    public_holidays: ['New Year\'s Day', 'Eid al-Fitr (3 days)', 'Eid al-Adha (3 days)', 'Islamic New Year', 'Prophet\'s Ascension', 'Ramadan (working hours reduced)', 'National Day (2 days)'],
    government_agencies: [
      { name: 'Ministry of Human Resources and Emiratisation (MOHRE)', submission_frequency: 'Monthly', portal: 'MOHRE Portal' },
      { name: 'Federal Tax Authority (FTA)', submission_frequency: 'Quarterly', portal: 'EmaraTax' },
      { name: 'General Pension and Social Security Authority (GPSSA)', submission_frequency: 'Monthly', portal: 'GPSSA Portal' },
    ],
    government_forms: [
      { name: 'WPS Payroll File', frequency: 'Monthly', deadline: '14th of month' },
      { name: 'VAT Return', frequency: 'Quarterly', deadline: '28th of month' },
      { name: 'Corporate Tax Return', frequency: 'Annual', deadline: '9 months after year end' },
      { name: 'Employment Contract', frequency: 'As required', deadline: 'Within 14 days of engagement' },
      { name: 'Labour Card', frequency: 'Annual', deadline: 'Renew before expiry' },
    ],
    accounting: {
      fiscal_year_start: '01-01', default_tax_code: 'SR', invoice_number_format: 'INV-{YYYY}-{0000}', payment_terms: 'Net 30',
      tax_codes: [
        { code: 'SR', name: 'Standard Rated', rate: 5, is_default: true },
        { code: 'ZR', name: 'Zero Rated', rate: 0, is_default: false },
        { code: 'EX', name: 'Exempt', rate: 0, is_default: false },
        { code: 'RC', name: 'Reverse Charge', rate: 0, is_default: false },
        { code: 'OS', name: 'Out of Scope', rate: 0, is_default: false },
      ],
    },
    banking: {
      bank_file_format: 'WPS SIF', supported_banks: ['Emirates NBD', 'ADCB', 'Mashreq', 'HSBC', 'Standard Chartered', 'FAB'],
      payment_methods: ['WPS SIF File', 'Bank Transfer', 'Direct Credit'],
    },
    compliance: {
      employment_act: 'UAE Labour Law (Federal Decree-Law 33/2021)',
      record_retention_years: 5,
      payslip_requirements: 'Mandatory via WPS — electronic payslip required',
      privacy_law: 'Federal Decree-Law 45/2021 (Personal Data Protection)',
      checklist: [
        { name: 'WPS Submission', frequency: 'Monthly', deadline: '14th of month' },
        { name: 'Employment Contract', frequency: 'One-time', deadline: 'Within 14 days of engagement' },
        { name: 'Visa Status Check', frequency: 'Ongoing', deadline: 'Before expiry' },
        { name: 'Work Permit Renewal', frequency: 'Annual', deadline: '30 days before expiry' },
        { name: 'Payroll Processing', frequency: 'Monthly', deadline: 'Last day of month' },
        { name: 'VAT Filing', frequency: 'Quarterly', deadline: '28th of month' },
        { name: 'Corporate Tax Filing', frequency: 'Annual', deadline: '9 months after year end' },
        { name: 'End-of-Service Gratuity', frequency: 'As required', deadline: 'Upon termination' },
        { name: 'Payslip Issuance', frequency: 'Monthly', deadline: 'Within 3 days of payroll' },
      ],
    },
    termination: { notice_period: '30-90 days based on service under UAE Labour Law', severance_pay: '21 days salary per year for first 5 years, 30 days thereafter (EOSG)', last_pay_rules: 'Within 14 days of termination including EOSG settlement' },
    foreign_workers: { work_pass_types: ['Employment Visa', 'Green Visa', 'Golden Visa', 'Freelance Visa'], levy: 'Varies by emirate (AED 250-1,000/month)', quota: 'No fixed quota; Emiratisation targets apply' },
    localisation: { address_format: 'Building, Street, Area, City, PO Box, UAE', postal_code_format: 'Not used (PO Box system)', phone_format: '+971 5x xxx xxxx', national_id_format: '000-0000-0000000-0 (Emirates ID)' },
    document_numbering: [
      { entity: 'employee', format: 'EMP-{000001}' },
      { entity: 'payroll', format: 'PAY-{YYYYMM}-{000001}' },
      { entity: 'invoice', format: 'INV-{YYYY}-{000001}' },
      { entity: 'purchase_order', format: 'PO-{YYYY}-{000001}' },
      { entity: 'claim', format: 'CLM-{YYYY}-{000001}' },
      { entity: 'leave', format: 'LV-{YYYY}-{000001}' },
    ],
    workflow_templates: [
      { name: 'Leave Approval', entity_type: 'leave', steps: [{ step_order: 1, assignee_role: 'Manager', action: 'approve' }, { step_order: 2, assignee_role: 'HR', action: 'approve' }] },
      { name: 'Claim Approval', entity_type: 'claims', steps: [{ step_order: 1, assignee_role: 'Manager', action: 'approve' }, { step_order: 2, assignee_role: 'Finance', action: 'approve' }] },
      { name: 'Purchase Order', entity_type: 'purchase_order', steps: [{ step_order: 1, assignee_role: 'Manager', action: 'approve' }, { step_order: 2, assignee_role: 'Finance', action: 'approve' }] },
    ],
    dashboard_widgets: ['Payroll Due', 'WPS Submission', 'VAT Return Due', 'Corporate Tax Due', 'Leave Balance', 'Pending Claims', 'Pending Approvals', 'Employee Headcount'],
  },
  AU: {
    general: { name: 'Australia', code: 'AU', currency: 'AUD', currency_symbol: 'A$', phone_code: '+61', timezone: 'Australia/Sydney', primary_language: 'English', date_format: 'DD/MM/YYYY', time_format: '24h', week_starts_on: 'Monday', financial_year: '01-07', tax_year: '01-07', default_payroll_frequency: 'Fortnightly', payslip_language: 'English' },
    employment_types: [
      { name: 'Full-Time', enabled: true }, { name: 'Part-Time', enabled: true },
      { name: 'Casual', enabled: true }, { name: 'Fixed-Term', enabled: true },
      { name: 'Temporary', enabled: true }, { name: 'Apprentice', enabled: true },
      { name: 'Trainee', enabled: true }, { name: 'Internship', enabled: true },
    ],
    employee_categories: [
      { name: 'Australian Resident', statutory_treatment: 'Super + PAYG applies' },
      { name: 'Temporary Resident', statutory_treatment: 'Usually Super + PAYG' },
      { name: 'Foreign Resident', statutory_treatment: 'PAYG only (no Super typically)' },
      { name: 'Working Holiday Maker', statutory_treatment: 'Special PAYG rates + optional Super' },
      { name: 'Contractor', statutory_treatment: 'No PAYG/Super (unless deemed employee)' },
    ],
    employment: { max_weekly_hours: 38, probation_months: 6, notice_period_days: 30, retirement_age: 67, rest_days: 'Weekend (Sat/Sun)', employment_types: ['Full-Time', 'Part-Time', 'Casual', 'Fixed-Term', 'Temporary', 'Apprentice', 'Trainee', 'Internship'], contract_types: ['Full-time', 'Part-time', 'Casual', 'Fixed-term'] },
    payroll: { frequencies: ['Weekly', 'Fortnightly', 'Monthly'], minimum_wage: 24.10, payroll_cutoff: 'Saturday', payroll_lock_date: '3 days after cutoff', thirteenth_month: 'Not common', bank_file_format: 'ABA/CSV' },
    payroll_components: {
      earnings: [
        { name: 'Basic Salary', is_taxable: true }, { name: 'Hourly Pay', is_taxable: true },
        { name: 'Overtime', is_taxable: true }, { name: 'Penalty Rates', is_taxable: true },
        { name: 'Commission', is_taxable: true }, { name: 'Bonus', is_taxable: true },
        { name: 'Allowance', is_taxable: true }, { name: 'Travel Allowance', is_taxable: true },
        { name: 'Meal Allowance', is_taxable: true }, { name: 'Motor Vehicle Allowance', is_taxable: true },
        { name: 'Tool Allowance', is_taxable: true }, { name: 'Shift Allowance', is_taxable: true },
        { name: 'Leave Loading', is_taxable: true }, { name: 'Back Pay', is_taxable: true },
        { name: 'Leave Encashment', is_taxable: true }, { name: 'Termination Payment', is_taxable: true },
      ],
      deductions: [
        { name: 'PAYG Withholding', is_taxable: false, is_mandatory: true },
        { name: 'Superannuation (Employer)', is_taxable: false, is_mandatory: true },
        { name: 'Superannuation (Salary Sacrifice)', is_taxable: false, is_mandatory: false },
        { name: 'Union Fees', is_taxable: false, is_mandatory: false },
        { name: 'HECS/HELP', is_taxable: false, is_mandatory: false },
        { name: 'Child Support', is_taxable: false, is_mandatory: false },
        { name: 'Loan', is_taxable: false, is_mandatory: false },
        { name: 'Salary Advance', is_taxable: false, is_mandatory: false },
        { name: 'Insurance', is_taxable: false, is_mandatory: false },
        { name: 'Other Deduction', is_taxable: false, is_mandatory: false },
      ],
    },
    statutory_contributions: [
      { name: 'Superannuation Guarantee', employee_rate: '0%', employer_rate: '11.5%', cap: 'No cap', notes: 'Employer contribution. Rate increasing to 12% by 2025.', formula_type: 'percentage' },
      { name: 'PAYG Withholding', employee_rate: 'Variable', employer_rate: '0%', cap: 'Based on ATO tax tables', notes: 'Pay As You Go — remitted to ATO', formula_type: 'ato_tax_table' },
      { name: 'Medicare Levy', employee_rate: '2%', employer_rate: '0%', cap: 'No cap', notes: 'Additional 1% for high income without private health insurance', formula_type: 'percentage' },
      { name: 'HECS/HELP Repayment', employee_rate: '1-10%', employer_rate: '0%', cap: 'Income-based', notes: 'Compulsory repayment when income exceeds threshold', formula_type: 'percentage' },
    ],
    income_tax: {
      brackets: [
        { min: 0, max: 18200, rate: 0, fixed: 0 },
        { min: 18200, max: 45000, rate: 19, fixed: 0 },
        { min: 45000, max: 120000, rate: 32.5, fixed: 5092 },
        { min: 120000, max: 180000, rate: 37, fixed: 29467 },
        { min: 180000, max: null, rate: 45, fixed: 51667 },
      ],
      resident_rules: '183 days/year',
      non_resident_rate: 45,
      filing_frequency: 'Annual via STP (Single Touch Payroll)',
      form_types: ['STP Report', 'Income Statement', 'TFN Declaration', 'BAS (Activity Statement)'],
    },
    sales_tax: [{ name: 'GST', rate: 10, notes: 'Goods and Services Tax — 10% on most goods and services' }],
    leave: {
      types: [
        { name: 'Annual Leave', min_days: 20, carry_forward: 0, encashable: true },
        { name: 'Personal/Carer\'s Leave', min_days: 10, carry_forward: 0, encashable: false },
        { name: 'Compassionate Leave', min_days: 2, carry_forward: 0, encashable: false },
        { name: 'Parental Leave', min_days: 365, carry_forward: 0, encashable: false },
        { name: 'Long Service Leave', min_days: 60, carry_forward: 0, encashable: true },
        { name: 'Community Service Leave', min_days: 10, carry_forward: 0, encashable: false },
        { name: 'Family & Domestic Violence Leave', min_days: 10, carry_forward: 0, encashable: false },
        { name: 'Unpaid Leave', min_days: 0, carry_forward: 0, encashable: false },
      ],
    },
    public_holidays: ['New Year\'s Day', 'Australia Day', 'Good Friday', 'Easter Monday', 'ANZAC Day', 'Labour Day (state-dependent)', 'King\'s Birthday', 'Christmas Day', 'Boxing Day', 'State-specific holidays vary'],
    government_agencies: [
      { name: 'Australian Taxation Office (ATO)', submission_frequency: 'Pay event', portal: 'ATO Business Portal' },
      { name: 'Fair Work Ombudsman', submission_frequency: 'As required', portal: 'Fair Work Portal' },
      { name: 'Services Australia', submission_frequency: 'As required', portal: 'Services Australia' },
      { name: 'State Revenue Offices', submission_frequency: 'Monthly/Quarterly', portal: 'Varies by state' },
    ],
    government_forms: [
      { name: 'Single Touch Payroll (STP)', frequency: 'Pay event', deadline: 'Pay day' },
      { name: 'Activity Statement (BAS/IAS)', frequency: 'Monthly/Quarterly', deadline: '21st/28th of month' },
      { name: 'Payment Summary (Historical)', frequency: 'Annual', deadline: '14 Jul' },
      { name: 'TFN Declaration', frequency: 'On hire', deadline: '14 days of commencement' },
      { name: 'SuperStream', frequency: 'Quarterly', deadline: '28 days after quarter end' },
    ],
    accounting: {
      fiscal_year_start: '01-07', default_tax_code: 'GST', invoice_number_format: 'INV-{YYYY}-{0000}', payment_terms: 'Net 30',
      tax_codes: [
        { code: 'GST', name: 'GST', rate: 10, is_default: true },
        { code: 'GSTF', name: 'GST Free', rate: 0, is_default: false },
        { code: 'ITS', name: 'Input Taxed', rate: 0, is_default: false },
        { code: 'BAS', name: 'BAS Excluded', rate: 0, is_default: false },
        { code: 'OS', name: 'Out of Scope', rate: 0, is_default: false },
      ],
    },
    banking: {
      bank_file_format: 'ABA/CSV', supported_banks: ['Commonwealth', 'Westpac', 'NAB', 'ANZ', 'Macquarie', 'ING'],
      payment_methods: ['ABA File', 'Direct Credit', 'Bank Transfer'],
    },
    compliance: {
      employment_act: 'Fair Work Act 2009',
      record_retention_years: 7,
      payslip_requirements: 'Itemised payslip within 1 day of pay day',
      privacy_law: 'Privacy Act 1988 (Australian Privacy Principles)',
      checklist: [
        { name: 'STP Submission', frequency: 'Pay event', deadline: 'Pay day' },
        { name: 'PAYG Withholding', frequency: 'Pay event', deadline: 'Pay day' },
        { name: 'Superannuation Payment', frequency: 'Quarterly', deadline: '28 days after quarter end' },
        { name: 'TFN Declaration', frequency: 'One-time', deadline: '14 days of commencement' },
        { name: 'Fair Work Compliance', frequency: 'Ongoing', deadline: 'Continuous' },
        { name: 'Payslip Issuance', frequency: 'Pay event', deadline: 'Within 1 day of pay day' },
        { name: 'Employment Contract', frequency: 'One-time', deadline: 'Before start date' },
        { name: 'Leave Compliance', frequency: 'Ongoing', deadline: 'Continuous' },
      ],
    },
    termination: { notice_period: '1-5 weeks based on age and years of service', severance_pay: '4-16 weeks based on years of service (excluded for <2 years)', last_pay_rules: 'Within 7 days of termination including all entitlements' },
    foreign_workers: { work_pass_types: ['TSS 482 (Employer-Sponsored)', 'Skilled Independent 189', 'Working Holiday 417', 'Student Visa (limited work rights)'], levy: 'Training Levy (Skilling Australians Fund) applies', quota: 'Occupation-dependent (occupation lists)' },
    localisation: { address_format: 'Unit/Street, Suburb, State, Postcode', postal_code_format: '4 digits', phone_format: '+61 04xx xxx xxx', national_id_format: 'XXX XXX XXX (Tax File Number)' },
    document_numbering: [
      { entity: 'employee', format: 'EMP-{000001}' },
      { entity: 'payroll', format: 'PAY-{YYYYMM}-{000001}' },
      { entity: 'invoice', format: 'INV-{YYYY}-{000001}' },
      { entity: 'purchase_order', format: 'PO-{YYYY}-{000001}' },
      { entity: 'claim', format: 'CLM-{YYYY}-{000001}' },
      { entity: 'leave', format: 'LV-{YYYY}-{000001}' },
    ],
    workflow_templates: [
      { name: 'Leave Approval', entity_type: 'leave', steps: [{ step_order: 1, assignee_role: 'Manager', action: 'approve' }, { step_order: 2, assignee_role: 'HR', action: 'approve' }] },
      { name: 'Claim Approval', entity_type: 'claims', steps: [{ step_order: 1, assignee_role: 'Manager', action: 'approve' }, { step_order: 2, assignee_role: 'Finance', action: 'approve' }] },
      { name: 'Purchase Order', entity_type: 'purchase_order', steps: [{ step_order: 1, assignee_role: 'Manager', action: 'approve' }, { step_order: 2, assignee_role: 'Finance', action: 'approve' }] },
    ],
    dashboard_widgets: ['Payroll Due', 'STP Status', 'Super Due', 'PAYG Due', 'Leave Balance', 'Pending Claims', 'Pending Approvals', 'Employee Headcount'],
  },
  NZ: {
    general: { name: 'New Zealand', code: 'NZ', currency: 'NZD', currency_symbol: 'NZ$', phone_code: '+64', timezone: 'Pacific/Auckland', primary_language: 'English', secondary_language: 'Māori', date_format: 'DD/MM/YYYY', time_format: '24h', week_starts_on: 'Monday', financial_year: '01-04', tax_year: '01-04', default_payroll_frequency: 'Fortnightly', payslip_language: 'English' },
    employment_types: [
      { name: 'Full-Time', enabled: true }, { name: 'Part-Time', enabled: true },
      { name: 'Casual', enabled: true }, { name: 'Fixed-Term', enabled: true },
      { name: 'Temporary', enabled: true }, { name: 'Seasonal', enabled: true },
      { name: 'Apprentice', enabled: true }, { name: 'Internship', enabled: true },
    ],
    employee_categories: [
      { name: 'New Zealand Citizen', statutory_treatment: 'KiwiSaver opt-in + PAYE' },
      { name: 'Permanent Resident', statutory_treatment: 'KiwiSaver + PAYE' },
      { name: 'Temporary Visa Holder', statutory_treatment: 'PAYE only (no KiwiSaver)' },
      { name: 'Working Holiday Visa', statutory_treatment: 'PAYE only (no KiwiSaver)' },
      { name: 'Contractor', statutory_treatment: 'No PAYE/KiwiSaver (unless deemed)' },
    ],
    employment: { max_weekly_hours: 40, probation_months: 3, notice_period_days: 30, retirement_age: 65, rest_days: 'Weekend', employment_types: ['Full-Time', 'Part-Time', 'Casual', 'Fixed-Term', 'Temporary', 'Seasonal', 'Apprentice', 'Internship'], contract_types: ['Full-time', 'Part-time', 'Casual', 'Fixed-term'] },
    payroll: { frequencies: ['Weekly', 'Fortnightly', 'Monthly'], minimum_wage: 23.15, payroll_cutoff: 'Saturday', payroll_lock_date: '3 days after cutoff', thirteenth_month: 'Not common', bank_file_format: 'Direct Credit CSV' },
    payroll_components: {
      earnings: [
        { name: 'Basic Salary', is_taxable: true }, { name: 'Hourly Wage', is_taxable: true },
        { name: 'Overtime', is_taxable: true }, { name: 'Commission', is_taxable: true },
        { name: 'Bonus', is_taxable: true }, { name: 'Allowance', is_taxable: true },
        { name: 'Meal Allowance', is_taxable: true }, { name: 'Travel Allowance', is_taxable: true },
        { name: 'Tool Allowance', is_taxable: true }, { name: 'Shift Allowance', is_taxable: true },
        { name: 'Back Pay', is_taxable: true }, { name: 'Leave Payment', is_taxable: true },
        { name: 'Holiday Pay', is_taxable: true }, { name: 'Leave Encashment', is_taxable: true },
        { name: 'Termination Payment', is_taxable: true },
      ],
      deductions: [
        { name: 'PAYE', is_taxable: false, is_mandatory: true },
        { name: 'KiwiSaver Employee', is_taxable: false, is_mandatory: false },
        { name: 'ACC Earners\' Levy', is_taxable: false, is_mandatory: true },
        { name: 'Student Loan', is_taxable: false, is_mandatory: false },
        { name: 'Child Support', is_taxable: false, is_mandatory: false },
        { name: 'Salary Advance', is_taxable: false, is_mandatory: false },
        { name: 'Loan', is_taxable: false, is_mandatory: false },
        { name: 'Insurance', is_taxable: false, is_mandatory: false },
        { name: 'Union Fee', is_taxable: false, is_mandatory: false },
        { name: 'Other Deduction', is_taxable: false, is_mandatory: false },
      ],
    },
    statutory_contributions: [
      { name: 'PAYE', employee_rate: '10.5-39%', employer_rate: '0%', cap: 'Income-based', notes: 'Pay As You Earn — progressive tax brackets', formula_type: 'tax_table' },
      { name: 'KiwiSaver Employee', employee_rate: '3-8%', employer_rate: '0%', cap: 'No cap', notes: 'Employee chooses 3%, 4%, 6%, 8% or 10%', formula_type: 'percentage' },
      { name: 'KiwiSaver Employer', employee_rate: '0%', employer_rate: '3%', cap: 'No cap', notes: 'Employer minimum contribution 3%', formula_type: 'percentage' },
      { name: 'ACC Earners\' Levy', employee_rate: '1.39%', employer_rate: '0%', cap: 'Per $100 of earnings', notes: 'ACC levy rate set annually', formula_type: 'percentage' },
      { name: 'Student Loan', employee_rate: '12%', employer_rate: '0%', cap: 'Income-based', notes: 'Deducted when income exceeds repayment threshold', formula_type: 'percentage' },
    ],
    income_tax: {
      brackets: [
        { min: 0, max: 14000, rate: 10.5, fixed: 0 },
        { min: 14000, max: 48000, rate: 17.5, fixed: 0 },
        { min: 48000, max: 70000, rate: 30, fixed: 0 },
        { min: 70000, max: 180000, rate: 33, fixed: 0 },
        { min: 180000, max: null, rate: 39, fixed: 0 },
      ],
      resident_rules: '183 days/year',
      non_resident_rate: 39,
      filing_frequency: 'Payday filing (Employment Information)',
    },
    sales_tax: [{ name: 'GST', rate: 15, notes: 'Goods and Services Tax — 15% standard' }],
    leave: {
      types: [
        { name: 'Annual Leave', min_days: 20, carry_forward: 0, encashable: true },
        { name: 'Sick Leave', min_days: 10, carry_forward: 0, encashable: false },
        { name: 'Bereavement Leave', min_days: 3, carry_forward: 0, encashable: false },
        { name: 'Family Violence Leave', min_days: 10, carry_forward: 0, encashable: false },
        { name: 'Parental Leave', min_days: 365, carry_forward: 0, encashable: false },
        { name: 'Alternative Holiday', min_days: 0, carry_forward: 0, encashable: false },
        { name: 'Unpaid Leave', min_days: 0, carry_forward: 0, encashable: false },
      ],
    },
    public_holidays: ['New Year\'s Day', 'Day After New Year', 'Waitangi Day', 'Good Friday', 'Easter Monday', 'ANZAC Day', 'King\'s Birthday', 'Matariki', 'Labour Day', 'Christmas Day', 'Boxing Day', 'Regional anniversary holidays vary'],
    government_agencies: [
      { name: 'Inland Revenue (IRD)', submission_frequency: 'Pay event', portal: 'myIR' },
      { name: 'Employment New Zealand', submission_frequency: 'As required', portal: 'Employment NZ' },
      { name: 'Accident Compensation Corporation (ACC)', submission_frequency: 'Annual', portal: 'ACC Portal' },
    ],
    government_forms: [
      { name: 'Employment Information (EI)', frequency: 'Pay event', deadline: 'Within 2 days of pay day' },
      { name: 'IR330 (Tax Code Declaration)', frequency: 'On hire', deadline: 'Before first pay' },
      { name: 'IR330C', frequency: 'On hire', deadline: 'Before first pay' },
      { name: 'KiwiSaver KS2', frequency: 'On opt-in', deadline: 'Within 7 days' },
      { name: 'KiwiSaver KS10', frequency: 'On contribution holiday', deadline: 'As required' },
      { name: 'Student Loan Declaration', frequency: 'On hire', deadline: 'Before first pay' },
    ],
    accounting: {
      fiscal_year_start: '01-04', default_tax_code: 'GST', invoice_number_format: 'INV-{YYYY}-{0000}', payment_terms: 'Net 20',
      tax_codes: [
        { code: 'GST', name: 'GST Standard', rate: 15, is_default: true },
        { code: 'GSTZ', name: 'GST Zero Rated', rate: 0, is_default: false },
        { code: 'EX', name: 'GST Exempt', rate: 0, is_default: false },
        { code: 'OS', name: 'Out of Scope', rate: 0, is_default: false },
      ],
    },
    banking: {
      bank_file_format: 'Direct Credit CSV', supported_banks: ['ANZ', 'ASB', 'BNZ', 'Westpac', 'Kiwibank', 'TSB'],
      payment_methods: ['Direct Credit', 'Bank Transfer', 'Batch Payment File'],
    },
    compliance: {
      employment_act: 'Employment Relations Act 2000',
      record_retention_years: 7,
      payslip_requirements: 'Itemised payslip required',
      privacy_law: 'Privacy Act 2020',
      checklist: [
        { name: 'PAYE Filing (Employment Information)', frequency: 'Pay event', deadline: 'Within 2 days of pay day' },
        { name: 'KiwiSaver Contributions', frequency: 'Pay event', deadline: 'Pay day' },
        { name: 'ACC Levy Payment', frequency: 'Annual', deadline: 'Per IRD schedule' },
        { name: 'Employment Information Submission', frequency: 'Pay event', deadline: 'Within 2 days' },
        { name: 'Payslip Issuance', frequency: 'Pay event', deadline: 'Pay day' },
        { name: 'Employment Agreement', frequency: 'One-time', deadline: 'Before start date' },
        { name: 'Leave Compliance', frequency: 'Ongoing', deadline: 'Continuous' },
        { name: 'Student Loan Deductions', frequency: 'Pay event', deadline: 'Pay day' },
      ],
    },
    termination: { notice_period: 'Contractual or statutory minimum based on service', severance_pay: 'Not mandatory under NZ law', last_pay_rules: 'Within 7 days of termination including annual leave payout' },
    foreign_workers: { work_pass_types: ['Accredited Employer WVP', 'Working Holiday Visa', 'Skilled Migrant Resident Visa', 'Post-Study Work Visa'], levy: 'No specific levy', quota: 'Occupation-dependent (Green List)' },
    localisation: { address_format: 'Street, Suburb, City, Postcode', postal_code_format: '4 digits', phone_format: '+64 2x xxx xxxx', national_id_format: 'XXX-XXXX-XXX (IRD Number)' },
    document_numbering: [
      { entity: 'employee', format: 'EMP-{000001}' },
      { entity: 'payroll', format: 'PAY-{YYYYMM}-{000001}' },
      { entity: 'invoice', format: 'INV-{YYYY}-{000001}' },
      { entity: 'purchase_order', format: 'PO-{YYYY}-{000001}' },
      { entity: 'claim', format: 'CLM-{YYYY}-{000001}' },
      { entity: 'leave', format: 'LV-{YYYY}-{000001}' },
    ],
    workflow_templates: [
      { name: 'Leave Approval', entity_type: 'leave', steps: [{ step_order: 1, assignee_role: 'Manager', action: 'approve' }, { step_order: 2, assignee_role: 'HR', action: 'approve' }] },
      { name: 'Claim Approval', entity_type: 'claims', steps: [{ step_order: 1, assignee_role: 'Manager', action: 'approve' }, { step_order: 2, assignee_role: 'Finance', action: 'approve' }] },
      { name: 'Purchase Order', entity_type: 'purchase_order', steps: [{ step_order: 1, assignee_role: 'Manager', action: 'approve' }, { step_order: 2, assignee_role: 'Finance', action: 'approve' }] },
    ],
    dashboard_widgets: ['Payroll Due', 'PAYE Due', 'KiwiSaver Due', 'ACC Levy', 'Pending Leave', 'Pending Claims', 'Pending Approvals', 'Employee Headcount'],
  },
  GB: {
    general: { name: 'United Kingdom', code: 'GB', currency: 'GBP', currency_symbol: '\u00a3', phone_code: '+44', timezone: 'Europe/London', primary_language: 'English', date_format: 'DD/MM/YYYY', time_format: '24h', week_starts_on: 'Monday', financial_year: '06-04', tax_year: '06-04', default_payroll_frequency: 'Monthly', payslip_language: 'English' },
    employment_types: [
      { name: 'Full-Time', enabled: true }, { name: 'Part-Time', enabled: true },
      { name: 'Fixed-Term', enabled: true }, { name: 'Temporary', enabled: true },
      { name: 'Casual', enabled: true }, { name: 'Zero-Hours Contract', enabled: true },
      { name: 'Apprentice', enabled: true }, { name: 'Internship', enabled: true },
    ],
    employee_categories: [
      { name: 'UK Employee', statutory_treatment: 'PAYE + NI + Pension' },
      { name: 'Director', statutory_treatment: 'PAYE + Director NI + Pension' },
      { name: 'Apprentice', statutory_treatment: 'PAYE + NI + Pension' },
      { name: 'Foreign Worker', statutory_treatment: 'PAYE + NI (if eligible)' },
      { name: 'Contractor', statutory_treatment: 'No PAYE/NI (outside IR35)' },
    ],
    employment: { max_weekly_hours: 48, probation_months: 6, notice_period_days: 30, retirement_age: 66, rest_days: 'Weekend (Sunday workers have special rules)', employment_types: ['Full-Time', 'Part-Time', 'Fixed-Term', 'Temporary', 'Casual', 'Zero-Hours Contract', 'Apprentice', 'Internship'], contract_types: ['Full-time', 'Part-time', 'Fixed-term', 'Zero-hour'] },
    payroll: { frequencies: ['Weekly', 'Fortnightly', 'Four-Weekly', 'Monthly'], minimum_wage: 11.44, payroll_cutoff: 'Last Friday of month', payroll_lock_date: '3 days before pay', thirteenth_month: 'Not mandatory', bank_file_format: 'BACS CSV' },
    payroll_components: {
      earnings: [
        { name: 'Basic Salary', is_taxable: true }, { name: 'Hourly Wage', is_taxable: true },
        { name: 'Overtime', is_taxable: true }, { name: 'Commission', is_taxable: true },
        { name: 'Bonus', is_taxable: true }, { name: 'Allowance', is_taxable: true },
        { name: 'Shift Allowance', is_taxable: true }, { name: 'Car Allowance', is_taxable: true },
        { name: 'Travel Allowance', is_taxable: true }, { name: 'Back Pay', is_taxable: true },
        { name: 'Holiday Pay', is_taxable: true }, { name: 'Sick Pay', is_taxable: true },
        { name: 'Leave Encashment', is_taxable: true }, { name: 'Termination Payment', is_taxable: true },
      ],
      deductions: [
        { name: 'PAYE', is_taxable: false, is_mandatory: true },
        { name: 'National Insurance (Employee)', is_taxable: false, is_mandatory: true },
        { name: 'Workplace Pension', is_taxable: false, is_mandatory: false },
        { name: 'Student Loan', is_taxable: false, is_mandatory: false },
        { name: 'Postgraduate Loan', is_taxable: false, is_mandatory: false },
        { name: 'Attachment of Earnings', is_taxable: false, is_mandatory: false },
        { name: 'Salary Advance', is_taxable: false, is_mandatory: false },
        { name: 'Loan', is_taxable: false, is_mandatory: false },
        { name: 'Union Fees', is_taxable: false, is_mandatory: false },
        { name: 'Other Deduction', is_taxable: false, is_mandatory: false },
      ],
    },
    statutory_contributions: [
      { name: 'PAYE Income Tax', employee_rate: '20-45%', employer_rate: '0%', cap: 'Threshold-based', notes: 'Cumulative tax-free personal allowance', formula_type: 'tax_table' },
      { name: 'National Insurance Class 1 (Employee)', employee_rate: '12%', employer_rate: '0%', cap: '\u00a312,570-\u00a350,270', notes: '2% above upper earnings limit', formula_type: 'percentage', min_amount: 12570, max_amount: 50270 },
      { name: 'National Insurance Class 1 (Employer)', employee_rate: '0%', employer_rate: '13.8%', cap: 'Above \u00a3175/week', notes: 'Employment allowance may apply', formula_type: 'percentage' },
      { name: 'Workplace Pension (Auto-Enrolment)', employee_rate: '5%', employer_rate: '3%', cap: 'Qualifying earnings band', notes: 'Minimum total 8%; opt-out available', formula_type: 'percentage' },
      { name: 'Student Loan (Plan 1/2/4)', employee_rate: '9%', employer_rate: '0%', cap: 'Above repayment threshold', notes: 'Plan 1: \u00a322,015; Plan 2: \u00a327,295; Plan 4: \u00a331,395', formula_type: 'percentage' },
      { name: 'Postgraduate Loan', employee_rate: '6%', employer_rate: '0%', cap: 'Above \u00a321,000 threshold', notes: 'Deducted alongside student loan', formula_type: 'percentage' },
    ],
    income_tax: {
      brackets: [
        { min: 0, max: 12570, rate: 0, fixed: 0 },
        { min: 12570, max: 50270, rate: 20, fixed: 0 },
        { min: 50270, max: 125140, rate: 40, fixed: 0 },
        { min: 125140, max: null, rate: 45, fixed: 0 },
      ],
      resident_rules: '183 days/year + statutory residence test',
      filing_frequency: 'Real-Time Information (RTI) per pay period',
      form_types: ['FPS', 'EPS', 'P45', 'P60', 'P11D'],
    },
    sales_tax: [{ name: 'VAT Standard', rate: 20, notes: 'Standard rate — most goods and services' }, { name: 'VAT Reduced', rate: 5, notes: 'Reduced rate on certain goods' }, { name: 'VAT Zero', rate: 0, notes: 'Zero-rated essentials (food, childrens clothes)' }],
    leave: {
      types: [
        { name: 'Annual Leave', min_days: 28, carry_forward: 0, encashable: true },
        { name: 'Sick Leave (SSP)', min_days: 28, carry_forward: 0, encashable: false },
        { name: 'Maternity Leave', min_days: 365, carry_forward: 0, encashable: false },
        { name: 'Paternity Leave', min_days: 14, carry_forward: 0, encashable: false },
        { name: 'Shared Parental Leave', min_days: 365, carry_forward: 0, encashable: false },
        { name: 'Adoption Leave', min_days: 365, carry_forward: 0, encashable: false },
        { name: 'Parental Bereavement Leave', min_days: 14, carry_forward: 0, encashable: false },
        { name: 'Unpaid Leave', min_days: 0, carry_forward: 0, encashable: false },
      ],
    },
    public_holidays: ['New Year\'s Day (E&W/NI)', 'Good Friday (E&W/NI)', 'Easter Monday (E&W/NI)', 'Early May Bank Holiday', 'Spring Bank Holiday', 'Summer Bank Holiday (E&W)', 'Summer Bank Holiday (Scotland)', 'St Andrew\'s Day (Scotland)', 'St Patrick\'s Day (NI)', 'Christmas Day', 'Boxing Day'],
    government_agencies: [
      { name: 'HM Revenue & Customs (HMRC)', submission_frequency: 'Pay event', portal: 'Government Gateway' },
      { name: 'The Pensions Regulator', submission_frequency: 'Annual', portal: 'TPR Portal' },
      { name: 'Companies House', submission_frequency: 'Annual', portal: 'Companies House' },
    ],
    government_forms: [
      { name: 'FPS (Full Payment Submission)', frequency: 'Pay event', deadline: 'On or before pay day' },
      { name: 'EPS (Employer Payment Summary)', frequency: 'Monthly', deadline: 'Pay day' },
      { name: 'P45', frequency: 'As required', deadline: 'On termination' },
      { name: 'P60', frequency: 'Annual', deadline: '31 May' },
      { name: 'P11D (Benefits in Kind)', frequency: 'Annual', deadline: '6 July' },
      { name: 'Starter Checklist', frequency: 'On hire', deadline: 'Before first pay' },
    ],
    accounting: {
      fiscal_year_start: '06-04', default_tax_code: 'VAT', invoice_number_format: 'INV-{YYYY}-{0000}', payment_terms: 'Net 30',
      tax_codes: [
        { code: 'VATS', name: 'VAT Standard', rate: 20, is_default: true },
        { code: 'VATR', name: 'VAT Reduced', rate: 5, is_default: false },
        { code: 'VATZ', name: 'VAT Zero', rate: 0, is_default: false },
        { code: 'EX', name: 'Exempt', rate: 0, is_default: false },
        { code: 'OS', name: 'Outside Scope', rate: 0, is_default: false },
        { code: 'RC', name: 'Reverse Charge', rate: 0, is_default: false },
      ],
    },
    banking: {
      bank_file_format: 'BACS CSV', supported_banks: ['Barclays', 'HSBC', 'Lloyds', 'NatWest', 'Santander', 'Nationwide'],
      payment_methods: ['BACS', 'Faster Payments', 'Bank Transfer'],
    },
    compliance: {
      employment_act: 'Employment Rights Act 1996',
      record_retention_years: 6,
      payslip_requirements: 'Itemised payslip mandatory since 2019',
      privacy_law: 'UK GDPR / Data Protection Act 2018',
      checklist: [
        { name: 'RTI Filing (FPS)', frequency: 'Pay event', deadline: 'On or before pay day' },
        { name: 'PAYE Payment', frequency: 'Monthly', deadline: '22nd of month (electronic)' },
        { name: 'National Insurance Payment', frequency: 'Monthly', deadline: '22nd of month (electronic)' },
        { name: 'Pension Contributions', frequency: 'Monthly', deadline: '22nd of month' },
        { name: 'Auto Enrolment Duties', frequency: 'Ongoing', deadline: 'Continuous' },
        { name: 'P60 Issuance', frequency: 'Annual', deadline: '31 May' },
        { name: 'P45 Generation', frequency: 'As required', deadline: 'On termination' },
        { name: 'Employment Contract', frequency: 'One-time', deadline: 'Before start date' },
        { name: 'Payslip Issuance', frequency: 'Pay event', deadline: 'Pay day' },
      ],
    },
    termination: { notice_period: '1-12 weeks based on years of service (statutory minimum)', severance_pay: 'Statutory redundancy pay (1-20 weeks, capped at \u00a3643/week)', last_pay_rules: 'Final pay including accrued holiday on or before termination or next pay day' },
    foreign_workers: { work_pass_types: ['Skilled Worker Visa', 'Global Talent Visa', 'Youth Mobility Scheme', 'Health & Care Worker Visa'], levy: 'Immigration Skills Charge (\u00a31,000/year per sponsored worker)', quota: 'No fixed quota; points-based system' },
    localisation: { address_format: 'Street, Town, County, Postcode', postal_code_format: 'AA00 0AA (alphanumeric)', phone_format: '+44 7xxx xxxxxx', national_id_format: 'AB123456C (NI Number)' },
    document_numbering: [
      { entity: 'employee', format: 'EMP-{000001}' },
      { entity: 'payroll', format: 'PAY-{YYYYMM}-{000001}' },
      { entity: 'invoice', format: 'INV-{YYYY}-{000001}' },
      { entity: 'purchase_order', format: 'PO-{YYYY}-{000001}' },
      { entity: 'claim', format: 'CLM-{YYYY}-{000001}' },
      { entity: 'leave', format: 'LV-{YYYY}-{000001}' },
    ],
    workflow_templates: [
      { name: 'Leave Approval', entity_type: 'leave', steps: [{ step_order: 1, assignee_role: 'Manager', action: 'approve' }, { step_order: 2, assignee_role: 'HR', action: 'approve' }] },
      { name: 'Claim Approval', entity_type: 'claims', steps: [{ step_order: 1, assignee_role: 'Manager', action: 'approve' }, { step_order: 2, assignee_role: 'Finance', action: 'approve' }] },
      { name: 'Purchase Order', entity_type: 'purchase_order', steps: [{ step_order: 1, assignee_role: 'Manager', action: 'approve' }, { step_order: 2, assignee_role: 'Finance', action: 'approve' }] },
    ],
    dashboard_widgets: ['Payroll Due', 'RTI Submission', 'PAYE Due', 'National Insurance Due', 'Pension Due', 'Pending Leave', 'Pending Claims', 'Employee Headcount'],
  },
  US: {
    general: { name: 'United States', code: 'US', currency: 'USD', currency_symbol: '$', phone_code: '+1', timezone: 'America/New_York', primary_language: 'English', date_format: 'MM/DD/YYYY', time_format: '12h', week_starts_on: 'Sunday', financial_year: '01-01', tax_year: '01-01', default_payroll_frequency: 'Bi-weekly' },
    employment: { max_weekly_hours: 40, probation_months: 3, notice_period_days: 14, retirement_age: 67, rest_days: 'At-will employment', employment_types: ['Regular', 'Temporary', 'Contract', 'Intern', 'Seasonal'], contract_types: ['Full-time', 'Part-time', 'At-will'] },
    payroll: { frequencies: ['Weekly', 'Bi-weekly', 'Semi-monthly', 'Monthly'], minimum_wage: 7.25, payroll_cutoff: 'Saturday', payroll_lock_date: '5 days before pay', thirteenth_month: 'Not common', bank_file_format: 'ACH NACHA' },
    statutory_contributions: [
      { name: 'FICA SS', employee_rate: '6.2%', employer_rate: '6.2%', cap: '$168,600', notes: 'Social Security (2024)' },
      { name: 'FICA Medicare', employee_rate: '1.45%', employer_rate: '1.45%', cap: 'No cap', notes: 'Additional 0.9% above $200k' },
      { name: 'FUTA', employee_rate: '0%', employer_rate: '6%', cap: '$7,000', notes: 'Federal Unemployment' },
      { name: 'SUTA', employee_rate: '0%', employer_rate: 'Variable', cap: 'Varies by state', notes: 'State Unemployment (varies)' },
    ],
    income_tax: { brackets: [{ min: 0, max: 11600, rate: 10, fixed: 0 }, { min: 11600, max: 47150, rate: 12, fixed: 1160 }, { min: 47150, max: 100525, rate: 22, fixed: 5427 }, { min: 100525, max: 191950, rate: 24, fixed: 17189 }, { min: 191950, max: 243725, rate: 32, fixed: 39110 }, { min: 243725, max: 609350, rate: 35, fixed: 55678 }, { min: 609350, max: null, rate: 37, fixed: 183647 }], resident_rules: '31 days in current year / 183 days in 3-year period', filing_frequency: 'Annual (W-2)' },
    sales_tax: [{ name: 'State Sales Tax', rate: 0, notes: 'Varies by state (0-10.25%)' }],
    leave: { types: [{ name: 'Annual Leave', min_days: 0, carry_forward: 0, encashable: false }, { name: 'Sick Leave', min_days: 0, carry_forward: 0, encashable: false }, { name: 'FMLA', min_days: 90, carry_forward: 0, encashable: false }, { name: 'Maternity Leave', min_days: 90, carry_forward: 0, encashable: false }] },
    public_holidays: ['New Year\'s Day', 'Martin Luther King Jr. Day', 'Presidents\' Day', 'Memorial Day', 'Juneteenth', 'Independence Day', 'Labour Day', 'Veterans Day', 'Thanksgiving Day', 'Christmas Day'],
    government_agencies: [{ name: 'IRS', submission_frequency: 'Pay event/Quarterly', portal: 'EFTPS/IRS Portal' }, { name: 'SSA', submission_frequency: 'Annual', portal: 'Social Security Portal' }, { name: 'DOL', submission_frequency: 'As required', portal: 'DOL Portal' }, { name: 'State Agency', submission_frequency: 'Varies', portal: 'Varies by state' }],
    government_forms: [{ name: 'W-2', frequency: 'Annual', deadline: '31 Jan' }, { name: 'W-4', frequency: 'On hire', deadline: 'On hire' }, { name: '941', frequency: 'Quarterly', deadline: 'Last day of month' }, { name: '940', frequency: 'Annual', deadline: '31 Jan' }, { name: 'W-3', frequency: 'Annual', deadline: '31 Jan' }, { name: '1099-NEC', frequency: 'Annual', deadline: '31 Jan' }],
    accounting: { fiscal_year_start: '01-01', default_tax_code: 'Sales Tax', invoice_number_format: 'INV-{YYYY}-{0000}', payment_terms: 'Net 30' },
    banking: { bank_file_format: 'ACH NACHA', supported_banks: ['Chase', 'Bank of America', 'Wells Fargo', 'Citi', 'US Bank', 'PNC'] },
    compliance: { employment_act: 'FLSA (Fair Labor Standards Act)', record_retention_years: 4, payslip_requirements: 'Pay stub mandatory in most states', privacy_law: 'CCPA (California)/State laws' },
    termination: { notice_period: 'At-will (no notice required)', severance_pay: 'Not mandatory (common for executives)', last_pay_rules: 'Within 5-7 days (state-dependent)' },
    foreign_workers: { work_pass_types: ['H-1B', 'L-1', 'O-1', 'OPT', 'Green Card'], levy: 'H-1B filing fees', quota: 'H-1B cap 85,000/year' },
    localisation: { address_format: 'Street, City, State, ZIP', postal_code_format: '5 digits or 5+4', phone_format: '+1 (555) 555-5555', national_id_format: 'XXX-XX-XXXX (SSN)' },
  },
  CA: {
    general: { name: 'Canada', code: 'CA', currency: 'CAD', currency_symbol: 'C$', phone_code: '+1', timezone: 'America/Toronto', primary_language: 'English/French', date_format: 'YYYY-MM-DD', time_format: '24h', week_starts_on: 'Monday', financial_year: '01-01', tax_year: '01-01', default_payroll_frequency: 'Bi-weekly' },
    employment: { max_weekly_hours: 40, probation_months: 3, notice_period_days: 30, retirement_age: 65, rest_days: 'Weekend', employment_types: ['Permanent', 'Contract', 'Temporary', 'Seasonal'], contract_types: ['Full-time', 'Part-time', 'Casual'] },
    payroll: { frequencies: ['Weekly', 'Bi-weekly', 'Semi-monthly', 'Monthly'], minimum_wage: 16.65, payroll_cutoff: 'Saturday', payroll_lock_date: '3 days before pay', thirteenth_month: 'Not mandatory', bank_file_format: 'ACH/CSV' },
    statutory_contributions: [
      { name: 'CPP', employee_rate: '5.95%', employer_rate: '5.95%', cap: '$68,500', notes: 'Canada Pension Plan (2024)' },
      { name: 'EI', employee_rate: '1.66%', employer_rate: '2.324%', cap: '$63,200', notes: 'Employment Insurance (2024)' },
    ],
    income_tax: { brackets: [{ min: 0, max: 53359, rate: 15, fixed: 0 }, { min: 53359, max: 106717, rate: 20.5, fixed: 0 }, { min: 106717, max: 165430, rate: 26, fixed: 0 }, { min: 165430, max: 235675, rate: 29, fixed: 0 }, { min: 235675, max: null, rate: 33, fixed: 0 }], resident_rules: '183 days/year', filing_frequency: 'Annual (T4)' },
    sales_tax: [{ name: 'GST/HST', rate: 5, notes: 'Federal rate (HST varies by province 13-15%)' }, { name: 'PST', rate: 7, notes: 'Provincial (BC, SK, MB, QC)' }, { name: 'QST', rate: 9.975, notes: 'Quebec Sales Tax' }],
    leave: { types: [{ name: 'Annual Leave', min_days: 10, carry_forward: 0, encashable: true }, { name: 'Sick Leave', min_days: 3, carry_forward: 0, encashable: false }, { name: 'Maternity Leave', min_days: 270, carry_forward: 0, encashable: false }, { name: 'Parental Leave', min_days: 270, carry_forward: 0, encashable: false }, { name: 'Compassionate Leave', min_days: 8, carry_forward: 0, encashable: false }] },
    public_holidays: ['New Year\'s Day', 'Family Day (Feb)', 'Good Friday', 'Victoria Day', 'Canada Day', 'Labour Day', 'Thanksgiving', 'Remembrance Day', 'Christmas Day', 'Boxing Day'],
    government_agencies: [{ name: 'CRA', submission_frequency: 'Pay event', portal: 'My Business Account' }, { name: 'Service Canada', submission_frequency: 'As required', portal: 'Service Canada' }, { name: 'Provincial Ministry', submission_frequency: 'Varies', portal: 'Varies by province' }],
    government_forms: [{ name: 'T4', frequency: 'Annual', deadline: '28 Feb' }, { name: 'T4 Summary', frequency: 'Annual', deadline: '28 Feb' }, { name: 'PD7A', frequency: 'Monthly/Quarterly', deadline: '15th of month' }, { name: 'ROE', frequency: 'As required', deadline: 'Within 5 days of interruption' }, { name: 'RL-1', frequency: 'Annual', deadline: '28 Feb' }],
    accounting: { fiscal_year_start: '01-01', default_tax_code: 'GST', invoice_number_format: 'INV-{YYYY}-{0000}', payment_terms: 'Net 30' },
    banking: { bank_file_format: 'ACH/CSV', supported_banks: ['RBC', 'TD', 'Scotiabank', 'BMO', 'CIBC', 'National Bank'] },
    compliance: { employment_act: 'Canada Labour Code / Provincial Employment Standards', record_retention_years: 7, payslip_requirements: 'Itemised payslip required', privacy_law: 'PIPEDA (Personal Information Protection and Electronic Documents Act)' },
    termination: { notice_period: '1-8 weeks based on service', severance_pay: 'Required in Ontario/federal jurisdiction', last_pay_rules: 'Within 7-30 days based on province' },
    foreign_workers: { work_pass_types: ['LMIA-based Work Permit', 'IEC Youth', 'CUSMA Professional', 'Global Talent Stream'], levy: 'LMIA fee $1,000', quota: 'Based on labour market needs' },
    localisation: { address_format: 'Street, City, Province, Postal Code', postal_code_format: 'A0A 0A0 (alphanumeric)', phone_format: '+1 (555) 555-5555', national_id_format: 'XXX-XXX-XXX (SIN)' },
  },
  DE: {
    general: { name: 'Germany', code: 'DE', currency: 'EUR', currency_symbol: '\u20ac', phone_code: '+49', timezone: 'Europe/Berlin', primary_language: 'German', date_format: 'DD.MM.YYYY', time_format: '24h', week_starts_on: 'Monday', financial_year: '01-01', tax_year: '01-01', default_payroll_frequency: 'Monthly' },
    employment: { max_weekly_hours: 48, probation_months: 6, notice_period_days: 30, retirement_age: 67, rest_days: 'Sunday/weekends', employment_types: ['Permanent', 'Fixed-term', 'Minijob', 'Apprenticeship', 'Freelance'], contract_types: ['Full-time', 'Part-time', 'Minijob (450\u20ac)'] },
    payroll: { frequencies: ['Monthly', 'Semi-monthly'], minimum_wage: 12.41, payroll_cutoff: 'Last day of month', payroll_lock_date: '3rd last banking day', thirteenth_month: 'Christmas bonus common', bank_file_format: 'SEPA XML/CSV' },
    statutory_contributions: [
      { name: 'Pension Insurance', employee_rate: '9.3%', employer_rate: '9.3%', cap: '\u20ac7,550/month', notes: 'Rentenversicherung' },
      { name: 'Health Insurance', employee_rate: '7.3%', employer_rate: '7.3%', cap: '\u20ac5,175/month', notes: 'Krankenversicherung + avg 1.7% extra' },
      { name: 'Unemployment Insurance', employee_rate: '1.3%', employer_rate: '1.3%', cap: '\u20ac7,550/month', notes: 'Arbeitslosenversicherung' },
      { name: 'Long-term Care Insurance', employee_rate: '1.7%', employer_rate: '1.7%', cap: '\u20ac5,175/month', notes: 'Pflegeversicherung' },
      { name: 'Insolvency Levy', employee_rate: '0%', employer_rate: '0.06%', cap: '\u20ac7,550/month', notes: 'Umlage U1/U2' },
    ],
    income_tax: { brackets: [{ min: 0, max: 11604, rate: 0, fixed: 0 }, { min: 11605, max: 66000, rate: 14.77, fixed: 0 }, { min: 66001, max: 277826, rate: 42, fixed: 0 }, { min: 277827, max: null, rate: 45, fixed: 0 }], resident_rules: '183 days/year', filing_frequency: 'Annual (ELStAM)' },
    sales_tax: [{ name: 'VAT Standard', rate: 19, notes: 'Mehrwertsteuer' }, { name: 'VAT Reduced', rate: 7, notes: 'Food, books, hotels' }],
    leave: { types: [{ name: 'Annual Leave', min_days: 24, carry_forward: 0, encashable: false }, { name: 'Sick Leave', min_days: 42, carry_forward: 0, encashable: false }, { name: 'Maternity Leave', min_days: 98, carry_forward: 0, encashable: false }, { name: 'Parental Leave', min_days: 1095, carry_forward: 0, encashable: false }] },
    public_holidays: ['New Year\'s Day', 'Good Friday', 'Easter Monday', 'Labour Day', 'Ascension Day', 'Whit Monday', 'German Unity Day', 'Christmas Day', 'Boxing Day'],
    government_agencies: [{ name: 'Finanzamt', submission_frequency: 'Monthly/Annual', portal: 'ELSTER' }, { name: 'DRV (Pension)', submission_frequency: 'Monthly', portal: 'DRV Portal' }, { name: 'Krankenkasse', submission_frequency: 'Monthly', portal: 'Various' }, { name: 'Bundesagentur', submission_frequency: 'Monthly', portal: 'BA Portal' }],
    government_forms: [{ name: 'Lohnsteuer-Anmeldung', frequency: 'Monthly/Quarterly', deadline: '10th of month' }, { name: 'Beitragsnachweis', frequency: 'Monthly', deadline: 'Monthly' }, { name: 'Jahresmeldung (DE\u00dcV)', frequency: 'Annual', deadline: '15 Feb' }, { name: 'ELStAM Query', frequency: 'Monthly', deadline: 'Monthly' }],
    accounting: { fiscal_year_start: '01-01', default_tax_code: 'VAT', invoice_number_format: 'INV-{YYYY}-{0000}', payment_terms: 'Net 30' },
    banking: { bank_file_format: 'SEPA XML', supported_banks: ['Deutsche Bank', 'Commerzbank', 'Sparkasse', 'Volksbank', 'Postbank', 'N26'] },
    compliance: { employment_act: 'Betriebsverfassungsgesetz / K\u00fcndigungsschutzgesetz', record_retention_years: 10, payslip_requirements: 'Itemised payslip mandatory', privacy_law: 'BDSG (Bundesdatenschutzgesetz) / GDPR' },
    termination: { notice_period: '4 weeks to 7 months based on service', severance_pay: '0.5 month per year if agreed', last_pay_rules: 'On termination date' },
    foreign_workers: { work_pass_types: ['EU Blue Card', 'Skilled Worker Visa', 'Job Seeker Visa', 'Freelance Visa'], levy: 'No specific levy', quota: 'None for skilled workers' },
    localisation: { address_format: 'Street, City, PLZ', postal_code_format: '5 digits', phone_format: '+49 1xx xxxxxxx', national_id_format: 'XX XXX XXX X (Steuer-ID)' },
  },
  FR: {
    general: { name: 'France', code: 'FR', currency: 'EUR', currency_symbol: '\u20ac', phone_code: '+33', timezone: 'Europe/Paris', primary_language: 'French', date_format: 'DD/MM/YYYY', time_format: '24h', week_starts_on: 'Monday', financial_year: '01-01', tax_year: '01-01', default_payroll_frequency: 'Monthly' },
    employment: { max_weekly_hours: 35, probation_months: 4, notice_period_days: 30, retirement_age: 62, rest_days: 'Sunday', employment_types: ['CDI (Permanent)', 'CDD (Fixed-term)', 'Temporary', 'Intern'], contract_types: ['Full-time', 'Part-time'] },
    payroll: { frequencies: ['Monthly'], minimum_wage: 11.52, payroll_cutoff: 'Last day of month', payroll_lock_date: '5th of next month', thirteenth_month: 'Common in CCN (13th month)', bank_file_format: 'SEPA XML' },
    statutory_contributions: [
      { name: 'S\u00e9curit\u00e9 Sociale', employee_rate: '7.2%', employer_rate: '42%', cap: '\u20ac3,428/month', notes: 'Overall social contributions (est.)' },
      { name: 'Assurance Maladie', employee_rate: '0%', employer_rate: '13%', cap: 'No cap', notes: 'Health insurance' },
      { name: 'Assurance Vieillesse', employee_rate: '6.9%', employer_rate: '8.55%', cap: '\u20ac3,428/month', notes: 'Old-age pension' },
      { name: 'Allocations Familiales', employee_rate: '0%', employer_rate: '3.45%', cap: '\u20ac3,428/month', notes: 'Family allowances' },
      { name: 'CSG/CRDS', employee_rate: '9.7%', employer_rate: '0%', cap: 'No cap', notes: 'Social surtax on income' },
    ],
    income_tax: { brackets: [{ min: 0, max: 11294, rate: 0, fixed: 0 }, { min: 11294, max: 28797, rate: 11, fixed: 0 }, { min: 28797, max: 82341, rate: 30, fixed: 0 }, { min: 82341, max: 177106, rate: 41, fixed: 0 }, { min: 177106, max: null, rate: 45, fixed: 0 }], resident_rules: '183 days/year', filing_frequency: 'Annual (D\u00e9claration Sociale Nominative)' },
    sales_tax: [{ name: 'VAT Standard', rate: 20, notes: 'TVA (Taxe sur la Valeur Ajout\u00e9e)' }, { name: 'VAT Reduced', rate: 10, notes: 'Restaurants, transport' }, { name: 'VAT Super Reduced', rate: 5.5, notes: 'Food, energy' }],
    leave: { types: [{ name: 'Annual Leave (Cong\u00e9s Pay\u00e9s)', min_days: 30, carry_forward: 0, encashable: false }, { name: 'Sick Leave', min_days: 90, carry_forward: 0, encashable: false }, { name: 'Maternity Leave', min_days: 112, carry_forward: 0, encashable: false }, { name: 'Paternity Leave', min_days: 28, carry_forward: 0, encashable: false }] },
    public_holidays: ['New Year\'s Day', 'Easter Monday', 'Labour Day', 'VE Day', 'Ascension Day', 'Whit Monday', 'Bastille Day', 'Assumption Day', 'All Saints\' Day', 'Armistice Day', 'Christmas Day'],
    government_agencies: [{ name: 'URSSAF', submission_frequency: 'Monthly', portal: 'URSSAF' }, { name: 'DGFiP', submission_frequency: 'Monthly/Annual', portal: 'impots.gouv.fr' }, { name: 'France Trav\u00adail', submission_frequency: 'Monthly', portal: 'France Travail' }, { name: 'CNAV', submission_frequency: 'Monthly', portal: 'CNAV Portal' }],
    government_forms: [{ name: 'DSN (D\u00e9claration Sociale Nominative)', frequency: 'Monthly', deadline: '5th of month' }, { name: 'DUCS (Monthly Report)', frequency: 'Monthly', deadline: '5th of month' }, { name: 'Bilan Social', frequency: 'Annual', deadline: '31 Dec' }],
    accounting: { fiscal_year_start: '01-01', default_tax_code: 'VAT', invoice_number_format: 'FAC-{YYYY}-{0000}', payment_terms: 'Net 45' },
    banking: { bank_file_format: 'SEPA XML', supported_banks: ['BNP Paribas', 'Soci\u00e9t\u00e9 G\u00e9n\u00e9rale', 'Cr\u00e9dit Agricole', 'BPCE', 'Banque Populaire', 'ING'] },
    compliance: { employment_act: 'Code du Travail', record_retention_years: 5, payslip_requirements: 'Complex itemised payslip mandatory', privacy_law: 'CNIL / GDPR' },
    termination: { notice_period: '1-3 months based on service', severance_pay: '1/4 month per year (legal minimum)', last_pay_rules: 'Within 7 days of termination' },
    foreign_workers: { work_pass_types: ['Titre de S\u00e9jour Salari\u00e9', 'Passeport Talent', 'Brexit Visa', 'EU Blue Card'], levy: 'Employer tax (Taxe sur les Salaires)', quota: 'Shortage occupation list' },
    localisation: { address_format: 'Street, Postcode, City, CEDEX', postal_code_format: '5 digits', phone_format: '+33 6 xx xx xx xx', national_id_format: '1 00 00 000 000 (INSEE/Num\u00e9ro de S\u00e9cu)' },
  },
  NL: {
    general: { name: 'Netherlands', code: 'NL', currency: 'EUR', currency_symbol: '\u20ac', phone_code: '+31', timezone: 'Europe/Amsterdam', primary_language: 'Dutch', date_format: 'DD-MM-YYYY', time_format: '24h', week_starts_on: 'Monday', financial_year: '01-01', tax_year: '01-01', default_payroll_frequency: 'Monthly' },
    employment: { max_weekly_hours: 40, probation_months: 2, notice_period_days: 30, retirement_age: 67, rest_days: 'Weekend', employment_types: ['Permanent', 'Fixed-term', 'On-call', 'Temporary', 'Payroll'], contract_types: ['Full-time', 'Part-time', 'Flexible'] },
    payroll: { frequencies: ['Monthly', 'Weekly'], minimum_wage: 13.68, payroll_cutoff: 'Last day of month', payroll_lock_date: '5th of month', thirteenth_month: 'Holiday allowance (8%) mandatory', bank_file_format: 'SEPA XML' },
    statutory_contributions: [
      { name: 'Sociale Verzekeringen', employee_rate: '0%', employer_rate: '26.11%', cap: '\u20ac66,956', notes: 'Social insurance total (2024)' },
      { name: 'AOW', employee_rate: '0%', employer_rate: 'Included above', cap: '-', notes: 'State pension' },
      { name: 'WW', employee_rate: '0%', employer_rate: 'Included above', cap: '-', notes: 'Unemployment insurance' },
      { name: 'WIA/ZVW', employee_rate: '0%', employer_rate: 'Included above', cap: '-', notes: 'Disability inc. healthcare' },
    ],
    income_tax: { brackets: [{ min: 0, max: 38098, rate: 36.97, fixed: 0 }, { min: 38098, max: 75518, rate: 49.50, fixed: 0 }, { min: 75518, max: null, rate: 49.50, fixed: 0 }], resident_rules: '183 days/year', filing_frequency: 'Annual' },
    sales_tax: [{ name: 'VAT High', rate: 21, notes: 'BTW (standard rate)' }, { name: 'VAT Low', rate: 9, notes: 'Food, medicine, books' }],
    leave: { types: [{ name: 'Annual Leave', min_days: 20, carry_forward: 6, encashable: true }, { name: 'Sick Leave', min_days: 104, carry_forward: 0, encashable: false }, { name: 'Maternity Leave', min_days: 112, carry_forward: 0, encashable: false }, { name: 'Paternity Leave', min_days: 6, carry_forward: 0, encashable: false }, { name: 'Parental Leave', min_days: 26, carry_forward: 0, encashable: false }] },
    public_holidays: ['New Year\'s Day', 'Good Friday', 'Easter Monday', 'King\'s Day', 'Liberation Day', 'Ascension Day', 'Whit Monday', 'Christmas Day', 'Boxing Day'],
    government_agencies: [{ name: 'Belastingdienst', submission_frequency: 'Monthly', portal: 'Tax Portal' }, { name: 'UWV', submission_frequency: 'As required', portal: 'UWV Portal' }, { name: 'SVB', submission_frequency: 'Annual', portal: 'SVB Portal' }],
    government_forms: [{ name: 'Aangifte Loonheffingen', frequency: 'Monthly', deadline: 'Within month' }, { name: 'Jaaropgave', frequency: 'Annual', deadline: '31 Jan' }, { name: 'UWV Report', frequency: 'As required', deadline: 'As required' }],
    accounting: { fiscal_year_start: '01-01', default_tax_code: 'VAT', invoice_number_format: 'FACTUUR-{YYYY}-{0000}', payment_terms: 'Net 30' },
    banking: { bank_file_format: 'SEPA XML', supported_banks: ['ING', 'ABN AMRO', 'Rabobank', 'SNS', 'Triodos', 'Bunq'] },
    compliance: { employment_act: 'Burgerlijk Wetboek (Civil Code) Book 7', record_retention_years: 7, payslip_requirements: 'Itemised payslip mandatory', privacy_law: 'AVG (Algemene Verordening Gegevensbescherming)' },
    termination: { notice_period: '1-4 months based on service', severance_pay: 'Transition payment (1/3 month per year)', last_pay_rules: 'Within 1 month of termination' },
    foreign_workers: { work_pass_types: ['Highly Skilled Migrant', 'Orientation Year', 'EU Blue Card', 'Work Permit'], levy: 'No specific levy', quota: 'No fixed quota' },
    localisation: { address_format: 'Street, Postcode, City', postal_code_format: '1234 AB (alphanumeric)', phone_format: '+31 6 xxxx xxxx', national_id_format: '000.00.0000.000 (BSN)' },
  },
  CH: {
    general: { name: 'Switzerland', code: 'CH', currency: 'CHF', currency_symbol: 'CHF', phone_code: '+41', timezone: 'Europe/Zurich', primary_language: 'German/French/Italian', date_format: 'DD.MM.YYYY', time_format: '24h', week_starts_on: 'Monday', financial_year: '01-01', tax_year: '01-01', default_payroll_frequency: 'Monthly' },
    employment: { max_weekly_hours: 45, probation_months: 3, notice_period_days: 30, retirement_age: 65, rest_days: 'Sunday', employment_types: ['Permanent', 'Fixed-term', 'Temporary', 'Apprenticeship'], contract_types: ['Full-time', 'Part-time'] },
    payroll: { frequencies: ['Monthly'], minimum_wage: 0, payroll_cutoff: 'Last day of month', payroll_lock_date: '3rd of next month', thirteenth_month: '13th salary mandatory (most cantons)', bank_file_format: 'SEPA XML/CSV' },
    statutory_contributions: [
      { name: 'AHV/IV/EO', employee_rate: '5.3%', employer_rate: '5.3%', cap: 'CHF 90,800', notes: 'State pension + disability' },
      { name: 'Pension (BVG)', employee_rate: 'Variable', employer_rate: 'Variable', cap: 'Based on plan', notes: 'Mandatory occupational pension' },
      { name: 'Accident Insurance (UVG)', employee_rate: '0%', employer_rate: 'Variable', cap: 'CHF 148,200', notes: 'Occupational & non-occupational' },
      { name: 'ALV/EO (Unemployment)', employee_rate: '1.1%', employer_rate: '1.1%', cap: 'CHF 148,200', notes: 'Unemployment insurance' },
    ],
    income_tax: { brackets: [{ min: 0, max: 15000, rate: 0, fixed: 0 }, { min: 15001, max: 45000, rate: 0.77, fixed: 0 }, { min: 45001, max: 78000, rate: 1.1, fixed: 0 }, { min: 78001, max: 147000, rate: 2.64, fixed: 0 }, { min: 147001, max: 214000, rate: 4.18, fixed: 0 }, { min: 214001, max: null, rate: 11.5, fixed: 0 }], resident_rules: '183 days/year', filing_frequency: 'Annual' },
    sales_tax: [{ name: 'VAT Standard', rate: 8.1, notes: 'MWST (Mehrwertsteuer)' }, { name: 'VAT Reduced', rate: 2.6, notes: 'Food, books' }, { name: 'VAT Accommodation', rate: 3.8, notes: 'Hotel stays' }],
    leave: { types: [{ name: 'Annual Leave', min_days: 20, carry_forward: 0, encashable: false }, { name: 'Sick Leave', min_days: 90, carry_forward: 0, encashable: false }, { name: 'Maternity Leave', min_days: 98, carry_forward: 0, encashable: false }, { name: 'Paternity Leave', min_days: 14, carry_forward: 0, encashable: false }] },
    public_holidays: ['New Year\'s Day', 'Good Friday', 'Easter Monday', 'Ascension Day', 'Whit Monday', 'Swiss National Day', 'Christmas Day', 'Boxing Day'],
    government_agencies: [{ name: 'AHV-Ausgleichskasse', submission_frequency: 'Quarterly', portal: 'AHV Portal' }, { name: 'ESTV (Tax)', submission_frequency: 'Monthly/Annual', portal: 'ESTV Portal' }, { name: 'SUVA', submission_frequency: 'Annual', portal: 'SUVA Portal' }],
    government_forms: [{ name: 'Lohnausweis', frequency: 'Annual', deadline: '31 Mar' }, { name: 'AHV/IV/EO Declaration', frequency: 'Quarterly', deadline: 'Quarterly' }, { name: 'BVG Report', frequency: 'Annual', deadline: '31 Mar' }],
    accounting: { fiscal_year_start: '01-01', default_tax_code: 'VAT', invoice_number_format: 'INV-{YYYY}-{0000}', payment_terms: 'Net 30' },
    banking: { bank_file_format: 'SEPA XML/CSV', supported_banks: ['UBS', 'Credit Suisse', 'Z\u00fcrcher Kantonalbank', 'Raiffeisen', 'PostFinance', 'Julius B\u00e4r'] },
    compliance: { employment_act: 'OR (Obligationenrecht)', record_retention_years: 10, payslip_requirements: 'Itemised payslip mandatory', privacy_law: 'nFADP (New Federal Act on Data Protection)' },
    termination: { notice_period: '1-3 months based on service', severance_pay: 'Not mandatory except age 50+ with 20+ years', last_pay_rules: 'On termination date' },
    foreign_workers: { work_pass_types: ['B Permit', 'L Permit', 'C Permit', 'Ci Permit'], levy: 'No specific levy', quota: 'Annual quotas for non-EU' },
    localisation: { address_format: 'Street, Postcode, City', postal_code_format: '4 digits', phone_format: '+41 7x xxx xx xx', national_id_format: '756.XXXX.XXXX.XX (AHV-Nummer)' },
  },
  JP: {
    general: { name: 'Japan', code: 'JP', currency: 'JPY', currency_symbol: '\u00a5', phone_code: '+81', timezone: 'Asia/Tokyo', primary_language: 'Japanese', date_format: 'YYYY/MM/DD', time_format: '24h', week_starts_on: 'Monday', financial_year: '01-04', tax_year: '01-01', default_payroll_frequency: 'Monthly' },
    employment: { max_weekly_hours: 40, probation_months: 6, notice_period_days: 30, retirement_age: 65, rest_days: 'Weekend', employment_types: ['Seishain (Regular)', 'Keiyaku (Contract)', 'Arubaito (Part-time)', 'Haken (Temporary)'], contract_types: ['Full-time', 'Part-time', 'Fixed-term'] },
    payroll: { frequencies: ['Monthly', 'Semi-monthly'], minimum_wage: 1004, payroll_cutoff: 'Last day of month', payroll_lock_date: '25th of month', thirteenth_month: 'Summer & Winter bonuses common', bank_file_format: 'Zengin CSV' },
    statutory_contributions: [
      { name: 'K\u014dsei Nenkin Hoken', employee_rate: '9.15%', employer_rate: '9.15%', cap: '\u00a5590,000/month', notes: 'Welfare Pension Insurance' },
      { name: 'Kenk\u014d Hoken', employee_rate: '5%', employer_rate: '5%', cap: '\u00a51,390,000/month', notes: 'Health Insurance (varies by plan)' },
      { name: 'Koy\u014d Hoken', employee_rate: '0.6%', employer_rate: '0.9%', cap: '\u00a5590,000/month', notes: 'Employment Insurance' },
      { name: 'Kaigo Hoken', employee_rate: '0.9%', employer_rate: '0.9%', cap: '\u00a5590,000/month', notes: 'Long-term Care Insurance (40+)' },
    ],
    income_tax: { brackets: [{ min: 0, max: 1950000, rate: 5, fixed: 0 }, { min: 1950000, max: 3300000, rate: 10, fixed: 97500 }, { min: 3300000, max: 6950000, rate: 20, fixed: 427500 }, { min: 6950000, max: 9000000, rate: 23, fixed: 636000 }, { min: 9000000, max: 18000000, rate: 33, fixed: 1536000 }, { min: 18000000, max: 40000000, rate: 40, fixed: 2796000 }, { min: 40000000, max: null, rate: 45, fixed: 4596000 }], resident_rules: '183 days/year', filing_frequency: 'Annual' },
    sales_tax: [{ name: 'Consumption Tax', rate: 10, notes: 'Standard rate' }, { name: 'Reduced Rate', rate: 8, notes: 'Food (take-out) and newspapers' }],
    leave: { types: [{ name: 'Annual Leave', min_days: 10, carry_forward: 0, encashable: false }, { name: 'Sick Leave', min_days: 0, carry_forward: 0, encashable: false }, { name: 'Maternity Leave', min_days: 98, carry_forward: 0, encashable: false }, { name: 'Paternity Leave', min_days: 4, carry_forward: 0, encashable: false }, { name: 'Childcare Leave', min_days: 365, carry_forward: 0, encashable: false }] },
    public_holidays: ['New Year\'s Day', 'Coming of Age Day', 'National Foundation Day', 'Golden Week (Showa Day, Constitution Day, Greenery Day, Children\'s Day)', 'Marine Day', 'Mountain Day', 'Respect for the Aged Day', 'Autumnal Equinox', 'Sports Day', 'Culture Day', 'Labor Thanksgiving Day', 'Emperor\'s Birthday'],
    government_agencies: [{ name: 'NTA (National Tax Agency)', submission_frequency: 'Monthly/Annual', portal: 'e-Tax' }, { name: 'Pension Service', submission_frequency: 'Monthly', portal: 'Nenkin Portal' }, { name: 'Hello Work', submission_frequency: 'As required', portal: 'Hello Work Portal' }, { name: 'Health Insurance Society', submission_frequency: 'Monthly', portal: 'Various' }],
    government_forms: [{ name: 'Gensench\u014dsh\u016b Hy\u014d', frequency: 'Monthly', deadline: '10th of month' }, { name: 'Ch\u014dsh\u016b Hy\u014d (Annual)', frequency: 'Annual', deadline: '31 Jan' }, { name: 'Koy\u014d Hoken Report', frequency: 'Annual', deadline: 'Annual' }],
    accounting: { fiscal_year_start: '01-04', default_tax_code: 'CT', invoice_number_format: 'INV-{YYYY}-{0000}', payment_terms: 'Net 30' },
    banking: { bank_file_format: 'Zengin CSV', supported_banks: ['MUFG', 'SMBC', 'Mizuho', 'Resona', 'Rakuten', 'Japan Post Bank'] },
    compliance: { employment_act: 'Labour Standards Act (R\u014dd\u014d Kijun H\u014d)', record_retention_years: 3, payslip_requirements: 'Itemised payslip mandatory', privacy_law: 'APPI (Act on Protection of Personal Information)' },
    termination: { notice_period: '30 days', severance_pay: 'Common by company policy, not legally mandatory', last_pay_rules: 'Within 7 days of termination' },
    foreign_workers: { work_pass_types: ['Engineer/Specialist in Humanities', 'Technical Intern', 'Specified Skilled Worker', 'Highly Skilled Professional'], levy: 'No specific levy', quota: 'Based on technical intern plan' },
    localisation: { address_format: 'Postcode, Prefecture, City, Street, Building', postal_code_format: '000-0000', phone_format: '+81 80-xxxx-xxxx', national_id_format: 'XXXX-XXXX-XXXX (My Number)' },
  },
  KR: {
    general: { name: 'South Korea', code: 'KR', currency: 'KRW', currency_symbol: '\u20a9', phone_code: '+82', timezone: 'Asia/Seoul', primary_language: 'Korean', date_format: 'YYYY-MM-DD', time_format: '24h', week_starts_on: 'Monday', financial_year: '01-01', tax_year: '01-01', default_payroll_frequency: 'Monthly' },
    employment: { max_weekly_hours: 52, probation_months: 3, notice_period_days: 30, retirement_age: 60, rest_days: 'Weekend', employment_types: ['Regular', 'Contract', 'Temporary', 'Daily'], contract_types: ['Full-time', 'Part-time'] },
    payroll: { frequencies: ['Monthly'], minimum_wage: 9860, payroll_cutoff: 'Last day of month', payroll_lock_date: '10th of next month', thirteenth_month: 'Bonuses (4 times/year common)', bank_file_format: 'CSV/EFT' },
    statutory_contributions: [
      { name: 'National Pension (NPS)', employee_rate: '4.5%', employer_rate: '4.5%', cap: '\u20a95,590,000/month', notes: 'National Pension Service' },
      { name: 'NHIS (Health)', employee_rate: '3.545%', employer_rate: '3.545%', cap: '\u20a95,590,000/month', notes: 'National Health Insurance + 0.459% LTC' },
      { name: 'Employment Insurance', employee_rate: '0.9%', employer_rate: '0.9%', cap: 'No cap', notes: 'With additional 0.38% stability levy' },
      { name: 'Industrial Accident', employee_rate: '0%', employer_rate: 'Variable', cap: 'Varies by industry', notes: 'Workers\' Compensation' },
    ],
    income_tax: { brackets: [{ min: 0, max: 14000000, rate: 6, fixed: 0 }, { min: 14000000, max: 50000000, rate: 15, fixed: 840000 }, { min: 50000000, max: 88000000, rate: 24, fixed: 6240000 }, { min: 88000000, max: 150000000, rate: 35, fixed: 15360000 }, { min: 150000000, max: 300000000, rate: 38, fixed: 28440000 }, { min: 300000000, max: 500000000, rate: 40, fixed: 85440000 }, { min: 500000000, max: null, rate: 42, fixed: 165440000 }], resident_rules: '183 days/year', filing_frequency: 'Annual' },
    sales_tax: [{ name: 'VAT', rate: 10, notes: 'Value Added Tax (standard)' }],
    leave: { types: [{ name: 'Annual Leave', min_days: 15, carry_forward: 0, encashable: true }, { name: 'Sick Leave', min_days: 0, carry_forward: 0, encashable: false }, { name: 'Maternity Leave', min_days: 90, carry_forward: 0, encashable: false }, { name: 'Paternity Leave', min_days: 10, carry_forward: 0, encashable: false }, { name: 'Childcare Leave', min_days: 365, carry_forward: 0, encashable: false }] },
    public_holidays: ['New Year\'s Day (Seollal 3 days)', 'Independence Movement Day', 'Buddha\'s Birthday', 'Labour Day', 'Children\'s Day', 'Memorial Day', 'Liberation Day', 'Chuseok (3 days)', 'National Foundation Day', 'Hangeul Day', 'Christmas Day'],
    government_agencies: [{ name: 'NTS', submission_frequency: 'Monthly', portal: 'Home Tax' }, { name: 'NPS', submission_frequency: 'Monthly', portal: 'NPS Portal' }, { name: 'NHIS', submission_frequency: 'Monthly', portal: 'NHIS Portal' }],
    government_forms: [{ name: 'Woncheonseong Jisik', frequency: 'Monthly', deadline: '10th of month' }, { name: 'Yonmal Jeongsan', frequency: 'Annual', deadline: 'Feb' }, { name: 'Goyong Insurance Report', frequency: 'Monthly', deadline: '10th of month' }],
    accounting: { fiscal_year_start: '01-01', default_tax_code: 'VAT', invoice_number_format: 'INV-{YYYY}-{0000}', payment_terms: 'Net 30' },
    banking: { bank_file_format: 'CSV/EFT', supported_banks: ['KB Kookmin', 'Shinhan', 'Woori', 'KEB Hana', 'Nonghyup', 'IBK'] },
    compliance: { employment_act: 'Labour Standards Act', record_retention_years: 5, payslip_requirements: 'Itemised payslip mandatory', privacy_law: 'PIPA (Personal Information Protection Act)' },
    termination: { notice_period: '30 days', severance_pay: '30 days salary per year of service', last_pay_rules: 'Within 14 days of termination' },
    foreign_workers: { work_pass_types: ['E-7 (Specified)', 'E-9 (Non-professional)', 'D-10 (Job Seeker)', 'F-2 Residency'], levy: 'No specific levy', quota: 'EPS system for E-9 workers' },
    localisation: { address_format: 'Province, City, District, Street, Building', postal_code_format: '00000', phone_format: '+82 10-xxxx-xxxx', national_id_format: '000000-0000000 (RRN)' },
  },
  IN: {
    general: { name: 'India', code: 'IN', currency: 'INR', currency_symbol: '\u20b9', phone_code: '+91', timezone: 'Asia/Kolkata', primary_language: 'Hindi/English', date_format: 'DD/MM/YYYY', time_format: '24h', week_starts_on: 'Monday', financial_year: '01-04', tax_year: '01-04', default_payroll_frequency: 'Monthly' },
    employment: { max_weekly_hours: 48, probation_months: 6, notice_period_days: 30, retirement_age: 58, rest_days: 'Sunday', employment_types: ['Permanent', 'Contract', 'Temporary', 'Apprenticeship'], contract_types: ['Full-time', 'Part-time', 'Fixed-term'] },
    payroll: { frequencies: ['Monthly'], minimum_wage: 178, payroll_cutoff: 'Last day of month', payroll_lock_date: '7th of next month', thirteenth_month: 'Bonus (8.33% annual minimum)', bank_file_format: 'CSV/NEFT' },
    statutory_contributions: [
      { name: 'EPF', employee_rate: '12%', employer_rate: '12%', cap: '\u20b915,000/month', notes: 'Employees\' Provident Fund' },
      { name: 'ESI', employee_rate: '0.75%', employer_rate: '3.25%', cap: '\u20b921,000/month', notes: 'Employees\' State Insurance' },
      { name: 'Professional Tax', employee_rate: 'Variable', employer_rate: '0%', cap: '\u20b9200-300/month', notes: 'State-dependent' },
      { name: 'Labour Welfare Fund', employee_rate: '0.5%', employer_rate: '1%', cap: 'Varies by state', notes: 'Applicable in select states' },
    ],
    income_tax: { brackets: [{ min: 0, max: 300000, rate: 0, fixed: 0 }, { min: 300000, max: 700000, rate: 5, fixed: 0 }, { min: 700000, max: 1000000, rate: 10, fixed: 20000 }, { min: 1000000, max: 1200000, rate: 15, fixed: 50000 }, { min: 1200000, max: 1500000, rate: 20, fixed: 80000 }, { min: 1500000, max: null, rate: 30, fixed: 140000 }], resident_rules: '182 days/year', filing_frequency: 'Annual (Form 16)' },
    sales_tax: [{ name: 'GST Standard', rate: 18, notes: 'CGST+SGST (9+9%)' }, { name: 'GST Reduced', rate: 12, notes: 'Services' }, { name: 'GST Low', rate: 5, notes: 'Basic essentials' }],
    leave: { types: [{ name: 'Annual Leave', min_days: 12, carry_forward: 0, encashable: true }, { name: 'Sick Leave', min_days: 12, carry_forward: 0, encashable: false }, { name: 'Maternity Leave', min_days: 182, carry_forward: 0, encashable: false }, { name: 'Paternity Leave', min_days: 15, carry_forward: 0, encashable: false }, { name: 'Casual Leave', min_days: 12, carry_forward: 0, encashable: false }] },
    public_holidays: ['Republic Day', 'Holi', 'Good Friday', 'Independence Day', 'Gandhi Jayanti', 'Dussehra', 'Diwali (2 days)', 'Guru Nanak Jayanti', 'Christmas Day'],
    government_agencies: [{ name: 'EPFO', submission_frequency: 'Monthly', portal: 'EPFO Portal' }, { name: 'ESIC', submission_frequency: 'Monthly', portal: 'ESIC Portal' }, { name: 'IT Department', submission_frequency: 'Annual', portal: 'Income Tax Portal' }, { name: 'Labour Department', submission_frequency: 'Varies', portal: 'State Labour Portal' }],
    government_forms: [{ name: 'Form 16', frequency: 'Annual', deadline: '15 Jun' }, { name: 'ECR (EPF)', frequency: 'Monthly', deadline: '15th of month' }, { name: 'ESIC Return', frequency: 'Monthly/Six-monthly', deadline: '15th of month / 11 May & Nov' }, { name: 'GST Return', frequency: 'Monthly/Quarterly', deadline: '20th of month' }],
    accounting: { fiscal_year_start: '01-04', default_tax_code: 'GST', invoice_number_format: 'INV-{YYYY}-{0000}', payment_terms: 'Net 30' },
    banking: { bank_file_format: 'NEFT/CSV', supported_banks: ['SBI', 'HDFC', 'ICICI', 'Axis', 'Kotak', 'Yes Bank', 'PNB'] },
    compliance: { employment_act: 'Factories Act / Shops & Establishments Act', record_retention_years: 7, payslip_requirements: 'Itemised payslip mandatory', privacy_law: 'DPDPA (Digital Personal Data Protection Act 2023)' },
    termination: { notice_period: '1 month or salary in lieu', severance_pay: '15 days salary per year of service', last_pay_rules: 'Within 48 hours of termination' },
    foreign_workers: { work_pass_types: ['Employment Visa', 'Business Visa', 'Project Visa', 'Research Visa'], levy: 'No specific levy', quota: 'No fixed quota' },
    localisation: { address_format: 'Street, Area, City, State, Pincode', postal_code_format: '6 digits', phone_format: '+91 xxxxx xxxxx', national_id_format: 'XXXX XXXX XXXX (Aadhaar)' },
  },
  CN: {
    general: { name: 'China', code: 'CN', currency: 'CNY', currency_symbol: '\u00a5', phone_code: '+86', timezone: 'Asia/Shanghai', primary_language: 'Chinese (Mandarin)', date_format: 'YYYY/MM/DD', time_format: '24h', week_starts_on: 'Monday', financial_year: '01-01', tax_year: '01-01', default_payroll_frequency: 'Monthly' },
    employment: { max_weekly_hours: 40, probation_months: 6, notice_period_days: 30, retirement_age: 60, rest_days: 'Weekend', employment_types: ['Regular', 'Contract', 'Temporary', 'Intern'], contract_types: ['Full-time', 'Part-time', 'Fixed-term'] },
    payroll: { frequencies: ['Monthly'], minimum_wage: 2690, payroll_cutoff: 'Last day of month', payroll_lock_date: '15th of month', thirteenth_month: '13th month bonus common', bank_file_format: 'CSV/EFT' },
    statutory_contributions: [
      { name: 'Pension', employee_rate: '8%', employer_rate: '16%', cap: 'Local ceiling', notes: 'Social insurance - varies by city' },
      { name: 'Medical Insurance', employee_rate: '2%', employer_rate: '10%', cap: 'Local ceiling', notes: 'Social insurance - varies by city' },
      { name: 'Unemployment Insurance', employee_rate: '0.5%', employer_rate: '1%', cap: 'Local ceiling', notes: 'Social insurance' },
      { name: 'Work Injury Insurance', employee_rate: '0%', employer_rate: 'Variable', cap: 'Local ceiling', notes: 'Based on industry risk' },
      { name: 'Maternity Insurance', employee_rate: '0%', employer_rate: '1%', cap: 'Local ceiling', notes: 'Social insurance' },
      { name: 'Housing Fund', employee_rate: '12%', employer_rate: '12%', cap: 'Local ceiling', notes: 'Housing Provident Fund' },
    ],
    income_tax: { brackets: [{ min: 0, max: 36000, rate: 3, fixed: 0 }, { min: 36000, max: 144000, rate: 10, fixed: 2520 }, { min: 144000, max: 300000, rate: 20, fixed: 16920 }, { min: 300000, max: 420000, rate: 25, fixed: 31920 }, { min: 420000, max: 660000, rate: 30, fixed: 52920 }, { min: 660000, max: 960000, rate: 35, fixed: 85920 }, { min: 960000, max: null, rate: 45, fixed: 181920 }], resident_rules: '183 days/year', filing_frequency: 'Annual (Annual Reconciliation)' },
    sales_tax: [{ name: 'VAT Standard', rate: 13, notes: 'Standard rate' }, { name: 'VAT Reduced', rate: 9, notes: 'Transport, construction, food' }, { name: 'VAT Small', rate: 6, notes: 'Services' }],
    leave: { types: [{ name: 'Annual Leave', min_days: 5, carry_forward: 0, encashable: true }, { name: 'Sick Leave', min_days: 90, carry_forward: 0, encashable: false }, { name: 'Maternity Leave', min_days: 128, carry_forward: 0, encashable: false }, { name: 'Paternity Leave', min_days: 7, carry_forward: 0, encashable: false }, { name: 'Marriage Leave', min_days: 3, carry_forward: 0, encashable: false }, { name: 'Bereavement Leave', min_days: 3, carry_forward: 0, encashable: false }] },
    public_holidays: ['New Year\'s Day', 'Chinese New Year (Spring Festival 7 days)', 'Qingming Festival', 'Labour Day', 'Dragon Boat Festival', 'Mid-Autumn Festival', 'National Day (Golden Week 7 days)'],
    government_agencies: [{ name: 'SAT', submission_frequency: 'Monthly/Annual', portal: 'Chinatax Portal' }, { name: 'Social Security Bureau', submission_frequency: 'Monthly', portal: 'Local SSB Portal' }, { name: 'Housing Fund Centre', submission_frequency: 'Monthly', portal: 'Local HFC Portal' }],
    government_forms: [{ name: 'IIT Monthly Filing', frequency: 'Monthly', deadline: '15th of month' }, { name: 'Social Insurance Report', frequency: 'Monthly', deadline: 'Monthly' }, { name: 'Housing Fund Report', frequency: 'Monthly', deadline: 'Monthly' }, { name: 'Annual IIT Reconciliation', frequency: 'Annual', deadline: '30 Jun' }],
    accounting: { fiscal_year_start: '01-01', default_tax_code: 'VAT', invoice_number_format: 'INV-{YYYY}-{0000}', payment_terms: 'Net 30' },
    banking: { bank_file_format: 'CSV/EFT', supported_banks: ['ICBC', 'CCB', 'ABC', 'Bank of China', 'China Merchants', 'Shanghai Pudong'] },
    compliance: { employment_act: 'PRC Labour Contract Law', record_retention_years: 5, payslip_requirements: 'Itemised payslip mandatory', privacy_law: 'PIPL (Personal Information Protection Law)' },
    termination: { notice_period: '30 days or 1 month salary in lieu', severance_pay: '1 month salary per year of service', last_pay_rules: 'On termination date' },
    foreign_workers: { work_pass_types: ['Z Visa (Work)', 'R Visa (Talent)', 'Foreign Expert Certificate'], levy: 'No specific levy', quota: 'No fixed quota' },
    localisation: { address_format: 'Province, City, District, Street, Building', postal_code_format: '6 digits', phone_format: '+86 1xx xxxx xxxx', national_id_format: '000000 0000 0000 0000 (Identity Card)' },
  },
  ID: {
    general: { name: 'Indonesia', code: 'ID', currency: 'IDR', currency_symbol: 'Rp', phone_code: '+62', timezone: 'Asia/Jakarta', primary_language: 'Indonesian', date_format: 'DD/MM/YYYY', time_format: '24h', week_starts_on: 'Monday', financial_year: '01-01', tax_year: '01-01', default_payroll_frequency: 'Monthly' },
    employment: { max_weekly_hours: 40, probation_months: 3, notice_period_days: 30, retirement_age: 56, rest_days: 'Sunday', employment_types: ['Permanent', 'Contract (PKWT)', 'Temporary', 'Outsourcing'], contract_types: ['Full-time', 'Part-time'] },
    payroll: { frequencies: ['Monthly'], minimum_wage: 5000000, payroll_cutoff: 'Last day of month', payroll_lock_date: '5th of next month', thirteenth_month: 'THR (Holiday Allowance) mandatory', bank_file_format: 'CSV/EFT' },
    statutory_contributions: [
      { name: 'BPJS Kesehatan', employee_rate: '1%', employer_rate: '4%', cap: 'Rp 12,000,000/month', notes: 'Health insurance' },
      { name: 'BPJS Ketenagakerjaan - JKK', employee_rate: '0%', employer_rate: '0.24-1.74%', cap: 'Varies', notes: 'Work accident insurance' },
      { name: 'BPJS Ketenagakerjaan - JKM', employee_rate: '0%', employer_rate: '0.3%', cap: 'Varies', notes: 'Death benefit' },
      { name: 'BPJS Ketenagakerjaan - JHT', employee_rate: '2%', employer_rate: '3.7%', cap: 'No cap', notes: 'Old-age savings' },
      { name: 'BPJS Ketenagakerjaan - JP', employee_rate: '1%', employer_rate: '2%', cap: 'Varies', notes: 'Pension (for eligible employees)' },
    ],
    income_tax: { brackets: [{ min: 0, max: 60000000, rate: 5, fixed: 0 }, { min: 60000000, max: 250000000, rate: 15, fixed: 0 }, { min: 250000000, max: 500000000, rate: 25, fixed: 0 }, { min: 500000000, max: 5000000000, rate: 30, fixed: 0 }, { min: 5000000000, max: null, rate: 35, fixed: 0 }], resident_rules: '183 days/year', filing_frequency: 'Monthly (PPh21)/Annual' },
    sales_tax: [{ name: 'VAT (PPN)', rate: 11, notes: 'Standard rate (increasing to 12% planned)' }],
    leave: { types: [{ name: 'Annual Leave', min_days: 12, carry_forward: 0, encashable: true }, { name: 'Sick Leave', min_days: 0, carry_forward: 0, encashable: false }, { name: 'Maternity Leave', min_days: 90, carry_forward: 0, encashable: false }, { name: 'Paternity Leave', min_days: 2, carry_forward: 0, encashable: false }, { name: 'Marriage Leave', min_days: 3, carry_forward: 0, encashable: false }, { name: 'Long Leave', min_days: 30, carry_forward: 0, encashable: false }] },
    public_holidays: ['New Year\'s Day', 'Chinese New Year', 'Isra Miraj', 'Hari Raya Puasa (2 days)', 'Hari Raya Haji', 'Good Friday', 'Labour Day', 'Waisak Day', 'Ascension Day', 'Pancasila Day', 'Independence Day', 'Christmas Day'],
    government_agencies: [{ name: 'DJPT (DJP)', submission_frequency: 'Monthly', portal: 'e-Filing DJP' }, { name: 'BPJS Kesehatan', submission_frequency: 'Monthly', portal: 'BPJS Portal' }, { name: 'BPJS Ketenagakerjaan', submission_frequency: 'Monthly', portal: 'BPS Portal' }],
    government_forms: [{ name: 'PPh21 Monthly', frequency: 'Monthly', deadline: '10th of month' }, { name: 'PPh21 Annual', frequency: 'Annual', deadline: '31 Mar' }, { name: 'BPJS Report', frequency: 'Monthly', deadline: '10th of month' }, { name: 'THR Report', frequency: 'Annual', deadline: '7 days before Lebaran' }],
    accounting: { fiscal_year_start: '01-01', default_tax_code: 'PPN', invoice_number_format: 'INV-{YYYY}-{0000}', payment_terms: 'Net 30' },
    banking: { bank_file_format: 'CSV/EFT', supported_banks: ['BCA', 'Mandiri', 'BNI', 'BRI', 'CIMB Niaga', 'Danamon'] },
    compliance: { employment_act: 'UU Cipta Kerja (Omnibus Law)', record_retention_years: 5, payslip_requirements: 'Itemised payslip required', privacy_law: 'UU PDP (Personal Data Protection Law 2022)' },
    termination: { notice_period: '30 days', severance_pay: '2x minimum wage per year of service', last_pay_rules: 'On termination date' },
    foreign_workers: { work_pass_types: ['IMTA (Work Permit)', 'KITAS (Stay Permit)', 'Expatriate Position Plan'], levy: 'USD 100-2,400/year (DAK)', quota: 'Based on company size' },
    localisation: { address_format: 'Street, RT/RW, Village, District, City, Province, Postcode', postal_code_format: '5 digits', phone_format: '+62 8xx xxxx xxxx', national_id_format: '0000 0000 0000 0000 (NIK/KTP)' },
  },
  TH: {
    general: { name: 'Thailand', code: 'TH', currency: 'THB', currency_symbol: '\u0e3f', phone_code: '+66', timezone: 'Asia/Bangkok', primary_language: 'Thai', date_format: 'DD/MM/YYYY', time_format: '24h', week_starts_on: 'Monday', financial_year: '01-01', tax_year: '01-01', default_payroll_frequency: 'Monthly' },
    employment: { max_weekly_hours: 48, probation_months: 4, notice_period_days: 30, retirement_age: 60, rest_days: 'Sunday', employment_types: ['Permanent', 'Fixed-term', 'Temporary', 'Seasonal'], contract_types: ['Full-time', 'Part-time'] },
    payroll: { frequencies: ['Monthly', 'Semi-monthly'], minimum_wage: 354, payroll_cutoff: 'Last day of month', payroll_lock_date: '5th of next month', thirteenth_month: 'Not mandatory', bank_file_format: 'CSV/EFT' },
    statutory_contributions: [
      { name: 'Social Security (SSO)', employee_rate: '5%', employer_rate: '5%', cap: 'THB 15,000/month', notes: 'Social Security Fund (max THB 750 each)' },
    ],
    income_tax: { brackets: [{ min: 0, max: 150000, rate: 0, fixed: 0 }, { min: 150000, max: 300000, rate: 5, fixed: 0 }, { min: 300000, max: 500000, rate: 10, fixed: 0 }, { min: 500000, max: 750000, rate: 15, fixed: 0 }, { min: 750000, max: 1000000, rate: 20, fixed: 0 }, { min: 1000000, max: 2000000, rate: 25, fixed: 0 }, { min: 2000000, max: 5000000, rate: 30, fixed: 0 }, { min: 5000000, max: null, rate: 35, fixed: 0 }], resident_rules: '180 days/year', filing_frequency: 'Annual' },
    sales_tax: [{ name: 'VAT', rate: 7, notes: 'Value Added Tax (effective rate)' }],
    leave: { types: [{ name: 'Annual Leave', min_days: 6, carry_forward: 0, encashable: true }, { name: 'Sick Leave', min_days: 30, carry_forward: 0, encashable: false }, { name: 'Maternity Leave', min_days: 98, carry_forward: 0, encashable: false }, { name: 'Paternity Leave', min_days: 0, carry_forward: 0, encashable: false }] },
    public_holidays: ['New Year\'s Day', 'Makha Bucha Day', 'Chakri Day', 'Songkran (3 days)', 'Labour Day', 'Coronation Day', 'Visakha Bucha Day', 'Asahna Bucha Day', 'HM Queen\'s Birthday', 'HM King\'s Birthday', 'Chulalongkorn Day', 'Constitution Day', 'New Year\'s Eve'],
    government_agencies: [{ name: 'RD (Revenue Department)', submission_frequency: 'Monthly/Annual', portal: 'RD Portal' }, { name: 'SSO', submission_frequency: 'Monthly', portal: 'SSO Portal' }, { name: 'Ministry of Labour', submission_frequency: 'As required', portal: 'MOL Portal' }],
    government_forms: [{ name: 'Por.Ngo.Dor Report', frequency: 'Monthly', deadline: '15th of month' }, { name: 'PND1 (Withholding Tax)', frequency: 'Monthly', deadline: '7th of month' }, { name: 'PP30 (Corporate Tax)', frequency: 'Annual', deadline: '150 days after year-end' }],
    accounting: { fiscal_year_start: '01-01', default_tax_code: 'VAT', invoice_number_format: 'INV-{YYYY}-{0000}', payment_terms: 'Net 30' },
    banking: { bank_file_format: 'CSV/EFT', supported_banks: ['Bangkok Bank', 'Kasikorn', 'SCB', 'Krungsri', 'Krungthai', 'TTB'] },
    compliance: { employment_act: 'Labour Protection Act B.E. 2541', record_retention_years: 5, payslip_requirements: 'Payslip required', privacy_law: 'PDPA (Personal Data Protection Act 2019)' },
    termination: { notice_period: '1 month or salary in lieu', severance_pay: '30-400 days based on service', last_pay_rules: 'Within 3 days of termination' },
    foreign_workers: { work_pass_types: ['Non-B Visa + Work Permit', 'BOI Visa', 'Smart Visa'], levy: 'No specific levy', quota: '4 foreign:1 Thai for certain positions' },
    localisation: { address_format: 'House No, Street, Sub-district, District, Province, Postcode', postal_code_format: '5 digits', phone_format: '+66 8x xxxx xxxx', national_id_format: 'X-XXXX-XXXXX-XX-X (ID Card)' },
  },
  PH: {
    general: { name: 'Philippines', code: 'PH', currency: 'PHP', currency_symbol: '\u20b1', phone_code: '+63', timezone: 'Asia/Manila', primary_language: 'Filipino/English', date_format: 'MM/DD/YYYY', time_format: '12h', week_starts_on: 'Monday', financial_year: '01-01', tax_year: '01-01', default_payroll_frequency: 'Semi-monthly' },
    employment: { max_weekly_hours: 48, probation_months: 6, notice_period_days: 30, retirement_age: 60, rest_days: 'Sunday', employment_types: ['Regular', 'Probationary', 'Contractual', 'Project', 'Seasonal'], contract_types: ['Full-time', 'Part-time', 'Fixed-term'] },
    payroll: { frequencies: ['Semi-monthly', 'Monthly'], minimum_wage: 610, payroll_cutoff: '15th & 30th', payroll_lock_date: 'After cutoff', thirteenth_month: '13th month mandatory', bank_file_format: 'CSV/EFT' },
    statutory_contributions: [
      { name: 'SSS', employee_rate: '4.5%', employer_rate: '6%', cap: 'PHP 20,750/month', notes: 'Social Security System' },
      { name: 'PhilHealth', employee_rate: '4.5%', employer_rate: '4.5%', cap: 'PHP 10,000/month', notes: 'Health insurance (each)' },
      { name: 'Pag-IBIG', employee_rate: '2%', employer_rate: '2%', cap: 'PHP 5,000/month', notes: 'Housing fund (max PHP 100 each)' },
    ],
    income_tax: { brackets: [{ min: 0, max: 250000, rate: 0, fixed: 0 }, { min: 250000, max: 400000, rate: 15, fixed: 0 }, { min: 400000, max: 800000, rate: 20, fixed: 22500 }, { min: 800000, max: 2000000, rate: 25, fixed: 102500 }, { min: 2000000, max: 8000000, rate: 30, fixed: 402500 }, { min: 8000000, max: null, rate: 35, fixed: 1302500 }], resident_rules: '183 days/year', filing_frequency: 'Annual' },
    sales_tax: [{ name: 'VAT', rate: 12, notes: 'Standard rate' }],
    leave: { types: [{ name: 'Annual Leave (VL)', min_days: 5, carry_forward: 0, encashable: true }, { name: 'Sick Leave (SL)', min_days: 5, carry_forward: 0, encashable: false }, { name: 'Maternity Leave', min_days: 105, carry_forward: 0, encashable: false }, { name: 'Paternity Leave', min_days: 7, carry_forward: 0, encashable: false }, { name: 'Parental Leave', min_days: 7, carry_forward: 0, encashable: false }] },
    public_holidays: ['New Year\'s Day', 'People Power Anniversary', 'Araw ng Kagitingan', 'Maundy Thursday', 'Good Friday', 'Labour Day', 'Independence Day', 'Ninoy Aquino Day', 'National Heroes Day', 'Bonifacio Day', 'Christmas Day', 'Rizal Day'],
    government_agencies: [{ name: 'BIR', submission_frequency: 'Monthly/Annual', portal: 'eBIR Forms' }, { name: 'SSS', submission_frequency: 'Monthly', portal: 'SSS Portal' }, { name: 'PhilHealth', submission_frequency: 'Monthly', portal: 'PhilHealth Portal' }, { name: 'Pag-IBIG', submission_frequency: 'Monthly', portal: 'LMS Portal' }],
    government_forms: [{ name: 'BIR 1601-C', frequency: 'Monthly', deadline: '10th of month' }, { name: 'BIR 2316', frequency: 'Annual', deadline: '15 Mar' }, { name: 'SSS RF-1', frequency: 'Monthly', deadline: 'Monthly' }, { name: 'PhilHealth ER2', frequency: 'Monthly', deadline: 'Monthly' }, { name: 'Pag-IBIG M1', frequency: 'Monthly', deadline: 'Monthly' }],
    accounting: { fiscal_year_start: '01-01', default_tax_code: 'VAT', invoice_number_format: 'INV-{YYYY}-{0000}', payment_terms: 'Net 30' },
    banking: { bank_file_format: 'CSV/EFT', supported_banks: ['BDO', 'Metrobank', 'BPI', 'Landbank', 'PNB', 'Security Bank', 'EastWest'] },
    compliance: { employment_act: 'Labour Code of the Philippines', record_retention_years: 5, payslip_requirements: 'Itemised payslip required', privacy_law: 'Data Privacy Act 2012 (RA 10173)' },
    termination: { notice_period: '30 days', severance_pay: '1 month or 1/2 month per year of service', last_pay_rules: 'Within 30 days of termination' },
    foreign_workers: { work_pass_types: ['9G Alien Employment Permit', 'AEP + Work Visa', 'Special Working Visa'], levy: 'No specific levy', quota: 'Based on company capitalisation' },
    localisation: { address_format: 'House/Street, Barangay, City/Municipality, Province, Postcode', postal_code_format: '4 digits', phone_format: '+63 9xx xxx xxxx', national_id_format: 'XXXX-XXXX-XXXX (PhilSys ID)' },
  },
  VN: {
    general: { name: 'Vietnam', code: 'VN', currency: 'VND', currency_symbol: '\u20ab', phone_code: '+84', timezone: 'Asia/Ho_Chi_Minh', primary_language: 'Vietnamese', date_format: 'DD/MM/YYYY', time_format: '24h', week_starts_on: 'Monday', financial_year: '01-01', tax_year: '01-01', default_payroll_frequency: 'Monthly' },
    employment: { max_weekly_hours: 48, probation_months: 2, notice_period_days: 30, retirement_age: 60, rest_days: 'Sunday', employment_types: ['Permanent (CDXDN)', 'Fixed-term (XDHH)', 'Temporary', 'Seasonal'], contract_types: ['Full-time', 'Part-time'] },
    payroll: { frequencies: ['Monthly'], minimum_wage: 4680000, payroll_cutoff: 'Last day of month', payroll_lock_date: '5th of next month', thirteenth_month: 'Not mandatory but common (T\u1ebft bonus)', bank_file_format: 'CSV/EFT' },
    statutory_contributions: [
      { name: 'Social Insurance (SI)', employee_rate: '8%', employer_rate: '17.5%', cap: '20x base salary (max)', notes: 'BHXH (Social insurance)' },
      { name: 'Health Insurance (HI)', employee_rate: '1.5%', employer_rate: '3%', cap: '20x base salary (max)', notes: 'BHYT (Health insurance)' },
      { name: 'Unemployment Insurance (UI)', employee_rate: '1%', employer_rate: '1%', cap: '20x base salary (max)', notes: 'BHTN (Unemployment)' },
    ],
    income_tax: { brackets: [{ min: 0, max: 6000000, rate: 5, fixed: 0 }, { min: 6000000, max: 12000000, rate: 10, fixed: 300000 }, { min: 12000000, max: 18000000, rate: 15, fixed: 900000 }, { min: 18000000, max: 32000000, rate: 20, fixed: 1800000 }, { min: 32000000, max: 52000000, rate: 25, fixed: 4600000 }, { min: 52000000, max: 80000000, rate: 30, fixed: 9600000 }, { min: 80000000, max: null, rate: 35, fixed: 18000000 }], resident_rules: '183 days/year', filing_frequency: 'Monthly/Annual' },
    sales_tax: [{ name: 'VAT Standard', rate: 10, notes: 'GTGT (Thu\u1ebf Gi\u00e1 tr\u1ecb gia t\u0103ng)' }, { name: 'VAT Reduced', rate: 5, notes: 'Reduced rate' }, { name: 'VAT Zero', rate: 0, notes: 'Export' }],
    leave: { types: [{ name: 'Annual Leave', min_days: 12, carry_forward: 0, encashable: true }, { name: 'Sick Leave', min_days: 30, carry_forward: 0, encashable: false }, { name: 'Maternity Leave', min_days: 180, carry_forward: 0, encashable: false }, { name: 'Paternity Leave', min_days: 5, carry_forward: 0, encashable: false }, { name: 'Marriage Leave', min_days: 3, carry_forward: 0, encashable: false }, { name: 'Bereavement Leave', min_days: 3, carry_forward: 0, encashable: false }] },
    public_holidays: ['New Year\'s Day', 'T\u1ebft Nguy\u00ean \u0110\u00e1n (5 days)', 'Hung Kings\' Day', 'Reunification Day (30 Apr)', 'Labour Day (1 May)', 'National Day (2 Sep)'],
    government_agencies: [{ name: 'General Department of Taxation', submission_frequency: 'Monthly/Annual', portal: 'eTax Portal' }, { name: 'Social Insurance Agency', submission_frequency: 'Monthly', portal: 'BHXH Portal' }, { name: 'Ministry of Labour', submission_frequency: 'As required', portal: 'MOLISA Portal' }],
    government_forms: [{ name: 'PIT Monthly Declaration', frequency: 'Monthly', deadline: '20th of month' }, { name: 'SI/HI/UI Report', frequency: 'Monthly', deadline: 'Monthly' }, { name: 'PIT Finalisation', frequency: 'Annual', deadline: '31 Mar' }, { name: 'VAT Return', frequency: 'Monthly/Quarterly', deadline: '20th of month' }],
    accounting: { fiscal_year_start: '01-01', default_tax_code: 'VAT', invoice_number_format: 'INV-{YYYY}-{0000}', payment_terms: 'Net 30' },
    banking: { bank_file_format: 'CSV/EFT', supported_banks: ['Vietcombank', 'VietinBank', 'BIDV', 'Techcombank', 'ACB', 'MB Bank'] },
    compliance: { employment_act: 'Labour Code 2019', record_retention_years: 5, payslip_requirements: 'Itemised payslip required', privacy_law: 'Decree 13/2023 on Personal Data Protection' },
    termination: { notice_period: '30-45 days based on contract type', severance_pay: '1/2 month salary per year of service', last_pay_rules: 'Within 7 days of termination' },
    foreign_workers: { work_pass_types: ['Work Permit (valid 2 years)', 'Temporary Residence Card', 'Visa Waiver'], levy: 'No specific levy', quota: 'Based on company size (maximum 1-3%)' },
    localisation: { address_format: 'Street, Ward, District, Province/City', postal_code_format: '6 digits', phone_format: '+84 9x xxx xxxx', national_id_format: '000 000 000 000 (CCCD)' },
  },
};

/**
 * What the country calls its personal ID number, for labels: "NRIC / FIN" in Singapore, "MyKad" in Malaysia,
 * "Emirates ID" in the UAE… Falls back to "National ID".
 */
export function nationalIdLabel(country?: string | null): string {
  const c = (country || 'SG').toUpperCase();
  const OWN: Record<string, string> = { SG: 'NRIC / FIN', SA: 'National ID / Iqama', AE: 'Emirates ID' };
  if (OWN[c]) return OWN[c];
  const fmt = COUNTRY_PACKS[c]?.localisation?.national_id_format || '';
  return fmt.match(/\(([^)]+)\)\s*$/)?.[1] || 'National ID';
}

/** What the country calls a company's registration number, e.g. "UEN" in Singapore, "Trade Licence No." in the UAE. */
export function companyRegLabel(country?: string | null): string {
  const L: Record<string, string> = {
    SG: 'UEN', MY: 'SSM Registration No.', HK: 'Business Registration (BR) No.', AE: 'Trade Licence No.',
    SA: 'Commercial Registration (CR) No.', AU: 'ABN', NZ: 'NZBN', GB: 'Company Number', US: 'EIN',
    CA: 'Business Number (BN)', IN: 'CIN', ID: 'NIB', TH: 'Company Registration No.', PH: 'SEC Registration No.',
    VN: 'Enterprise Code', CN: 'Unified Social Credit Code', JP: 'Corporate Number', KR: 'Business Registration No.',
    DE: 'Handelsregisternummer', FR: 'SIREN', NL: 'KvK Number', CH: 'UID',
  };
  return L[(country || 'SG').toUpperCase()] || 'Company Registration No.';
}

/** What the country calls a sales-tax registration number, e.g. "GST Reg. No." in Singapore, "TRN" in the UAE. */
export function taxRegLabel(country?: string | null): string {
  const L: Record<string, string> = {
    SG: 'GST Reg. No.', MY: 'SST Registration No.', AE: 'TRN', SA: 'VAT Number', AU: 'ABN (GST)', NZ: 'GST Number',
    GB: 'VAT Number', IN: 'GSTIN', CA: 'GST/HST Number', DE: 'USt-IdNr.', FR: 'TVA Number', NL: 'BTW Number',
  };
  return L[(country || 'SG').toUpperCase()] || 'Tax Registration No.';
}
