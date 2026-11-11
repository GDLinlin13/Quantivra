import { supabase } from '../utils/supabase';

// Clocking in and out (migration 041). People with Attendance → view clock themselves; the database stamps
// the time. People with Attendance → create / edit see everyone's hours and can add or correct entries.

export interface AttendanceLog {
  id: number; company_id: number; employee_id: number; work_date: string;
  clock_in: string; clock_out: string | null; note: string | null; source: 'clock' | 'manual';
}

const must = (r: { data: any; error: any }): any => {
  if (r.error) throw new Error(/attendance_logs/i.test(r.error.message) && /relation|exist|schema cache/i.test(r.error.message)
    ? 'Attendance needs database update 041 — ask your administrator to run it in Supabase.' : r.error.message);
  return r.data;
};

/** Worked time of one shift in minutes (an open shift counts up to `now`). */
export const minutesOf = (l: Pick<AttendanceLog, 'clock_in' | 'clock_out'>, now = Date.now()) =>
  Math.max(0, Math.round(((l.clock_out ? Date.parse(l.clock_out) : now) - Date.parse(l.clock_in)) / 60000));

/** 7h 05m */
export const hoursText = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;

export const attendanceService = {
  async list(companyId: number, opts: { from: string; to: string; employeeId?: number }): Promise<AttendanceLog[]> {
    let q = supabase.from('attendance_logs').select('*').eq('company_id', companyId).gte('work_date', opts.from).lte('work_date', opts.to);
    if (opts.employeeId) q = q.eq('employee_id', opts.employeeId);
    return must(await q.order('clock_in', { ascending: false })) || [];
  },
  /** The shift this person has not clocked out of yet, if any. */
  async open(employeeId: number): Promise<AttendanceLog | null> {
    const r = await supabase.from('attendance_logs').select('*').eq('employee_id', employeeId).is('clock_out', null).maybeSingle();
    if (r.error) must(r);
    return r.data || null;
  },
  async clockIn(companyId: number, employeeId: number, note?: string): Promise<void> {
    // the time and day are set by the database; these are placeholders it replaces
    const now = new Date();
    must(await supabase.from('attendance_logs').insert({
      company_id: companyId, employee_id: employeeId, clock_in: now.toISOString(),
      work_date: now.toISOString().slice(0, 10), note: note?.trim() || null, source: 'clock',
    }));
  },
  async clockOut(id: number, note?: string): Promise<void> {
    const r = await supabase.from('attendance_logs').update({ clock_out: new Date().toISOString(), ...(note?.trim() ? { note: note.trim() } : {}) }).eq('id', id).select('id');
    if (r.error) must(r);
    if (!r.data?.length) throw new Error('This shift is already closed');
  },
  /** Add or correct an entry (Attendance → create / edit). Times are ISO strings. */
  async save(companyId: number, a: { id?: number; employee_id: number; clock_in: string; clock_out: string | null; note?: string | null }): Promise<void> {
    const row = {
      company_id: companyId, employee_id: a.employee_id, clock_in: a.clock_in, clock_out: a.clock_out,
      work_date: a.clock_in.slice(0, 10), note: a.note?.trim() || null, source: 'manual' as const,
    };
    if (a.id) must(await supabase.from('attendance_logs').update(row).eq('id', a.id));
    else must(await supabase.from('attendance_logs').insert(row));
  },
  async remove(id: number): Promise<void> { must(await supabase.from('attendance_logs').delete().eq('id', id)); },
};
