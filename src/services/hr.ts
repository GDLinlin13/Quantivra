import { supabase } from '../utils/supabase';

export interface Employee {
  id: number;
  employee_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  employment_type: string;
  join_date: string | null;
  exit_date: string | null;
  base_salary: number;
  status: string;
  department_id: number | null;
  department_name: string | null;
  manager_id: number | null;
  manager_name: string | null;
  user_id: number | null;
  date_of_birth: string | null;
  residency_status: string | null;
  pr_stage: string | null;
  ethnicity: string | null;
  national_id: string | null;
  tax_id: string | null;
  bank_account: string | null;
  bank_name: string | null;
}

export const hrService = {
  async listEmployees(companyId: number): Promise<Employee[]> {
    const { data, error } = await supabase.rpc('hr_list_employees', { p_company_id: companyId });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async upsertEmployee(payload: Record<string, unknown>): Promise<number> {
    const { data, error } = await supabase.rpc('hr_upsert_employee', { p: payload });
    if (error) throw new Error(error.message);
    return data as number;
  },

  async deleteEmployee(id: number): Promise<void> {
    const { error } = await supabase.rpc('hr_delete_employee', { p_id: id });
    if (error) throw new Error(error.message);
  },

  async departments(companyId: number) {
    const { data } = await supabase.from('hr_departments').select('*').eq('company_id', companyId).order('name');
    return data || [];
  },

  async addDepartment(companyId: number, name: string) {
    const { error } = await supabase.from('hr_departments').insert({ company_id: companyId, name });
    if (error) throw new Error(error.message);
  },
};

export interface LeaveType {
  id: number; company_id: number; name: string; code: string | null;
  default_days: number; is_paid: boolean; requires_approval: boolean;
  carry_forward_cap: number; encashable: boolean; color: string; active: boolean;
}

export interface LeaveBalance {
  id: number; employee_id: number; leave_type_id: number; year: number;
  entitled_days: number; carried_days: number; taken_days: number; pending_days: number;
}

export interface LeaveRequest {
  id: number; company_id: number; employee_id: number; leave_type_id: number;
  start_date: string; end_date: string; half_day: boolean; days: number;
  reason: string | null; status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  applied_at: string; decided_by: number | null; decided_at: string | null; decision_note: string | null;
  employees?: { full_name: string; employee_code: string };
  leave_types?: { name: string; color: string };
}

export const leaveService = {
  async types(companyId: number): Promise<LeaveType[]> {
    const { data } = await supabase.from('leave_types').select('*').eq('company_id', companyId).order('name');
    return data || [];
  },

  async saveType(t: Partial<LeaveType> & { company_id: number; name: string }) {
    if (t.id) {
      const { error } = await supabase.from('leave_types').update(t).eq('id', t.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from('leave_types').insert(t);
      if (error) throw new Error(error.message);
    }
  },

  async myEmployeeRecord(companyId: number, userId: number) {
    const list = await hrService.listEmployees(companyId);
    return list.find(e => e.user_id === userId) || null;
  },

  async balances(employeeId: number, year: number): Promise<LeaveBalance[]> {
    const { data } = await supabase.from('leave_balances').select('*').eq('employee_id', employeeId).eq('year', year);
    return data || [];
  },

  async requests(companyId: number, opts: { employeeId?: number; status?: string } = {}): Promise<LeaveRequest[]> {
    let q = supabase.from('leave_requests')
      .select('*, employees(full_name, employee_code), leave_types(name, color)')
      .eq('company_id', companyId).order('applied_at', { ascending: false });
    if (opts.employeeId) q = q.eq('employee_id', opts.employeeId);
    if (opts.status) q = q.eq('status', opts.status);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data as LeaveRequest[]) || [];
  },

  async apply(payload: Record<string, unknown>): Promise<number> {
    const { data, error } = await supabase.rpc('leave_apply', { p: payload });
    if (error) throw new Error(error.message);
    return data as number;
  },

  async decide(requestId: number, decision: 'approved' | 'rejected', note: string, decidedBy: number) {
    const { error } = await supabase.rpc('leave_decide', {
      p_request_id: requestId, p_decision: decision, p_note: note, p_decided_by: decidedBy,
    });
    if (error) throw new Error(error.message);
  },

  async ensureBalance(companyId: number, employeeId: number, leaveTypeId: number, year: number, entitled: number) {
    const { data } = await supabase.from('leave_balances').select('id')
      .eq('employee_id', employeeId).eq('leave_type_id', leaveTypeId).eq('year', year).maybeSingle();
    if (!data) {
      await supabase.from('leave_balances').insert({
        company_id: companyId, employee_id: employeeId, leave_type_id: leaveTypeId, year, entitled_days: entitled,
      });
    }
  },
};

/** Whole days between two dates inclusive, minus weekends. Half-day => 0.5. */
export function businessDays(start: string, end: string, halfDay: boolean): number {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  if (e < s) return 0;
  let count = 0;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  if (halfDay && count > 0) return count - 0.5;
  return count;
}
