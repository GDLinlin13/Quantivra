import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
// Service-role key: put it in scripts/key.txt (gitignored) or the SUPABASE_SERVICE_KEY env var.
const SVC = process.env.SUPABASE_SERVICE_KEY
  || readFileSync(new URL('./key.txt', import.meta.url), 'utf8').trim();
const s = createClient('https://zxutyxqyvfnadbdabwvf.supabase.co', SVC);

// company
let { data: co } = await s.from('companies').select('*').eq('company_code', 'testco').maybeSingle();
if (!co) {
  const r = await s.from('companies').insert({
    name: 'Testco Pte Ltd', company_code: 'testco', country: 'SG', currency: 'SGD',
    industry: 'General', business_type: 'General', financial_year_start: '01-01',
    timezone: 'Asia/Singapore', modules: ['hr'], is_active: true,
  }).select().single();
  if (r.error) throw r.error;
  co = r.data;
}
console.log('company', co.id);

// owner + a staff user
async function mkUser(email, name, title, pw) {
  // Supabase Auth login (needs migration 011). Re-running resets the password.
  let authId;
  const created = await s.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (created.data?.user) authId = created.data.user.id;
  else {
    const found = await s.rpc('app_find_auth_user', { p_email: email });
    if (found.error || !found.data) throw created.error || found.error;
    authId = found.data;
    await s.auth.admin.updateUserById(authId, { password: pw });
  }
  let { data: u } = await s.from('company_users').select('*').eq('company_id', co.id).eq('email', email).maybeSingle();
  if (!u) {
    const r = await s.from('company_users').insert({ company_id: co.id, email, full_name: name, job_title: title, auth_user_id: authId, is_active: true }).select().single();
    if (r.error) throw r.error;
    u = r.data;
  } else if (u.auth_user_id !== authId) {
    await s.from('company_users').update({ auth_user_id: authId }).eq('id', u.id);
  }
  return u;
}
const owner = await mkUser('alice@testco.sg', 'Alice Tan', 'Director', 'test1234');
const staff = await mkUser('bob@testco.sg', 'Bob Lim', 'Engineer', 'test1234');
console.log('users', owner.id, staff.id);

// departments
for (const name of ['Management', 'Engineering', 'HR']) {
  await s.from('hr_departments').upsert({ company_id: co.id, name }, { onConflict: 'company_id,name' });
}
const { data: depts } = await s.from('hr_departments').select('*').eq('company_id', co.id);
const eng = depts.find(d => d.name === 'Engineering');

// leave types
const lts = [
  { name: 'Annual Leave', default_days: 14, carry_forward_cap: 7, encashable: true },
  { name: 'Sick Leave', default_days: 14, carry_forward_cap: 0, encashable: false },
  { name: 'Hospitalisation Leave', default_days: 60, carry_forward_cap: 0, encashable: false },
];
for (const lt of lts) {
  const { data: ex } = await s.from('leave_types').select('id').eq('company_id', co.id).eq('name', lt.name).maybeSingle();
  if (!ex) await s.from('leave_types').insert({ company_id: co.id, ...lt, is_paid: true, requires_approval: true, active: true });
}

// employees via RPC (encrypts PII)
async function mkEmp(p) {
  const { data: ex } = await s.from('employees').select('id').eq('company_id', co.id).eq('employee_code', p.employee_code).maybeSingle();
  const { data, error } = await s.rpc('hr_upsert_employee', { p: { company_id: co.id, id: ex ? String(ex.id) : '', ...p } });
  if (error) throw error;
  return data;
}
const aliceEmp = await mkEmp({ user_id: String(owner.id), employee_code: 'EMP-001', full_name: 'Alice Tan', email: 'alice@testco.sg', job_title: 'Director', department_id: String(depts.find(d => d.name === 'Management').id), status: 'active', join_date: '2025-01-06', date_of_birth: '1985-04-12', residency_status: 'SC', ethnicity: 'chinese', base_salary: '9000', national_id: 'S8811223A', tax_id: 'S8811223A', bank_account: '123-45678-9', bank_name: 'DBS' });
const bobEmp = await mkEmp({ user_id: String(staff.id), employee_code: 'EMP-002', full_name: 'Bob Lim', email: 'bob@testco.sg', job_title: 'Engineer', department_id: String(eng.id), manager_id: String(aliceEmp), status: 'active', join_date: '2025-03-01', date_of_birth: '1996-09-20', residency_status: 'SC', ethnicity: 'indian', base_salary: '4500', national_id: 'S9002334B', tax_id: 'S9002334B', bank_account: '987-65432-1', bank_name: 'OCBC' });
console.log('employees', aliceEmp, bobEmp);

// verify PII round-trips (decrypted through the RPC view)
const { data: emps } = await s.rpc('hr_list_employees', { p_company_id: co.id });
console.log(emps.map(e => ({ code: e.employee_code, name: e.full_name, nric: e.national_id, bank: e.bank_account, mgr: e.manager_name })));

// raw check: national_id_enc must be bytea, not readable
const { data: raw } = await s.from('employees').select('employee_code, national_id_enc').eq('company_id', co.id);
console.log('ciphertext sample:', raw[0].employee_code, String(raw[0].national_id_enc).slice(0, 24), '...');

console.log('\nLOGIN: company code "testco",  alice@testco.sg / test1234  (or bob@testco.sg / test1234)');
