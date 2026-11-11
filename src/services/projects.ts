import { supabase } from '../utils/supabase';

// Projects, tasks, milestones and timesheets (migration 042).

export type ProjectStatus = 'planned' | 'active' | 'on_hold' | 'done' | 'cancelled';
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = { planned: 'Planned', active: 'Active', on_hold: 'On hold', done: 'Done', cancelled: 'Cancelled' };
export const PROJECT_STATUS_COLOR: Record<ProjectStatus, string> = { planned: 'default', active: 'blue', on_hold: 'gold', done: 'green', cancelled: 'red' };

export interface Project {
  id: number; company_id: number; code: string | null; name: string; contact_id: number | null; manager_id: number | null;
  status: ProjectStatus; start_date: string | null; end_date: string | null; budget_hours: number | null; notes: string | null;
}
export type TaskStatus = 'todo' | 'doing' | 'done';
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To do', doing: 'In progress', done: 'Done' };
export interface ProjectTask { id: number; company_id: number; project_id: number; title: string; assignee_id: number | null; due_date: string | null; status: TaskStatus }
export interface ProjectMilestone { id: number; company_id: number; project_id: number; title: string; due_date: string | null; done: boolean }
export interface Timesheet { id: number; company_id: number; project_id: number; task_id: number | null; employee_id: number; work_date: string; hours: number; note: string | null }

const must = (r: { data: any; error: any }): any => {
  if (r.error) throw new Error(/project/i.test(r.error.message) && /relation|exist|schema cache/i.test(r.error.message)
    ? 'Projects need database update 042 — ask your administrator to run it in Supabase.' : r.error.message);
  return r.data;
};
const num = (v: any) => (v == null ? null : Number(v));

export const projectService = {
  async list(companyId: number): Promise<Project[]> {
    const rows = must(await supabase.from('projects').select('*').eq('company_id', companyId).order('name')) || [];
    return rows.map((p: any) => ({ ...p, budget_hours: num(p.budget_hours) }));
  },
  async save(companyId: number, p: Partial<Project> & { name: string }): Promise<number> {
    const row = {
      company_id: companyId, code: p.code?.trim() || null, name: p.name.trim(), contact_id: p.contact_id || null, manager_id: p.manager_id || null,
      status: p.status || 'active', start_date: p.start_date || null, end_date: p.end_date || null,
      budget_hours: p.budget_hours == null || p.budget_hours === ('' as any) ? null : Number(p.budget_hours), notes: p.notes?.trim() || null,
    };
    if (p.id) { must(await supabase.from('projects').update(row).eq('id', p.id)); return p.id; }
    return must(await supabase.from('projects').insert(row).select('id').single()).id;
  },
  async remove(id: number) { must(await supabase.from('projects').delete().eq('id', id)); },

  async tasks(companyId: number, projectId?: number): Promise<ProjectTask[]> {
    let q = supabase.from('project_tasks').select('*').eq('company_id', companyId);
    if (projectId) q = q.eq('project_id', projectId);
    return must(await q.order('id')) || [];
  },
  async saveTask(companyId: number, t: Partial<ProjectTask> & { project_id: number; title: string }) {
    const row = { company_id: companyId, project_id: t.project_id, title: t.title.trim(), assignee_id: t.assignee_id || null, due_date: t.due_date || null, status: t.status || 'todo' };
    if (t.id) must(await supabase.from('project_tasks').update(row).eq('id', t.id));
    else must(await supabase.from('project_tasks').insert(row));
  },
  async removeTask(id: number) { must(await supabase.from('project_tasks').delete().eq('id', id)); },

  async milestones(companyId: number, projectId?: number): Promise<ProjectMilestone[]> {
    let q = supabase.from('project_milestones').select('*').eq('company_id', companyId);
    if (projectId) q = q.eq('project_id', projectId);
    return must(await q.order('due_date', { ascending: true })) || [];
  },
  async saveMilestone(companyId: number, m: Partial<ProjectMilestone> & { project_id: number; title: string }) {
    const row = { company_id: companyId, project_id: m.project_id, title: m.title.trim(), due_date: m.due_date || null, done: !!m.done };
    if (m.id) must(await supabase.from('project_milestones').update(row).eq('id', m.id));
    else must(await supabase.from('project_milestones').insert(row));
  },
  async removeMilestone(id: number) { must(await supabase.from('project_milestones').delete().eq('id', id)); },

  async timesheets(companyId: number, opts: { from?: string; to?: string; employeeId?: number; projectId?: number }): Promise<Timesheet[]> {
    let q = supabase.from('project_timesheets').select('*').eq('company_id', companyId);
    if (opts.from) q = q.gte('work_date', opts.from);
    if (opts.to) q = q.lte('work_date', opts.to);
    if (opts.employeeId) q = q.eq('employee_id', opts.employeeId);
    if (opts.projectId) q = q.eq('project_id', opts.projectId);
    const rows = must(await q.order('work_date', { ascending: false }).order('id', { ascending: false })) || [];
    return rows.map((t: any) => ({ ...t, hours: Number(t.hours) }));
  },
  async saveTimesheet(companyId: number, t: Partial<Timesheet> & { project_id: number; employee_id: number; work_date: string; hours: number }) {
    const row = { company_id: companyId, project_id: t.project_id, task_id: t.task_id || null, employee_id: t.employee_id, work_date: t.work_date, hours: Number(t.hours), note: t.note?.trim() || null };
    if (t.id) must(await supabase.from('project_timesheets').update(row).eq('id', t.id));
    else must(await supabase.from('project_timesheets').insert(row));
  },
  async removeTimesheet(id: number) { must(await supabase.from('project_timesheets').delete().eq('id', id)); },
};

/** 7.5 → "7.5 h" */
export const hoursLabel = (h: number) => `${Math.round(h * 100) / 100} h`;
