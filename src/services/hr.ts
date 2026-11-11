import { supabase } from '../utils/supabase';
import { computeLeaveEntitlement } from '../data/leave-rules';
import { normalisePattern, DEFAULT_WORK_PATTERN, type CountMethod, type WorkPattern } from '../utils/workdays';
import { officialHolidays } from '../data/public-holidays';

export interface Dependent {
  id?: number;
  employee_id?: number;
  name: string | null;
  relationship: string;
  date_of_birth: string | null;
  citizenship: string | null;
}

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
  marital_status: string | null;
  gender: string | null;
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

  async dependents(employeeId: number): Promise<Dependent[]> {
    const { data } = await supabase.from('employee_dependents').select('*').eq('employee_id', employeeId).order('date_of_birth');
    return data || [];
  },

  async saveDependents(companyId: number, employeeId: number, list: Partial<Dependent>[]) {
    await supabase.from('employee_dependents').delete().eq('employee_id', employeeId);
    const rows = list.filter(d => d.relationship).map(d => ({
      company_id: companyId, employee_id: employeeId,
      name: d.name || null, relationship: d.relationship || 'child',
      date_of_birth: d.date_of_birth || null, citizenship: d.citizenship || null,
    }));
    if (rows.length) {
      const { error } = await supabase.from('employee_dependents').insert(rows);
      if (error) throw new Error(error.message);
    }
  },

  async addDepartment(companyId: number, name: string) {
    const { error } = await supabase.from('hr_departments').insert({ company_id: companyId, name });
    if (error) throw new Error(error.message);
  },
};

export interface LeaveType {
  id: number; company_id: number; name: string; code: string | null;
  default_days: number; statutory_min: number; is_paid: boolean; requires_approval: boolean;
  carry_forward_cap: number; encashable: boolean; color: string; active: boolean;
  /** company policy: extra days per completed year of service, capped at max_days */
  increment_per_year: number; max_days: number | null;
  /** working_days: skip rest days & holidays; weeks: whole 7-day blocks (entitlement in weeks) */
  count_method: CountMethod; allow_single_days: boolean;
  /** leave policy (migration 044) */
  min_notice_days?: number; quota_days?: number | null; quota_period?: 'week' | 'month' | null;
  /** false for leave that is not being away (work from home) */
  counts_as_absence?: boolean;
  /** time off in lieu: HR adds it to an employee's balance when it has been earned */
  is_toil?: boolean;
}

export interface LeavePolicy { max_off_per_day: number | null; max_off_scope: 'company' | 'department'; min_at_work_per_department: number | null }
export interface ToilCredit {
  id: number; company_id: number; employee_id: number; leave_type_id: number; amount: number; worked_date: string; reason: string | null; created_at: string;
}

/** One row of the "start new leave year" preview. */
export interface LeaveYearRow {
  employee: Employee; leaveType: LeaveType;
  entitled: number; carried: number; unusedLastYear: number; basis: string;
}

function entitlementFor(lt: LeaveType, employee: Employee, deps: Dependent[], countryCode: string, year: number) {
  const ent = entitlementInDays(lt, employee, deps, countryCode, year);
  // Country rules speak in working days (5 per week); week-based types hold weeks.
  if (lt.count_method === 'weeks' && ent.computed) {
    return { ...ent, days: Math.round((ent.days / 5) * 100) / 100, statutoryMin: Math.round((ent.statutoryMin / 5) * 100) / 100 };
  }
  return ent;
}

function entitlementInDays(lt: LeaveType, employee: Employee, deps: Dependent[], countryCode: string, year: number) {
  return computeLeaveEntitlement({
    leaveTypeName: lt.name, countryCode,
    employee: {
      residency_status: employee.residency_status, marital_status: employee.marital_status,
      join_date: employee.join_date, employment_type: employee.employment_type, gender: employee.gender,
    },
    dependents: deps.map(d => ({ relationship: d.relationship, date_of_birth: d.date_of_birth, citizenship: d.citizenship })),
    templateDefault: Number(lt.default_days), statutoryMin: Number(lt.statutory_min || 0),
    incrementPerYear: Number(lt.increment_per_year || 0),
    maxDays: lt.max_days == null ? null : Number(lt.max_days),
    // Service is counted as at 1 January of the leave year.
    asOf: new Date(`${year}-01-01T00:00:00`),
  });
}

/** Unused days from last year that may roll over, limited by the type's carry-forward cap. */
export function carryForward(prev: Pick<LeaveBalance, 'entitled_days' | 'carried_days' | 'taken_days'> | undefined, cap: number) {
  if (!prev) return { unused: 0, carried: 0 };
  const unused = Math.max(0, Number(prev.entitled_days) + Number(prev.carried_days || 0) - Number(prev.taken_days || 0));
  return { unused, carried: Math.min(unused, Math.max(0, Number(cap || 0))) };
}

export interface LeaveBalance {
  id: number; employee_id: number; leave_type_id: number; year: number;
  entitled_days: number; carried_days: number; taken_days: number; pending_days: number;
  entitlement_source: 'auto' | 'manual'; entitlement_basis: string | null; below_statutory: boolean;
}

export interface LeaveRequest {
  id: number; company_id: number; employee_id: number; leave_type_id: number;
  start_date: string; end_date: string; half_day: boolean; days: number;
  reason: string | null; status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  applied_at: string; decided_by: number | null; decided_at: string | null; decision_note: string | null;
  employees?: { full_name: string; employee_code: string };
  leave_types?: { name: string; color: string; count_method?: string };
}

export const leaveService = {
  async types(companyId: number): Promise<LeaveType[]> {
    const { data } = await supabase.from('leave_types').select('*').eq('company_id', companyId).order('name');
    return data || [];
  },

  /** Company-wide rules: most people off at once, fewest at work per department (before update 044: none). */
  async policy(companyId: number): Promise<LeavePolicy> {
    const r = await supabase.from('leave_policy').select('*').eq('company_id', companyId).maybeSingle();
    return r.data ? { max_off_per_day: r.data.max_off_per_day, max_off_scope: r.data.max_off_scope, min_at_work_per_department: r.data.min_at_work_per_department }
      : { max_off_per_day: null, max_off_scope: 'company', min_at_work_per_department: null };
  },
  async savePolicy(companyId: number, p: LeavePolicy) {
    const { error } = await supabase.from('leave_policy').upsert({ company_id: companyId, ...p, updated_at: new Date().toISOString() }, { onConflict: 'company_id' });
    if (error) throw new Error(/leave_policy/i.test(error.message) && /relation|exist|schema cache/i.test(error.message) ? 'Leave policy needs database update 044 — ask your administrator to run it in Supabase.' : error.message);
  },

  async toilCredits(companyId: number, employeeId?: number): Promise<ToilCredit[]> {
    let q = supabase.from('toil_credits').select('*').eq('company_id', companyId);
    if (employeeId) q = q.eq('employee_id', employeeId);
    const r = await q.order('created_at', { ascending: false });
    return r.error ? [] : (r.data || []).map((c: any) => ({ ...c, amount: Number(c.amount) }));
  },
  /** HR adds time off in lieu (days or hours, as the leave type counts) to an employee's balance. */
  async grantToil(employeeId: number, leaveTypeId: number, amount: number, workedDate: string, reason?: string): Promise<number> {
    const { data, error } = await supabase.rpc('toil_grant', { p_employee_id: employeeId, p_type_id: leaveTypeId, p_amount: amount, p_worked_date: workedDate, p_reason: reason || null });
    if (error) throw new Error(error.message);
    return data as number;
  },
  async revokeToil(id: number) {
    const { error } = await supabase.rpc('toil_revoke', { p_id: id });
    if (error) throw new Error(error.message);
  },

  async saveType(t: Partial<LeaveType> & { company_id: number; name: string }) {
    if (t.id) {
      // id / company / created_at are fixed: sending them back makes the update fail.
      const { id, company_id: _company, created_at: _created, ...changes } = t as any;
      const { error } = await supabase.from('leave_types').update(changes).eq('id', id);
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
      .select('*, employees(full_name, employee_code), leave_types(name, color, count_method)')
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

  /**
   * Ensure a balance row exists for every active leave type and (re)compute the
   * auto entitlements from the employee's facts + dependents. Manual overrides
   * are left alone but re-checked against the statutory minimum.
   */
  async syncEntitlements(companyId: number, employee: Employee, countryCode: string, year: number,
    carriedByType?: Map<number, number>) {
    const [types, deps, existing] = await Promise.all([
      this.types(companyId),
      hrService.dependents(employee.id),
      this.balances(employee.id, year),
    ]);
    const byType = new Map(existing.map(b => [b.leave_type_id, b]));

    for (const lt of types.filter(t => t.active)) {
      const ent = entitlementFor(lt, employee, deps, countryCode, year);
      const row = byType.get(lt.id);
      const carried = carriedByType?.get(lt.id);

      if (!row) {
        const { error } = await supabase.from('leave_balances').insert({
          company_id: companyId, employee_id: employee.id, leave_type_id: lt.id, year,
          entitled_days: ent.days, carried_days: carried ?? 0, entitlement_source: 'auto',
          entitlement_basis: ent.basis, below_statutory: false,
        });
        if (error) throw new Error(error.message);
      } else if (row.entitlement_source === 'auto') {
        const { error } = await supabase.from('leave_balances').update({
          entitled_days: ent.days, entitlement_basis: ent.basis, below_statutory: false,
          ...(carried !== undefined ? { carried_days: carried } : {}),
        }).eq('id', row.id);
        if (error) throw new Error(error.message);
      } else {
        // manual override: keep the days, refresh the compliance flag (and carry-over)
        const { error } = await supabase.from('leave_balances').update({
          below_statutory: Number(row.entitled_days) < ent.statutoryMin,
          ...(carried !== undefined ? { carried_days: carried } : {}),
        }).eq('id', row.id);
        if (error) throw new Error(error.message);
      }
    }
  },

  /** Explain how each leave type's entitlement is derived for one employee (for the UI). */
  explain(types: LeaveType[], employee: Employee, deps: Dependent[], countryCode: string, year: number) {
    return types.filter(t => t.active).map(lt => ({
      leaveType: lt,
      ...entitlementFor(lt, employee, deps, countryCode, year),
    }));
  },

  /** What starting a new leave year would do: new entitlement + carried-over days, per employee and type. */
  async previewLeaveYear(companyId: number, countryCode: string, year: number): Promise<LeaveYearRow[]> {
    const [emps, types, prevAll] = await Promise.all([
      hrService.listEmployees(companyId),
      this.types(companyId),
      supabase.from('leave_balances').select('*').eq('company_id', companyId).eq('year', year - 1)
        .then(({ data }) => (data || []) as LeaveBalance[]),
    ]);
    const rows: LeaveYearRow[] = [];
    for (const e of emps.filter(x => x.status === 'active')) {
      const deps = await hrService.dependents(e.id);
      for (const lt of types.filter(t => t.active)) {
        const ent = entitlementFor(lt, e, deps, countryCode, year);
        const prev = prevAll.find(b => b.employee_id === e.id && b.leave_type_id === lt.id);
        const cf = carryForward(prev, lt.carry_forward_cap);
        rows.push({ employee: e, leaveType: lt, entitled: ent.days, carried: cf.carried, unusedLastYear: cf.unused, basis: ent.basis });
      }
    }
    return rows;
  },

  /** Create (or refresh) every active employee's balances for a new leave year, carrying over unused days. */
  async startLeaveYear(companyId: number, countryCode: string, year: number) {
    const preview = await this.previewLeaveYear(companyId, countryCode, year);
    const byEmployee = new Map<number, { employee: Employee; carried: Map<number, number> }>();
    for (const r of preview) {
      const entry = byEmployee.get(r.employee.id) ?? { employee: r.employee, carried: new Map() };
      entry.carried.set(r.leaveType.id, r.carried);
      byEmployee.set(r.employee.id, entry);
    }
    for (const { employee, carried } of byEmployee.values()) {
      await this.syncEntitlements(companyId, employee, countryCode, year, carried);
    }
    return { employees: byEmployee.size };
  },

  async setEntitlement(balanceId: number, days: number, source: 'auto' | 'manual', statutoryMin: number) {
    const { error } = await supabase.from('leave_balances').update({
      entitled_days: days, entitlement_source: source,
      below_statutory: source === 'manual' && days < statutoryMin,
      entitlement_basis: source === 'manual' ? 'Manually set by HR' : null,
    }).eq('id', balanceId);
    if (error) throw new Error(error.message);
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

/** Work weeks and public holidays, used to count leave correctly. */
export const calendarService = {
  async companyPattern(companyId: number): Promise<WorkPattern> {
    const { data } = await supabase.from('company_settings').select('value')
      .eq('company_id', companyId).eq('category', 'company').eq('key', 'work_pattern').maybeSingle();
    return data?.value ? normalisePattern(data.value as Partial<WorkPattern>) : DEFAULT_WORK_PATTERN;
  },

  async saveCompanyPattern(companyId: number, pattern: WorkPattern) {
    const { error } = await supabase.from('company_settings').upsert(
      { company_id: companyId, category: 'company', key: 'work_pattern', value: pattern },
      { onConflict: 'company_id,category,key' });
    if (error) throw new Error(error.message);
  },

  /** The employee's own work week, or null when they follow the company's. */
  async employeePattern(employeeId: number): Promise<WorkPattern | null> {
    const { data } = await supabase.from('employee_work_patterns').select('pattern').eq('employee_id', employeeId).maybeSingle();
    return data?.pattern ? normalisePattern(data.pattern as Partial<WorkPattern>) : null;
  },

  async saveEmployeePattern(companyId: number, employeeId: number, pattern: WorkPattern | null) {
    if (!pattern) {
      const { error } = await supabase.from('employee_work_patterns').delete().eq('employee_id', employeeId);
      if (error) throw new Error(error.message);
      return;
    }
    const { error } = await supabase.from('employee_work_patterns').upsert(
      { employee_id: employeeId, company_id: companyId, pattern, updated_at: new Date().toISOString() },
      { onConflict: 'employee_id' });
    if (error) throw new Error(error.message);
  },

  async effectivePattern(companyId: number, employeeId: number): Promise<WorkPattern> {
    return (await this.employeePattern(employeeId)) ?? (await this.companyPattern(companyId));
  },

  async holidays(companyId: number, from: string, to: string) {
    const { data, error } = await supabase.from('company_holidays').select('*')
      .eq('company_id', companyId).gte('holiday_date', from).lte('holiday_date', to).order('holiday_date');
    if (error) throw new Error(error.message);
    return (data || []) as { id: number; holiday_date: string; name: string; source: 'official' | 'company' }[];
  },

  async holidaySet(companyId: number, from: string, to: string): Promise<Set<string>> {
    return new Set((await this.holidays(companyId, from, to)).map(h => h.holiday_date));
  },

  async addHoliday(companyId: number, date: string, name: string) {
    const { error } = await supabase.from('company_holidays').upsert(
      { company_id: companyId, holiday_date: date, name, source: 'company' }, { onConflict: 'company_id,holiday_date' });
    if (error) throw new Error(error.message);
  },

  async deleteHoliday(id: number) {
    const { error } = await supabase.from('company_holidays').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  /** Add the country's official holidays for a year (existing dates are left alone). */
  async importOfficial(companyId: number, country: string, year: number): Promise<number> {
    const list = officialHolidays(country, year);
    if (!list.length) return 0;
    const { error } = await supabase.from('company_holidays').upsert(
      list.map(h => ({ company_id: companyId, holiday_date: h.date, name: h.name, source: 'official' })),
      { onConflict: 'company_id,holiday_date', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return list.length;
  },
};
