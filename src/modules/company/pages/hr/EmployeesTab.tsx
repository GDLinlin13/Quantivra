import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, message, Tag, Space, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { hrService, calendarService, type Employee } from '../../../../services/hr';
import { adminUsersService, MIN_PASSWORD_LENGTH } from '../../../../services/adminUsers';
import { useCompanyAccess } from '../../../../contexts/CompanyAccess';
import { USERNAME_PATTERN, USERNAME_RULE_TEXT } from '../../../../utils/loginEmail';
import { WORK_PATTERN_PRESETS, presetKeyOf, describePattern, type WorkPattern } from '../../../../utils/workdays';
import { supabase } from '../../../../utils/supabase';
import { residencyOptions, defaultResidency } from '../../../../data/residency-options';

const EMP_TYPES = ['full_time', 'part_time', 'contract', 'intern', 'casual'];

export function EmployeesTab({ companyId }: { companyId: number }) {
  const { canViewPay } = useCompanyAccess();
  const [roles, setRoles] = useState<any[]>([]);
  const [rows, setRows] = useState<Employee[]>([]);
  const [depts, setDepts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [country, setCountry] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, d, u, co] = await Promise.all([
        hrService.listEmployees(companyId),
        hrService.departments(companyId),
        supabase.from('company_users').select('id, full_name, username, email').eq('company_id', companyId),
        supabase.from('companies').select('country').eq('id', companyId).maybeSingle(),
      ]);
      setRows(e); setDepts(d); setUsers(u.data || []); setCountry(co.data?.country ?? null);
      const { data: rs } = await supabase.from('company_roles').select('id, name, can_view_pay').eq('company_id', companyId).order('name');
      setRoles(rs || []);
    } catch (err: any) { message.error(err.message); }
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const [deps, setDeps] = useState<any[]>([]);
  const [customPattern, setCustomPattern] = useState<WorkPattern | null>(null);

  const openNew = () => {
    setEditing(null); setDeps([]); setCustomPattern(null);
    form.resetFields();
    form.setFieldsValue({ signin_mode: 'new', work_week: 'company', employment_type: 'full_time', status: 'active', residency_status: defaultResidency(country), marital_status: 'single', employee_code: `EMP-${String(rows.length + 1).padStart(3, '0')}` });
    setOpen(true);
  };

  const openEdit = async (r: Employee) => {
    setEditing(r);
    const [d, pat] = await Promise.all([hrService.dependents(r.id), calendarService.employeePattern(r.id)]);
    setDeps(d);
    setCustomPattern(pat && !presetKeyOf(pat) ? pat : null);
    form.setFieldsValue({
      ...r,
      work_week: !pat ? 'company' : (presetKeyOf(pat) ?? 'custom'),
      signin_mode: r.user_id ? undefined : 'none',
      join_date: r.join_date ? dayjs(r.join_date) : null,
      exit_date: r.exit_date ? dayjs(r.exit_date) : null,
      date_of_birth: r.date_of_birth ? dayjs(r.date_of_birth) : null,
    });
    setOpen(true);
  };

  const submit = async (formValues: any) => {
    const { work_week, signin_mode, signin_username, signin_password, signin_role_id, signin_existing_user, user_id: _ignored, ...v } = formValues;
    try {
      const id = await hrService.upsertEmployee({
        id: editing?.id ?? '',
        company_id: companyId,
        ...v,
        join_date: v.join_date ? dayjs(v.join_date).format('YYYY-MM-DD') : '',
        exit_date: v.exit_date ? dayjs(v.exit_date).format('YYYY-MM-DD') : '',
        date_of_birth: v.date_of_birth ? dayjs(v.date_of_birth).format('YYYY-MM-DD') : '',
        pr_stage: v.residency_status === 'PR' ? (v.pr_stage || 'year_3_plus') : '',
        manager_id: v.manager_id ?? '',
        department_id: v.department_id ?? '',
        // only sent when linking an existing sign-in; otherwise the link is left as is
        ...(signin_mode === 'existing' && signin_existing_user ? { user_id: signin_existing_user } : {}),
      });
      if (work_week !== 'custom') {
        await calendarService.saveEmployeePattern(companyId, id,
          work_week && work_week !== 'company' ? WORK_PATTERN_PRESETS[work_week].pattern : null);
      }
      await hrService.saveDependents(companyId, id, deps.map(d => ({
        ...d, date_of_birth: d.date_of_birth ? dayjs(d.date_of_birth).format('YYYY-MM-DD') : null,
      })));
      // One person, one login: create their sign-in and attach it here.
      if (signin_mode === 'new' && signin_username && !editing?.user_id) {
        await adminUsersService.createCompanyUser({
          company_id: companyId, employee_id: id, username: signin_username, password: signin_password,
          full_name: v.full_name, email: v.email || undefined, role_id: signin_role_id,
        });
        message.success(`Sign-in created for ${v.full_name}. They choose their own password at first sign-in.`);
      }
      message.success(editing ? 'Employee updated' : 'Employee added');
      setOpen(false);
      load();
    } catch (err: any) { message.error(err.message); }
  };

  const columns = [
    { title: 'Code', dataIndex: 'employee_code', key: 'code' },
    { title: 'Name', dataIndex: 'full_name', key: 'name', render: (v: string) => <span style={{ color: '#f0ede6' }}>{v}</span> },
    { title: 'Job Title', dataIndex: 'job_title', key: 'jt' },
    { title: 'Department', dataIndex: 'department_name', key: 'dept', render: (v: string) => v || '—' },
    { title: 'Manager', dataIndex: 'manager_name', key: 'mgr', render: (v: string) => v || '—' },
    { title: 'Type', dataIndex: 'employment_type', key: 'type', render: (v: string) => <Tag>{v.replace('_', ' ')}</Tag> },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={v === 'active' ? 'green' : v === 'on_leave' ? 'gold' : 'red'}>{v.replace('_', ' ')}</Tag> },
    {
      title: '', key: 'act', render: (_: any, r: Employee) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Delete this employee? Their leave records go too." onConfirm={async () => { await hrService.deleteEmployee(r.id); message.success('Deleted'); load(); }}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Button icon={<PlusOutlined />} onClick={async () => {
            const name = prompt('New department name');
            if (name) { try { await hrService.addDepartment(companyId, name.trim()); load(); } catch (e: any) { message.error(e.message); } }
          }}>Add Department</Button>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}
          style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>Add Employee</Button>
      </div>

      <Table dataSource={rows} columns={columns} loading={loading} rowKey="id" size="small"
        pagination={false} style={{ background: 'transparent' }}
        locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No employees yet</span> }} />

      <Modal title={editing ? 'Edit Employee' : 'Add Employee'} open={open} onCancel={() => setOpen(false)}
        onOk={() => form.submit()} width={640} okText="Save">
        <Form form={form} layout="vertical" onFinish={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employee_code" label="Employee Code" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="full_name" label="Full Name" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="email" label="Email"><Input /></Form.Item>
            <Form.Item name="phone" label="Phone"><Input /></Form.Item>
            <Form.Item name="job_title" label="Job Title"><Input /></Form.Item>
            <Form.Item name="department_id" label="Department">
              <Select allowClear options={depts.map(d => ({ label: d.name, value: d.id }))} />
            </Form.Item>
            <Form.Item name="manager_id" label="Manager">
              <Select allowClear showSearch optionFilterProp="label"
                options={rows.filter(r => r.id !== editing?.id).map(r => ({ label: r.full_name, value: r.id }))} />
            </Form.Item>
            <Form.Item name="employment_type" label="Employment Type">
              <Select options={EMP_TYPES.map(t => ({ label: t.replace('_', ' '), value: t }))} />
            </Form.Item>
            <Form.Item name="status" label="Status">
              <Select options={['active', 'on_leave', 'terminated'].map(s => ({ label: s.replace('_', ' '), value: s }))} />
            </Form.Item>
            <Form.Item name="join_date" label="Join Date"><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="exit_date" label="Exit Date"><DatePicker style={{ width: '100%' }} /></Form.Item>
            {canViewPay && <Form.Item name="base_salary" label="Base Salary (monthly)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>}
            <Form.Item name="date_of_birth" label="Date of Birth"><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="residency_status" label="Residency (for statutory)">
              <Select options={residencyOptions(country).map(o => ({ label: o.label, value: o.value }))} />
            </Form.Item>
            <Form.Item name="pr_stage" label="PR Stage (Singapore)" dependencies={['residency_status']}>
              <Select allowClear disabled={form.getFieldValue('residency_status') !== 'PR'}
                options={[
                  { label: 'Year 1', value: 'year_1' },
                  { label: 'Year 2', value: 'year_2' },
                  { label: 'Year 3+', value: 'year_3_plus' },
                ]} />
            </Form.Item>
            <Form.Item name="ethnicity" label="Ethnicity (self-help group)"
              tooltip="Determines which SG self-help group contribution applies (CDAC / MBMF / SINDA / ECF)">
              <Select allowClear options={[
                { label: 'Chinese (CDAC)', value: 'chinese' },
                { label: 'Malay (MBMF)', value: 'malay' },
                { label: 'Indian (SINDA)', value: 'indian' },
                { label: 'Eurasian (ECF)', value: 'eurasian' },
                { label: 'Other / none', value: 'other' },
              ]} />
            </Form.Item>
            <Form.Item name="gender" label="Gender" tooltip="Decides maternity or paternity leave">
              <Select allowClear options={[{ label: 'Female', value: 'female' }, { label: 'Male', value: 'male' }]} />
            </Form.Item>
            <Form.Item name="work_week" label="Work week" tooltip="Which days this person normally works. Leave counted in working days skips the others.">
              <Select options={[
                { value: 'company', label: 'Same as company (Settings)' },
                ...Object.entries(WORK_PATTERN_PRESETS).map(([k, v]) => ({ value: k, label: v.label })),
                ...(customPattern ? [{ value: 'custom', label: `Custom: ${describePattern(customPattern)}` }] : []),
              ]} />
            </Form.Item>
            <Form.Item name="marital_status" label="Marital status"
              tooltip="Used for leave eligibility (e.g. paternity leave)">
              <Select options={['single', 'married', 'divorced', 'widowed'].map(s => ({ label: s[0].toUpperCase() + s.slice(1), value: s }))} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0' }}>
            <span style={{ color: 'rgba(240,237,230,0.6)', fontSize: 13 }}>
              Dependents — add an expected baby with its due date to turn on maternity / paternity leave
            </span>
            <Space size={4}>
              <Button size="small" icon={<PlusOutlined />} onClick={() => setDeps(d => [...d, { relationship: 'expected_child', name: '', date_of_birth: null, citizenship: 'SC' }])}>Expected baby</Button>
              <Button size="small" icon={<PlusOutlined />} onClick={() => setDeps(d => [...d, { relationship: 'child', name: '', date_of_birth: null, citizenship: 'SC' }])}>Dependent</Button>
            </Space>
          </div>
          {deps.map((d, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 6 }}>
              <Input size="small" placeholder="Name" value={d.name || ''} onChange={e => setDeps(x => x.map((v, vi) => vi === i ? { ...v, name: e.target.value } : v))} />
              <Select size="small" value={d.relationship} onChange={v => setDeps(x => x.map((r, ri) => ri === i ? { ...r, relationship: v } : r))}
                options={[{ label: 'Expected baby', value: 'expected_child' }, { label: 'Child', value: 'child' }, { label: 'Spouse', value: 'spouse' }, { label: 'Parent', value: 'parent' }]} />
              <DatePicker size="small" value={d.date_of_birth ? dayjs(d.date_of_birth) : null} placeholder={d.relationship === 'expected_child' ? 'Due date' : 'Date of birth'}
                onChange={v => setDeps(x => x.map((r, ri) => ri === i ? { ...r, date_of_birth: v ? v.format('YYYY-MM-DD') : null } : r))} />
              <Select size="small" value={d.citizenship} placeholder="Citizenship"
                onChange={v => setDeps(x => x.map((r, ri) => ri === i ? { ...r, citizenship: v } : r))}
                options={[{ label: 'Citizen', value: 'SC' }, { label: 'PR', value: 'PR' }, { label: 'Foreigner', value: 'FOREIGNER' }]} />
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setDeps(x => x.filter((_, xi) => xi !== i))} />
            </div>
          ))}
          <SignInSection editing={editing} users={users} roles={roles} canViewPay={canViewPay}
            unlinkedUsers={users.filter(u => !rows.some(r => r.user_id === u.id))} />

          {canViewPay && <div style={{ color: 'rgba(240,237,230,0.4)', fontSize: 12, margin: '4px 0 8px' }}>PII below is encrypted at rest.</div>}
{canViewPay && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="national_id" label="National ID / NRIC"><Input /></Form.Item>
            <Form.Item name="tax_id" label="Tax ID"><Input /></Form.Item>
            <Form.Item name="bank_name" label="Bank"><Input /></Form.Item>
            <Form.Item name="bank_account" label="Bank Account No."><Input /></Form.Item>
          </div>
          )}
        </Form>
      </Modal>
    </div>
  );
}

/**
 * One person, one login: an employee's sign-in lives on their record.
 * People with pay access can create one here (username, temporary password,
 * role), link an existing one, or leave it without a sign-in.
 */
function SignInSection({ editing, users, roles, canViewPay, unlinkedUsers }: {
  editing: Employee | null; users: any[]; roles: any[]; canViewPay: boolean; unlinkedUsers: any[];
}) {
  const linked = editing?.user_id ? users.find(u => u.id === editing.user_id) : null;
  const [resetting, setResetting] = useState(false);
  const requiredWhen = (mode: string, msg: string, extra?: (v: any) => boolean) => ({ getFieldValue }: any) => ({
    validator: (_: any, v: any) => (getFieldValue('signin_mode') !== mode || (v && (!extra || extra(v)))
      ? Promise.resolve() : Promise.reject(new Error(msg))),
  });

  const resetPassword = () => {
    let pw = '';
    Modal.confirm({
      title: `New temporary password for ${linked?.full_name}`,
      content: <Input.Password autoFocus onChange={e => { pw = e.target.value; }} placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} />,
      okText: 'Set temporary password',
      onOk: async () => {
        setResetting(true);
        try {
          await adminUsersService.setPassword(linked.id, pw);
          message.success('Done. They will choose their own password at next sign-in.');
        } catch (e: any) { message.error(e.message); throw e; } finally { setResetting(false); }
      },
    });
  };

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 12, margin: '12px 0' }}>
      <div style={{ color: '#f0ede6', marginBottom: 8 }}>Sign-in</div>
      {linked ? (
        <Space wrap>
          <span style={{ color: 'rgba(240,237,230,0.7)' }}>Signs in as <b>{linked.username || linked.email}</b></span>
          {canViewPay && <Button size="small" loading={resetting} onClick={resetPassword}>Reset password</Button>}
        </Space>
      ) : !canViewPay ? (
        <span style={{ color: 'rgba(240,237,230,0.5)' }}>No sign-in. Only HR / Director can create one.</span>
      ) : (
        <>
          <Form.Item name="signin_mode" style={{ marginBottom: 12 }}>
            <Select options={[
              { value: 'new', label: 'Create a sign-in for this person' },
              { value: 'existing', label: 'Link a sign-in that already exists', disabled: unlinkedUsers.length === 0 },
              { value: 'none', label: "No sign-in (they don't use Quantivra)" },
            ]} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(a, b) => a.signin_mode !== b.signin_mode}>
            {({ getFieldValue }) => getFieldValue('signin_mode') === 'new' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Form.Item name="signin_username" label="Username" normalize={(v: string) => (v || '').trim().toLowerCase()}
                  rules={[requiredWhen('new', 'Enter a username'), { pattern: USERNAME_PATTERN, message: USERNAME_RULE_TEXT }]}>
                  <Input autoComplete="off" />
                </Form.Item>
                <Form.Item name="signin_password" label="Temporary password"
                  rules={[requiredWhen('new', `At least ${MIN_PASSWORD_LENGTH} characters`, v => String(v).length >= MIN_PASSWORD_LENGTH)]}>
                  <Input.Password autoComplete="new-password" />
                </Form.Item>
                <Form.Item name="signin_role_id" label="Role (what they can open)" rules={[requiredWhen('new', 'Choose a role')]}>
                  <Select options={roles.map(r => ({ label: r.can_view_pay ? `${r.name} (sees pay)` : r.name, value: r.id }))} />
                </Form.Item>
              </div>
            ) : getFieldValue('signin_mode') === 'existing' ? (
              <Form.Item name="signin_existing_user" label="Sign-in" rules={[requiredWhen('existing', 'Choose a sign-in')]}>
                <Select showSearch optionFilterProp="label"
                  options={unlinkedUsers.map(u => ({ label: `${u.full_name} (${u.username || u.email || 'no username'})`, value: u.id }))} />
              </Form.Item>
            ) : null}
          </Form.Item>
          <div style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>
            A sign-in lets them see their own leave and apply for leave. They choose their own password the first time they sign in.
          </div>
        </>
      )}
    </div>
  );
}
