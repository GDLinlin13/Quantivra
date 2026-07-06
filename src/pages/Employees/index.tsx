import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber, message, Space, Tag, Typography, Upload, Checkbox } from 'antd';
import { PlusOutlined, UploadOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { supabase } from '../../utils/supabase';
import { useCompanyId } from '../../utils/useCompany';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [docForm] = Form.useForm();

  useEffect(() => { loadEmployees(); }, []);

  const companyId = useCompanyId();

  async function loadEmployees() {
    try {
      const [empRes, deptRes] = await Promise.all([
        supabase.from('employees').select('*, departments(name)').eq('company_id', companyId).order('full_name'),
        supabase.from('departments').select('*').eq('company_id', companyId).order('name'),
      ]);
      setEmployees(empRes.data || []);
      setDepartments(deptRes.data || []);
    } catch {} finally {
      setLoading(false);
    }
  }

  async function handleSave(values: any) {
    setSaving(true);
    try {
      const payload: any = { ...values, company_id: companyId, join_date: values.join_date?.format('YYYY-MM-DD') };
      delete payload._username;
      delete payload._password;
      delete payload._roles;
      delete payload._manage_dept_id;

      if (selectedEmployee) {
        await supabase.from('employees').update(payload).eq('id', selectedEmployee.id);

        // Update user roles
        if (values._roles && selectedEmployee.user_id) {
          await supabase.from('users').update({ roles: values._roles }).eq('id', selectedEmployee.user_id);
        }

        // Update department manager assignment
        const oldManaged = departments.find(d => d.manager_id === selectedEmployee.id);
        if (values._manage_dept_id) {
          if (oldManaged && oldManaged.id !== values._manage_dept_id) {
            await supabase.from('departments').update({ manager_id: null }).eq('id', oldManaged.id);
          }
          await supabase.from('departments').update({ manager_id: selectedEmployee.id }).eq('id', values._manage_dept_id);
        } else if (oldManaged) {
          await supabase.from('departments').update({ manager_id: null }).eq('id', oldManaged.id);
        }

        message.success('Employee saved');
      } else {
        const { data: newEmp } = await supabase.from('employees').insert(payload).select().single();
        if (newEmp && values._username) {
          const internalEmail = `${values._username.toLowerCase().replace(/[^a-z0-9]/g, '_')}@acchr.internal`;
          const { data: newUser } = await supabase.from('users').insert({
            company_id: companyId,
            username: values._username,
            email: internalEmail,
            full_name: values.full_name,
            password_hash: values._password || '123456',
            roles: values._roles || ['employee'],
            is_active: 1,
          }).select().single();
          if (newUser) {
            await supabase.from('employees').update({ user_id: newUser.id }).eq('id', newEmp.id);
            // Assign as department manager if set
            if (values._manage_dept_id) {
              await supabase.from('departments').update({ manager_id: newEmp.id }).eq('id', values._manage_dept_id);
            }
          }
        }
        message.success('Employee saved with login account');
      }
      setModalOpen(false);
      loadEmployees();
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function openDocuments(emp: any) {
    setSelectedEmployee(emp);
    const { data } = await supabase.from('employee_documents').select('*').eq('employee_id', emp.id);
    setDocuments(data || []);
    setDocModalOpen(true);
  }

  async function handleDocUpload(file: File) {
    try {
      const ext = file.name.split('.').pop();
      const filePath = `employee-docs/${selectedEmployee?.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('company-files').upload(filePath, file);
      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = supabase.storage.from('company-files').getPublicUrl(filePath);
      await supabase.from('employee_documents').insert({
        employee_id: selectedEmployee?.id,
        document_type: docForm.getFieldValue('document_type') || 'other',
        document_name: file.name,
        file_url: publicUrl,
        file_name: file.name,
      });
      message.success('Document uploaded');
      docForm.resetFields();
      openDocuments(selectedEmployee);
    } catch (err: any) {
      message.error('Upload failed: ' + err.message);
    }
    return false;
  }

  async function deleteEmployee(emp: any) {
    Modal.confirm({
      title: `Delete ${emp.full_name}?`,
      content: `This will permanently delete the employee record and all associated data. The linked login account will be deactivated.`,
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        try {
          if (emp.user_id) {
            await supabase.from('users').update({ is_active: 0, company_id: null }).eq('id', emp.user_id);
          }
          const { error } = await supabase.from('employees').delete().eq('id', emp.id);
          if (error) throw error;
          message.success('Employee deleted');
          loadEmployees();
        } catch (err: any) { message.error(err.message); }
      },
    });
  }

  async function deleteDoc(doc: any) {
    await supabase.from('employee_documents').delete().eq('id', doc.id);
    message.success('Document deleted');
    openDocuments(selectedEmployee);
  }

  async function generateCode(): Promise<string> {
    const { data } = await supabase.from('employees').select('employee_code').eq('company_id', companyId).order('employee_code', { ascending: false }).limit(1);
    const lastCode = data?.[0]?.employee_code || '000';
    const nextNum = parseInt(lastCode, 10) + 1;
    return String(nextNum).padStart(3, '0');
  }

  async function openAddModal() {
    setSelectedEmployee(null);
    form.resetFields();
    const code = await generateCode();
    form.setFieldValue('employee_code', code);
    form.setFieldValue('_roles', ['employee']);
    setModalOpen(true);
  }

  async function openEditModal(emp: any) {
    setSelectedEmployee(emp);
    let userRoles = ['employee'];
    let managedDeptId = null;
    if (emp.user_id) {
      const { data: u } = await supabase.from('users').select('roles').eq('id', emp.user_id).single();
      if (u) userRoles = u.roles;
    }
    const managed = departments.find(d => d.manager_id === emp.id);
    if (managed) managedDeptId = managed.id;
    form.setFieldsValue({
      ...emp,
      join_date: emp.join_date ? dayjs(emp.join_date) : null,
      _roles: userRoles,
      _manage_dept_id: managedDeptId,
    });
    setModalOpen(true);
  }

  const roleColors: Record<string, string> = { master: 'purple', hr: 'cyan', accountant: 'geekblue', employee: 'green' };

  const columns = [
    { title: 'Code', dataIndex: 'employee_code', key: 'code', width: 80 },
    { title: 'Full Name', dataIndex: 'full_name', key: 'name' },
    { title: 'Department', key: 'dept', render: (_: any, row: any) => row.departments?.name || '—' },
    { title: 'Position', dataIndex: 'position', key: 'pos' },
    { title: 'Type', dataIndex: 'employment_type', key: 'type', width: 100, render: (v: string) => <Tag color={v === 'full_time' ? 'blue' : 'orange'}>{v === 'full_time' ? 'Full Time' : 'Part Time'}</Tag> },
    { title: 'Salary', dataIndex: 'salary', key: 'salary', render: (v: number) => `$${v?.toFixed(2)}` },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'active' ? 'green' : s === 'inactive' ? 'orange' : 'red'}>{s}</Tag> },
    {
      title: 'Actions', key: 'actions',
      render: (_: any, row: any) => (
        <Space>
          <Button size="small" onClick={() => openEditModal(row)}>Edit</Button>
          <Button size="small" icon={<EyeOutlined />} onClick={() => openDocuments(row)}>Docs</Button>
          <Button size="small" danger onClick={() => deleteEmployee(row)}>Delete</Button>
        </Space>
      ),
    },
  ];

  const docColumns = [
    { title: 'Document', dataIndex: 'document_name', key: 'name' },
    { title: 'Type', dataIndex: 'document_type', key: 'type' },
    { title: 'Actions', key: 'actions', render: (_: any, row: any) => (
      <Space>
        <Button size="small" icon={<EyeOutlined />} onClick={() => window.open(row.file_url, '_blank')}>View</Button>
        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => deleteDoc(row)} />
      </Space>
    )},
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Employees</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>Add Employee</Button>
      </div>

      <Table dataSource={employees} columns={columns} rowKey="id" loading={loading} />

      <Modal title={selectedEmployee ? 'Edit Employee' : 'Add Employee'} open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={720}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="employee_code" hidden><Input /></Form.Item>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 16, padding: '4px 0' }}>
            Employee Code: <strong>{form.getFieldValue('employee_code') || '—'}</strong>
          </div>
          {!selectedEmployee ? (
            <>
              <Form.Item name="_username" label="Login Username" rules={[{ required: true }]}>
                <Input style={{ textTransform: 'uppercase' }} onChange={e => { const v = e.target.value.toUpperCase(); e.target.value = v; form.setFieldValue('_username', v); }} />
              </Form.Item>
              <Form.Item name="_password" label="Password" rules={[{ required: true, min: 4 }]}>
                <Input.Password placeholder="Set a password for the login account" />
              </Form.Item>
            </>
          ) : null}
          <Form.Item name="full_name" label="Full Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email"><Input type="email" /></Form.Item>
          <Form.Item name="phone" label="Phone"><Input /></Form.Item>
          <Form.Item name="department_id" label="Department">
            <Select allowClear placeholder="Select department">
              {departments.map(d => <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="_manage_dept_id" label="Manager of Department">
            <Select allowClear placeholder="Assign as manager of a department">
              {departments.map(d => <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="_roles" label="Roles">
            <Checkbox.Group>
              <Checkbox value="hr">HR</Checkbox>
              <Checkbox value="accountant">Accountant</Checkbox>
              <Checkbox value="employee">Employee</Checkbox>
            </Checkbox.Group>
          </Form.Item>
          <Form.Item name="position" label="Position"><Input /></Form.Item>
          <Form.Item name="employment_type" label="Employment Type" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="full_time">Full Time</Select.Option>
              <Select.Option value="part_time">Part Time</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="join_date" label="Join Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="salary" label="Monthly Salary"><InputNumber style={{ width: '100%' }} prefix="$" /></Form.Item>
          <Form.Item name="bank_name" label="Bank Name"><Input /></Form.Item>
          <Form.Item name="bank_account" label="Bank Account"><Input /></Form.Item>
          <Form.Item name="tax_id" label="Tax ID / National ID"><Input /></Form.Item>
          <Form.Item name="address" label="Address"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="emergency_contact" label="Emergency Contact"><Input /></Form.Item>
          <Form.Item name="status" label="Status">
            <Select>
              <Select.Option value="active">Active</Select.Option>
              <Select.Option value="inactive">Inactive</Select.Option>
              <Select.Option value="terminated">Terminated</Select.Option>
            </Select>
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>Save Employee</Button>
        </Form>
      </Modal>

      <Modal title={`Documents - ${selectedEmployee?.full_name}`} open={docModalOpen} onCancel={() => setDocModalOpen(false)} footer={null} width={600}>
        <Form form={docForm} layout="inline" style={{ marginBottom: 16 }}>
          <Form.Item name="document_type" label="Type">
            <Select style={{ width: 150 }}>
              <Select.Option value="national_id">National ID</Select.Option>
              <Select.Option value="passport">Passport</Select.Option>
              <Select.Option value="driving_license">Driving License</Select.Option>
              <Select.Option value="visa">Visa</Select.Option>
              <Select.Option value="certificate">Certificate</Select.Option>
              <Select.Option value="contract">Contract</Select.Option>
              <Select.Option value="other">Other</Select.Option>
            </Select>
          </Form.Item>
          <Upload beforeUpload={handleDocUpload} showUploadList={false} accept=".pdf,.jpg,.png,.doc,.docx">
            <Button icon={<UploadOutlined />}>Upload Document</Button>
          </Upload>
        </Form>
        <Table dataSource={documents} columns={docColumns} rowKey="id" pagination={false} size="small" />
      </Modal>
    </div>
  );
}
