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
    { name: 'employee_code', label: 'Employee code' },
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

const NAME_AMOUNT: FieldDef[] = [{ name: 'line.name', label: 'Item name' }, { name: 'line.amount', label: 'Amount' }];

export const DOC_LISTS: Record<DocKind, ListDef[]> = {
  payslip: [
    { name: 'earnings', label: 'Earnings', fields: NAME_AMOUNT },
    { name: 'deductions', label: 'Deductions', fields: NAME_AMOUNT },
    { name: 'employer', label: 'Employer contributions', fields: NAME_AMOUNT },
  ],
  invoice: [
    {
      name: 'lines', label: 'Invoice lines', fields: [
        { name: 'line.no', label: 'Line number' },
        { name: 'line.description', label: 'Description' },
        { name: 'line.qty', label: 'Quantity' },
        { name: 'line.unit_price', label: 'Unit price' },
        { name: 'line.amount', label: 'Amount' },
      ],
    },
  ],
};

// ---- starter layouts --------------------------------------------------------

const GREY = '#666666';
const SHADE = '#f2f2f2';

function build(cols: number[], spec: { h?: number; repeat?: string; cells?: [number, GridCell][] }[]): GridTemplate {
  const cells: Record<string, GridCell> = {};
  spec.forEach((row, r) => (row.cells || []).forEach(([c, cell]) => { cells[`${r}:${c}`] = cell; }));
  return { enabled: false, cols, rows: spec.map(({ h, repeat }) => ({ ...(h ? { h } : {}), ...(repeat ? { repeat } : {}) })), cells };
}

const label = (v: string, extra: GridCell = {}): GridCell => ({ v, b: true, c: GREY, ...extra });

export const STARTER_LAYOUTS: Record<DocKind, () => GridTemplate> = {
  payslip: () => build([110, 120, 110, 110, 110, 120], [
    { h: 28, cells: [[0, { v: '{{logo}}', rs: 3, cs: 2, va: 'middle' }], [2, { v: '{{company_legal_name}}', cs: 4, b: true, fs: 16, al: 'right' }]] },
    { cells: [[2, { v: '{{company_address}}', cs: 4, fs: 11, c: GREY, al: 'right' }]] },
    { cells: [[2, { v: 'Reg. No. {{company_reg_no}}', cs: 4, fs: 11, c: GREY, al: 'right' }]] },
    { h: 10 },
    { h: 34, cells: [[0, { v: 'PAYSLIP', cs: 6, b: true, fs: 18, al: 'center', bt: true, bb: true }]] },
    { cells: [[0, label('Employee')], [1, { v: '{{employee_name}}', cs: 2 }], [3, label('Pay period')], [4, { v: '{{period}}', cs: 2 }]] },
    { cells: [[0, label('Employee code')], [1, { v: '{{employee_code}}', cs: 2 }], [3, label('Pay date')], [4, { v: '{{pay_date}}', cs: 2 }]] },
    { cells: [[0, label('Bank account')], [1, { v: '{{bank_name}} {{bank_account_masked}}', cs: 2 }], [3, label('Currency')], [4, { v: '{{currency}}', cs: 2 }]] },
    { h: 10 },
    { cells: [[0, { v: 'Earnings', cs: 4, b: true, bg: SHADE, bb: true }], [4, { v: 'Amount', cs: 2, b: true, bg: SHADE, bb: true, al: 'right' }]] },
    { repeat: 'earnings', cells: [[0, { v: '{{line.name}}', cs: 4 }], [4, { v: '{{line.amount}}', cs: 2, al: 'right' }]] },
    { cells: [[0, { v: 'Gross pay', cs: 4, b: true, bt: true }], [4, { v: '{{gross_pay}}', cs: 2, b: true, bt: true, al: 'right' }]] },
    { h: 10 },
    { cells: [[0, { v: 'Deductions', cs: 4, b: true, bg: SHADE, bb: true }], [4, { v: 'Amount', cs: 2, b: true, bg: SHADE, bb: true, al: 'right' }]] },
    { repeat: 'deductions', cells: [[0, { v: '{{line.name}}', cs: 4 }], [4, { v: '{{line.amount}}', cs: 2, al: 'right' }]] },
    { cells: [[0, { v: 'Total deductions', cs: 4, b: true, bt: true }], [4, { v: '{{total_deductions}}', cs: 2, b: true, bt: true, al: 'right' }]] },
    { h: 10 },
    { h: 32, cells: [[0, { v: 'NET PAY', cs: 4, b: true, fs: 15, bg: '#e8f0fe', bt: true, bb: true, va: 'middle' }], [4, { v: '{{net_pay}}', cs: 2, b: true, fs: 15, bg: '#e8f0fe', bt: true, bb: true, al: 'right', va: 'middle' }]] },
    { h: 10 },
    { cells: [[0, { v: 'Employer contributions (not deducted from your pay)', cs: 6, fs: 11, c: GREY }]] },
    { repeat: 'employer', cells: [[0, { v: '{{line.name}}', cs: 4, fs: 11, c: GREY }], [4, { v: '{{line.amount}}', cs: 2, fs: 11, c: GREY, al: 'right' }]] },
    { h: 14 },
    { cells: [[0, { v: '{{footer_note}}', cs: 6, fs: 10, c: GREY }]] },
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
      [0, { v: '{{line.no}}', bb: true }], [1, { v: '{{line.description}}', bb: true }], [2, { v: '{{line.qty}}', al: 'right', bb: true }],
      [3, { v: '{{line.unit_price}}', al: 'right', bb: true }], [4, { v: '{{line.amount}}', al: 'right', bb: true }],
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
        ...base, employee_name: 'Alice Tan', employee_code: 'EMP-001', bank_name: 'DBS', bank_account: '012-345678-9', bank_account_masked: '•••••••78-9',
        period: 'August 2026', pay_date: '2026-08-31', gross_pay: money(9500, cur), total_deductions: money(1600, cur),
        net_pay: money(7900, cur), total_employer: money(1530, cur), paid_on_behalf: '',
      },
      lists: {
        earnings: [{ name: 'Basic Salary', amount: money(9000, cur) }, { name: 'Transport Allowance', amount: money(500, cur) }],
        deductions: [{ name: 'CPF (Employee)', amount: money(1600, cur) }],
        employer: [{ name: 'CPF (Employer)', amount: money(1360, cur) }, { name: 'SDL', amount: money(11.25, cur) }],
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
