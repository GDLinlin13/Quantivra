// Finance: types, the maths for document totals, and the default chart of accounts.

export type DocType = 'quote' | 'invoice' | 'credit_note' | 'bill' | 'expense';
export type DocStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'approved' | 'paid' | 'partial' | 'void';

export const DOC_LABEL: Record<DocType, string> = {
  quote: 'Quotation', invoice: 'Invoice', credit_note: 'Credit note', bill: 'Bill', expense: 'Expense',
};
/** Settings → Document numbers entity for each document type. */
export const DOC_NUMBER_ENTITY: Record<DocType, string> = {
  quote: 'quotation', invoice: 'invoice', credit_note: 'credit_note', bill: 'bill', expense: 'claim',
};
/** A counted number showing another year than the document's date (BILL-2026-0001 dated 2025-09-15). */
export function numberYearDiffers(number: string | null | undefined, date: string | null | undefined): boolean {
  const y = (number || '').match(/(?<!\d)(20\d{2})(?!\d)/)?.[1];
  return !!y && !!date && y !== date.slice(0, 4);
}
export const isSalesDoc = (t: DocType) => t === 'quote' || t === 'invoice' || t === 'credit_note';

export interface Contact {
  id: number; company_id: number; is_customer: boolean; is_supplier: boolean; name: string;
  reg_no?: string | null; tax_no?: string | null; email?: string | null; phone?: string | null; website?: string | null;
  address?: string | null; currency?: string | null; payment_terms_days?: number | null; notes?: string | null; archived?: boolean;
  /** the price list this customer buys at (migration 048) */
  price_list_id?: number | null;
}
/** The currencies a customer / supplier bills or pays in (stored as "USD,EUR"); the first is the default. */
export const contactCurrencies = (c?: { currency?: string | null } | null): string[] =>
  (c?.currency || '').split(/[\s,]+/).map(x => x.trim().toUpperCase()).filter(Boolean);

export interface ContactPerson {
  id?: number; company_id?: number; contact_id?: number; name: string; designation?: string | null;
  email?: string | null; phone?: string | null; is_primary?: boolean;
}

export interface DocDiscount { name: string; kind: 'percent' | 'amount'; value: number }

export interface DocLine {
  id?: number; position?: number; description: string; quantity: number; unit_price: number;
  discount_pct: number; tax_rate: number; account_id?: number | null; item_id?: number | null; amount?: number;
  /** the piece of a by-weight item this line buys or sells (migration 046) */
  piece_id?: number | null;
  /** screen only: the weight of the piece a bill line buys; saved on the piece, not the line */
  weight?: number;
}

export interface FinDocument {
  id: number; company_id: number; doc_type: DocType; number: string; status: DocStatus;
  contact_id: number | null; contact_person_id: number | null; issue_date: string; due_date: string | null;
  reference: string | null; currency: string; tax_inclusive: boolean; discounts: DocDiscount[];
  subtotal: number; discount_total: number; tax_total: number; total: number; amount_paid: number;
  notes: string | null; terms: string | null; source_id: number | null;
  paid_from_account_id?: number | null; employee_id?: number | null;
  payment_account_index?: number | null;
  /** company currency per 1 unit of the document's currency; empty when the document is in the company's currency (migration 036) */
  fx_rate?: number | null;
  created_at?: string;
}

/** The rate a document is booked at: its own exchange rate when it is in another currency, otherwise 1. */
export const docRate = (d: { fx_rate?: number | null }) => Number(d.fx_rate) > 0 ? Number(d.fx_rate) : 1;
/** True for a document in another currency (with a rate: older documents never are). */
export const isForeignDoc = (d: { currency?: string | null; fx_rate?: number | null }, base: string) =>
  !!d.currency && d.currency !== base && Number(d.fx_rate) > 0;
/** An amount of the document in the company's currency. */
export const inBase = (d: { fx_rate?: number | null }, amount: number) => Math.round((Number(amount) || 0) * docRate(d) * 100) / 100;

export interface FinanceSettings {
  gstRegistered: boolean;
  gstRate: number;          // percent, e.g. 9
  gstNumber?: string;
  invoiceTerms?: string;    // default terms printed on invoices
  quoteValidityDays?: number;
  /** Quotations are hidden unless switched on (price lists replace them) */
  quotationsOn?: boolean;
}
export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = { gstRegistered: false, gstRate: 9, quoteValidityDays: 30 };

const r2 = (n: number) => Math.round((Number(n) || 0) * 100 + Number.EPSILON) / 100;

/** A line's amount after its own discount, before tax. */
export function lineAmount(l: Pick<DocLine, 'quantity' | 'unit_price' | 'discount_pct'>): number {
  const gross = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
  return r2(gross * (1 - (Number(l.discount_pct) || 0) / 100));
}

export interface DocTotals {
  lines: number[];          // each line's amount
  subtotal: number;         // sum of lines
  discounts: number[];      // each document discount
  discount_total: number;
  tax_total: number;
  total: number;
}

/**
 * Totals for a document. Document discounts (percent or fixed) come off the
 * subtotal; tax is charged on what's left, line by line at each line's rate.
 * With tax-inclusive prices the line amounts already contain the tax.
 */
export function docTotals(lines: DocLine[], discounts: DocDiscount[] = [], taxInclusive = false): DocTotals {
  const amounts = lines.map(lineAmount);
  const subtotal = r2(amounts.reduce((a, b) => a + b, 0));
  let remaining = subtotal;
  const discAmounts = discounts.map(d => {
    const v = d.kind === 'percent' ? r2(subtotal * (Number(d.value) || 0) / 100) : r2(Number(d.value) || 0);
    const applied = Math.min(Math.max(0, v), Math.max(0, remaining));
    remaining = r2(remaining - applied);
    return applied;
  });
  const discount_total = r2(discAmounts.reduce((a, b) => a + b, 0));
  const factor = subtotal > 0 ? (subtotal - discount_total) / subtotal : 0;
  let tax = 0;
  lines.forEach((l, i) => {
    const net = amounts[i] * factor;
    const rate = (Number(l.tax_rate) || 0) / 100;
    tax += taxInclusive ? net - net / (1 + rate) : net * rate;
  });
  const tax_total = r2(tax);
  const total = taxInclusive ? r2(subtotal - discount_total) : r2(subtotal - discount_total + tax_total);
  return { lines: amounts, subtotal, discounts: discAmounts, discount_total, tax_total, total };
}

/** What the customer still owes (never below zero). */
export const balanceDue = (d: Pick<FinDocument, 'total' | 'amount_paid'>) => Math.max(0, r2((Number(d.total) || 0) - (Number(d.amount_paid) || 0)));

/** Status after a payment change. */
export function statusAfterPayment(d: Pick<FinDocument, 'total' | 'amount_paid' | 'status'>): DocStatus {
  if (d.status === 'void' || d.status === 'draft') return d.status;
  const paid = Number(d.amount_paid) || 0;
  if (paid <= 0) return d.status === 'paid' || d.status === 'partial' ? 'sent' : d.status;
  return paid + 0.005 >= Number(d.total) ? 'paid' : 'partial';
}

/** Overdue = sent / part-paid and past the due date. */
export function isOverdue(d: Pick<FinDocument, 'status' | 'due_date' | 'doc_type'>, today = new Date().toISOString().slice(0, 10)): boolean {
  return (d.doc_type === 'invoice' || d.doc_type === 'bill') && ['sent', 'partial', 'approved'].includes(d.status) && !!d.due_date && d.due_date < today;
}

export const STATUS_LABEL: Record<DocStatus, string> = {
  draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', approved: 'Approved',
  paid: 'Paid', partial: 'Part paid', void: 'Void',
};
export const STATUS_COLOR: Record<DocStatus, string> = {
  draft: 'default', sent: 'blue', accepted: 'green', declined: 'red', approved: 'blue', paid: 'green', partial: 'gold', void: 'default',
};

export const PAYMENT_METHODS = ['Bank transfer', 'PayNow', 'Cheque', 'Cash', 'Card', 'GIRO', 'Other'];

// ---- chart of accounts ------------------------------------------------------

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
export interface Account {
  id: number; company_id: number; code: string; name: string; type: AccountType; subtype: string | null;
  description?: string | null; is_system: boolean; archived: boolean;
  bank_name?: string | null; bank_account_no?: string | null; opening_balance?: number; opening_date?: string | null;
  /** Bank accounts in another currency: the currency and the opening balance in it (opening_balance stays in the company currency). */
  currency?: string | null; opening_foreign?: number | null;
}

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  asset: 'Asset', liability: 'Liability', equity: 'Equity', income: 'Income', expense: 'Expense',
};

/**
 * The recommended chart of accounts every new company starts with: 1xxx assets, 2xxx liabilities, 3xxx equity, 4xxx revenue,
 * 5xxx cost of sales, 6xxx operating expenses, 7xxx other income and expenses, 8xxx taxation and special items.
 * Accounts with a subtype are the ones Quantivra posts to by itself (bank, receivables, payroll, tax, exchange differences…).
 */
export const RECOMMENDED_ACCOUNTS: Omit<Account, 'id' | 'company_id' | 'archived'>[] = [
  { code: '1000', name: 'Cash on Hand', type: 'asset', subtype: 'cash', is_system: false },
  { code: '1010', name: 'Bank Accounts', type: 'asset', subtype: 'bank', is_system: true },
  { code: '1020', name: 'Foreign Currency Bank Accounts', type: 'asset', subtype: null, is_system: false },
  { code: '1100', name: 'Accounts Receivable', type: 'asset', subtype: 'receivable', is_system: true },
  { code: '1110', name: 'Other Receivables and Advances', type: 'asset', subtype: null, is_system: false },
  { code: '1130', name: 'Prepayments and Deposits', type: 'asset', subtype: null, is_system: false },
  { code: '1200', name: 'Inventory', type: 'asset', subtype: null, is_system: false },
  { code: '1300', name: 'Property and Buildings', type: 'asset', subtype: 'fixed', is_system: false },
  { code: '1310', name: 'Machinery and Equipment', type: 'asset', subtype: 'fixed', is_system: false },
  { code: '1320', name: 'Office Equipment and Furniture', type: 'asset', subtype: 'fixed', is_system: false },
  { code: '1330', name: 'Computer Equipment', type: 'asset', subtype: 'fixed', is_system: false },
  { code: '1350', name: 'Vehicles', type: 'asset', subtype: 'fixed', is_system: false },
  { code: '1390', name: 'Accumulated Depreciation', type: 'asset', subtype: null, is_system: false },
  { code: '1400', name: 'Intangible Assets', type: 'asset', subtype: null, is_system: false },
  { code: '1490', name: 'Accumulated Amortisation', type: 'asset', subtype: null, is_system: false },
  { code: '2000', name: 'Accounts Payable', type: 'liability', subtype: 'payable', is_system: true },
  { code: '2010', name: 'Accrued Expenses and Other Payables', type: 'liability', subtype: null, is_system: false },
  { code: '2030', name: 'Salaries and Employee Benefits Payable', type: 'liability', subtype: 'payroll_payable', is_system: true },
  { code: '2031', name: 'Payroll Contributions and Statutory Deductions Payable', type: 'liability', subtype: 'statutory_payable', is_system: true },
  { code: '2034', name: 'End-of-service gratuity provision', type: 'liability', subtype: 'gratuity_provision', is_system: true },
  { code: '2040', name: 'Taxes Payable', type: 'liability', subtype: null, is_system: false },
  { code: '2050', name: 'Sales Tax / VAT / GST Payable', type: 'liability', subtype: 'tax', is_system: true },
  { code: '2100', name: 'Customer Deposits and Unearned Revenue', type: 'liability', subtype: null, is_system: false },
  { code: '2120', name: 'Staff Claims Payable', type: 'liability', subtype: 'claims_payable', is_system: true },
  { code: '2200', name: 'Short-term Loans', type: 'liability', subtype: null, is_system: false },
  { code: '2210', name: 'Long-term Loans and Lease Liabilities', type: 'liability', subtype: null, is_system: false },
  { code: '2300', name: 'Related Party Payables', type: 'liability', subtype: null, is_system: false },
  { code: '2310', name: 'Dividends Payable', type: 'liability', subtype: 'dividends_payable', is_system: false },
  { code: '3000', name: 'Share Capital', type: 'equity', subtype: null, is_system: false },
  { code: '3010', name: 'Additional Paid-in Capital / Share Premium', type: 'equity', subtype: null, is_system: false },
  { code: '3100', name: 'Retained Earnings', type: 'equity', subtype: 'retained', is_system: true },
  { code: '3110', name: 'Current Year Earnings', type: 'equity', subtype: null, is_system: false },
  { code: '3200', name: 'Other Reserves', type: 'equity', subtype: null, is_system: false },
  { code: '3300', name: 'Dividends / Distributions', type: 'equity', subtype: 'dividends', is_system: false },
  { code: '4000', name: 'Sales Revenue', type: 'income', subtype: 'sales', is_system: true },
  { code: '4010', name: 'Service Revenue', type: 'income', subtype: null, is_system: false },
  { code: '4020', name: 'Other Operating Income', type: 'income', subtype: null, is_system: false },
  { code: '4090', name: 'Sales Returns and Allowances', type: 'income', subtype: null, is_system: false },
  { code: '4100', name: 'Other Income', type: 'income', subtype: 'fx_gain', is_system: true },
  { code: '5000', name: 'Cost of Sales', type: 'expense', subtype: null, is_system: false },
  { code: '5010', name: 'Purchases and Raw Materials', type: 'expense', subtype: null, is_system: false },
  { code: '5020', name: 'Direct Labour and Subcontractor Costs', type: 'expense', subtype: null, is_system: false },
  { code: '5030', name: 'Freight, Duties and Packaging', type: 'expense', subtype: null, is_system: false },
  { code: '5090', name: 'Other Direct Costs', type: 'expense', subtype: null, is_system: false },
  { code: '6000', name: 'Employee Salaries and Wages', type: 'expense', subtype: 'payroll', is_system: true },
  { code: '6005', name: "Director's Salary / Wages", type: 'expense', subtype: 'payroll_director', is_system: true },
  { code: '6008', name: "Director's Fees", type: 'expense', subtype: 'director_fees', is_system: false },
  { code: '6010', name: 'Employer Contributions and Payroll Expenses', type: 'expense', subtype: 'payroll_employer', is_system: true },
  { code: '6025', name: 'End-of-service Gratuity', type: 'expense', subtype: 'gratuity_expense', is_system: true },
  { code: '6030', name: 'Employee Benefits and Welfare', type: 'expense', subtype: null, is_system: false },
  { code: '6040', name: 'Staff Training and Recruitment', type: 'expense', subtype: null, is_system: false },
  { code: '6100', name: 'Rent', type: 'expense', subtype: null, is_system: false },
  { code: '6110', name: 'Utilities', type: 'expense', subtype: null, is_system: false },
  { code: '6120', name: 'Repairs, Maintenance and Cleaning', type: 'expense', subtype: null, is_system: false },
  { code: '6200', name: 'Office Supplies, Printing and Postage', type: 'expense', subtype: null, is_system: false },
  { code: '6300', name: 'Travel, Accommodation and Transport', type: 'expense', subtype: null, is_system: false },
  { code: '6320', name: 'Vehicle Expenses', type: 'expense', subtype: null, is_system: false },
  { code: '6400', name: 'Meals and Entertainment', type: 'expense', subtype: null, is_system: false },
  { code: '6500', name: 'Marketing and Advertising', type: 'expense', subtype: null, is_system: false },
  { code: '6600', name: 'IT Expenses', type: 'expense', subtype: null, is_system: false },
  { code: '6700', name: 'Insurance Expenses', type: 'expense', subtype: null, is_system: false },
  { code: '6800', name: 'Professional and Consultancy Fees', type: 'expense', subtype: null, is_system: false },
  { code: '6810', name: 'Legal Fees', type: 'expense', subtype: null, is_system: false },
  { code: '6820', name: 'Accounting and Audit Fees', type: 'expense', subtype: 'fees_accounting', is_system: false },
  { code: '6840', name: 'Corporate Secretarial Fees', type: 'expense', subtype: 'fees_secretarial', is_system: false },
  { code: '6850', name: 'Tax Advisory and Filing Fees', type: 'expense', subtype: 'fees_tax_agent', is_system: false },
  { code: '6860', name: 'Company Registration Fees', type: 'expense', subtype: null, is_system: false },
  { code: '6870', name: 'Licences and Permits', type: 'expense', subtype: null, is_system: false },
  { code: '6900', name: 'Bank and Payment Charges', type: 'expense', subtype: null, is_system: false },
  { code: '6910', name: 'Foreign Exchange Losses', type: 'expense', subtype: 'fx_loss', is_system: true },
  { code: '6920', name: 'Depreciation and Amortisation', type: 'expense', subtype: null, is_system: false },
  { code: '6930', name: 'Bad Debt Expenses', type: 'expense', subtype: null, is_system: false },
  { code: '6990', name: 'General Administrative Expenses', type: 'expense', subtype: 'general', is_system: true },
  { code: '7000', name: 'Interest and Finance Charges', type: 'expense', subtype: null, is_system: false },
  { code: '7010', name: 'Other Non-operating Expenses', type: 'expense', subtype: null, is_system: false },
  { code: '8000', name: 'Corporate Income Tax Expense', type: 'expense', subtype: null, is_system: false },
  { code: '8010', name: 'Deferred Tax Expense', type: 'expense', subtype: null, is_system: false },
];

/** The older, simpler chart of accounts that companies set up before the recommended one still use (until they switch). */
export const DEFAULT_ACCOUNTS: Omit<Account, 'id' | 'company_id' | 'archived'>[] = [
  { code: '1000', name: 'Bank', type: 'asset', subtype: 'bank', is_system: true },
  { code: '1010', name: 'Petty cash', type: 'asset', subtype: 'cash', is_system: false },
  { code: '1100', name: 'Accounts receivable (customers owe us)', type: 'asset', subtype: 'receivable', is_system: true },
  { code: '1200', name: 'Prepayments and deposits', type: 'asset', subtype: null, is_system: false },
  { code: '1500', name: 'Equipment and furniture', type: 'asset', subtype: 'fixed', is_system: false },
  { code: '2000', name: 'Accounts payable (we owe suppliers)', type: 'liability', subtype: 'payable', is_system: true },
  { code: '2100', name: 'GST', type: 'liability', subtype: 'tax', is_system: true },
  { code: '2200', name: 'Net salaries payable', type: 'liability', subtype: 'payroll_payable', is_system: true },
  { code: '2210', name: "Employee's CPF contribution payable", type: 'liability', subtype: 'statutory_payable', is_system: true },
  { code: '2220', name: "Employer's CPF contribution payable", type: 'liability', subtype: 'cpf_employer_payable', is_system: true },
  { code: '2230', name: 'SDL, CDAC/SINDA/MBMF/ECF and other deductions payable', type: 'liability', subtype: 'other_payroll_payable', is_system: true },
  { code: '2240', name: 'End-of-service gratuity provision', type: 'liability', subtype: 'gratuity_provision', is_system: true },
  { code: '2300', name: 'Staff claims payable', type: 'liability', subtype: 'claims_payable', is_system: true },
  { code: '2400', name: 'Dividends payable', type: 'liability', subtype: 'dividends_payable', is_system: false },
  { code: '3000', name: 'Share capital', type: 'equity', subtype: null, is_system: false },
  { code: '3100', name: 'Retained earnings', type: 'equity', subtype: 'retained', is_system: true },
  { code: '3200', name: 'Dividends', type: 'equity', subtype: 'dividends', is_system: false },
  { code: '4000', name: 'Sales', type: 'income', subtype: 'sales', is_system: true },
  { code: '4100', name: 'Other income', type: 'income', subtype: null, is_system: false },
  { code: '4900', name: 'Foreign exchange gain / (loss)', type: 'income', subtype: 'fx_gain_loss', is_system: true },
  { code: '5000', name: 'Cost of sales', type: 'expense', subtype: null, is_system: false },
  { code: '6000', name: 'Employee salaries / wages', type: 'expense', subtype: 'payroll', is_system: true },
  { code: '6005', name: "Director's salary", type: 'expense', subtype: 'payroll_director', is_system: true },
  { code: '6008', name: "Director's fees", type: 'expense', subtype: 'director_fees', is_system: false },
  { code: '6010', name: "Employer's CPF contributions", type: 'expense', subtype: 'payroll_employer', is_system: true },
  { code: '6015', name: 'SDL and other employer contributions', type: 'expense', subtype: 'payroll_employer_other', is_system: true },
  { code: '6020', name: 'End-of-service gratuity', type: 'expense', subtype: 'gratuity_expense', is_system: true },
  { code: '6100', name: 'Rent', type: 'expense', subtype: null, is_system: false },
  { code: '6200', name: 'Utilities', type: 'expense', subtype: null, is_system: false },
  { code: '6300', name: 'Office supplies', type: 'expense', subtype: null, is_system: false },
  { code: '6400', name: 'Travel and transport', type: 'expense', subtype: null, is_system: false },
  { code: '6500', name: 'Meals and entertainment', type: 'expense', subtype: null, is_system: false },
  { code: '6600', name: 'Marketing and advertising', type: 'expense', subtype: null, is_system: false },
  { code: '6700', name: 'Software and subscriptions', type: 'expense', subtype: null, is_system: false },
  { code: '6800', name: 'Professional fees', type: 'expense', subtype: null, is_system: false },
  { code: '6810', name: 'Corporate secretarial fees', type: 'expense', subtype: 'fees_secretarial', is_system: false },
  { code: '6820', name: 'Tax agent / tax filing fees', type: 'expense', subtype: 'fees_tax_agent', is_system: false },
  { code: '6830', name: 'Accounting and bookkeeping fees', type: 'expense', subtype: 'fees_accounting', is_system: false },
  { code: '6900', name: 'Bank charges', type: 'expense', subtype: null, is_system: false },
  { code: '6990', name: 'General expenses', type: 'expense', subtype: 'general', is_system: true },
];

/**
 * Bank accounts are numbered 1000, 1001, 1002… in their current order, with no gaps.
 * Returns only the accounts whose code has to change. Codes used by other accounts (e.g. 1010 Petty cash) are skipped.
 */
/** Old default names renamed in the payroll chart of accounts update (only if the company never renamed them). */
const PAYROLL_RENAMES: Record<string, [string, string]> = {
  payroll_payable: ['Salaries payable', 'Net salaries payable'],
  statutory_payable: ['CPF and statutory payable', "Employee's CPF contribution payable"],
  payroll: ['Salaries and wages', 'Employee salaries / wages'],
  payroll_employer: ['CPF and statutory contributions', "Employer's CPF contributions"],
};
// ---- names that depend on the company's country ---------------------------------------------

/** Short name of the main payroll contribution scheme, e.g. "CPF" in Singapore. */
const SCHEMES: Record<string, string> = {
  SG: 'CPF', MY: 'EPF, SOCSO & EIS', HK: 'MPF', AE: 'pension (GPSSA)', SA: 'GOSI', AU: 'superannuation', NZ: 'KiwiSaver',
  GB: 'pension & National Insurance', US: 'FICA', CA: 'CPP & EI', IN: 'PF & ESI', ID: 'BPJS', PH: 'SSS, PhilHealth & Pag-IBIG',
};
export const payrollScheme = (country?: string | null) => SCHEMES[(country || 'SG').toUpperCase()] || 'statutory';
/** The same, for screens: "CPF", "EPF, SOCSO & EIS", "Statutory contributions"… (capitalised). */
export const schemeLabel = (country?: string | null) => {
  const x = payrollScheme(country);
  const t = x === 'statutory' ? 'statutory contributions' : x;
  return t.charAt(0).toUpperCase() + t.slice(1);
};
/** Name of the sales tax, e.g. "GST" in Singapore, "VAT" in the UAE. */
const SALES_TAX: Record<string, string> = { SG: 'GST', AU: 'GST', NZ: 'GST', IN: 'GST', CA: 'GST', MY: 'SST', US: 'Sales tax', HK: 'Sales tax', JP: 'Consumption tax' };
export const salesTaxName = (country?: string | null) => SALES_TAX[(country || 'SG').toUpperCase()] || 'VAT';

/** Account names that follow the country (everything else in DEFAULT_ACCOUNTS is the same everywhere). */
export function localAccountNames(country?: string | null): Record<string, string> {
  const c = (country || 'SG').toUpperCase(), x = payrollScheme(c);
  const sg = c === 'SG';
  return {
    tax: salesTaxName(c),
    statutory_payable: `Employee's ${x} contribution${sg ? '' : 's'} payable`,
    cpf_employer_payable: `Employer's ${x} contribution${sg ? '' : 's'} payable`,
    payroll_employer: `Employer's ${x} contributions`,
    other_payroll_payable: sg ? 'SDL, CDAC/SINDA/MBMF/ECF and other deductions payable' : 'Other payroll deductions payable',
    payroll_employer_other: sg ? 'SDL and other employer contributions' : 'Other employer payroll costs',
  };
}
/** The standard chart of accounts with the country's names. */
/** Countries where employers set aside an end-of-service gratuity each month (Gulf states). */
export const GRATUITY_COUNTRIES = ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'];
const GRATUITY = ['gratuity_provision', 'gratuity_expense'];
export type ChartStyle = 'recommended' | 'legacy';
/** Which chart a company has: the recommended one has Cash on Hand at 1000; the older one has the bank there. */
export function chartStyleOf(rows: Pick<Account, 'code' | 'subtype'>[]): ChartStyle {
  return rows.some(r => r.code === '1000' && r.subtype === 'cash') ? 'recommended' : 'legacy';
}
export function defaultAccountsFor(country?: string | null, style: ChartStyle = 'recommended') {
  const names = localAccountNames(country);
  const gulf = GRATUITY_COUNTRIES.includes((country || 'SG').toUpperCase());
  const base = style === 'recommended' ? RECOMMENDED_ACCOUNTS : DEFAULT_ACCOUNTS;
  return base.filter(a => gulf || !GRATUITY.includes(a.subtype || ''))
    .map(a => {
      if (!a.subtype || !names[a.subtype]) return a;
      // the recommended chart has its own names for the payroll accounts (one account each for contributions and costs)
      if (style === 'recommended' && a.subtype !== 'tax') return a;
      // the recommended chart calls the tax account "GST Payable", "VAT Payable"…
      return { ...a, name: style === 'recommended' && a.subtype === 'tax' ? `${names.tax} Payable` : names[a.subtype] };
    });
}

/**
 * Accounts added to the standard chart after companies were set up. Each group is added once: when its
 * `marker` account is missing (the payroll split also renames untouched old names).
 */
const CHART_UPGRADES: { marker: string; subtypes: string[]; renames?: Record<string, [string, string]>; countries?: string[]; sameAs?: Record<string, RegExp> }[] = [
  { marker: 'cpf_employer_payable', subtypes: ['cpf_employer_payable', 'other_payroll_payable', 'payroll_director', 'director_fees', 'payroll_employer_other'], renames: PAYROLL_RENAMES },
  { marker: 'fees_tax_agent', subtypes: ['fees_secretarial', 'fees_tax_agent', 'fees_accounting'] },
  { marker: 'gratuity_provision', subtypes: ['gratuity_provision', 'gratuity_expense'], countries: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'] },
  // a company that already made its own dividend account keeps it (no second one)
  { marker: 'fx_gain_loss', subtypes: ['fx_gain_loss'] },
  { marker: 'dividends', subtypes: ['dividends', 'dividends_payable'], sameAs: { dividends: /dividend(?!s?\s+payable)/i, dividends_payable: /dividends?\s+payable/i } },
];

/**
 * Brings an older company's chart of accounts up to date, once per group, with the country's names; and renames
 * accounts still carrying another country's standard name (e.g. "Employee's CPF…" in a Malaysian company).
 * Empty when nothing to do.
 */
export function chartUpgrade(rows: Pick<Account, 'id' | 'code' | 'name' | 'subtype'>[], country?: string | null) {
  const add: Omit<Account, 'id' | 'company_id' | 'archived'>[] = [];
  const rename: { id: number; name: string }[] = [];
  if (!rows.length) return { add, rename };
  const style = chartStyleOf(rows);
  const local = localAccountNames(country), sgNames = localAccountNames('SG');
  const defaults = defaultAccountsFor(country, style);
  const used = new Set(rows.map(r => r.code));
  for (const g of CHART_UPGRADES) {
    if (rows.some(r => r.subtype === g.marker)) continue;
    // the recommended chart keeps exchange gains and losses in two accounts
    if (g.marker === 'fx_gain_loss' && rows.some(r => r.subtype === 'fx_gain' || r.subtype === 'fx_loss')) continue;
    if (g.countries && !g.countries.includes((country || 'SG').toUpperCase())) continue;
    for (const d of defaults.filter(a => g.subtypes.includes(a.subtype || ''))) {
      if (rows.some(r => r.subtype === d.subtype)) continue;
      const like = g.sameAs?.[d.subtype || ''];
      if (like && rows.some(r => like.test(r.name || ''))) continue;
      let c = Number(d.code);
      while (used.has(String(c))) c++;
      used.add(String(c));
      add.push({ ...d, code: String(c) });
    }
  }
  for (const r of rows) {
    const st = r.subtype || '';
    const old = CHART_UPGRADES.some(g => g.renames?.[st]?.[0] === r.name);
    const target0 = local[st] || CHART_UPGRADES.map(g => g.renames?.[st]?.[1]).find(Boolean);
    const target = style === 'recommended' && st === 'tax' && target0 ? `${target0} Payable` : target0;
    if (!target || r.name === target) continue;
    // only names nobody changed: an old standard name, or the Singapore standard name in another country
    if (old || (sgNames[st] && r.name === sgNames[st])) rename.push({ id: r.id, name: target });
  }
  return { add, rename };
}

export function bankCodePlan(accounts: (Pick<Account, 'id' | 'code' | 'subtype'> & { currency?: string | null })[], companyCurrency?: string): { id: number; code: string }[] {
  const byCode = (a: { code: string; id: number }, b: { code: string; id: number }) => a.code.localeCompare(b.code, undefined, { numeric: true }) || a.id - b.id;
  const banks = accounts.filter(a => a.subtype === 'bank').sort(byCode);
  const taken = new Set(accounts.filter(a => a.subtype !== 'bank').map(a => a.code));
  const out: { id: number; code: string }[] = [];
  if (chartStyleOf(accounts) === 'recommended') {
    // bank accounts from 1010, accounts in another currency from 1021 (1020 is the "Foreign Currency Bank Accounts" heading)
    const isForeign = (a: { currency?: string | null }) => !!(a.currency && companyCurrency && a.currency !== companyCurrency);
    for (const [group, start] of [[banks.filter(a => !isForeign(a)), 1010], [banks.filter(isForeign), 1021]] as const) {
      let next = start;
      for (const b of group) {
        while (taken.has(String(next))) next++;
        if (b.code !== String(next)) out.push({ id: b.id, code: String(next) });
        taken.add(String(next));
        next++;
      }
    }
    return out;
  }
  let next = 1000;
  for (const b of banks) {
    while (taken.has(String(next))) next++;
    if (b.code !== String(next)) out.push({ id: b.id, code: String(next) });
    next++;
  }
  return out;
}


/** Older default accounts that moved in the recommended chart: old code → the new code and name. */
const LEGACY_TO_RECOMMENDED: Record<string, { name: RegExp; code: string; to: string }> = {
  '1200': { name: /^prepayments and deposits$/i, code: '1130', to: 'Prepayments and Deposits' },
  '1500': { name: /^equipment and furniture$/i, code: '1320', to: 'Office Equipment and Furniture' },
  '3000': { name: /^share capital$/i, code: '3000', to: 'Share Capital' },
  '4100': { name: /^other income$/i, code: '4100', to: 'Other Income' },
  '5000': { name: /^cost of sales$/i, code: '5000', to: 'Cost of Sales' },
  '6100': { name: /^rent$/i, code: '6100', to: 'Rent' },
  '6200': { name: /^utilities$/i, code: '6110', to: 'Utilities' },
  '6300': { name: /^office supplies$/i, code: '6200', to: 'Office Supplies, Printing and Postage' },
  '6400': { name: /^travel and transport$/i, code: '6300', to: 'Travel, Accommodation and Transport' },
  '6500': { name: /^meals and entertainment$/i, code: '6400', to: 'Meals and Entertainment' },
  '6600': { name: /^marketing and advertising$/i, code: '6500', to: 'Marketing and Advertising' },
  '6700': { name: /^software and subscriptions$/i, code: '6600', to: 'IT Expenses' },
  '6800': { name: /^professional fees$/i, code: '6800', to: 'Professional Fees' },
  '6900': { name: /^bank charges$/i, code: '6900', to: 'Bank and Payment Gateway Charges' },
};

export interface ChartMove { id: number; from: string; to: string; fromName: string; name?: string }
/**
 * What it takes to bring a company with the older chart onto the recommended one: accounts Quantivra uses by itself and the
 * old standard accounts take their new codes (names are changed only where nobody renamed them), bank accounts are
 * renumbered 1010 onwards, and the accounts the recommended chart has and the company lacks are added. An account the
 * company made itself keeps its code; if that code is wanted by a recommended account, that one is not added.
 */
export function recommendedChartPlan(rows: Pick<Account, 'id' | 'code' | 'name' | 'subtype' | 'currency'>[], country?: string | null, companyCurrency?: string) {
  const empty = { moves: [] as ChartMove[], add: [] as Omit<Account, 'id' | 'company_id' | 'archived'>[], skipped: [] as { code: string; name: string }[] };
  if (!rows.length || chartStyleOf(rows) === 'recommended') return empty;
  const target = defaultAccountsFor(country, 'recommended');
  // roles Quantivra posts to by itself: one account each (several fixed-asset accounts share a role, so they are not one)
  const bySub = new Map(target.filter(t => t.subtype && t.subtype !== 'bank' && target.filter(x => x.subtype === t.subtype).length === 1).map(t => [t.subtype!, t]));

  const want = new Map<number, { to: string; name?: string }>();
  const sorted = [...rows].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }) || a.id - b.id);
  const seenSub = new Set<string>();
  for (const r of sorted) {
    const st = r.subtype || '';
    const t = st && bySub.get(st);
    if (t && !seenSub.has(st)) {
      seenSub.add(st);
      const def = defaultAccountsFor(country, 'legacy').find(d => d.subtype === st);
      want.set(r.id, { to: t.code, name: def && r.name === def.name && def.name !== t.name ? t.name : undefined });
      continue;
    }
    const m = LEGACY_TO_RECOMMENDED[r.code];
    if (m && !st && m.name.test(r.name)) want.set(r.id, { to: m.code, name: r.name === m.to ? undefined : m.to });
    else if (m && st === 'fixed' && m.name.test(r.name)) want.set(r.id, { to: m.code, name: m.to });
  }
  // bank accounts: numbered as the recommended chart does (once the cash account is at 1000)
  {
    const moved0 = rows.map(r => ({ ...r, code: want.get(r.id)?.to ?? r.code }));
    const withCash = moved0.some(r => r.code === '1000' && r.subtype === 'cash') ? moved0 : [...moved0, { id: -1, code: '1000', name: 'Cash on Hand', subtype: 'cash', currency: null }];
    for (const b of bankCodePlan(withCash, companyCurrency)) if (b.id > 0) want.set(b.id, { to: b.code });
  }
  // two accounts can't end up with one code. An account that stays put (one the company made itself, say) keeps its code
  // and the moves wanting it are dropped; between two moves, the account with the older code wins.
  const byId = new Map(rows.map(r => [r.id, r]));
  const moving = (id: number) => { const w = want.get(id); return !!w && w.to !== byId.get(id)!.code; };
  for (;;) {
    const claims = new Map<string, number[]>();
    for (const r of rows) { const c = want.get(r.id)?.to ?? r.code; claims.set(c, [...(claims.get(c) || []), r.id]); }
    const clash = [...claims.values()].find(ids => ids.length > 1);
    if (!clash) break;
    const stay = clash.filter(id => !moving(id));
    const movers = clash.filter(moving);
    const keep = stay.length ? [] : movers.slice(0, 1);
    for (const id of movers) if (!keep.includes(id)) want.delete(id);
  }
  const moved = rows.map(r => ({ ...r, code: want.get(r.id)?.to ?? r.code, name: want.get(r.id)?.name ?? r.name }));
  const moves: ChartMove[] = rows.filter(r => want.has(r.id) && want.get(r.id)!.to !== r.code || want.get(r.id)?.name)
    .map(r => ({ id: r.id, from: r.code, to: want.get(r.id)!.to, fromName: r.name, name: want.get(r.id)!.name }));

  const real = moves.filter(m => m.to !== m.from || m.name);

  const codes = new Set(moved.map(r => r.code));
  const subs = new Set(moved.map(r => r.subtype).filter(Boolean) as string[]);
  const add: typeof empty.add = [];
  const skipped: typeof empty.skipped = [];
  for (const t of target) {
    if (t.subtype === 'bank') continue;
    if (t.subtype && target.filter(x => x.subtype === t.subtype).length === 1 && subs.has(t.subtype)) continue;   // a role the company already has (several fixed-asset accounts are fine)
    if (codes.has(t.code)) { if (moved.some(r => r.code === t.code && r.name.toLowerCase() === t.name.toLowerCase())) continue; skipped.push({ code: t.code, name: t.name }); continue; }
    add.push(t);
  }
  return { moves: real, add, skipped };
}

/** The code a new bank account gets: 1010 onwards (1021 onwards in another currency) in the recommended chart, 1000 onwards in the older one. */
export function nextBankCode(accounts: Pick<Account, 'code' | 'subtype'>[], foreign: boolean): string {
  const used = new Set(accounts.map(a => a.code));
  const start = chartStyleOf(accounts) === 'recommended' ? (foreign ? 1021 : 1010) : 1000;
  for (let c = start; c < start + 90; c++) if (!used.has(String(c))) return String(c);
  return `1${Date.now() % 1000}`;
}

export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (iso: string, days: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + (Number(days) || 0));
  return d.toISOString().slice(0, 10);
};
