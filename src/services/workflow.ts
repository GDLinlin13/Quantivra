import { supabase } from '../utils/supabase';

// Approval chains for leave and claims (migration 043).
// A chain is a list of steps; each step's approver is the employee's line manager ('@manager') or a role name.

export type FlowKind = 'leave' | 'claim' | 'po';
export const MANAGER = '@manager';
export interface FlowStep { approver: string; min_value: number | null }
export interface Flow { id?: number; kind: FlowKind; is_active: boolean; steps: FlowStep[] }
export interface RequestStatus {
  request_id: number; mode: 'flow' | 'tick' | 'done'; step_no: number; steps_total: number; waiting_for: string | null; can_act: boolean;
}

const must = (r: { data: any; error: any }): any => {
  if (r.error) throw new Error(/approval_|workflow_/i.test(r.error.message) && /relation|exist|schema cache|function/i.test(r.error.message)
    ? 'Workflow needs database update 043 — ask your administrator to run it in Supabase.' : r.error.message);
  return r.data;
};

export const workflowService = {
  async flows(companyId: number): Promise<Record<FlowKind, Flow>> {
    const out: Record<FlowKind, Flow> = { leave: { kind: 'leave', is_active: false, steps: [] }, claim: { kind: 'claim', is_active: false, steps: [] }, po: { kind: 'po', is_active: false, steps: [] } };
    const flows = must(await supabase.from('approval_flows').select('*').eq('company_id', companyId)) || [];
    const steps = flows.length ? must(await supabase.from('approval_flow_steps').select('*').in('flow_id', flows.map((f: any) => f.id)).order('position')) || [] : [];
    for (const f of flows) {
      out[f.kind as FlowKind] = {
        id: f.id, kind: f.kind, is_active: !!f.is_active,
        steps: steps.filter((s: any) => s.flow_id === f.id).map((s: any) => ({ approver: s.approver, min_value: s.min_value == null ? null : Number(s.min_value) })),
      };
    }
    return out;
  },
  async saveFlow(companyId: number, flow: Flow): Promise<void> {
    const id = must(await supabase.from('approval_flows')
      .upsert({ company_id: companyId, kind: flow.kind, is_active: flow.is_active }, { onConflict: 'company_id,kind' }).select('id').single()).id;
    must(await supabase.from('approval_flow_steps').delete().eq('flow_id', id));
    if (flow.steps.length) {
      must(await supabase.from('approval_flow_steps').insert(flow.steps.map((s, i) => ({
        company_id: companyId, flow_id: id, position: i + 1, approver: s.approver, min_value: s.min_value,
      }))));
    }
  },

  /** Where each pending request is, and whether the signed-in person may act on it now. */
  async status(kind: FlowKind, ids: number[]): Promise<Map<number, RequestStatus>> {
    if (!ids.length) return new Map();
    const r = await supabase.rpc('workflow_status', { p_kind: kind, p_ids: ids });
    if (r.error) return new Map();       // before update 043: the screens fall back to the Approve tick
    return new Map((r.data || []).map((s: any) => [Number(s.request_id), s as RequestStatus]));
  },
  /** 'approved' / 'rejected' when final; 'pending' when it moved on to the next step. */
  async decide(kind: FlowKind, id: number, decision: 'approved' | 'rejected', note?: string): Promise<'approved' | 'rejected' | 'pending'> {
    const res = must(await supabase.rpc('workflow_decide', { p_kind: kind, p_id: id, p_decision: decision, p_note: note || null }));
    try { window.dispatchEvent(new Event('qv-approvals-changed')); } catch { /* the bell catches up on its own */ }
    return res;
  },
  /** Which kinds of request this person approves, so the right tabs show. */
  async approverKinds(companyId: number): Promise<FlowKind[]> {
    const r = await supabase.rpc('workflow_approver_kinds', { p_company_id: companyId });
    return r.error ? [] : (r.data || []);
  },
};

export const approverLabel = (a: string) => (a === MANAGER ? 'Line manager' : a);
