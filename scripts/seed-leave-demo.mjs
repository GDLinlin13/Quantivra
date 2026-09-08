import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const s = createClient('https://zxutyxqyvfnadbdabwvf.supabase.co', readFileSync(new URL('./key.txt', import.meta.url), 'utf8').trim());

const { data: co } = await s.from('companies').select('id').eq('company_code', 'testco').single();

// full SG leave type set with statutory minimums
const types = [
  { name: 'Annual Leave', default_days: 14, statutory_min: 7, carry_forward_cap: 7, encashable: true, color: '#4fc3f7' },
  { name: 'Sick Leave', default_days: 14, statutory_min: 14, carry_forward_cap: 0, color: '#f6c26b' },
  { name: 'Hospitalisation Leave', default_days: 60, statutory_min: 60, carry_forward_cap: 0, color: '#e08bb0' },
  { name: 'Maternity Leave', default_days: 80, statutory_min: 40, carry_forward_cap: 0, color: '#b39ddb' },
  { name: 'Paternity Leave', default_days: 20, statutory_min: 20, carry_forward_cap: 0, color: '#80cbc4' },
  { name: 'Childcare Leave', default_days: 6, statutory_min: 2, carry_forward_cap: 0, color: '#a5d6a7' },
];
for (const t of types) {
  const { data: ex } = await s.from('leave_types').select('id').eq('company_id', co.id).eq('name', t.name).maybeSingle();
  if (ex) await s.from('leave_types').update({ ...t, is_paid: true, requires_approval: true, active: true }).eq('id', ex.id);
  else await s.from('leave_types').insert({ company_id: co.id, ...t, is_paid: true, requires_approval: true, active: true });
}

// Bob: married, with a young citizen child + set marital status
const { data: bob } = await s.from('employees').select('id').eq('company_id', co.id).eq('employee_code', 'EMP-002').single();
await s.rpc('hr_upsert_employee', { p: { company_id: String(co.id), id: String(bob.id), employee_code: 'EMP-002', full_name: 'Bob Lim', residency_status: 'SC', marital_status: 'married', ethnicity: 'indian', date_of_birth: '1996-09-20', join_date: '2023-03-01', base_salary: '4500' } });
await s.from('employee_dependents').delete().eq('employee_id', bob.id);
await s.from('employee_dependents').insert({ company_id: co.id, employee_id: bob.id, name: 'Lim Junior', relationship: 'child', date_of_birth: '2022-05-10', citizenship: 'SC' });

// Alice: married, citizen, no dependents, long service
const { data: alice } = await s.from('employees').select('id').eq('company_id', co.id).eq('employee_code', 'EMP-001').single();
await s.rpc('hr_upsert_employee', { p: { company_id: String(co.id), id: String(alice.id), employee_code: 'EMP-001', full_name: 'Alice Tan', residency_status: 'SC', marital_status: 'married', ethnicity: 'chinese', date_of_birth: '1985-04-12', join_date: '2019-01-06', base_salary: '9000' } });

// clear stale balances so they recompute fresh
await s.from('leave_balances').delete().eq('company_id', co.id);
console.log('leave demo seeded — Bob has a citizen child (age ~4), Alice 7yr service');
