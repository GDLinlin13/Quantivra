import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, message, Tag, Space, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { hrService, type Employee } from '../../../../services/hr';
import { supabase } from '../../../../utils/supabase';

const EMP_TYPES = ['full_time', 'part_time', 'contract', 'intern', 'casual'];

export function EmployeesTab({ companyId }: { companyId: number }) {
  const [rows, setRows] = useState<Employee[]>([]);
  const [depts, setDepts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, d, u] = await Promise.all([
        hrService.listEmployees(companyId),
        hrService.departments(companyId),
        supabase.from('company_users').select('id, full_name, email').eq('company_id', companyId),
      ]);
      setRows(e); setDepts(d); setUsers(u.data || []);
    } catch (err: any) { message.error(err.message); }
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ employment_type: 'full_time', status: 'active', residency_status: 'SC', employee_code: `EMP-${String(rows.length + 1).padStart(3, '0')}` });
    setOpen(true);
  };

  const openEdit = (r: Employee) => {
    setEditing(r);
    form.setFieldsValue({
      ...r,
      join_date: r.join_date ? dayjs(r.join_date) : null,
      exit_date: r.exit_date ? dayjs(r.exit_date) : null,
      date_of_birth: r.date_of_birth ? dayjs(r.date_of_birth) : null,
    });
    setOpen(true);
  };

  const submit = async (v: any) => {
    try {
      await hrService.upsertEmployee({
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
            <Form.Item name="user_id" label="Login Account">
              <Select allowClear showSearch optionFilterProp="label"
                options={users.map(u => ({ label: `${u.full_name} (${u.email})`, value: u.id }))} />
            </Form.Item>
            <Form.Item name="employment_type" label="Employment Type">
              <Select options={EMP_TYPES.map(t => ({ label: t.replace('_', ' '), value: t }))} />
            </Form.Item>
            <Form.Item name="status" label="Status">
              <Select options={['active', 'on_leave', 'terminated'].map(s => ({ label: s.replace('_', ' '), value: s }))} />
            </Form.Item>
            <Form.Item name="join_date" label="Join Date"><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="exit_date" label="Exit Date"><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="base_salary" label="Base Salary (monthly)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
            <Form.Item name="date_of_birth" label="Date of Birth"><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="residency_status" label="Residency (for statutory)">
              <Select options={[
                { label: 'Singapore Citizen', value: 'SC' },
                { label: 'PR', value: 'PR' },
                { label: 'Employment Pass', value: 'EP' },
                { label: 'S Pass', value: 'SP' },
                { label: 'Work Permit', value: 'WP' },
                { label: 'Other / Foreigner', value: 'OTHER' },
              ]} />
            </Form.Item>
            <Form.Item name="pr_stage" label="PR Stage" dependencies={['residency_status']}>
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
          </div>
          <div style={{ color: 'rgba(240,237,230,0.4)', fontSize: 12, margin: '4px 0 8px' }}>PII below is encrypted at rest.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="national_id" label="National ID / NRIC"><Input /></Form.Item>
            <Form.Item name="tax_id" label="Tax ID"><Input /></Form.Item>
            <Form.Item name="bank_name" label="Bank"><Input /></Form.Item>
            <Form.Item name="bank_account" label="Bank Account No."><Input /></Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
