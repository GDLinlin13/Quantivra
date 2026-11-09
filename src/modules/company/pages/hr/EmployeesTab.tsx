import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, message, Tag, Space, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { hrService, calendarService, type Employee } from '../../../../services/hr';
import { useCompanyAccess } from '../../../../contexts/CompanyAccess';
import { WORK_PATTERN_PRESETS, presetKeyOf, describePattern, type WorkPattern } from '../../../../utils/workdays';
import { supabase } from '../../../../utils/supabase';
import { residencyOptions, defaultResidency } from '../../../../data/residency-options';
import { AmountInput } from '../../../../components/AmountInput';
import { nationalIdLabel } from '../../../../data/countries';

const EMP_TYPES = ['full_time', 'part_time', 'contract', 'intern', 'casual', 'director'];
/** 'on_leave' → 'On leave' */
const nice = (v: string) => { const t = (v || '').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };

export function EmployeesTab({ companyId }: { companyId: number }) {
  const { canViewPay } = useCompanyAccess();
  const [rows, setRows] = useState<Employee[]>([]);
  const [depts, setDepts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [country, setCountry] = useState<string | null>(null);
  const isSG = (country || 'SG').toUpperCase() === 'SG';
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
    } catch (err: any) { message.error(err.message); }
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const [deps, setDeps] = useState<any[]>([]);
  const [customPattern, setCustomPattern] = useState<WorkPattern | null>(null);

  const openNew = () => {
    setEditing(null); setDeps([]); setCustomPattern(null);
    form.resetFields();
    form.setFieldsValue({ work_week: 'company', employment_type: 'full_time', status: 'active', residency_status: defaultResidency(country), marital_status: 'single', employee_code: `EMP-${String(rows.length + 1).padStart(3, '0')}` });
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
      join_date: r.join_date ? dayjs(r.join_date) : null,
      exit_date: r.exit_date ? dayjs(r.exit_date) : null,
      date_of_birth: r.date_of_birth ? dayjs(r.date_of_birth) : null,
    });
    setOpen(true);
  };

  const submit = async (formValues: any) => {
    const { work_week, ...v } = formValues;
    try {
      const id = await hrService.upsertEmployee({
        id: editing?.id ?? '',
        company_id: companyId,
        ...v,
        join_date: v.join_date ? dayjs(v.join_date).format('YYYY-MM-DD') : '',
        exit_date: v.exit_date ? dayjs(v.exit_date).format('YYYY-MM-DD') : '',
        date_of_birth: v.date_of_birth ? dayjs(v.date_of_birth).format('YYYY-MM-DD') : '',
        pr_stage: v.residency_status === 'PR' ? (v.pr_stage || 'year_3_plus') : '',
        user_id: v.user_id ?? '',
        manager_id: v.manager_id ?? '',
        department_id: v.department_id ?? '',
      });
      if (work_week !== 'custom') {
        await calendarService.saveEmployeePattern(companyId, id,
          work_week && work_week !== 'company' ? WORK_PATTERN_PRESETS[work_week].pattern : null);
      }
      await hrService.saveDependents(companyId, id, deps.map(d => ({
        ...d, date_of_birth: d.date_of_birth ? dayjs(d.date_of_birth).format('YYYY-MM-DD') : null,
      })));
      message.success(editing ? 'Employee updated' : 'Employee added');
      setOpen(false);
      load();
    } catch (err: any) { message.error(err.message); }
  };

  const columns = [
    { title: 'Employee ID', dataIndex: 'employee_code', key: 'code' },
    { title: 'Name', dataIndex: 'full_name', key: 'name', render: (v: string) => <span style={{ color: '#f0ede6' }}>{v}</span> },
    { title: 'Designation', dataIndex: 'job_title', key: 'jt' },
    { title: 'Department', dataIndex: 'department_name', key: 'dept', render: (v: string) => v || '—' },
    { title: 'Manager', dataIndex: 'manager_name', key: 'mgr', render: (v: string) => v || '—' },
    { title: 'Type', dataIndex: 'employment_type', key: 'type', render: (v: string) => <Tag>{nice(v)}</Tag> },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={v === 'active' ? 'green' : v === 'on_leave' ? 'gold' : 'red'}>{nice(v)}</Tag> },
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
            <Form.Item name="employee_code" label="Employee ID" tooltip="Your company's own number for this person, e.g. EMP-001" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="full_name" label="Full Name" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="email" label="Email"><Input /></Form.Item>
            <Form.Item name="phone" label="Phone"><Input /></Form.Item>
            <Form.Item name="job_title" label="Designation" tooltip="Job title, e.g. Senior Designer"><Input /></Form.Item>
            <Form.Item name="department_id" label="Department">
              <Select allowClear options={depts.map(d => ({ label: d.name, value: d.id }))} />
            </Form.Item>
            <Form.Item name="manager_id" label="Manager">
              <Select allowClear showSearch optionFilterProp="label"
                options={rows.filter(r => r.id !== editing?.id).map(r => ({ label: r.full_name, value: r.id }))} />
            </Form.Item>
            <Form.Item name="user_id" label="Login Account"
              tooltip="Link the sign-in (created under Users) this person uses, so they can see their own leave and apply for leave. Leave empty if they don't sign in.">
              <Select allowClear showSearch optionFilterProp="label" placeholder="Not linked" disabled={!canViewPay}
                options={users.filter(u => u.id === editing?.user_id || !rows.some(r => r.user_id === u.id))
                  .map(u => ({ label: `${u.full_name} (${u.username || u.email || 'no username'})`, value: u.id }))} />
            </Form.Item>
            <Form.Item name="employment_type" label="Employment Type">
              <Select options={EMP_TYPES.map(t => ({ label: nice(t), value: t }))} />
            </Form.Item>
            <Form.Item name="status" label="Status">
              <Select options={['active', 'on_leave', 'terminated'].map(s => ({ label: nice(s), value: s }))} />
            </Form.Item>
            <Form.Item name="join_date" label="Join Date"><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="exit_date" label="Exit Date"><DatePicker style={{ width: '100%' }} /></Form.Item>
            {canViewPay && <Form.Item name="base_salary" label="Base Salary (monthly)"><AmountInput style={{ width: '100%' }} min={0} /></Form.Item>}
            <Form.Item name="date_of_birth" label="Date of Birth"><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="residency_status" label="Residency (for statutory)">
              <Select options={residencyOptions(country).map(o => ({ label: o.label, value: o.value }))} />
            </Form.Item>
            {/* Singapore only: CPF rates for permanent residents depend on the PR year; self-help groups are Singapore funds */}
            {isSG && <Form.Item name="pr_stage" label="PR Stage" dependencies={['residency_status']}>
              <Select allowClear disabled={form.getFieldValue('residency_status') !== 'PR'}
                options={[
                  { label: 'Year 1', value: 'year_1' },
                  { label: 'Year 2', value: 'year_2' },
                  { label: 'Year 3+', value: 'year_3_plus' },
                ]} />
            </Form.Item>}
            {isSG && <Form.Item name="ethnicity" label="Ethnicity (self-help group)"
              tooltip="Determines which SG self-help group contribution applies (CDAC / MBMF / SINDA / ECF)">
              <Select allowClear options={[
                { label: 'Chinese (CDAC)', value: 'chinese' },
                { label: 'Malay (MBMF)', value: 'malay' },
                { label: 'Indian (SINDA)', value: 'indian' },
                { label: 'Eurasian (ECF)', value: 'eurasian' },
                { label: 'Other / none', value: 'other' },
              ]} />
            </Form.Item>}
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
          {canViewPay && <div style={{ color: 'rgba(240,237,230,0.4)', fontSize: 12, margin: '4px 0 8px' }}>PII below is encrypted at rest.</div>}
          {canViewPay && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="national_id" label={nationalIdLabel(country)}><Input /></Form.Item>
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
