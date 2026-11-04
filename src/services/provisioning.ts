import { supabase } from '../utils/supabase';
import { adminUsersService } from './adminUsers';
import { COUNTRY_PACKS } from '../data/countries';

export interface ProvisionInput {
  name: string;
  registration_number?: string;
  country: string;
  business_type: string;
  business_pack: string;
  company_size?: string;
  currency: string;
  financial_year_start: string;
  timezone: string;
  modules: string[];
  owner_full_name: string;
  owner_email: string;
  owner_mobile?: string;
  owner_password: string;
}

export interface ProvisionStep {
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
}

export interface ProvisionResult {
  company: any;
  company_code: string;
  owner: any;
  roles: any[];
  branches: any[];
  departments: string[];
  positions: string[];
  coa: any[];
  leave_types: any[];
  payroll_components: any[];
  tax_codes: any[];
  workflows: any[];
  numbering: any[];
  report_count: number;
}

const STEPS: ProvisionStep[] = [
  { label: 'Company', status: 'pending' },
  { label: 'Company Settings', status: 'pending' },
  { label: 'Owner Account', status: 'pending' },
  { label: 'Branch', status: 'pending' },
  { label: 'Country Profile', status: 'pending' },
  { label: 'Business Pack', status: 'pending' },
  { label: 'Departments', status: 'pending' },
  { label: 'Positions', status: 'pending' },
  { label: 'Roles', status: 'pending' },
  { label: 'Permissions', status: 'pending' },
  { label: 'Leave Types', status: 'pending' },
  { label: 'Payroll Components', status: 'pending' },
  { label: 'Chart of Accounts', status: 'pending' },
  { label: 'Tax Codes', status: 'pending' },
  { label: 'Revenue Categories', status: 'pending' },
  { label: 'Numbering Formats', status: 'pending' },
  { label: 'Approval Workflows', status: 'pending' },
  { label: 'Dashboard Widgets', status: 'pending' },
  { label: 'Notification Templates', status: 'pending' },
  { label: 'Email Templates', status: 'pending' },
  { label: 'Document Templates', status: 'pending' },
  { label: 'Default Reports', status: 'pending' },
  { label: 'Audit Log', status: 'pending' },
];

type ProgressCallback = (stepIndex: number, status: 'running' | 'done' | 'error') => void;

const GLOBAL_COA = [
  { code: '1000', name: 'Assets', type: 'header' },
  { code: '1100', name: 'Cash', type: 'asset' },
  { code: '1110', name: 'Bank', type: 'asset' },
  { code: '1120', name: 'Petty Cash', type: 'asset' },
  { code: '1200', name: 'Accounts Receivable', type: 'asset' },
  { code: '1300', name: 'Inventory', type: 'asset' },
  { code: '1400', name: 'Fixed Assets', type: 'asset' },
  { code: '1500', name: 'Accumulated Depreciation', type: 'asset' },
  { code: '2000', name: 'Liabilities', type: 'header' },
  { code: '2100', name: 'Accounts Payable', type: 'liability' },
  { code: '2200', name: 'Loans', type: 'liability' },
  { code: '2300', name: 'Payroll Payable', type: 'liability' },
  { code: '2400', name: 'Tax Payable', type: 'liability' },
  { code: '3000', name: 'Equity', type: 'header' },
  { code: '3100', name: 'Share Capital', type: 'equity' },
  { code: '3200', name: 'Retained Earnings', type: 'equity' },
  { code: '3300', name: 'Current Year Earnings', type: 'equity' },
  { code: '4000', name: 'Revenue', type: 'header' },
  { code: '4100', name: 'Sales', type: 'revenue' },
  { code: '4200', name: 'Service Revenue', type: 'revenue' },
  { code: '4300', name: 'Other Revenue', type: 'revenue' },
  { code: '5000', name: 'Cost of Sales', type: 'header' },
  { code: '5100', name: 'Purchases', type: 'cogs' },
  { code: '5200', name: 'Direct Labour', type: 'cogs' },
  { code: '5300', name: 'Freight In', type: 'cogs' },
  { code: '6000', name: 'Operating Expenses', type: 'header' },
  { code: '6100', name: 'Salary', type: 'expense' },
  { code: '6200', name: 'Employer Contributions', type: 'expense' },
  { code: '6300', name: 'Rent', type: 'expense' },
  { code: '6400', name: 'Utilities', type: 'expense' },
  { code: '6500', name: 'Telephone & Internet', type: 'expense' },
  { code: '6600', name: 'Insurance', type: 'expense' },
  { code: '6700', name: 'Transport', type: 'expense' },
  { code: '6800', name: 'Marketing', type: 'expense' },
  { code: '6900', name: 'Professional Fees', type: 'expense' },
  { code: '7000', name: 'Other Income', type: 'header' },
  { code: '7100', name: 'Interest Income', type: 'other_income' },
  { code: '7200', name: 'Gain on Disposal', type: 'other_income' },
  { code: '8000', name: 'Other Expenses', type: 'header' },
  { code: '8100', name: 'Bank Charges', type: 'other_expense' },
  { code: '8200', name: 'Interest Expense', type: 'other_expense' },
  { code: '8300', name: 'Depreciation', type: 'other_expense' },
  { code: '8400', name: 'Bad Debts', type: 'other_expense' },
  { code: '9000', name: 'Income Tax', type: 'header' },
  { code: '9100', name: 'Income Tax Expense', type: 'tax' },
];

export function getProvisionSteps(): ProvisionStep[] {
  return STEPS.map(s => ({ ...s }));
}

export async function provisionCompany(input: ProvisionInput, onProgress?: ProgressCallback): Promise<ProvisionResult> {
  const company_code = input.name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 20);

  const mark = (i: number, status: 'running' | 'done' | 'error') => {
    if (onProgress) onProgress(i, status);
  };

  const run = async <T>(stepIndex: number, fn: () => Promise<T>): Promise<T> => {
    mark(stepIndex, 'running');
    try {
      const result = await fn();
      mark(stepIndex, 'done');
      return result;
    } catch (e) {
      mark(stepIndex, 'error');
      throw e;
    }
  };

  // 0. Company
  const company = await run(0, async () => {
    const { data, error } = await supabase.from('companies').insert({
      name: input.name,
      company_code,
      country: input.country,
      business_type: input.business_type,
      currency: input.currency,
      financial_year_start: input.financial_year_start,
      timezone: input.timezone,
      modules: input.modules,
      metadata: { business_type: input.business_type, registration_number: input.registration_number, company_size: input.company_size },
    }).select().single();
    if (error) throw error;
    return data;
  });

  // 1. Company Settings
  await run(1, async () => {
    const { error } = await supabase.from('company_settings').upsert({
      company_id: company.id, category: 'company', key: 'registration_number', value: input.registration_number || '',
    });
    if (error) throw error;
  });

  // 2. Owner Account
  const owner = await run(2, async () => {
    // Login is created server-side (Supabase Auth); the password never touches our tables.
    const res = await adminUsersService.createCompanyUser({
      company_id: company.id,
      full_name: input.owner_full_name,
      email: input.owner_email,
      password: input.owner_password,
      phone: input.owner_mobile || '',
      job_title: 'Owner',
    });
    return res.user;
  });

  // 3. Branch
  const branches = await run(3, async () => {
    const { data, error } = await supabase.from('company_settings').upsert({
      company_id: company.id, category: 'company', key: 'branches',
      value: [{ name: 'Head Office', code: 'HQ', is_active: true, is_main: true }],
    });
    if (error) throw error;
    return [{ name: 'Head Office', code: 'HQ' }];
  });

  // 4. Country Profile (load into settings)
  await run(4, async () => {
    const { error } = await supabase.from('company_settings').upsert({
      company_id: company.id, category: 'company', key: 'country_config',
      value: { country_code: input.country, currency: input.currency, timezone: input.timezone, business_type: input.business_type },
    });
    if (error) throw error;
  });

  // 5. Business Pack (record selected pack + modules)
  await run(5, async () => {
    const { error } = await supabase.from('company_settings').upsert({
      company_id: company.id, category: 'company', key: 'business_pack',
      value: { pack: input.business_pack, modules: input.modules },
    });
    if (error) throw error;
  });

  const departments: string[] = ['Management', 'Finance', 'HR', 'Operations'];
  const positions: string[] = ['CEO', 'Manager', 'Executive', 'Assistant'];
  // The country pack's statutory leave list, falling back to a generic set.
  const packLeave = COUNTRY_PACKS[input.country]?.leave?.types;
  const leaveTypes: any[] = packLeave && packLeave.length > 0
    ? packLeave.map(t => ({ name: t.name, days: t.min_days, carry_forward: t.carry_forward, encashable: t.encashable }))
    : [
      { name: 'Annual Leave', days: 14, carry_forward: 7, encashable: true },
      { name: 'Sick Leave', days: 14, carry_forward: 0, encashable: false },
      { name: 'Hospitalization Leave', days: 60, carry_forward: 0, encashable: false },
      { name: 'Maternity Leave', days: 98, carry_forward: 0, encashable: false },
    ];
  const payrollComponents: any[] = [
    { name: 'Basic Salary', type: 'Earning', is_taxable: true },
    { name: 'Allowance', type: 'Earning', is_taxable: true },
    { name: 'Overtime', type: 'Earning', is_taxable: true },
    { name: 'EPF/SOCSO', type: 'Deduction', is_taxable: false },
    { name: 'Tax Withholding', type: 'Deduction', is_taxable: false },
  ];
  const coaList = GLOBAL_COA;
  const expenseCategories: string[] = [
    'Rent', 'Utilities', 'Office Supplies', 'Travel', 'Marketing', 'Maintenance',
  ];
  const revenueCategories: string[] = [
    'Product Sales', 'Service Revenue', 'Commission Income', 'Interest Income',
  ];

  // 6. Departments
  await run(6, async () => {
    const { error } = await supabase.from('company_settings').upsert({
      company_id: company.id, category: 'company', key: 'departments', value: departments,
    });
    if (error) throw error;
    await supabase.from('hr_departments').insert(
      departments.map(name => ({ company_id: company.id, name }))
    );
  });

  // 7. Positions
  await run(7, async () => {
    const { error } = await supabase.from('company_settings').upsert({
      company_id: company.id, category: 'company', key: 'job_positions', value: positions,
    });
    if (error) throw error;
  });

  // 8. Roles
  const roleNames = ['Admin', 'Manager', 'Employee'];
  const roles: any[] = [];
  await run(8, async () => {
    for (const name of roleNames) {
      const { data, error } = await supabase.from('company_roles').insert({
        company_id: company.id, name, is_system: true,
      }).select().single();
      if (error) throw error;
      roles.push(data);
    }
  });

  // 9. Permissions
  await run(9, async () => {
    const ALL_FEATURES = ['view', 'create', 'edit', 'delete', 'approve', 'export'];
    for (const role of roles) {
      let featureList: string[] = [];
      if (role.name === 'Admin') featureList = ALL_FEATURES;
      else if (role.name === 'Manager') featureList = ['view', 'create', 'edit', 'approve'];
      else featureList = ['view', 'create'];

      const permRows = input.modules.flatMap((mod: string) =>
        featureList.map((action: string) => ({ role_id: role.id, module: mod, feature: '*', action }))
      );

      if (permRows.length > 0) {
        const BATCH_SIZE = 50;
        for (let i = 0; i < permRows.length; i += BATCH_SIZE) {
          const batch = permRows.slice(i, i + BATCH_SIZE);
          const { error } = await supabase.from('company_permissions').insert(batch);
          if (error) throw error;
        }
      }
    }

    // Assign owner to Admin role
    const adminRole = roles.find(r => r.name === 'Admin');
    if (adminRole) {
      const { error } = await supabase.from('company_user_roles').insert({
        user_id: owner.id, role_id: adminRole.id,
      });
      if (error) throw error;
    }
  });

  // 10. Leave Types
  await run(10, async () => {
    const { error } = await supabase.from('company_settings').upsert({
      company_id: company.id, category: 'company', key: 'leave_types', value: leaveTypes,
    });
    if (error) throw error;
    await supabase.from('leave_types').insert(
      leaveTypes.map((lt: any) => ({
        company_id: company.id, name: lt.name, default_days: lt.days ?? 0,
        carry_forward_cap: lt.carry_forward ?? 0, encashable: !!lt.encashable,
        is_paid: true, requires_approval: true, active: true,
      }))
    );
    // Owner employee record, linked to the owner login
    await supabase.rpc('hr_upsert_employee', {
      p: {
        company_id: company.id, user_id: String(owner.id), employee_code: 'EMP-001',
        full_name: input.owner_full_name, email: input.owner_email,
        phone: input.owner_mobile || '', job_title: 'Owner', employment_type: 'full_time',
        status: 'active', join_date: new Date().toISOString().slice(0, 10),
      },
    });
  });

  // 11. Payroll Components
  await run(11, async () => {
    const { error } = await supabase.from('company_settings').upsert({
      company_id: company.id, category: 'company', key: 'payroll_components', value: payrollComponents,
    });
    if (error) throw error;
  });

  // 12. Chart of Accounts
  await run(12, async () => {
    const { error } = await supabase.from('company_settings').upsert({
      company_id: company.id, category: 'company', key: 'chart_of_accounts', value: coaList,
    });
    if (error) throw error;
  });

  // 13. Tax Codes
  const taxCodes = [
    { code: 'SR', name: 'Standard Rate', rate: 0, is_default: true },
    { code: 'ZR', name: 'Zero Rated', rate: 0, is_default: false },
    { code: 'EX', name: 'Exempt', rate: 0, is_default: false },
  ];
  const savedTaxCodes = await run(13, async () => {
    const { error } = await supabase.from('company_settings').upsert({
      company_id: company.id, category: 'company', key: 'tax_codes', value: taxCodes,
    });
    if (error) throw error;
    return taxCodes;
  });

  // 14. Revenue Categories
  await run(14, async () => {
    const { error } = await supabase.from('company_settings').upsert({
      company_id: company.id, category: 'company', key: 'revenue_categories', value: revenueCategories,
    });
    if (error) throw error;
  });

  // 15. Numbering Formats
  const numberingFormats = [
    { entity: 'employee', format: 'EMP-{YYYY}-{0000}', next: 1 },
    { entity: 'invoice', format: 'INV-{YYYY}-{0000}', next: 1 },
    { entity: 'purchase_order', format: 'PO-{YYYY}-{0000}', next: 1 },
    { entity: 'claim', format: 'CLM-{YYYY}-{0000}', next: 1 },
    { entity: 'leave', format: 'LEV-{YYYY}-{0000}', next: 1 },
    { entity: 'journal', format: 'JRN-{YYYY}-{0000}', next: 1 },
  ];
  const savedNumbering = await run(15, async () => {
    const { error } = await supabase.from('company_settings').upsert({
      company_id: company.id, category: 'company', key: 'numbering_formats', value: numberingFormats,
    });
    if (error) throw error;
    return numberingFormats;
  });

  // 16. Approval Workflows
  const workflowTemplates: string[] = [];
  if (input.modules.includes('leave')) workflowTemplates.push('Leave Approval');
  if (input.modules.includes('claims')) workflowTemplates.push('Claim Approval');
  if (input.modules.includes('attendance')) workflowTemplates.push('Attendance Correction');
  if (input.modules.includes('purchasing')) workflowTemplates.push('Purchase Order');
  if (input.modules.includes('finance') || input.modules.includes('accounting')) workflowTemplates.push('Journal Approval');

  const savedWorkflows: any[] = [];
  await run(16, async () => {
    for (const wfName of workflowTemplates) {
      const entityType = wfName.toLowerCase().replace(/\s+/g, '_');
      const { data: wf, error: wfErr } = await supabase.from('workflow_templates').insert({
        company_id: company.id, name: wfName, entity_type: entityType, is_active: true,
      }).select().single();
      if (wfErr) throw wfErr;
      savedWorkflows.push(wf);

      const { error: wsErr } = await supabase.from('workflow_steps').insert([
        { template_id: wf.id, step_order: 1, assignee_role: 'Manager', action: 'approve', timeout_days: 3 },
        { template_id: wf.id, step_order: 2, assignee_role: 'Admin', action: 'approve', timeout_days: 2 },
      ]);
      if (wsErr) throw wsErr;
    }
  });

  // 17. Dashboard Widgets
  await run(17, async () => {
    const { error } = await supabase.from('company_settings').upsert({
      company_id: company.id, category: 'company', key: 'dashboard_widgets',
      value: ['Employee Count', 'Pending Leaves', 'Recent Claims', 'Quick Actions', 'Monthly Payroll', 'Active Projects'],
    });
    if (error) throw error;
  });

  // 18. Notification Templates
  await run(18, async () => {
    const { error } = await supabase.from('company_settings').upsert({
      company_id: company.id, category: 'company', key: 'notification_templates',
      value: [
        { name: 'Leave Approved', subject: 'Leave request approved', channel: 'in_app,email' },
        { name: 'Leave Rejected', subject: 'Leave request rejected', channel: 'in_app,email' },
        { name: 'Claim Approved', subject: 'Claim approved', channel: 'in_app,email' },
        { name: 'Claim Rejected', subject: 'Claim rejected', channel: 'in_app,email' },
      ],
    });
    if (error) throw error;
  });

  // 19. Email Templates
  await run(19, async () => {
    const { error } = await supabase.from('company_settings').upsert({
      company_id: company.id, category: 'company', key: 'email_templates',
      value: [
        { name: 'Welcome Email', subject: 'Welcome to {company_name}', template: '' },
        { name: 'Password Reset', subject: 'Reset your password', template: '' },
        { name: 'Leave Notification', subject: 'Leave request {status}', template: '' },
      ],
    });
    if (error) throw error;
  });

  // 20. Document Templates
  const docTemplates = [
    { name: 'Employment Contract', type: 'contract', default: true },
    { name: 'Payslip', type: 'payslip', default: true },
    { name: 'Claim Form', type: 'claim', default: true },
    { name: 'Leave Application', type: 'leave', default: true },
  ];
  await run(20, async () => {
    const { error } = await supabase.from('company_settings').upsert({
      company_id: company.id, category: 'company', key: 'document_templates', value: docTemplates,
    });
    if (error) throw error;
  });

  // 21. Default Reports
  const defaultReports: string[] = [
    'Profit & Loss', 'Balance Sheet', 'Employee List', 'Leave Summary',
  ];
  await run(21, async () => {
    const { error } = await supabase.from('company_settings').upsert({
      company_id: company.id, category: 'company', key: 'default_reports', value: defaultReports,
    });
    if (error) throw error;
  });

  // 22. Audit Log
  await run(22, async () => {
    const { error } = await supabase.from('platform_audit_log').insert({
      user_id: owner.id,
      action: 'company.provisioned',
      entity_type: 'company',
      entity_id: String(company.id),
      new_value: {
        name: company.name, company_code, country: input.country, business_type: input.business_type,
        modules: input.modules, departments: departments.length, positions: positions.length,
        workflows: savedWorkflows.length, roles: roleNames.length,
      },
    });
    if (error) throw error;
  });

  return {
    company,
    company_code,
    owner,
    roles,
    branches: [{ name: 'Head Office', code: 'HQ' }],
    departments,
    positions,
    coa: coaList,
    leave_types: leaveTypes,
    payroll_components: payrollComponents,
    tax_codes: taxCodes,
    workflows: savedWorkflows,
    numbering: numberingFormats,
    report_count: defaultReports.length,
  };
}
