// The general ledger, worked out from what's already in the system (invoices, bills, expenses,
// payments, finalised payroll, opening balances) plus manual journals. Nothing is posted twice:
// change or void a document and the books follow.
import { docTotals, type Account, type FinDocument, type DocLine } from './finance';

export interface LedgerLine { account_id: number; debit: number; credit: number; description?: string; contact_id?: number | null }
export interface LedgerEntry {
  date: string; source: 'invoice' | 'credit_note' | 'bill' | 'expense' | 'payment_in' | 'payment_out' | 'payroll' | 'journal' | 'opening';
  source_id: number | null; ref: string; memo: string; lines: LedgerLine[];
}

/** A payroll run broken down from its payslips: directors' pay and the employee / employer contribution shares. */
export interface PayrollSplit { directorGross: number; eeCpf: number; erCpf: number; sdl?: number; /** end-of-service gratuity set aside (Gulf) */ gratuity?: number }

/** Pay items that are deductions but not contributions to an authority. */
const PAY_ITEM_DEDUCTIONS = new Set(['DEDUCTION_LOAN', 'DEDUCTION_ADVANCE', 'DEDUCTION_OTHER']);

/**
 * Works out a run's split from its payslips. `directors` holds the ids of employees whose type is Director.
 * Singapore: the CPF shares (SDL and self-help funds are kept apart). Elsewhere: every statutory contribution.
 */
export function payrollSplit(slips: { employee_id: number; gross_pay: number; deductions_json?: any[]; employer_json?: any[] }[], directors: Set<number>, country = 'SG'): PayrollSplit {
  const sg = (country || 'SG').toUpperCase() === 'SG';
  const match = (code: string, want: string) => (sg ? code === want
    : want.startsWith('DEDUCTION_') ? code.startsWith('DEDUCTION_') && !code.endsWith('_ABSORBED') && !PAY_ITEM_DEDUCTIONS.has(code)
      : /^COST_.*_EMPLOYER$/.test(code) && code !== 'COST_EOSB_EMPLOYER');
  const sum = (items: any[] | undefined, code: string) => (items || []).filter(i => match(String(i?.componentCode || ''), code)).reduce((t, i) => t + (Number(i.amount) || 0), 0);
  let directorGross = 0, eeCpf = 0, erCpf = 0, sdl = 0, gratuity = 0;
  for (const p of slips) {
    if (directors.has(Number(p.employee_id))) directorGross += Number(p.gross_pay) || 0;
    eeCpf += sum(p.deductions_json, 'DEDUCTION_CPF');
    erCpf += sum(p.employer_json, 'COST_CPF_EMPLOYER');
    if (sg) sdl += sum(p.employer_json, 'COST_SDL_EMPLOYER');
    gratuity += (p.employer_json || []).filter(i => i?.componentCode === 'COST_EOSB_EMPLOYER').reduce((t, i) => t + (Number(i.amount) || 0), 0);
  }
  return { directorGross: r2(directorGross), eeCpf: r2(eeCpf), erCpf: r2(erCpf), sdl: r2(sdl), ...(gratuity ? { gratuity: r2(gratuity) } : {}) };
}

/** Split `amount` over accounts in proportion to their shares, keeping cents exact. */
export function splitByShare(amount: number, shares: { account_id: number; share: number }[]): { account_id: number; amount: number }[] {
  const amts = spread(amount, shares.map(s => Math.max(0, s.share)));
  const out = new Map<number, number>();
  shares.forEach((s, i) => out.set(s.account_id, r2((out.get(s.account_id) || 0) + amts[i])));
  return [...out.entries()].filter(([, a]) => a).map(([account_id, a]) => ({ account_id, amount: a }));
}

/**
 * How a finalised run is booked. Costs: employee salaries, director's salary, employer's CPF, SDL and other
 * employer contributions. Owed: net salaries, employee's CPF, employer's CPF, SDL / self-help funds / other deductions.
 */
export function payrollLines(r: LedgerInput['payroll'][number], accounts: Account[]): LedgerLine[] {
  const id = (sub: string) => systemAccount(accounts, sub)?.id ?? 0;
  const BANK = id('bank');
  const WAGES = id('payroll') || systemAccount(accounts, 'general', 'expense')?.id || 0;
  const DIRECTOR = id('payroll_director') || WAGES;
  const ER_CPF = id('payroll_employer') || WAGES, ER_OTHER = id('payroll_employer_other') || ER_CPF;
  const SALARIES = id('payroll_payable') || BANK;
  const EE_PAY = id('statutory_payable'), ER_PAY = id('cpf_employer_payable') || EE_PAY, OTHER_PAY = id('other_payroll_payable') || EE_PAY;
  // end-of-service gratuity: a cost set aside each month, owed only when the employee leaves (not paid monthly)
  const GRAT_EXP = id('gratuity_expense') || ER_OTHER, GRAT_PROV = id('gratuity_provision') || OTHER_PAY;
  const gross = r2(r.total_gross), employer = r2(r.total_employer), net = r2(r.total_net), ded = r2(r.total_deductions);
  const sp = r.split;
  const dirGross = r2(Math.min(gross, sp?.directorGross || 0));
  const eeCpf = sp ? r2(Math.min(ded, sp.eeCpf)) : ded, erCpf = sp ? r2(Math.min(employer, sp.erCpf)) : employer;
  // CPF Board drops the cents from the month's total SDL (e.g. 53.75 → 53.00), so that's what is owed
  const sdlCents = r2((sp?.sdl || 0) - Math.floor((sp?.sdl || 0) + 1e-9));
  const grat = r2(Math.min(Math.max(0, employer - erCpf), sp?.gratuity || 0));
  const lines: LedgerLine[] = [
    { account_id: WAGES, debit: r2(gross - dirGross), credit: 0, description: 'Employee salaries' },
    { account_id: DIRECTOR, debit: dirGross, credit: 0, description: "Director's salary" },
    { account_id: ER_CPF, debit: erCpf, credit: 0, description: 'Employer contributions' },
    { account_id: ER_OTHER, debit: r2(employer - erCpf - sdlCents - grat), credit: 0, description: 'Other employer contributions' },
    { account_id: GRAT_EXP, debit: grat, credit: 0, description: 'End-of-service gratuity' },
    { account_id: SALARIES, debit: 0, credit: net, description: 'Net salaries owed' },
    { account_id: EE_PAY, debit: 0, credit: eeCpf, description: 'Employee contributions owed' },
    { account_id: ER_PAY, debit: 0, credit: erCpf, description: 'Employer contributions owed' },
    { account_id: OTHER_PAY, debit: 0, credit: r2(ded - eeCpf + employer - erCpf - sdlCents - grat), description: 'Other deductions owed' },
    { account_id: GRAT_PROV, debit: 0, credit: grat, description: 'End-of-service gratuity set aside' },
  ];
  // anything that doesn't add up stays with the other deductions
  const diff = r2(lines.reduce((s, l) => s + l.debit - l.credit, 0));
  if (diff) lines.push({ account_id: OTHER_PAY, debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0, description: 'Other deductions' });
  // put lines for the same account and side together (when an account is missing they fall back to one)
  const merged = new Map<string, LedgerLine>();
  for (const l of lines) {
    const k = `${l.account_id}|${l.debit ? 'd' : 'c'}`, m = merged.get(k);
    if (m) { m.debit = r2(m.debit + l.debit); m.credit = r2(m.credit + l.credit); } else merged.set(k, { ...l });
  }
  return [...merged.values()].filter(l => l.debit || l.credit);
}

/** The accounts CPF Board payments come off: employee's CPF, employer's CPF, SDL / self-help funds. */
export function cpfPayableIds(accounts: Account[]): number[] {
  return [...new Set(['statutory_payable', 'cpf_employer_payable', 'other_payroll_payable']
    .map(s => systemAccount(accounts, s)?.id).filter((x): x is number => !!x))];
}

export interface LedgerInput {
  accounts: Account[];
  docs: (FinDocument & { lines: DocLine[] })[];
  payments: { id: number; direction: 'in' | 'out'; number: string | null; contact_id: number | null; payment_date: string; amount: number; account_id: number | null }[];
  allocations: { payment_id: number; document_id: number; amount: number }[];
  payroll: { id: number; period_year: number; period_month: number; pay_date: string; status: string; total_gross: number; total_deductions: number; total_employer: number; total_net: number; split?: PayrollSplit }[];
  journals: { id: number; number: string | null; journal_date: string; memo: string | null; lines: { account_id: number; debit: number; credit: number; description?: string | null }[] }[];
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100 + Number.EPSILON) / 100;

/** The account used for a job, e.g. 'receivable' → 1100. Falls back to the first account of the type. */
export function systemAccount(accounts: Account[], subtype: string, fallbackType?: Account['type']): Account | undefined {
  return accounts.find(a => a.subtype === subtype && !a.archived) || accounts.find(a => a.subtype === subtype)
    || (fallbackType ? accounts.find(a => a.type === fallbackType && !a.archived) : undefined);
}

/** Split `total` over weights, keeping cents exact (the rounding difference goes on the biggest share). */
export function spread(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map((_, i) => (i === 0 ? r2(total) : 0));
  const parts = weights.map(w => r2((total * w) / sum));
  const diff = r2(total - parts.reduce((a, b) => a + b, 0));
  if (diff) { const i = weights.indexOf(Math.max(...weights)); parts[i] = r2(parts[i] + diff); }
  return parts;
}

export function buildLedger(input: LedgerInput): LedgerEntry[] {
  const { accounts } = input;
  const acc = (sub: string, type?: Account['type']) => systemAccount(accounts, sub, type)?.id ?? 0;
  const AR = acc('receivable', 'asset'), AP = acc('payable', 'liability'), GST = acc('tax', 'liability');
  const SALES = acc('sales', 'income'), GENERAL = acc('general', 'expense'), BANK = acc('bank', 'asset');
  const CLAIMS = acc('claims_payable', 'liability') || AP;
  const RETAINED = acc('retained', 'equity');
  const entries: LedgerEntry[] = [];
  const docById = new Map(input.docs.map(d => [d.id, d]));

  // Opening balances: against retained earnings.
  for (const a of accounts) {
    const ob = r2(Number(a.opening_balance) || 0);
    if (!ob || !RETAINED || a.id === RETAINED) continue;
    const debitNormal = a.type === 'asset' || a.type === 'expense';
    const dr = debitNormal ? ob : -ob;
    entries.push({
      date: a.opening_date || '1900-01-01', source: 'opening', source_id: a.id, ref: 'Opening', memo: `Opening balance — ${a.name}`,
      lines: dr > 0
        ? [{ account_id: a.id, debit: dr, credit: 0 }, { account_id: RETAINED, debit: 0, credit: dr }]
        : [{ account_id: a.id, debit: 0, credit: -dr }, { account_id: RETAINED, debit: -dr, credit: 0 }],
    });
  }

  for (const d of input.docs) {
    if (d.status === 'draft' || d.status === 'void' || d.doc_type === 'quote') continue;
    const t = docTotals(d.lines, d.discounts || [], d.tax_inclusive);
    if (!t.total && !t.subtotal) continue;
    const netTotal = r2(t.total - t.tax_total);                        // income / cost without GST
    const weights = d.lines.map((_, i) => t.lines[i]);
    const nets = spread(netTotal, weights);
    const sales = d.doc_type === 'invoice' || d.doc_type === 'credit_note';
    const sign = d.doc_type === 'credit_note' ? -1 : 1;
    const lines: LedgerLine[] = [];
    const add = (account_id: number, amount: number, side: 'debit' | 'credit', description?: string) => {
      const v = r2(amount * sign);
      if (!v) return;
      const pos = v > 0;
      const s = pos ? side : side === 'debit' ? 'credit' : 'debit';
      lines.push({ account_id, debit: s === 'debit' ? Math.abs(v) : 0, credit: s === 'credit' ? Math.abs(v) : 0, description, contact_id: d.contact_id });
    };
    if (sales) {
      add(AR, t.total, 'debit');
      d.lines.forEach((l, i) => add(l.account_id || SALES, nets[i], 'credit', l.description));
      add(GST, t.tax_total, 'credit', 'GST on sales');
    } else {
      d.lines.forEach((l, i) => add(l.account_id || GENERAL, nets[i], 'debit', l.description));
      add(GST, t.tax_total, 'debit', 'GST on purchases');
      add(d.doc_type === 'expense' && d.employee_id ? CLAIMS : AP, t.total, 'credit');
    }
    entries.push({ date: d.issue_date, source: d.doc_type as LedgerEntry['source'], source_id: d.id, ref: d.number, memo: d.reference || '', lines });
  }

  for (const p of input.payments) {
    const amt = r2(p.amount);
    const cash = p.account_id || BANK;
    const allocs = input.allocations.filter(a => a.payment_id === p.id);
    // Which control account the payment settles: claims payable for staff expenses, otherwise AR / AP.
    const settle = (docId?: number) => {
      const doc = docId ? docById.get(docId) : undefined;
      if (p.direction === 'in') return AR;
      return doc && doc.doc_type === 'expense' && doc.employee_id ? CLAIMS : AP;
    };
    const lines: LedgerLine[] = [];
    let left = amt;
    for (const a of allocs) {
      const v = Math.min(left, r2(a.amount));
      if (v <= 0) continue;
      left = r2(left - v);
      lines.push(p.direction === 'in'
        ? { account_id: settle(a.document_id), debit: 0, credit: v, contact_id: p.contact_id }
        : { account_id: settle(a.document_id), debit: v, credit: 0, contact_id: p.contact_id });
    }
    if (left > 0) lines.push(p.direction === 'in' ? { account_id: AR, debit: 0, credit: left, contact_id: p.contact_id } : { account_id: AP, debit: left, credit: 0, contact_id: p.contact_id });
    lines.push(p.direction === 'in' ? { account_id: cash, debit: amt, credit: 0 } : { account_id: cash, debit: 0, credit: amt });
    entries.push({ date: p.payment_date, source: p.direction === 'in' ? 'payment_in' : 'payment_out', source_id: p.id, ref: p.number || '', memo: '', lines });
  }

  // Finalised payroll: salaries and employer contributions are costs; net pay and CPF are owed
  // until they're paid (Payables → Payroll, or Bank).
  for (const r of input.payroll) {
    if (r.status === 'draft') continue;
    const label = `Payroll ${r.period_year}-${String(r.period_month).padStart(2, '0')}`;
    const lines = payrollLines(r, accounts);
    entries.push({ date: r.pay_date, source: 'payroll', source_id: r.id, ref: label, memo: label, lines });
  }

  for (const j of input.journals) {
    entries.push({
      date: j.journal_date, source: 'journal', source_id: j.id, ref: j.number || 'Journal', memo: j.memo || '',
      lines: j.lines.map(l => ({ account_id: l.account_id, debit: r2(l.debit), credit: r2(l.credit), description: l.description || undefined })),
    });
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

// ---- reports -----------------------------------------------------------------------------

export interface Balance { account: Account; debit: number; credit: number; balance: number } // balance in the account's normal direction

const inRange = (d: string, from?: string, to?: string) => (!from || d >= from) && (!to || d <= to);

export function balances(accounts: Account[], entries: LedgerEntry[], from?: string, to?: string): Balance[] {
  const sums = new Map<number, { d: number; c: number }>();
  for (const e of entries) {
    if (!inRange(e.date, from, to)) continue;
    for (const l of e.lines) {
      const s = sums.get(l.account_id) || { d: 0, c: 0 };
      s.d += l.debit; s.c += l.credit;
      sums.set(l.account_id, s);
    }
  }
  return accounts.map(a => {
    const s = sums.get(a.id) || { d: 0, c: 0 };
    const debitNormal = a.type === 'asset' || a.type === 'expense';
    return { account: a, debit: r2(s.d), credit: r2(s.c), balance: r2(debitNormal ? s.d - s.c : s.c - s.d) };
  });
}

export function profitAndLoss(accounts: Account[], entries: LedgerEntry[], from: string, to: string) {
  const b = balances(accounts, entries, from, to);
  const income = b.filter(x => x.account.type === 'income' && x.balance);
  const expenses = b.filter(x => x.account.type === 'expense' && x.balance);
  const totalIncome = r2(income.reduce((s, x) => s + x.balance, 0));
  const totalExpenses = r2(expenses.reduce((s, x) => s + x.balance, 0));
  return { income, expenses, totalIncome, totalExpenses, profit: r2(totalIncome - totalExpenses) };
}

export function balanceSheet(accounts: Account[], entries: LedgerEntry[], asAt: string) {
  const b = balances(accounts, entries, undefined, asAt);
  const pick = (t: Account['type']) => b.filter(x => x.account.type === t && x.balance);
  const assets = pick('asset'), liabilities = pick('liability'), equity = pick('equity');
  // profit so far is part of equity until it's moved to retained earnings
  const earnings = r2(b.filter(x => x.account.type === 'income').reduce((s, x) => s + x.balance, 0)
    - b.filter(x => x.account.type === 'expense').reduce((s, x) => s + x.balance, 0));
  const totalAssets = r2(assets.reduce((s, x) => s + x.balance, 0));
  const totalLiabilities = r2(liabilities.reduce((s, x) => s + x.balance, 0));
  const totalEquity = r2(equity.reduce((s, x) => s + x.balance, 0) + earnings);
  return { assets, liabilities, equity, earnings, totalAssets, totalLiabilities, totalEquity, balanced: Math.abs(totalAssets - totalLiabilities - totalEquity) < 0.01 };
}

/** GST for a period, in the shape of the Singapore GST F5 return (main boxes). */
export function gstReturn(docs: (FinDocument & { lines: DocLine[] })[], from: string, to: string) {
  let standard = 0, zero = 0, outputTax = 0, purchases = 0, inputTax = 0;
  for (const d of docs) {
    if (d.status === 'draft' || d.status === 'void' || d.doc_type === 'quote' || !inRange(d.issue_date, from, to)) continue;
    const t = docTotals(d.lines, d.discounts || [], d.tax_inclusive);
    const factor = t.subtotal ? (t.subtotal - t.discount_total) / t.subtotal : 0;
    const sign = d.doc_type === 'credit_note' ? -1 : 1;
    d.lines.forEach((l, i) => {
      let net = t.lines[i] * factor;
      const rate = Number(l.tax_rate) || 0;
      if (d.tax_inclusive && rate) net = net / (1 + rate / 100);
      if (d.doc_type === 'invoice' || d.doc_type === 'credit_note') {
        if (rate > 0) standard += sign * net; else zero += sign * net;
      } else if (rate > 0) purchases += net;
    });
    if (d.doc_type === 'invoice' || d.doc_type === 'credit_note') outputTax += sign * t.tax_total;
    else inputTax += t.tax_total;
  }
  return {
    box1_standard: r2(standard), box2_zero: r2(zero), box4_total: r2(standard + zero),
    box5_purchases: r2(purchases), box6_output_tax: r2(outputTax), box7_input_tax: r2(inputTax),
    box8_net: r2(outputTax - inputTax),
  };
}

/** Lines of one account, with a running balance. */
export function accountLedger(account: Account, entries: LedgerEntry[], from?: string, to?: string) {
  const debitNormal = account.type === 'asset' || account.type === 'expense';
  let running = 0;
  let opening = 0;
  for (const e of entries) {
    if (from && e.date < from) for (const l of e.lines) if (l.account_id === account.id) opening += debitNormal ? l.debit - l.credit : l.credit - l.debit;
  }
  running = r2(opening);
  const rows: { date: string; ref: string; memo: string; source: string; debit: number; credit: number; balance: number }[] = [];
  for (const e of entries) {
    if (!inRange(e.date, from, to)) continue;
    for (const l of e.lines) {
      if (l.account_id !== account.id) continue;
      running = r2(running + (debitNormal ? l.debit - l.credit : l.credit - l.debit));
      rows.push({ date: e.date, ref: e.ref, memo: l.description || e.memo, source: e.source, debit: l.debit, credit: l.credit, balance: running });
    }
  }
  return { opening: r2(opening), rows, closing: running };
}

/** Who owes what, grouped by how late it is (receivables for sales, payables for purchases). */
export function aged(docs: FinDocument[], kind: 'receivable' | 'payable', asAt: string) {
  const types = kind === 'receivable' ? ['invoice'] : ['bill', 'expense'];
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 };
  const byContact = new Map<number | null, typeof buckets & { total: number }>();
  for (const d of docs) {
    if (!types.includes(d.doc_type) || ['draft', 'void', 'paid'].includes(d.status) || d.issue_date > asAt) continue;
    const owed = r2(Number(d.total) - (Number(d.amount_paid) || 0));
    if (owed <= 0) continue;
    const late = d.due_date ? Math.floor((Date.parse(asAt) - Date.parse(d.due_date)) / 86400000) : 0;
    const k = late <= 0 ? 'current' : late <= 30 ? 'd1_30' : late <= 60 ? 'd31_60' : late <= 90 ? 'd61_90' : 'd90';
    const row = byContact.get(d.contact_id) || { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0, total: 0 };
    row[k] = r2(row[k] + owed); row.total = r2(row.total + owed);
    byContact.set(d.contact_id, row);
    buckets[k] = r2(buckets[k] + owed);
  }
  return { rows: [...byContact.entries()].map(([contact_id, v]) => ({ contact_id, ...v })), totals: buckets };
}

// ---- payroll still to pay ---------------------------------------------------------------------

export interface PayrollDue {
  run: LedgerInput['payroll'][number];
  net: number; netPaid: number; netDue: number;
  stat: number; statPaid: number; statDue: number;
  /** what this run owes to each CPF Board account, used to split a CPF payment */
  statParts: { account_id: number; share: number }[];
}

/**
 * What is still owed for each finalised payroll run: net salaries (account "Net salaries payable") and
 * CPF (employee's and employer's CPF payable, SDL / self-help funds). Payments are whatever has been taken
 * off those accounts (Pay buttons, bank lines booked to them, journals) and are applied to the oldest runs first.
 */
export function payrollDue(input: Pick<LedgerInput, 'accounts' | 'payroll'>, entries: LedgerEntry[]): PayrollDue[] {
  const sal = systemAccount(input.accounts, 'payroll_payable')?.id;
  const statIds = cpfPayableIds(input.accounts);
  const paidTo = (ids: number[]) => r2(entries.filter(e => e.source !== 'payroll')
    .reduce((s, e) => s + e.lines.filter(l => ids.includes(l.account_id)).reduce((t, l) => t + l.debit - l.credit, 0), 0));
  let netLeft = sal == null ? 0 : paidTo([sal]), statLeft = paidTo(statIds);
  return input.payroll.filter(r => r.status !== 'draft')
    .sort((a, b) => a.pay_date.localeCompare(b.pay_date))
    .map(r => {
      const lines = payrollLines(r, input.accounts);
      const statParts = lines.filter(l => statIds.includes(l.account_id)).map(l => ({ account_id: l.account_id, share: r2(l.credit - l.debit) }));
      const net = r2(r.total_net), st = r2(statParts.reduce((t, p) => t + p.share, 0));
      const netPaid = r2(Math.max(0, Math.min(net, netLeft))); netLeft = r2(netLeft - netPaid);
      const statPaid = r2(Math.max(0, Math.min(st, statLeft))); statLeft = r2(statLeft - statPaid);
      return { run: r, net, netPaid, netDue: r2(net - netPaid), stat: st, statPaid, statDue: r2(st - statPaid), statParts };
    });
}
