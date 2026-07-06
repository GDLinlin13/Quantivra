import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber, message, Space, Tag, Typography, Tabs, Upload, List } from 'antd';
import { PlusOutlined, UploadOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { supabase } from '../../utils/supabase';
import { useCompanyId } from '../../utils/useCompany';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [docForm] = Form.useForm();

  useEffect(() => {
    loadEmployees();
  }, []);

  const companyId = useCompanyId();

  async function loadEmployees() {
    try {
      const { data } = await supabase.from('employees').select('*').eq('company_id', companyId).order('full_name');
      setEmployees(data || []);
    } catch {} finally {
      setLoading(false);
    }
  }

  async function handleSave(values: any) {
    setSaving(true);
    try {
      const payload = { ...values, company_id: companyId, join_date: values.join_date?.format('YYYY-MM-DD') };
      if (selectedEmployee) {
        await supabase.from('employees').update(payload).eq('id', selectedEmployee.id);
      } else {
        await supabase.from('employees').insert(payload);
      }
      message.success('Employee saved');
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

  async function deleteDoc(doc: any) {
    await supabase.from('employee_documents').delete().eq('id', doc.id);
    message.success('Document deleted');
    openDocuments(selectedEmployee);
  }

  const columns = [
    { title: 'Code', dataIndex: 'employee_code', key: 'code', width: 100 },
    { title: 'Full Name', dataIndex: 'full_name', key: 'name' },
    { title: 'Department', dataIndex: 'department', key: 'dept' },
    { title: 'Position', dataIndex: 'position', key: 'pos' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Salary', dataIndex: 'salary', key: 'salary', render: (v: number) => `$${v?.toFixed(2)}` },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'active' ? 'green' : s === 'inactive' ? 'orange' : 'red'}>{s}</Tag> },
    {
      title: 'Actions', key: 'actions',
      render: (_: any, row: any) => (
        <Space>
          <Button size="small" onClick={() => { setSelectedEmployee(row); form.setFieldsValue(row); setModalOpen(true); }}>Edit</Button>
          <Button size="small" icon={<EyeOutlined />} onClick={() => openDocuments(row)}>Docs</Button>
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
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setSelectedEmployee(null); form.resetFields(); setModalOpen(true); }}>Add Employee</Button>
      </div>

      <Table dataSource={employees} columns={columns} rowKey="id" loading={loading} />

      <Modal title={selectedEmployee ? 'Edit Employee' : 'Add Employee'} open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={700}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="employee_code" label="Employee ID / Code" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="full_name" label="Full Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email"><Input type="email" /></Form.Item>
          <Form.Item name="phone" label="Phone"><Input /></Form.Item>
          <Form.Item name="department" label="Department"><Input /></Form.Item>
          <Form.Item name="position" label="Position"><Input /></Form.Item>
          <Form.Item name="join_date" label="Join Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="salary" label="Salary"><InputNumber style={{ width: '100%' }} prefix="$" /></Form.Item>
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
