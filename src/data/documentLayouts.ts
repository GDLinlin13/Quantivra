// Fields, lists and starter layouts for the spreadsheet-style document designer.
import type { GridTemplate, GridCell, FieldValues, ListValues } from '../utils/gridTemplate';
import { companyRegLabel, nationalIdLabel, taxRegLabel } from './countries';

const isSG = (country?: string | null) => (country || 'SG').toUpperCase() === 'SG';
/** Singapore-only payslip fields (CPF, SDL, self-help groups). */
const SG_ONLY_FIELDS = new Set(['cpf_employee', 'cpf_employer', 'cpf_total', 'sdl', 'shg_name', 'shg_amount']);

export type DocKind = 'payslip' | 'invoice';

export interface FieldDef { name: string; label: string }
export interface ListDef { name: string; label: string; fields: FieldDef[] }

const COMPANY_FIELDS: FieldDef[] = [
  { name: 'logo', label: 'Company logo (put alone in a cell)' },
  { name: 'company_name', label: 'Company name' },
  { name: 'company_legal_name', label: 'Legal name' },
  { name: 'company_reg_no', label: 'Company registration no.' },
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
    { name: 'employee_id_no', label: 'National ID number (full)' },
    { name: 'employee_id_no_masked', label: 'National ID number (masked, e.g. •••••567A)' },
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
    { name: 'document_title', label: 'Document title (INVOICE / QUOTATION / CREDIT NOTE)' },
    { name: 'invoice_no', label: 'Invoice number' },
    { name: 'reference', label: 'Reference / PO number' },
    { name: 'company_gst_no', label: 'Our tax registration no. (GST / VAT)' },
    { name: 'invoice_date', label: 'Invoice date' },
    { name: 'due_date', label: 'Due date' },
    { name: 'payment_terms', label: 'Payment terms' },
    { name: 'customer_name', label: 'Customer name' },
    { name: 'customer_address', label: 'Customer address' },
    { name: 'customer_contact', label: 'Customer person in charge' },
    { name: 'customer_phone', label: 'Customer phone' },
    { name: 'customer_email', label: 'Customer email' },
    { name: 'customer_website', label: 'Customer website' },
    { name: 'subtotal', label: 'Subtotal (before discount)' },
    { name: 'total_discount', label: 'Total discount' },
    { name: 'subtotal_after_discount', label: 'Subtotal after discount' },
    { name: 'tax', label: 'Tax' },
    { name: 'total', label: 'Total' },
    { name: 'amount_paid', label: 'Amount paid so far' },
    { name: 'balance_due', label: 'Balance due' },
    { name: 'notes', label: 'Notes' },
    { name: 'terms', label: 'Terms & conditions' },
    { name: 'bank_details', label: 'Bank / payment details' },
    { name: 'payment_account', label: 'Bank account name (which bank is shown)' },
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
        { name: 'lines.discount', label: 'Line discount' },
        { name: 'lines.amount', label: 'Line amount' },
      ],
    },
    {
      name: 'payment', label: 'Payment details', fields: [
        { name: 'payment.label', label: 'Payment detail label' },
        { name: 'payment.value', label: 'Payment detail value' },
      ],
    },
    {
      name: 'discounts', label: 'Discounts', fields: [
        { name: 'discounts.name', label: 'Discount name' },
        { name: 'discounts.amount', label: 'Discount amount' },
      ],
    },
  ],
};

/** The fields offered for this company's country: CPF, SDL and self-help groups only in Singapore. */
export function docFields(kind: DocKind, country?: string | null): FieldDef[] {
  return DOC_FIELDS[kind]
    .filter(f => isSG(country) || !SG_ONLY_FIELDS.has(f.name))
    .map(f => f.name === 'company_reg_no' ? { ...f, label: companyRegLabel(country) }
      : f.name === 'employee_id_no' ? { ...f, label: `${nationalIdLabel(country)} (full)` }
      : f.name === 'employee_id_no_masked' ? { ...f, label: `${nationalIdLabel(country)} (masked)` } : f);
}

export function docLists(kind: DocKind, country?: string | null): ListDef[] {
  return DOC_LISTS[kind].map(l => l.name === 'statutory' && !isSG(country) ? { ...l, label: 'Statutory schemes' } : l);
}

/** What each list's items look like, in this company's country. */
export function listExample(name: string, country?: string | null): string {
  if (isSG(country)) return LIST_EXAMPLES[name] || '';
  const OTHER: Record<string, string> = {
    earnings: 'Basic Salary, Housing allowance, Transport allowance, Overtime (10 hrs), Bonus, Unpaid leave (2 days)…',
    deductions: 'Salary advance, Loan repayment, Other deduction – Uniform…',
    employer: 'Contributions the company pays on top of salary…',
    statutory: 'One line per government scheme, with the employee and employer share',
  };
  return OTHER[name] || LIST_EXAMPLES[name] || '';
}

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

type RowSpec = { h?: number; repeat?: string; cells?: [number, GridCell][] }[];

const label = (v: string, extra: GridCell = {}): GridCell => ({ v, b: true, c: GREY, ...extra });

/** The older grid starters (one company's own design). Kept only to recognise untouched copies of them. */
export const LEGACY: Record<DocKind, (sg: boolean, reg: string) => GridTemplate> = {
  payslip: (sg, reg) => build([130, 16, 140, 40, 130, 16, 140], [
    { h: 30, cells: [[0, { v: '{{logo}}', rs: 3, cs: 3, va: 'middle' }], [4, { v: `${reg} : {{company_reg_no}}`, cs: 3, b: true, al: 'right' }]] },
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
    ...(sg ? ([
      { h: 28, cells: [[0, { v: 'STATUTORY CONTRIBUTIONS', cs: 3, ...HEAD }], [4, { v: 'NETT SALARY', cs: 2, fs: 14, ...HEAD, al: 'left' }], [6, { v: '{{net_pay}}', fs: 14, ...HEAD, al: 'right' }]] },
      { cells: [[0, { v: 'Employer CPF' }], [1, { v: ':' }], [2, { v: '{{cpf_employer}}', al: 'right' }]] },
      { cells: [[0, { v: 'Employee CPF' }], [1, { v: ':' }], [2, { v: '{{cpf_employee}}', al: 'right' }]] },
      { h: 6 },
      { cells: [[0, { v: 'Total CPF Contribution' }], [1, { v: ':' }], [2, { v: '{{cpf_total}}', b: true, bt: true, al: 'right' }]] },
    ] as RowSpec) : ([
      { h: 28, cells: [[0, { v: 'EMPLOYER CONTRIBUTIONS', cs: 3, ...HEAD }], [4, { v: 'NETT SALARY', cs: 2, fs: 14, ...HEAD, al: 'left' }], [6, { v: '{{net_pay}}', fs: 14, ...HEAD, al: 'right' }]] },
      { repeat: 'auto', cells: [[0, { v: '{{employer.name}}' }], [2, { v: '{{employer.amount}}', al: 'right' }]] },
      { h: 6 },
      { cells: [[0, { v: 'Total' }], [1, { v: ':' }], [2, { v: '{{total_employer}}', b: true, bt: true, al: 'right' }]] },
    ] as RowSpec)),
    { h: 14 },
    { cells: [[0, { v: '{{footer_note}}', cs: 7, fs: 10, c: GREY }]] },
  ]),
  invoice: (_sg, reg) => build([50, 270, 70, 140, 150], [
    { h: 28, cells: [[0, { v: '{{logo}}', rs: 3, cs: 2, va: 'middle' }], [2, { v: '{{document_title}}', cs: 3, b: true, fs: 22, al: 'right' }]] },
    { cells: [[2, { v: 'Invoice no. {{invoice_no}}', cs: 3, al: 'right' }]] },
    { cells: [[2, { v: 'Date {{invoice_date}}', cs: 3, al: 'right' }]] },
    { h: 10 },
    { cells: [[0, { v: '{{company_legal_name}}', cs: 2, b: true }], [2, label('Bill to', { cs: 3 })]] },
    { h: 36, cells: [[0, { v: '{{company_address}}', cs: 2, fs: 11, c: GREY }], [2, { v: '{{customer_name}}\n{{customer_address}}', cs: 3 }]] },
    { h: 36, cells: [[2, { v: 'Attn: {{customer_contact}}\n{{customer_phone}} · {{customer_email}}', cs: 3, fs: 11 }]] },
    { cells: [[0, { v: `${reg} {{company_reg_no}}`, cs: 2, fs: 11, c: GREY }], [2, { v: 'Due date {{due_date}} ({{payment_terms}})', cs: 3, fs: 11, c: GREY }]] },
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
    { repeat: 'auto', cells: [[1, { v: '{{discounts.name}}', cs: 3, al: 'right', c: '#15803d' }], [4, { v: '-{{discounts.amount}}', al: 'right', c: '#15803d' }]] },
    { cells: [[3, { v: 'Tax', al: 'right' }], [4, { v: '{{tax}}', al: 'right' }]] },
    { h: 30, cells: [[3, { v: 'TOTAL', b: true, fs: 14, al: 'right', bt: true, va: 'middle' }], [4, { v: '{{total}}', b: true, fs: 14, al: 'right', bt: true, va: 'middle' }]] },
    { h: 14 },
    { cells: [[0, label('Payment details', { cs: 5 })]] },
    { repeat: 'auto', cells: [[0, { v: '{{payment.label}}', cs: 2, fs: 11 }], [2, { v: '{{payment.value}}', cs: 3, fs: 11 }]] },
    { h: 14 },
    { cells: [[0, { v: '{{footer_note}}', cs: 5, fs: 10, c: GREY }]] },
  ]),
};

/** True when a saved layout is an untouched copy of one of the older grid starters. */
export function isLegacyStarter(kind: DocKind, t: GridTemplate | null | undefined, country?: string | null): boolean {
  if (!t) return false;
  const key = (x: GridTemplate) => canonical({ cols: x.cols.map(w => Math.max(20, w)), rows: x.rows, cells: x.cells });
  const mine = key(t);
  return [true, false].some(sg => ['UEN', 'Reg. No.', companyRegLabel(country)].some(reg => key(LEGACY[kind](sg, reg)) === mine));
}

/** Key order does not matter (the database reorders keys). */
function canonical(v: any): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/** The company header of the pre-built design: logo, name and details on the left, title and dates on the right. */
function headerRows(country: string | null | undefined, branding: any, title: string, meta: string[], logoCols: number, nameCols: number, rightCols: number): RowSpec {
  const kindKey = title === 'PAYSLIP' ? 'payslip' : 'invoice';
  const opts = branding?.templates?.[kindKey] || {};
  const logo = (opts.showLogo ?? true);
  const block = (opts.showCompanyBlock ?? true);
  const accent = branding?.accent_color || '#1677ff';
  const contact = [['phone', '{{company_phone}}'], ['email', '{{company_email}}'], ['website', '{{company_website}}']].filter(([k]) => branding?.[k]).map(([, v]) => v).join('  ·  ');
  const lines = block ? [
    branding?.registration_no ? `${companyRegLabel(country)} {{company_reg_no}}` : '',
    branding?.address ? '{{company_address}}' : '',
    contact,
  ].filter(Boolean) : [];
  const leftAt = logo ? logoCols : 0;
  const leftSpan = logo ? nameCols : logoCols + nameCols;
  const right = logoCols + nameCols;
  const h = Math.max(18, 16 * Math.max(lines.length, meta.length) + 4);
  return [
    { h: 26, cells: [
      ...(logo ? [[0, { v: '{{logo}}', rs: 2, cs: logoCols, va: 'top', bb: true }] as [number, GridCell]] : []),
      [leftAt, { v: '{{company_legal_name}}', cs: leftSpan, b: true, fs: 16 }],
      [right, { v: title, cs: rightCols, b: true, fs: 15, c: accent, al: 'right' }],
    ] },
    { h, cells: [
      [leftAt, { v: lines.join('\n'), cs: leftSpan, fs: 11, c: GREY, va: 'top', bb: true }],
      [right, { v: meta.join('\n'), cs: rightCols, fs: 11, c: GREY, al: 'right', va: 'top', bb: true }],
    ] },
    { h: 14 },
  ];
}

function footerRows(branding: any, kind: DocKind, width: number): RowSpec {
  const has = !!((branding?.templates?.[kind]?.footerNote || '').trim() || (branding?.footer_note || '').trim());
  return [{ h: 16 }, { cells: [[0, { v: '{{footer_note}}', cs: width, fs: 10, c: GREY, ...(has ? { bt: true } : {}) }]] }];
}

/**
 * What "Custom template" starts from: the pre-built design as an editable grid, with this company's own
 * choices (what to show, its details, its country's terms). Nothing from any other company.
 */
export const STARTER_LAYOUTS: Record<DocKind, (country?: string | null, branding?: any) => GridTemplate> = {
  payslip: (country, branding) => {
    const t = branding?.templates?.payslip || {};
    const accent = branding?.accent_color || '#0369a1';
    const row = (label: string, value: string, extra: GridCell = {}, valueExtra: GridCell = {}): RowSpec[number] =>
      ({ cells: [[0, { v: label, cs: 2, ...extra }], [2, { v: value, al: 'right', ...extra, ...valueExtra }]] });
    const muted: GridCell = { c: GREY };
    return build([150, 330, 200], [
      ...headerRows(country, branding, 'PAYSLIP', ['{{period}}', 'Pay date {{pay_date}}'], 1, 1, 1),
      row('Employee', (t.showEmployeeId ?? true) ? '{{employee_name}} · {{employee_code}}' : '{{employee_name}}', {}, {}),
      ...((t.showDesignation ?? true) ? [row('Designation', '{{employee_designation}}')] : []),
      ...(t.showNationalId ? [row(nationalIdLabel(country), t.nationalIdFull ? '{{employee_id_no}}' : '{{employee_id_no_masked}}')] : []),
      ...(t.showBankAccount ? [row('Bank account', t.bankAccountFull ? '{{bank_name}} {{bank_account}}' : '{{bank_name}} {{bank_account_masked}}')] : []),
      { h: 10 },
      { cells: [[0, { v: 'Earnings', cs: 3, c: '#888888' }]] },
      { repeat: 'auto', cells: [[0, { v: '{{earnings.name}}', cs: 2 }], [2, { v: '{{earnings.amount}}', al: 'right' }]] },
      row('Gross Pay', '{{gross_pay}}', { bt: true }),
      { h: 10 },
      { cells: [[0, { v: 'Deductions', cs: 3, c: '#888888' }]] },
      { repeat: 'auto', cells: [[0, { v: '{{deductions.name}}', cs: 2 }], [2, { v: '{{deductions.amount}}', al: 'right' }]] },
      row('Net Pay', '{{net_pay}}', { bt: true, b: true }, { c: accent }),
      { h: 10 },
      { cells: [[0, { v: 'Employer contributions', cs: 3, fs: 12, ...muted }]] },
      { repeat: 'auto', cells: [[0, { v: '{{employer.name}}', cs: 2, fs: 12, ...muted }], [2, { v: '{{employer.amount}}', al: 'right', fs: 12, ...muted }]] },
      ...footerRows(branding, 'payslip', 3),
    ]);
  },
  invoice: (country, branding) => {
    const accent = branding?.accent_color || '#1677ff';
    const sum = (label: string, value: string, extra: GridCell = {}): RowSpec[number] =>
      ({ cells: [[0, { v: label, cs: 4, al: 'right', ...extra }], [4, { v: value, al: 'right', ...extra }]] });
    const head: GridCell = { b: true, bg: SHADE, bb: true };
    return build([150, 200, 70, 130, 130], [
      ...headerRows(country, branding, '{{document_title}}', ['{{invoice_no}}', 'Date {{invoice_date}}', 'Due {{due_date}}'], 1, 2, 2),
      { cells: [[0, { v: 'Bill to', cs: 5, fs: 12, c: GREY }]] },
      { cells: [[0, { v: '{{customer_name}}', cs: 5, b: true }]] },
      { cells: [[0, { v: '{{customer_address}}', cs: 5 }]] },
      { cells: [[0, { v: 'Attn: {{customer_contact}} · {{customer_phone}} · {{customer_email}}', cs: 5, fs: 12 }]] },
      { cells: [[0, { v: `Our ${taxRegLabel(country)} {{company_gst_no}}`, cs: 5, fs: 11, c: GREY }]] },
      { h: 12 },
      { cells: [[0, { v: 'Description', cs: 2, ...head }], [2, { v: 'Qty', ...head, al: 'right' }], [3, { v: 'Unit price', ...head, al: 'right' }], [4, { v: 'Amount', ...head, al: 'right' }]] },
      { repeat: 'lines', cells: [
        [0, { v: '{{lines.description}}', cs: 2, bb: true }], [2, { v: '{{lines.qty}}', al: 'right', bb: true }],
        [3, { v: '{{lines.unit_price}}', al: 'right', bb: true }], [4, { v: '{{lines.amount}}', al: 'right', bb: true }],
      ] },
      sum('Subtotal', '{{subtotal}}'),
      { repeat: 'auto', cells: [[0, { v: '{{discounts.name}}', cs: 4, al: 'right', c: '#15803d' }], [4, { v: '-{{discounts.amount}}', al: 'right', c: '#15803d' }]] },
      sum('Tax', '{{tax}}'),
      sum('Total', '{{total}}', { b: true }),
      sum('Balance due', '{{balance_due}}', { b: true, c: accent }),
      { h: 12 },
      { cells: [[0, { v: '{{notes}}', cs: 5, fs: 12 }]] },
      { cells: [[0, { v: '{{terms}}', cs: 5, fs: 12 }]] },
      { h: 10 },
      { cells: [[0, { v: 'Payment details', cs: 5, b: true, fs: 12 }]] },
      { repeat: 'auto', cells: [[0, { v: '{{payment.label}}', fs: 12 }], [1, { v: '{{payment.value}}', cs: 4, fs: 12 }]] },
      ...footerRows(branding, 'invoice', 5),
    ]);
  },
};

// ---- filling in -------------------------------------------------------------

export type AmountFormat = 'code' | 'symbol' | 'symbol_space' | 'code_after' | 'number' | 'accounting_symbol' | 'accounting_code';

/** In accounting formats the symbol and the number are split by a tab; documents show the symbol at the
 *  left edge of the cell and the number at the right edge. Use plainAmount() wherever it is plain text. */
export const AMOUNT_SPLIT = '\t';
export const plainAmount = (s: string) => s.replace(/\t/g, ' ');

export const AMOUNT_FORMATS: { value: AmountFormat; label: string }[] = [
  { value: 'code', label: 'Currency code — SGD 1,234.50' },
  { value: 'symbol', label: 'Symbol — $1,234.50' },
  { value: 'symbol_space', label: 'Symbol with space — $ 1,234.50' },
  { value: 'code_after', label: 'Code after — 1,234.50 SGD' },
  { value: 'number', label: 'Number only — 1,234.50' },
  { value: 'accounting_symbol', label: 'Accounting — $ at the left of the cell, amount at the right' },
  { value: 'accounting_code', label: 'Accounting — SGD at the left of the cell, amount at the right' },
];

/** "$" for SGD/USD, "€", "£", "RM"… (falls back to the code). */
export function currencySymbol(code: string): string {
  try {
    const part = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find(p => p.type === 'currency');
    return part?.value || code;
  } catch { return code; }
}

/** An amount in the chosen style; minus signs go in front ("-$380.95"). */
export function money(n: number, c = 'SGD', format: AmountFormat | string | null = 'code'): string {
  const v = Number(n || 0);
  const num = Math.abs(v).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = v < 0 ? '-' : '';
  switch (format) {
    case 'symbol': return `${sign}${currencySymbol(c)}${num}`;
    case 'symbol_space': return `${sign}${currencySymbol(c)} ${num}`;
    case 'code_after': return `${sign}${num} ${c}`;
    case 'number': return `${sign}${num}`;
    case 'accounting_symbol': return `${sign}${currencySymbol(c)}${AMOUNT_SPLIT}${num}`;
    case 'accounting_code': return `${sign}${c}${AMOUNT_SPLIT}${num}`;
    default: return `${sign}${c} ${num}`;
  }
}

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
  const fmt = branding?.templates?.[kind]?.amountFormat;
  const m = (n: number) => money(n, cur, fmt);
  const base = companyFields(company, branding, kind === 'payslip' ? branding?.templates?.payslip?.footerNote : branding?.templates?.invoice?.footerNote);
  const country = (company?.country || 'SG').toUpperCase();
  const sg = isSG(country);
  if (kind === 'payslip') {
    const id = sg ? 'S1234567A' : country === 'AE' ? '784-1990-1234567-1' : 'A1234567';
    const bank = sg ? 'DBS' : country === 'AE' ? 'Emirates NBD' : country === 'SA' ? 'Al Rajhi Bank' : 'HSBC';
    const employer = sg ? [{ name: 'CPF (Employer)', amount: m(1360) }, { name: 'SDL', amount: m(11.25) }] : [{ name: 'End-of-service gratuity', amount: m(375) }];
    return {
      fields: {
        ...base, employee_name: 'Alice Tan', employee_code: 'EMP-001', employee_designation: 'Senior Designer', employee_department: 'Creative',
        employee_id_no: id, employee_id_no_masked: `•••••${id.slice(-4)}`, bank_name: bank, bank_account: '012-345678-9', bank_account_masked: '•••••••78-9',
        period: 'August 2026', pay_date: '2026-08-31', gross_pay: m(9500), total_deductions: m(sg ? 1600 : 500),
        net_pay: m(sg ? 7900 : 9000), total_employer: m(sg ? 1371.25 : 375), paid_on_behalf: '',
        ...(sg ? { cpf_employee: m(1600), cpf_employer: m(1360), cpf_total: m(2960), sdl: m(11.25), shg_name: '', shg_amount: '' } : {}),
      },
      lists: {
        earnings: [{ name: 'Basic Salary', amount: m(9000) }, { name: 'Transport Allowance', amount: m(500) }],
        deductions: [sg ? { name: 'CPF (Employee)', amount: m(1600) } : { name: 'Salary advance', amount: m(500) }],
        employer,
        statutory: sg ? [
          { name: 'CPF', employee: m(1600), employer: m(1360), total: m(2960) },
          { name: 'SDL', employee: m(0), employer: m(11.25), total: m(11.25) },
        ] : [],
      },
    };
  }
  const terms = branding?.templates?.invoice?.paymentTermsDays ?? 30;
  return {
    fields: {
      ...base, document_title: 'INVOICE', reference: 'PO-1234', company_gst_no: '', amount_paid: m(0), balance_due: m(2943), notes: '', terms: '',
      invoice_no: 'INV-0001', invoice_date: '2026-08-01', due_date: '2026-08-31', payment_terms: `${terms} days`,
      customer_name: sg ? 'Acme Trading Pte Ltd' : country === 'AE' ? 'Acme Trading LLC' : 'Acme Trading Ltd',
      customer_address: sg ? '1 Example Road, Singapore 123456' : country === 'AE' ? '1 Example Road, Dubai' : '1 Example Road',
      customer_contact: 'Mr John Lee', customer_phone: sg ? '+65 6123 4567' : country === 'AE' ? '+971 4 123 4567' : '+1 555 123 4567', customer_email: 'accounts@acme.example', customer_website: 'www.acme.example',
      subtotal: m(3000), total_discount: m(300), subtotal_after_discount: m(2700),
      tax: m(243), total: m(2943),
      bank_details: bankDetailsText(branding?.templates?.invoice),
      payment_account: pickPaymentAccount(branding?.templates?.invoice)?.title || `Main account (${cur})`,
    },
    lists: {
      lines: [
        { no: '1', description: 'Consulting services', qty: '10', unit_price: m(250), discount: '', amount: m(2500) },
        { no: '2', description: 'Travel', qty: '1', unit_price: m(500), discount: '', amount: m(500) },
      ],
      discounts: [{ name: 'Loyalty discount (10%)', amount: m(300) }],
      payment: paymentRows(branding?.templates?.invoice, true).map(r => ({ label: r.label, value: r.value })),
    },
  };
}

export const DEFAULT_PAYMENT_LABELS = ['Account Name:', 'Bank:', 'Account No:', 'Bank Code:', 'Branch Code:', 'S.W.I.F.T Code:', 'Branch Address:'];

const EXAMPLE_PAYMENT = [
  { label: 'Account Name:', value: 'Your Company' }, { label: 'Bank:', value: 'Your Bank' },
  { label: 'Account No:', value: '012-345678-9' }, { label: 'S.W.I.F.T Code:', value: 'ABCDEFGH' },
];

export interface PaymentLine { label: string; value: string }
export interface PaymentAccount { title: string; lines: PaymentLine[]; isDefault?: boolean }

/** The company's bank accounts for payment details (older single list = one account). */
export function paymentAccounts(inv: any): PaymentAccount[] {
  if (Array.isArray(inv?.paymentAccounts) && inv.paymentAccounts.length) return inv.paymentAccounts;
  if (Array.isArray(inv?.paymentDetails) && inv.paymentDetails.length) return [{ title: 'Bank account', lines: inv.paymentDetails, isDefault: true }];
  return [];
}

/** Which account an invoice shows: the one asked for (by position), else the default, else the first. */
export function pickPaymentAccount(inv: any, which?: number | null): PaymentAccount | null {
  const list = paymentAccounts(inv);
  if (which != null && list[which]) return list[which];
  return list.find(a => a.isDefault) || list[0] || null;
}

/** The payment detail lines that have a value (the example set when none are filled in and `example` is on). */
export function paymentRows(inv: any, example = false, which?: number | null): PaymentLine[] {
  const rows = (pickPaymentAccount(inv, which)?.lines || []).filter(r => (r.value || '').trim());
  return rows.length ? rows : (example && !(inv?.bankDetails || '').trim() ? EXAMPLE_PAYMENT : []);
}

/** {{bank_details}} as text: the payment detail lines, or the older free-text box. */
export function bankDetailsText(inv: any): string {
  const rows = paymentRows(inv);
  return rows.length ? rows.map(r => `${r.label} ${r.value}`).join('\n') : (inv?.bankDetails || '');
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
  payment: 'Account Name, Bank, Account No… — the lines you fill in under Invoice settings; put the label in one cell and the value in the next',
  discounts: 'e.g. Loyalty discount (10%), Early payment discount — one line per discount; nothing is printed when there is none',
};
