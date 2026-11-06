import type { CatalogItem, StockAdjustment, CustomerPrice } from '../data/catalog';
import { supabase } from '../utils/supabase';
import {
  docTotals, statusAfterPayment, bankCodePlan, chartUpgrade, defaultAccountsFor, DEFAULT_FINANCE_SETTINGS, DOC_NUMBER_ENTITY,
  type Contact, type ContactPerson, type FinDocument, type DocLine, type DocType, type FinanceSettings, type Account,
} from '../data/finance';
import { splitByShare, payrollSplit } from '../data/ledger';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const must = (r: { data: any; error: any }): any => { if (r.error) throw new Error(r.error.message); return r.data; };

// ---- contacts (CRM) ----------------------------------------------------------

export const contactService = {
  async list(companyId: number): Promise<Contact[]> {
    return must(await supabase.from('contacts').select('*').eq('company_id', companyId).order('name')) || [];
  },
  async people(contactId: number): Promise<ContactPerson[]> {
    return must(await supabase.from('contact_people').select('*').eq('contact_id', contactId).order('is_primary', { ascending: false }).order('name')) || [];
  },
  async peopleOf(companyId: number): Promise<ContactPerson[]> {
    return must(await supabase.from('contact_people').select('*').eq('company_id', companyId).order('name')) || [];
  },
  /** Save a contact and its people; returns the contact id. */
  async save(companyId: number, c: Partial<Contact>, people: ContactPerson[]): Promise<number> {
    const row = {
      company_id: companyId, name: (c.name || '').trim(), is_customer: c.is_customer ?? true, is_supplier: !!c.is_supplier,
      reg_no: c.reg_no || null, tax_no: c.tax_no || null, email: c.email || null, phone: c.phone || null, website: c.website || null,
      address: c.address || null, currency: c.currency || null, payment_terms_days: c.payment_terms_days ?? null,
      notes: c.notes || null, archived: !!c.archived, updated_at: new Date().toISOString(),
    };
    if (!row.name) throw new Error('Please enter a name');
    let id = c.id;
    if (id) must(await supabase.from('contacts').update(row).eq('id', id));
    else id = must(await supabase.from('contacts').insert(row).select('id').single()).id;
    // people: replace the list
    const existing = await this.people(id!);
    const keep = new Set(people.filter(p => p.id).map(p => p.id));
    for (const e of existing) if (!keep.has(e.id)) must(await supabase.from('contact_people').delete().eq('id', e.id!));
    for (const p of people) {
      if (!p.name?.trim()) continue;
      const pr = { company_id: companyId, contact_id: id, name: p.name.trim(), designation: p.designation || null, email: p.email || null, phone: p.phone || null, is_primary: !!p.is_primary };
      if (p.id) must(await supabase.from('contact_people').update(pr).eq('id', p.id));
      else must(await supabase.from('contact_people').insert(pr));
    }
    return id!;
  },
  async remove(id: number) {
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) throw new Error(/foreign key|violates/i.test(error.message) ? 'This contact has documents, so it can’t be deleted. Archive it instead.' : error.message);
  },
};

// ---- settings ------------------------------------------------------------------

export const financeSettingsService = {
  async get(companyId: number): Promise<FinanceSettings> {
    const { data } = await supabase.from('company_settings').select('value')
      .eq('company_id', companyId).eq('category', 'company').eq('key', 'finance').maybeSingle();
    return { ...DEFAULT_FINANCE_SETTINGS, ...(data?.value || {}) };
  },
  async save(companyId: number, s: FinanceSettings) {
    must(await supabase.from('company_settings').upsert(
      { company_id: companyId, category: 'company', key: 'finance', value: s }, { onConflict: 'company_id,category,key' }));
  },
};

// ---- chart of accounts -------------------------------------------------------------

export const accountService = {
  /** The company's accounts; the standard set is added the first time. */
  async list(companyId: number): Promise<Account[]> {
    const [acc, co] = await Promise.all([
      supabase.from('fin_accounts').select('*').eq('company_id', companyId).order('code'),
      supabase.from('companies').select('country').eq('id', companyId).maybeSingle(),
    ]);
    let rows: Account[] = must(acc) || [];
    // some account names follow the country (CPF in Singapore, EPF in Malaysia, GST / VAT…)
    const country = (co.data as any)?.country || 'SG';
    if (!rows.length) {
      must(await supabase.from('fin_accounts').upsert(
        defaultAccountsFor(country).map(a => ({ ...a, company_id: companyId })), { onConflict: 'company_id,code', ignoreDuplicates: true }));
      rows = must(await supabase.from('fin_accounts').select('*').eq('company_id', companyId).order('code')) || [];
    }
    const up = chartUpgrade(rows, country);
    if (up.add.length || up.rename.length) {
      try {
        if (up.add.length) must(await supabase.from('fin_accounts').insert(up.add.map(a => ({ ...a, company_id: companyId }))));
        for (const r of up.rename) must(await supabase.from('fin_accounts').update({ name: r.name }).eq('id', r.id));
        rows = must(await supabase.from('fin_accounts').select('*').eq('company_id', companyId).order('code')) || [];
      } catch { /* no edit rights: keep the accounts as they are */ }
    }
    if (bankCodePlan(rows).length) {
      try {
        await this.renumberBanks(rows);
        rows = must(await supabase.from('fin_accounts').select('*').eq('company_id', companyId).order('code')) || [];
      } catch { /* no edit rights: keep the codes as they are */ }
    }
    return rows;
  },
  /** Close gaps in bank codes so the first bank is 1000 (e.g. after a bank is deleted). Links use ids, so nothing else changes. */
  async renumberBanks(rows: Account[]) {
    const plan = bankCodePlan(rows);
    // move them out of the way first so two banks never hold the same code at once
    for (const p of plan) must(await supabase.from('fin_accounts').update({ code: `tmp-${p.id}` }).eq('id', p.id));
    for (const p of plan) must(await supabase.from('fin_accounts').update({ code: p.code }).eq('id', p.id));
  },
  async save(companyId: number, a: Partial<Account>): Promise<number> {
    const row = {
      company_id: companyId, code: (a.code || '').trim(), name: (a.name || '').trim(), type: a.type, subtype: a.subtype || null,
      description: a.description || null, archived: !!a.archived, bank_name: a.bank_name || null, bank_account_no: a.bank_account_no || null,
      opening_balance: Number(a.opening_balance) || 0, opening_date: a.opening_date || null,
      ...(a.currency !== undefined ? { currency: a.currency || null, opening_foreign: a.currency ? (Number(a.opening_foreign) || 0) : null } : {}),
    };
    if (!row.code || !row.name || !row.type) throw new Error('Code, name and type are needed');
    if (a.id) { must(await supabase.from('fin_accounts').update(row).eq('id', a.id)); return a.id; }
    return must(await supabase.from('fin_accounts').insert(row).select('id').single()).id;
  },
  async remove(id: number) {
    const { error } = await supabase.from('fin_accounts').delete().eq('id', id);
    if (error) throw new Error(/foreign key|violates/i.test(error.message) ? 'This account is used, so it can’t be deleted. Archive it instead.' : error.message);
  },
};

// ---- documents -------------------------------------------------------------------------

export interface DocWithLines { doc: FinDocument; lines: DocLine[] }

export const docService = {
  async list(companyId: number, types: DocType[]): Promise<FinDocument[]> {
    return must(await supabase.from('fin_documents').select('*').eq('company_id', companyId).in('doc_type', types)
      .order('issue_date', { ascending: false }).order('id', { ascending: false })) || [];
  },
  async get(id: number): Promise<DocWithLines> {
    const doc = must(await supabase.from('fin_documents').select('*').eq('id', id).single());
    const lines = must(await supabase.from('fin_document_lines').select('*').eq('document_id', id).order('position')) || [];
    return { doc, lines };
  },
  async nextNumber(companyId: number, type: DocType, date?: string): Promise<string> {
    return must(await supabase.rpc('fin_next_number', { p_company_id: companyId, p_entity: DOC_NUMBER_ENTITY[type], ...(date ? { p_date: date } : {}) }));
  },
  /** Create or update a document with its lines; totals are worked out here. Returns the id. */
  async save(companyId: number, d: Partial<FinDocument> & { doc_type: DocType }, lines: DocLine[]): Promise<number> {
    const t = docTotals(lines, d.discounts || [], !!d.tax_inclusive);
    const row: any = {
      company_id: companyId, doc_type: d.doc_type, status: d.status || 'draft',
      contact_id: d.contact_id || null, contact_person_id: d.contact_person_id || null,
      issue_date: d.issue_date, due_date: d.due_date || null, reference: d.reference || null, currency: d.currency || 'SGD',
      tax_inclusive: !!d.tax_inclusive, discounts: d.discounts || [],
      subtotal: t.subtotal, discount_total: t.discount_total, tax_total: t.tax_total, total: t.total,
      notes: d.notes || null, terms: d.terms || null, source_id: d.source_id || null,
      paid_from_account_id: d.paid_from_account_id || null, employee_id: d.employee_id || null,
      payment_account_index: d.payment_account_index ?? null, updated_at: new Date().toISOString(),
    };
    let id = d.id;
    if (id) {
      row.number = d.number;
      must(await supabase.from('fin_documents').update(row).eq('id', id));
    } else {
      row.number = d.number || await this.nextNumber(companyId, d.doc_type, d.issue_date);
      id = must(await supabase.from('fin_documents').insert(row).select('id').single()).id;
    }
    must(await supabase.from('fin_document_lines').delete().eq('document_id', id!));
    const rows = lines.filter(l => (l.description || '').trim() || Number(l.unit_price)).map((l, i) => ({
      company_id: companyId, document_id: id, position: i, description: l.description || '',
      quantity: Number(l.quantity) || 0, unit_price: Number(l.unit_price) || 0, discount_pct: Number(l.discount_pct) || 0,
      tax_rate: Number(l.tax_rate) || 0, account_id: l.account_id || null, ...(l.item_id ? { item_id: l.item_id } : {}), amount: t.lines[lines.indexOf(l)],
    }));
    if (rows.length) must(await supabase.from('fin_document_lines').insert(rows));
    // keep paid status right if the total changed
    const fresh = must(await supabase.from('fin_documents').select('id, total, amount_paid, status').eq('id', id!).single());
    const st = statusAfterPayment(fresh);
    if (st !== fresh.status) must(await supabase.from('fin_documents').update({ status: st }).eq('id', id!));
    return id!;
  },
  async setStatus(id: number, status: string) {
    must(await supabase.from('fin_documents').update({ status, updated_at: new Date().toISOString() }).eq('id', id));
  },
  async remove(id: number) {
    const paid = must(await supabase.from('fin_payment_allocations').select('id').eq('document_id', id).limit(1)) || [];
    if (paid.length) throw new Error('This document has payments recorded. Delete the payments first, or void it.');
    must(await supabase.from('fin_documents').delete().eq('id', id));
  },
  /** Turn a quotation into a new draft invoice (keeps the lines and discounts). */
  async quoteToInvoice(companyId: number, quoteId: number, dueDays: number): Promise<number> {
    const { doc, lines } = await this.get(quoteId);
    const issue = new Date().toISOString().slice(0, 10);
    const due = new Date(Date.now() + dueDays * 86400000).toISOString().slice(0, 10);
    const id = await this.save(companyId, {
      ...doc, id: undefined, number: undefined, doc_type: 'invoice', status: 'draft', issue_date: issue, due_date: due, source_id: quoteId,
    } as any, lines.map(l => ({ ...l, id: undefined })));
    if (doc.status === 'sent' || doc.status === 'draft') await this.setStatus(quoteId, 'accepted');
    return id;
  },
  /** Recalculate how much has been paid on a document from its payment allocations. */
  async refreshPaid(id: number) {
    const allocs = must(await supabase.from('fin_payment_allocations').select('amount').eq('document_id', id)) || [];
    const amount_paid = Math.round(allocs.reduce((s: number, a: any) => s + Number(a.amount), 0) * 100) / 100;
    const doc = must(await supabase.from('fin_documents').select('total, status').eq('id', id).single());
    const status = statusAfterPayment({ total: doc.total, status: doc.status, amount_paid });
    must(await supabase.from('fin_documents').update({ amount_paid, status }).eq('id', id));
  },
};

// ---- payments --------------------------------------------------------------------------

export interface Payment {
  id: number; company_id: number; direction: 'in' | 'out'; number: string | null; contact_id: number | null;
  payment_date: string; amount: number; method: string | null; reference: string | null; account_id: number | null; notes: string | null;
  /** set when the money went through a bank account in another currency */
  currency?: string | null; foreign_amount?: number | null;
}
export interface Allocation { id?: number; payment_id?: number; document_id: number; amount: number }

export const paymentService = {
  async list(companyId: number, direction: 'in' | 'out'): Promise<Payment[]> {
    return must(await supabase.from('fin_payments').select('*').eq('company_id', companyId).eq('direction', direction)
      .order('payment_date', { ascending: false }).order('id', { ascending: false })) || [];
  },
  async allocations(companyId: number): Promise<(Allocation & { payment_id: number })[]> {
    return must(await supabase.from('fin_payment_allocations').select('*').eq('company_id', companyId)) || [];
  },
  async forDocument(documentId: number): Promise<(Payment & { allocated: number })[]> {
    const allocs = must(await supabase.from('fin_payment_allocations').select('payment_id, amount').eq('document_id', documentId)) || [];
    if (!allocs.length) return [];
    const pays: Payment[] = must(await supabase.from('fin_payments').select('*').in('id', allocs.map((a: any) => a.payment_id))) || [];
    return pays.map(p => ({ ...p, allocated: allocs.filter((a: any) => a.payment_id === p.id).reduce((s: number, a: any) => s + Number(a.amount), 0) }));
  },
  /** Record a payment and spread it over documents; refreshes what each document has been paid. */
  async record(companyId: number, p: Partial<Payment> & { direction: 'in' | 'out'; amount: number }, allocations: Allocation[]): Promise<number> {
    const number = p.number || await supabase.rpc('fin_next_number', { p_company_id: companyId, p_entity: p.direction === 'in' ? 'receipt' : 'payment' })
      .then(r => (r.error ? null : r.data as string));
    const id = must(await supabase.from('fin_payments').insert({
      company_id: companyId, direction: p.direction, number, contact_id: p.contact_id || null,
      payment_date: p.payment_date || new Date().toISOString().slice(0, 10), amount: Math.round(p.amount * 100) / 100,
      method: p.method || null, reference: p.reference || null, account_id: p.account_id || null, notes: p.notes || null,
      ...(p.currency ? { currency: p.currency, foreign_amount: p.foreign_amount ?? null } : {}),
    }).select('id').single()).id;
    const rows = allocations.filter(a => a.amount > 0).map(a => ({ company_id: companyId, payment_id: id, document_id: a.document_id, amount: Math.round(a.amount * 100) / 100 }));
    if (rows.length) must(await supabase.from('fin_payment_allocations').insert(rows));
    for (const a of rows) await docService.refreshPaid(a.document_id);
    return id;
  },
  async remove(id: number) {
    const allocs = must(await supabase.from('fin_payment_allocations').select('document_id').eq('payment_id', id)) || [];
    must(await supabase.from('fin_payments').delete().eq('id', id));
    for (const a of allocs) await docService.refreshPaid((a as any).document_id);
  },
};

// ---- manual journals and everything the ledger needs ------------------------------------

export interface JournalRow {
  id: number; number: string | null; journal_date: string; memo: string | null;
  lines: { id?: number; account_id: number; debit: number; credit: number; description?: string | null }[];
}

export const journalService = {
  async list(companyId: number): Promise<JournalRow[]> {
    const js = must(await supabase.from('fin_journals').select('*').eq('company_id', companyId).order('journal_date', { ascending: false })) || [];
    const ls = must(await supabase.from('fin_journal_lines').select('*').eq('company_id', companyId)) || [];
    return js.map((j: any) => ({ ...j, lines: ls.filter((l: any) => l.journal_id === j.id) }));
  },
  async save(companyId: number, j: Partial<JournalRow>, lines: JournalRow['lines']): Promise<number> {
    const clean = lines.filter(l => l.account_id && (Number(l.debit) || Number(l.credit)));
    const dr = clean.reduce((s, l) => s + (Number(l.debit) || 0), 0), cr = clean.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    if (clean.length < 2) throw new Error('A journal needs at least two lines');
    if (Math.round(dr * 100) !== Math.round(cr * 100)) throw new Error('Debits and credits must be equal');
    let id = j.id;
    const row = { company_id: companyId, journal_date: j.journal_date, memo: j.memo || null };
    if (id) must(await supabase.from('fin_journals').update(row).eq('id', id));
    else {
      const number = await supabase.rpc('fin_next_number', { p_company_id: companyId, p_entity: 'journal' }).then(r => (r.error ? null : r.data as string));
      id = must(await supabase.from('fin_journals').insert({ ...row, number }).select('id').single()).id;
    }
    must(await supabase.from('fin_journal_lines').delete().eq('journal_id', id!));
    must(await supabase.from('fin_journal_lines').insert(clean.map(l => ({
      company_id: companyId, journal_id: id, account_id: l.account_id, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, description: l.description || null,
    }))));
    return id!;
  },
  async remove(id: number) { must(await supabase.from('fin_journals').delete().eq('id', id)); },
};

/** Everything the ledger and reports are worked out from. */
export async function loadLedgerInput(companyId: number) {
  const [accounts, docs, lines, payments, allocations, journals, payroll] = await Promise.all([
    accountService.list(companyId),
    supabase.from('fin_documents').select('*').eq('company_id', companyId).then(must),
    supabase.from('fin_document_lines').select('*').eq('company_id', companyId).order('position').then(must),
    supabase.from('fin_payments').select('*').eq('company_id', companyId).then(must),
    supabase.from('fin_payment_allocations').select('*').eq('company_id', companyId).then(must),
    journalService.list(companyId),
    // payroll is pay data: people without pay access simply don't see it in the books
    supabase.from('payroll_runs').select('id, period_year, period_month, pay_date, status, total_gross, total_deductions, total_employer, total_net')
      .eq('company_id', companyId).then(r => (r.error ? [] : r.data || [])),
  ]);
  const runs = (payroll as any[]).filter(r => r.status !== 'draft');
  if (runs.length) {
    // per payslip: CPF employee / employer shares and directors' pay, so each goes to its own account
    let country = 'SG';
    const [slips, emps] = await Promise.all([
      supabase.from('payslips').select('run_id, employee_id, gross_pay, deductions_json, employer_json').in('run_id', runs.map(r => r.id))
        .then(r => (r.error ? [] : r.data || [])),
      supabase.from('employees').select('id, employment_type').eq('company_id', companyId).then(r => (r.error ? [] : r.data || [])),
      supabase.from('companies').select('country').eq('id', companyId).maybeSingle().then(r => { country = (r.data as any)?.country || 'SG'; }),
    ]);
    const directors = new Set((emps as any[]).filter(e => e.employment_type === 'director').map(e => e.id));
    for (const r of runs) {
      const mine = (slips as any[]).filter(s => s.run_id === r.id);
      if (mine.length) r.split = payrollSplit(mine, directors, country);
    }
  }
  const byDoc = new Map<number, any[]>();
  for (const l of lines || []) { const a = byDoc.get(l.document_id) || []; a.push(l); byDoc.set(l.document_id, a); }
  return {
    accounts,
    docs: (docs || []).map((d: any) => ({ ...d, lines: byDoc.get(d.id) || [] })),
    payments: payments || [], allocations: allocations || [], journals, payroll: payroll as any[],
  };
}

// ---- bank statement lines ----------------------------------------------------------------

export interface BankTxn {
  id: number; company_id: number; account_id: number; txn_date: string; description: string | null; amount: number;
  payment_id: number | null; journal_id: number | null; status: 'unmatched' | 'matched' | 'ignored';
  /** the line in the company's currency, for bank accounts in another currency */
  base_amount?: number | null;
}

export const bankService = {
  async list(companyId: number, accountId: number): Promise<BankTxn[]> {
    return must(await supabase.from('fin_bank_transactions').select('*').eq('company_id', companyId).eq('account_id', accountId)
      .order('txn_date', { ascending: false }).order('id', { ascending: false })) || [];
  },
  async listAll(companyId: number): Promise<BankTxn[]> {
    return must(await supabase.from('fin_bank_transactions').select('*').eq('company_id', companyId)) || [];
  },
  async add(companyId: number, accountId: number, lines: { txn_date: string; description: string; amount: number }[]) {
    if (!lines.length) return;
    must(await supabase.from('fin_bank_transactions').insert(lines.map(l => ({ company_id: companyId, account_id: accountId, ...l, status: 'unmatched' }))));
  },
  async update(id: number, patch: Partial<BankTxn>) { must(await supabase.from('fin_bank_transactions').update(patch).eq('id', id)); },
  async remove(id: number) { must(await supabase.from('fin_bank_transactions').delete().eq('id', id)); },
  /** Match a statement line to a payment that's already recorded. */
  async matchPayment(txnId: number, paymentId: number, baseAmount?: number) {
    await this.update(txnId, { payment_id: paymentId, journal_id: null, status: 'matched', ...(baseAmount != null ? { base_amount: baseAmount } : {}) });
  },
  /** Money in / out that isn't an invoice or bill: book it straight to an account (e.g. bank charges, interest). */
  async categorise(companyId: number, txn: BankTxn, accountId: number | { account_id: number; share: number }[], memo: string, baseAmount?: number) {
    // books are in the company's currency: a foreign-currency line uses its converted amount
    const amt = Math.abs(baseAmount != null ? baseAmount : Number(txn.amount));
    // one account, or several (e.g. CPF: employee's and employer's CPF payable) split by share
    const parts = typeof accountId === 'number' ? [{ account_id: accountId, amount: amt }] : splitByShare(amt, accountId);
    const lines = txn.amount > 0
      ? [{ account_id: txn.account_id, debit: amt, credit: 0, description: memo }, ...parts.map(p => ({ account_id: p.account_id, debit: 0, credit: p.amount, description: memo }))]
      : [...parts.map(p => ({ account_id: p.account_id, debit: p.amount, credit: 0, description: memo })), { account_id: txn.account_id, debit: 0, credit: amt, description: memo }];
    const jid = await journalService.save(companyId, { journal_date: txn.txn_date, memo: memo || txn.description || 'Bank' }, lines);
    await this.update(txn.id, { journal_id: jid, payment_id: null, status: 'matched', ...(baseAmount != null ? { base_amount: Math.sign(Number(txn.amount)) * amt } : {}) });
  },
  async unmatch(txn: BankTxn, deleteJournal: boolean) {
    if (deleteJournal && txn.journal_id) await journalService.remove(txn.journal_id);
    await this.update(txn.id, { payment_id: null, journal_id: null, status: 'unmatched' });
  },
};

// ---- how to read each bank's PDF statements (taught by the user) ---------------------------

export const pdfLayoutService = {
  async get(companyId: number): Promise<Record<string, any>> {
    const { data } = await supabase.from('company_settings').select('value')
      .eq('company_id', companyId).eq('category', 'company').eq('key', 'bank_pdf_layouts').maybeSingle();
    return (data?.value as Record<string, any>) || {};
  },
  async save(companyId: number, accountId: number, layout: any | null) {
    const all = await this.get(companyId);
    if (layout) all[String(accountId)] = layout; else delete all[String(accountId)];
    must(await supabase.from('company_settings').upsert(
      { company_id: companyId, category: 'company', key: 'bank_pdf_layouts', value: all }, { onConflict: 'company_id,category,key' }));
  },
};

// ---- catalog (products and services) ---------------------------------------------------------


export const catalogService = {
  async list(companyId: number): Promise<CatalogItem[]> {
    return must(await supabase.from('catalog_items').select('*').eq('company_id', companyId).order('name')) || [];
  },
  async save(companyId: number, i: Partial<CatalogItem>): Promise<number> {
    const row = {
      company_id: companyId, kind: i.kind || 'product', code: (i.code || '').trim() || null, name: (i.name || '').trim(),
      description: i.description || null, unit: i.unit || null, sale_price: Number(i.sale_price) || 0, purchase_price: Number(i.purchase_price) || 0,
      tax_rate: i.tax_rate == null || (i.tax_rate as any) === '' ? null : Number(i.tax_rate),
      income_account_id: i.income_account_id || null, expense_account_id: i.expense_account_id || null,
      track_stock: i.kind === 'service' ? false : !!i.track_stock, opening_qty: Number(i.opening_qty) || 0,
      reorder_level: i.reorder_level == null || (i.reorder_level as any) === '' ? null : Number(i.reorder_level),
      category: i.category || null, archived: !!i.archived, updated_at: new Date().toISOString(),
    };
    if (!row.name) throw new Error('Please enter a name');
    const fix = (e: any) => { if (e && /uq_catalog_items_code|duplicate/i.test(e.message)) throw new Error(`The code "${row.code}" is already used by another item`); return e; };
    if (i.id) { const r = await supabase.from('catalog_items').update(row).eq('id', i.id); fix(r.error); must(r); return i.id; }
    const r = await supabase.from('catalog_items').insert(row).select('id').single(); fix(r.error);
    return must(r).id;
  },
  async remove(id: number) {
    const { error } = await supabase.from('catalog_items').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
  async adjustments(companyId: number): Promise<StockAdjustment[]> {
    return must(await supabase.from('catalog_stock_adjustments').select('*').eq('company_id', companyId).order('adj_date', { ascending: false })) || [];
  },
  async adjust(companyId: number, itemId: number, quantity: number, date: string, reason: string) {
    must(await supabase.from('catalog_stock_adjustments').insert({ company_id: companyId, item_id: itemId, quantity, adj_date: date, reason: reason || null }));
  },
  async removeAdjustment(id: number) { must(await supabase.from('catalog_stock_adjustments').delete().eq('id', id)); },
  /** Special prices for particular customers (empty until migration 027 is run). */
  async prices(companyId: number, itemId?: number): Promise<CustomerPrice[]> {
    let q = supabase.from('catalog_customer_prices').select('id, item_id, contact_id, price').eq('company_id', companyId);
    if (itemId) q = q.eq('item_id', itemId);
    const r = await q;
    return r.error ? [] : (r.data || []).map((p: any) => ({ ...p, price: Number(p.price) }));
  },
  /** Replace an item's customer prices with `rows`. */
  async setPrices(companyId: number, itemId: number, rows: { contact_id: number; price: number }[]) {
    const keep = rows.filter(r => r.contact_id);
    const old = await this.prices(companyId, itemId);
    const gone = old.filter(o => !keep.some(k => k.contact_id === o.contact_id)).map(o => o.id!);
    if (gone.length) must(await supabase.from('catalog_customer_prices').delete().in('id', gone));
    if (keep.length) {
      const r = await supabase.from('catalog_customer_prices').upsert(
        keep.map(k => ({ company_id: companyId, item_id: itemId, contact_id: k.contact_id, price: Number(k.price) || 0, updated_at: new Date().toISOString() })),
        { onConflict: 'item_id,contact_id' });
      if (r.error) throw new Error(/catalog_customer_prices|does not exist/i.test(r.error.message) ? 'Customer prices need database update 027 — ask your administrator to run it in Supabase.' : r.error.message);
    }
  },
};
