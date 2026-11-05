// Fields, lists and starter layouts for the spreadsheet-style document designer.
import type { GridTemplate, GridCell, FieldValues, ListValues } from '../utils/gridTemplate';

export type DocKind = 'payslip' | 'invoice';

export interface FieldDef { name: string; label: string }
export interface ListDef { name: string; label: string; fields: FieldDef[] }

const COMPANY_FIELDS: FieldDef[] = [
  { name: 'logo', label: 'Company logo (put alone in a cell)' },
  { name: 'company_name', label: 'Company name' },
  { name: 'company_legal_name', label: 'Legal name' },
  { name: 'company_reg_no', label: 'Registration / UEN' },
  { name: 'company_address', label: 'Company address' },
  { name: 'company_phone', label: 'Company phone' },
  { name: 'company_email', label: 'Company email' },
  { name: 'company_website', label: 'Company website' },
  { name: 'currency', label: 'Currency' },
  { name: 'footer_note', label: 'Footer note' },
];

export const DOC_FIELDS: Record<DocKind, FieldDef[]> = {
  payslip: [
    ...COMPANY_FIELDS,
    { name: 'employee_name', label: 'Employee name' },
    { name: 'employee_code', label: 'Employee ID' },
    { name: 'employee_designation', label: 'Designation (job title)' },
    { name: 'employee_department', label: 'Department' },
    { name: 'employee_id_no', label: 'NRIC / ID number (full)' },
    { name: 'employee_id_no_masked', label: 'NRIC / ID number (masked, e.g. •••••567A)' },
    { name: 'bank_name', label: 'Bank name' },
    { name: 'bank_account', label: 'Bank account number (full)' },
    { name: 'bank_account_masked', label: 'Bank account number (masked, e.g. ••••6789)' },
    { name: 'period', label: 'Pay period (e.g. August 2026)' },
    { name: 'pay_date', label: 'Pay date' },
    { name: 'gross_pay', label: 'Gross pay' },
    { name: 'total_deductions', label: 'Total deductions' },
    { name: 'net_pay', label: 'Net pay' },
    { name: 'total_employer', label: 'Total employer contributions' },
    { name: 'paid_on_behalf', label: 'Paid by the company on the employee’s behalf' },
    { name: 'cpf_employee', label: 'Employee CPF' },
    { name: 'cpf_employer', label: 'Employer CPF' },
    { name: 'cpf_total', label: 'Total CPF contribution (employee + employer)' },
    { name: 'sdl', label: 'SDL (Skills Development Levy, paid by the company)' },
    { name: 'shg_name', label: 'Self-help group name (CDAC / SINDA / MBMF / ECF)' },
    { name: 'shg_amount', label: 'Self-help group amount' },
  ],
  invoice: [
    ...COMPANY_FIELDS,
    { name: 'invoice_no', label: 'Invoice number' },
    { name: 'invoice_date', label: 'Invoice date' },
    { name: 'due_date', label: 'Due date' },
    { name: 'payment_terms', label: 'Payment terms' },
    { name: 'customer_name', label: 'Customer name' },
    { name: 'customer_address', label: 'Customer address' },
    { name: 'subtotal', label: 'Subtotal' },
    { name: 'tax', label: 'Tax' },
    { name: 'total', label: 'Total' },
    { name: 'bank_details', label: 'Bank / payment details' },
  ],
};

const nameAmount = (list: string, what: string): FieldDef[] => [
  { name: `${list}.name`, label: `${what} name` },
  { name: `${list}.amount`, label: `${what} amount` },
];

export const DOC_LISTS: Record<DocKind, ListDef[]> = {
  payslip: [
    { name: 'earnings', label: 'Earnings', fields: nameAmount('earnings', 'Earning') },
    { name: 'deductions', label: 'Deductions', fields: nameAmount('deductions', 'Deduction') },
    { name: 'employer', label: 'Employer contributions', fields: nameAmount('employer', 'Employer contribution') },
    {
      name: 'statutory', label: 'Statutory schemes (CPF, SDL, CDAC…)', fields: [
        { name: 'statutory.name', label: 'Scheme name' },
        { name: 'statutory.employee', label: 'Scheme – employee share' },
        { name: 'statutory.employer', label: 'Scheme – employer share' },
        { name: 'statutory.total', label: 'Scheme – total' },
      ],
    },
  ],
  invoice: [
    {
      name: 'lines', label: 'Invoice lines', fields: [
        { name: 'lines.no', label: 'Line number' },
        { name: 'lines.description', label: 'Line description' },
        { name: 'lines.qty', label: 'Line quantity' },
        { name: 'lines.unit_price', label: 'Line unit price' },
        { name: 'lines.amount', label: 'Line amount' },
      ],
    },
  ],
};

// ---- starter layouts --------------------------------------------------------

const GREY = '#666666';
const SHADE = '#f2f2f2';
const DARK = '#2b2b2b';
const HEAD: GridCell = { b: true, bg: DARK, c: '#ffffff', al: 'center', va: 'middle' };

function build(cols: number[], spec: { h?: number; repeat?: string; cells?: [number, GridCell][] }[]): GridTemplate {
  const cells: Record<string, GridCell> = {};
  spec.forEach((row, r) => (row.cells || []).forEach(([c, cell]) => { cells[`${r}:${c}`] = cell; }));
  return { enabled: false, cols, rows: spec.map(({ h, repeat }) => ({ ...(h ? { h } : {}), ...(repeat ? { repeat } : {}) })), cells };
}

const label = (v: string, extra: GridCell = {}): GridCell => ({ v, b: true, c: GREY, ...extra });

export const STARTER_LAYOUTS: Record<DocKind, () => GridTemplate> = {
  payslip: () => build([130, 16, 140, 40, 130, 16, 140], [
    { h: 30, cells: [[0, { v: '{{logo}}', rs: 3, cs: 3, va: 'middle' }], [4, { v: 'UEN : {{company_reg_no}}', cs: 3, b: true, al: 'right' }]] },
    { h: 36, cells: [[4, { v: '{{company_address}}', cs: 3, fs: 11, al: 'right' }]] },
    { cells: [[4, { v: '{{company_website}}', cs: 3, fs: 11, al: 'right' }]] },
    { h: 10 },
    { h: 36, cells: [[0, { v: 'EMPLOYEE PAYSLIP', cs: 7, fs: 18, ...HEAD }]] },
    { h: 8 },
    { cells: [[0, { v: 'Name of Employee' }], [1, { v: ':' }], [2, { v: '{{employee_name}}' }], [4, { v: 'Payment Method' }], [5, { v: ':' }], [6, { v: 'Bank Transfer' }]] },
    { cells: [[0, { v: 'Employee ID' }], [1, { v: ':' }], [2, { v: '{{employee_code}}' }], [4, { v: 'Bank Name' }], [5, { v: ':' }], [6, { v: '{{bank_name}}' }]] },
    { cells: [[0, { v: 'Designation' }], [1, { v: ':' }], [2, { v: '{{employee_designation}}' }], [4, { v: 'Bank Account #' }], [5, { v: ':' }], [6, { v: '{{bank_account_masked}}' }]] },
    { cells: [[0, { v: 'Month / Year' }], [1, { v: ':' }], [2, { v: '{{period}}' }], [4, { v: 'Pay Date' }], [5, { v: ':' }], [6, { v: '{{pay_date}}' }]] },
    { h: 10 },
    { h: 26, cells: [[0, { v: 'EARNINGS', cs: 3, ...HEAD }], [4, { v: 'DEDUCTIONS', cs: 3, ...HEAD }]] },
    { repeat: 'auto', cells: [
      [0, { v: '{{earnings.name}}' }], [2, { v: '{{earnings.amount}}', al: 'right' }],
      [4, { v: '{{deductions.name}}' }], [6, { v: '{{deductions.amount}}', al: 'right' }],
    ] },
    { h: 8 },
    { cells: [
      [0, { v: 'Total Earnings' }], [1, { v: ':' }], [2, { v: '{{gross_pay}}', b: true, bt: true, al: 'right' }],
      [4, { v: 'Total Deductions' }], [5, { v: ':' }], [6, { v: '{{total_deductions}}', b: true, bt: true, al: 'right' }],
    ] },
    { h: 12 },
    { h: 28, cells: [[0, { v: 'STATUTORY CONTRIBUTIONS', cs: 3, ...HEAD }], [4, { v: 'NETT SALARY', cs: 2, fs: 14, ...HEAD, al: 'left' }], [6, { v: '{{net_pay}}', fs: 14, ...HEAD, al: 'right' }]] },
    { cells: [[0, { v: 'Employer CPF' }], [1, { v: ':' }], [2, { v: '{{cpf_employer}}', al: 'right' }]] },
    { cells: [[0, { v: 'Employee CPF' }], [1, { v: ':' }], [2, { v: '{{cpf_employee}}', al: 'right' }]] },
    { h: 6 },
    { cells: [[0, { v: 'Total CPF Contribution' }], [1, { v: ':' }], [2, { v: '{{cpf_total}}', b: true, bt: true, al: 'right' }]] },
    { h: 14 },
    { cells: [[0, { v: '{{footer_note}}', cs: 7, fs: 10, c: GREY }]] },
  ]),
  invoice: () => build([50, 270, 70, 140, 150], [
    { h: 28, cells: [[0, { v: '{{logo}}', rs: 3, cs: 2, va: 'middle' }], [2, { v: 'INVOICE', cs: 3, b: true, fs: 22, al: 'right' }]] },
    { cells: [[2, { v: 'Invoice no. {{invoice_no}}', cs: 3, al: 'right' }]] },
    { cells: [[2, { v: 'Date {{invoice_date}}', cs: 3, al: 'right' }]] },
    { h: 10 },
    { cells: [[0, { v: '{{company_legal_name}}', cs: 2, b: true }], [2, label('Bill to', { cs: 3 })]] },
    { h: 36, cells: [[0, { v: '{{company_address}}', cs: 2, fs: 11, c: GREY }], [2, { v: '{{customer_name}}\n{{customer_address}}', cs: 3 }]] },
    { cells: [[0, { v: 'Reg. No. {{company_reg_no}}', cs: 2, fs: 11, c: GREY }], [2, { v: 'Due date {{due_date}} ({{payment_terms}})', cs: 3, fs: 11, c: GREY }]] },
    { h: 14 },
    { cells: [
      [0, { v: '#', b: true, bg: SHADE, bb: true }], [1, { v: 'Description', b: true, bg: SHADE, bb: true }],
      [2, { v: 'Qty', b: true, bg: SHADE, bb: true, al: 'right' }], [3, { v: 'Unit price', b: true, bg: SHADE, bb: true, al: 'right' }],
      [4, { v: 'Amount', b: true, bg: SHADE, bb: true, al: 'right' }],
    ] },
    { repeat: 'lines', cells: [
      [0, { v: '{{lines.no}}', bb: true }], [1, { v: '{{lines.description}}', bb: true }], [2, { v: '{{lines.qty}}', al: 'right', bb: true }],
      [3, { v: '{{lines.unit_price}}', al: 'right', bb: true }], [4, { v: '{{lines.amount}}', al: 'right', bb: true }],
    ] },
    { cells: [[3, { v: 'Subtotal', al: 'right' }], [4, { v: '{{subtotal}}', al: 'right' }]] },
    { cells: [[3, { v: 'Tax', al: 'right' }], [4, { v: '{{tax}}', al: 'right' }]] },
    { h: 30, cells: [[3, { v: 'TOTAL', b: true, fs: 14, al: 'right', bt: true, va: 'middle' }], [4, { v: '{{total}}', b: true, fs: 14, al: 'right', bt: true, va: 'middle' }]] },
    { h: 14 },
    { cells: [[0, label('Payment details', { cs: 5 })]] },
    { h: 36, cells: [[0, { v: '{{bank_details}}', cs: 5, fs: 11 }]] },
    { h: 14 },
    { cells: [[0, { v: '{{footer_note}}', cs: 5, fs: 10, c: GREY }]] },
  ]),
};

// ---- filling in -------------------------------------------------------------

export const money = (n: number, c = 'SGD') =>
  `${c} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function companyFields(company: any, branding: any, footerNote?: string): FieldValues {
  return {
    logo: '',
    company_name: company?.name || '',
    company_legal_name: branding?.legal_name || company?.name || '',
    company_reg_no: branding?.registration_no || '',
    company_address: branding?.address || '',
    company_phone: branding?.phone || '',
    company_email: branding?.email || '',
    company_website: branding?.website || '',
    currency: company?.currency || 'SGD',
    footer_note: (footerNote || '').trim() || (branding?.footer_note || ''),
  };
}

/** Example values shown in the designer's preview. */
export function sampleData(kind: DocKind, company: any, branding: any): { fields: FieldValues; lists: ListValues } {
  const cur = company?.currency || 'SGD';
  const base = companyFields(company, branding, kind === 'payslip' ? branding?.templates?.payslip?.footerNote : branding?.templates?.invoice?.footerNote);
  if (kind === 'payslip') {
    return {
      fields: {
        ...base, employee_name: 'Alice Tan', employee_code: 'EMP-001', employee_designation: 'Senior Designer', employee_department: 'Creative', employee_id_no: 'S1234567A', employee_id_no_masked: '•••••567A', bank_name: 'DBS', bank_account: '012-345678-9', bank_account_masked: '•••••••78-9',
        period: 'August 2026', pay_date: '2026-08-31', gross_pay: money(9500, cur), total_deductions: money(1600, cur),
        net_pay: money(7900, cur), total_employer: money(1371.25, cur), paid_on_behalf: '',
        cpf_employee: money(1600, cur), cpf_employer: money(1360, cur), cpf_total: money(2960, cur), sdl: money(11.25, cur),
        shg_name: '', shg_amount: '',
      },
      lists: {
        earnings: [{ name: 'Basic Salary', amount: money(9000, cur) }, { name: 'Transport Allowance', amount: money(500, cur) }],
        deductions: [{ name: 'CPF (Employee)', amount: money(1600, cur) }],
        employer: [{ name: 'CPF (Employer)', amount: money(1360, cur) }, { name: 'SDL', amount: money(11.25, cur) }],
        statutory: [
          { name: 'CPF', employee: money(1600, cur), employer: money(1360, cur), total: money(2960, cur) },
          { name: 'SDL', employee: money(0, cur), employer: money(11.25, cur), total: money(11.25, cur) },
        ],
      },
    };
  }
  const terms = branding?.templates?.invoice?.paymentTermsDays ?? 30;
  return {
    fields: {
      ...base, invoice_no: 'INV-0001', invoice_date: '2026-08-01', due_date: '2026-08-31', payment_terms: `${terms} days`,
      customer_name: 'Acme Trading Pte Ltd', customer_address: '1 Example Road, Singapore 123456',
      subtotal: money(3000, cur), tax: money(270, cur), total: money(3270, cur),
      bank_details: branding?.templates?.invoice?.bankDetails || '',
    },
    lists: {
      lines: [
        { no: '1', description: 'Consulting services', qty: '10', unit_price: money(250, cur), amount: money(2500, cur) },
        { no: '2', description: 'Travel', qty: '1', unit_price: money(500, cur), amount: money(500, cur) },
      ],
    },
  };
}

/** Short, friendly name for a {{field}}, shown on the chips in the designer. */
export function fieldShortName(kind: DocKind, name: string): string | null {
  const n = name.toLowerCase();
  const f = DOC_FIELDS[kind].find(x => x.name === n);
  if (f) return f.label.replace(/\s*\(.*\)\s*$/, '');
  for (const l of DOC_LISTS[kind]) {
    const lf = l.fields.find(x => x.name === n);
    if (lf) return lf.label;
  }
  // older layouts: {{line.name}} = "this row's item"
  if (n.startsWith('line.')) {
    const f = n.slice(5);
    if (DOC_LISTS[kind].some(l => l.fields.some(x => x.name.endsWith(`.${f}`)))) return `Item ${f.replace(/_/g, ' ')}`;
  }
  return null;
}

/** What each list's {{line.name}} looks like on a real document. */
export const LIST_EXAMPLES: Record<string, string> = {
  earnings: 'Basic Salary, Transport allowance, Overtime (10 hrs), Bonus, Reimbursement / claim – Taxi, Unpaid leave (2 days)…',
  deductions: 'CPF (Employee), CDAC, Loan repayment, Salary advance, Other deduction – Uniform…',
  employer: 'CPF (Employer), SDL…',
  statutory: 'CPF, SDL, CDAC… (one line per scheme, with the employee and employer share)',
  lines: 'Whatever is typed on each invoice line, e.g. Consulting services',
};
