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
export const isSalesDoc = (t: DocType) => t === 'quote' || t === 'invoice' || t === 'credit_note';

export interface Contact {
  id: number; company_id: number; is_customer: boolean; is_supplier: boolean; name: string;
  reg_no?: string | null; tax_no?: string | null; email?: string | null; phone?: string | null; website?: string | null;
  address?: string | null; currency?: string | null; payment_terms_days?: number | null; notes?: string | null; archived?: boolean;
}
export interface ContactPerson {
  id?: number; company_id?: number; contact_id?: number; name: string; designation?: string | null;
  email?: string | null; phone?: string | null; is_primary?: boolean;
}

export interface DocDiscount { name: string; kind: 'percent' | 'amount'; value: number }

export interface DocLine {
  id?: number; position?: number; description: string; quantity: number; unit_price: number;
  discount_pct: number; tax_rate: number; account_id?: number | null; item_id?: number | null; amount?: number;
}

export interface FinDocument {
  id: number; company_id: number; doc_type: DocType; number: string; status: DocStatus;
  contact_id: number | null; contact_person_id: number | null; issue_date: string; due_date: string | null;
  reference: string | null; currency: string; tax_inclusive: boolean; discounts: DocDiscount[];
  subtotal: number; discount_total: number; tax_total: number; total: number; amount_paid: number;
  notes: string | null; terms: string | null; source_id: number | null;
  paid_from_account_id?: number | null; employee_id?: number | null;
  payment_account_index?: number | null;
  created_at?: string;
}

export interface FinanceSettings {
  gstRegistered: boolean;
  gstRate: number;          // percent, e.g. 9
  gstNumber?: string;
  invoiceTerms?: string;    // default terms printed on invoices
  quoteValidityDays?: number;
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

/** A simple Singapore-style chart of accounts every company starts with. */
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
  { code: '2300', name: 'Staff claims payable', type: 'liability', subtype: 'claims_payable', is_system: true },
  { code: '3000', name: 'Share capital', type: 'equity', subtype: null, is_system: false },
  { code: '3100', name: 'Retained earnings', type: 'equity', subtype: 'retained', is_system: true },
  { code: '4000', name: 'Sales', type: 'income', subtype: 'sales', is_system: true },
  { code: '4100', name: 'Other income', type: 'income', subtype: null, is_system: false },
  { code: '5000', name: 'Cost of sales', type: 'expense', subtype: null, is_system: false },
  { code: '6000', name: 'Employee salaries / wages', type: 'expense', subtype: 'payroll', is_system: true },
  { code: '6005', name: "Director's salary", type: 'expense', subtype: 'payroll_director', is_system: true },
  { code: '6008', name: "Director's fees", type: 'expense', subtype: 'director_fees', is_system: false },
  { code: '6010', name: "Employer's CPF contributions", type: 'expense', subtype: 'payroll_employer', is_system: true },
  { code: '6015', name: 'SDL and other employer contributions', type: 'expense', subtype: 'payroll_employer_other', is_system: true },
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
export function defaultAccountsFor(country?: string | null) {
  const names = localAccountNames(country);
  return DEFAULT_ACCOUNTS.map(a => (a.subtype && names[a.subtype] ? { ...a, name: names[a.subtype] } : a));
}

/**
 * Accounts added to the standard chart after companies were set up. Each group is added once: when its
 * `marker` account is missing (the payroll split also renames untouched old names).
 */
const CHART_UPGRADES: { marker: string; subtypes: string[]; renames?: Record<string, [string, string]> }[] = [
  { marker: 'cpf_employer_payable', subtypes: ['cpf_employer_payable', 'other_payroll_payable', 'payroll_director', 'director_fees', 'payroll_employer_other'], renames: PAYROLL_RENAMES },
  { marker: 'fees_tax_agent', subtypes: ['fees_secretarial', 'fees_tax_agent', 'fees_accounting'] },
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
  const local = localAccountNames(country), sgNames = localAccountNames('SG');
  const defaults = defaultAccountsFor(country);
  const used = new Set(rows.map(r => r.code));
  for (const g of CHART_UPGRADES) {
    if (rows.some(r => r.subtype === g.marker)) continue;
    for (const d of defaults.filter(a => g.subtypes.includes(a.subtype || ''))) {
      if (rows.some(r => r.subtype === d.subtype)) continue;
      let c = Number(d.code);
      while (used.has(String(c))) c++;
      used.add(String(c));
      add.push({ ...d, code: String(c) });
    }
  }
  for (const r of rows) {
    const st = r.subtype || '';
    const old = CHART_UPGRADES.some(g => g.renames?.[st]?.[0] === r.name);
    const target = local[st] || CHART_UPGRADES.map(g => g.renames?.[st]?.[1]).find(Boolean);
    if (!target || r.name === target) continue;
    // only names nobody changed: an old standard name, or the Singapore standard name in another country
    if (old || (sgNames[st] && r.name === sgNames[st])) rename.push({ id: r.id, name: target });
  }
  return { add, rename };
}

export function bankCodePlan(accounts: Pick<Account, 'id' | 'code' | 'subtype'>[]): { id: number; code: string }[] {
  const banks = accounts.filter(a => a.subtype === 'bank')
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }) || a.id - b.id);
  const taken = new Set(accounts.filter(a => a.subtype !== 'bank').map(a => a.code));
  const out: { id: number; code: string }[] = [];
  let next = 1000;
  for (const b of banks) {
    while (taken.has(String(next))) next++;
    if (b.code !== String(next)) out.push({ id: b.id, code: String(next) });
    next++;
  }
  return out;
}

export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (iso: string, days: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + (Number(days) || 0));
  return d.toISOString().slice(0, 10);
};
