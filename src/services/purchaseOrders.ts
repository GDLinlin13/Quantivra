import { supabase } from '../utils/supabase';
import { docService } from './finance';
import { docTotals, type DocLine } from '../data/finance';
import type { RequestStatus } from './workflow';

// Purchase orders (migration 062): draft → pending approval → approved → sent → received; an approved order can be turned into a bill.

export type PoStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'sent' | 'received' | 'cancelled';
export interface PoLine { id?: number; item_id?: number | null; description: string; quantity: number; unit_price: number; tax_rate: number; amount?: number }
export interface PurchaseOrder {
  id: number; company_id: number; number: string; contact_id: number | null; issue_date: string; expected_date: string | null;
  status: PoStatus; currency: string; subtotal: number; tax_total: number; total: number; reference: string | null; deliver_to: string | null;
  notes: string | null; terms: string | null; document_id: number | null; created_by: number | null; decided_by: number | null; decided_at: string | null;
  decision_note: string | null;
}

export const PO_STATUS_LABEL: Record<PoStatus, string> = {
  draft: 'Draft', pending: 'To approve', approved: 'Approved', rejected: 'Rejected', sent: 'Sent', received: 'Received', cancelled: 'Cancelled',
};
export const PO_STATUS_COLOR: Record<PoStatus, string> = { draft: 'default', pending: 'gold', approved: 'green', rejected: 'red', sent: 'blue', received: 'cyan', cancelled: 'default' };

const must = (r: { data: any; error: any }): any => {
  if (r.error) throw new Error(/purchase_order|po_(status|decide)/i.test(r.error.message) && /relation|exist|schema cache|function/i.test(r.error.message)
    ? 'Purchase orders need database update 062 — ask your administrator to run it in Supabase.' : r.error.message);
  return r.data;
};
const num = (o: PurchaseOrder): PurchaseOrder => ({ ...o, subtotal: Number(o.subtotal), tax_total: Number(o.tax_total), total: Number(o.total) });

const asDocLines = (lines: PoLine[]): DocLine[] => lines.map(l => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price, discount_pct: 0, tax_rate: l.tax_rate, item_id: l.item_id ?? null }));

export const poService = {
  async list(companyId: number): Promise<PurchaseOrder[]> {
    return (must(await supabase.from('purchase_orders').select('*').eq('company_id', companyId).order('issue_date', { ascending: false }).order('id', { ascending: false })) || []).map(num);
  },
  async lines(poId: number): Promise<PoLine[]> {
    return (must(await supabase.from('purchase_order_lines').select('*').eq('po_id', poId).order('position')) || [])
      .map((l: any) => ({ ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price), tax_rate: Number(l.tax_rate), amount: Number(l.amount) }));
  },
  async save(companyId: number, po: Partial<PurchaseOrder>, lines: PoLine[], createdBy?: number | null): Promise<number> {
    const t = docTotals(asDocLines(lines), [], false);
    const row = {
      company_id: companyId, contact_id: po.contact_id ?? null, issue_date: po.issue_date, expected_date: po.expected_date || null,
      currency: po.currency || 'SGD', subtotal: t.subtotal, tax_total: t.tax_total, total: t.total,
      reference: (po.reference || '').trim() || null, deliver_to: (po.deliver_to || '').trim() || null, notes: po.notes || null, terms: po.terms || null,
    };
    let id = po.id;
    if (id) must(await supabase.from('purchase_orders').update(row).eq('id', id));
    else {
      const number = po.number || await docService.nextEntityNumber(companyId, 'po', po.issue_date || new Date().toISOString().slice(0, 10));
      id = must(await supabase.from('purchase_orders').insert({ ...row, number, status: 'draft', created_by: createdBy ?? null }).select('id').single()).id as number;
    }
    must(await supabase.from('purchase_order_lines').delete().eq('po_id', id!));
    const rows = lines.filter(l => (l.description || '').trim() || l.item_id).map((l, i) => ({
      company_id: companyId, po_id: id, position: i, item_id: l.item_id ?? null, description: l.description || null,
      quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate, amount: Math.round(l.quantity * l.unit_price * 100) / 100,
    }));
    if (rows.length) must(await supabase.from('purchase_order_lines').insert(rows));
    return id!;
  },
  async setStatus(id: number, status: PoStatus) { must(await supabase.from('purchase_orders').update({ status }).eq('id', id)); },
  async remove(id: number) { must(await supabase.from('purchase_orders').delete().eq('id', id)); },
  /** Through the approval chain, if the company set one. Returns 'pending' when it moved to the next step. */
  async decide(id: number, decision: 'approved' | 'rejected', note?: string): Promise<'approved' | 'rejected' | 'pending'> {
    const res = must(await supabase.rpc('po_decide', { p_id: id, p_decision: decision, p_note: note || null }));
    try { window.dispatchEvent(new Event('qv-approvals-changed')); } catch { /* the bell catches up on its own */ }
    return res;
  },
  async status(ids: number[]): Promise<Map<number, RequestStatus>> {
    if (!ids.length) return new Map();
    const r = await supabase.rpc('po_status', { p_ids: ids });
    if (r.error) return new Map();
    return new Map((r.data || []).map((s: any) => [Number(s.request_id), s as RequestStatus]));
  },
  /** A draft bill with the order's lines (no price list changes), linked back to the order. */
  async toBill(companyId: number, po: PurchaseOrder, lines: PoLine[]): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const id = await docService.save(companyId, {
      doc_type: 'bill', contact_id: po.contact_id, issue_date: today, currency: po.currency, reference: po.number, status: 'draft',
    } as any, asDocLines(lines).map(l => ({ ...l, price_one_off: true })));
    must(await supabase.from('purchase_orders').update({ document_id: id, status: po.status === 'received' ? 'received' : po.status }).eq('id', po.id));
    return id;
  },
};
