import { supabase } from '../utils/supabase';
import { workflowService } from './workflow';
import { ATTACH_BUCKET, contentTypeOf, readyToUpload, sending, uploadError, docService, latestRate } from './finance';

// Staff expense claims (migration 040). Staff submit their own; Claims → approve decides; Finance turns
// approved claims into staff-claim expenses (expense documents with the employee, paid later).

export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export interface Claim {
  id: number; company_id: number; employee_id: number; claim_date: string; category: string;
  description: string | null; amount: number; currency: string; status: ClaimStatus;
  decided_by: number | null; decided_at: string | null; decision_note: string | null;
  document_id: number | null; created_at?: string;
  /** the payroll run that paid it back (migration 058) */
  payroll_run_id?: number | null;
}
export interface ClaimReceipt { id: number; company_id: number; claim_id: number; path: string; file_name: string; content_type: string | null; size_bytes: number | null }

export const CLAIM_CATEGORIES = ['Transport', 'Travel', 'Meals', 'Entertainment', 'Phone', 'Medical', 'Office supplies', 'Training', 'Others'];

/** The expense account a category usually goes to (by the standard chart's names), else General expenses. */
export function accountForCategory(category: string, accounts: { id: number; name: string; type: string; subtype?: string | null; archived?: boolean }[]): number | null {
  const exp = accounts.filter(a => a.type === 'expense' && !a.archived);
  const c = category.toLowerCase();
  const by = (re: RegExp) => exp.find(a => re.test(a.name.toLowerCase()))?.id;
  const guess =
    /transport|travel|taxi|parking|mileage/.test(c) ? by(/travel|transport/) :
    /meal|entertain|food/.test(c) ? by(/meal|entertain/) :
    /office|stationery|supplies/.test(c) ? by(/office/) :
    /software|subscription/.test(c) ? by(/software|subscription/) :
    /phone|internet|utilit/.test(c) ? by(/utilit|phone|telecom/) : undefined;
  return guess ?? exp.find(a => a.subtype === 'general')?.id ?? exp[0]?.id ?? null;
}

const must = (r: { data: any; error: any }): any => {
  if (r.error) throw new Error(/claims|does not exist/i.test(r.error.message) && /relation|exist/i.test(r.error.message)
    ? 'Claims need database update 040 — ask your administrator to run it in Supabase.' : r.error.message);
  return r.data;
};

export const claimService = {
  async list(companyId: number, opts?: { employeeId?: number }): Promise<Claim[]> {
    let q = supabase.from('claims').select('*').eq('company_id', companyId);
    if (opts?.employeeId) q = q.eq('employee_id', opts.employeeId);
    const rows = must(await q.order('claim_date', { ascending: false }).order('id', { ascending: false })) || [];
    return rows.map((c: any) => ({ ...c, amount: Number(c.amount) }));
  },
  async save(companyId: number, c: Partial<Claim> & { employee_id: number }): Promise<number> {
    const row = {
      company_id: companyId, employee_id: c.employee_id, claim_date: c.claim_date, category: c.category,
      description: c.description || null, amount: c.amount, currency: c.currency,
    };
    if (c.id) { must(await supabase.from('claims').update(row).eq('id', c.id)); return c.id; }
    return must(await supabase.from('claims').insert({ ...row, status: 'pending' }).select('id').single()).id;
  },
  /** The approved claims a payroll run will pay back (company currency, not in Finance, not in another run). Empty before database update 058. */
  async waitingForPayroll(companyId: number, runId?: number | null): Promise<{ claim_id: number; employee_id: number; category: string; description: string | null; amount: number }[]> {
    const r = await supabase.rpc('payroll_claims_waiting', { p_company_id: companyId, p_run_id: runId ?? null });
    if (r.error) return [];
    return (r.data || []).map((x: any) => ({ ...x, claim_id: Number(x.claim_id), employee_id: Number(x.employee_id), amount: Number(x.amount) }));
  },
  async takeForPayroll(runId: number, claimIds: number[]) {
    const r = await supabase.rpc('payroll_take_claims', { p_run_id: runId, p_claim_ids: claimIds });
    if (r.error && !/payroll_take_claims|function/i.test(r.error.message)) throw new Error(r.error.message);
  },
  async cancel(id: number) { must(await supabase.from('claims').update({ status: 'cancelled' }).eq('id', id)); },
  async remove(id: number) {
    const files = await this.receipts([id]);
    if (files.length) await supabase.storage.from(ATTACH_BUCKET).remove(files.map(f => f.path));
    must(await supabase.from('claims').delete().eq('id', id));
  },
  /** Through the approval chain, if the company set one. Returns 'pending' when it moved to the next step. */
  async decide(id: number, status: 'approved' | 'rejected', note?: string) {
    return workflowService.decide('claim', id, status, note);
  },

  async receipts(claimIds: number[]): Promise<ClaimReceipt[]> {
    if (!claimIds.length) return [];
    const r = await supabase.from('claim_receipts').select('*').in('claim_id', claimIds).order('id');
    return r.error ? [] : r.data || [];
  },
  /** Upload a receipt into "<company>/claims/<claim>/…". */
  async addReceipt(companyId: number, claimId: number, original: File) {
    const file = await readyToUpload(original);
    const safe = file.name.replace(/[^\w.\- ]+/g, '_').slice(-80);
    const path = `${companyId}/claims/${claimId}/${Date.now()}-${safe}`;
    const up = await sending(file, () => supabase.storage.from(ATTACH_BUCKET).upload(path, file, { contentType: contentTypeOf(file), upsert: false }));
    if (up.error) throw new Error(uploadError(file, up.error.message));
    const r = await supabase.from('claim_receipts').insert({ company_id: companyId, claim_id: claimId, path, file_name: file.name, content_type: contentTypeOf(file), size_bytes: file.size });
    if (r.error) { await supabase.storage.from(ATTACH_BUCKET).remove([path]); throw new Error(r.error.message); }
  },
  async removeReceipt(f: ClaimReceipt) {
    await supabase.storage.from(ATTACH_BUCKET).remove([f.path]);
    must(await supabase.from('claim_receipts').delete().eq('id', f.id));
  },
  async receiptBlob(path: string): Promise<Blob> {
    const r = await supabase.storage.from(ATTACH_BUCKET).download(path);
    if (r.error || !r.data) throw new Error(r.error?.message || 'Could not get the file');
    return r.data;
  },

  /**
   * Book approved claims of one employee as one staff-claim expense in Finance (owed to the employee,
   * paid later from Payables), one line per claim, with the receipts attached. Claims must share a currency.
   */
  async toExpense(companyId: number, claims: Claim[], accountFor: (c: Claim) => number | null, companyCurrency: string, employeeName: string): Promise<number> {
    if (!claims.length) throw new Error('Nothing to book');
    const cur = claims[0].currency;
    if (claims.some(c => c.currency !== cur || c.employee_id !== claims[0].employee_id)) throw new Error('Book one person and one currency at a time');
    const date = claims.map(c => c.claim_date).sort().reverse()[0];
    const foreign = cur !== companyCurrency;
    const fx = foreign ? await latestRate(companyId, cur, companyCurrency, date) : null;
    if (foreign && !fx) throw new Error(`No ${cur} rate found — enter the claim in Finance by hand with the rate`);
    const id = await docService.save(companyId, {
      doc_type: 'expense', status: 'approved', employee_id: claims[0].employee_id, contact_id: null,
      issue_date: date, due_date: null, currency: cur, tax_inclusive: true, discounts: [],
      reference: `Claims: ${employeeName}`, ...(foreign ? { fx_rate: fx } : {}),
    }, claims.map(c => ({
      description: [c.category, c.description].filter(Boolean).join(' — ') + ` (${c.claim_date})`,
      quantity: 1, unit_price: c.amount, discount_pct: 0, tax_rate: 0, account_id: accountFor(c),
    })));
    // receipts go with the expense (copied, so the claim keeps its own)
    const files = await this.receipts(claims.map(c => c.id));
    for (const f of files) {
      const to = `${companyId}/${id}/${Date.now()}-${f.path.split('/').pop()}`;
      const cp = await supabase.storage.from(ATTACH_BUCKET).copy(f.path, to);
      if (!cp.error) await supabase.from('fin_attachments').insert({ company_id: companyId, document_id: id, path: to, file_name: f.file_name, content_type: f.content_type, size_bytes: f.size_bytes });
    }
    must(await supabase.from('claims').update({ document_id: id }).in('id', claims.map(c => c.id)));
    return id;
  },
};
