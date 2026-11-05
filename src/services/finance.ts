import { supabase } from '../utils/supabase';
import {
  docTotals, statusAfterPayment, DEFAULT_ACCOUNTS, DEFAULT_FINANCE_SETTINGS, DOC_NUMBER_ENTITY,
  type Contact, type ContactPerson, type FinDocument, type DocLine, type DocType, type FinanceSettings, type Account,
} from '../data/finance';

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
    let rows: Account[] = must(await supabase.from('fin_accounts').select('*').eq('company_id', companyId).order('code')) || [];
    if (!rows.length) {
      must(await supabase.from('fin_accounts').upsert(
        DEFAULT_ACCOUNTS.map(a => ({ ...a, company_id: companyId })), { onConflict: 'company_id,code', ignoreDuplicates: true }));
      rows = must(await supabase.from('fin_accounts').select('*').eq('company_id', companyId).order('code')) || [];
    }
    return rows;
  },
  async save(companyId: number, a: Partial<Account>) {
    const row = {
      company_id: companyId, code: (a.code || '').trim(), name: (a.name || '').trim(), type: a.type, subtype: a.subtype || null,
      description: a.description || null, archived: !!a.archived, bank_name: a.bank_name || null, bank_account_no: a.bank_account_no || null,
      opening_balance: Number(a.opening_balance) || 0, opening_date: a.opening_date || null,
    };
    if (!row.code || !row.name || !row.type) throw new Error('Code, name and type are needed');
    if (a.id) must(await supabase.from('fin_accounts').update(row).eq('id', a.id));
    else must(await supabase.from('fin_accounts').insert(row));
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
      tax_rate: Number(l.tax_rate) || 0, account_id: l.account_id || null, amount: t.lines[lines.indexOf(l)],
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
