import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Space, Tag, Typography, Card, Row, Col, Statistic, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, LockOutlined, DeleteOutlined, TeamOutlined, BankOutlined } from '@ant-design/icons';
import { supabase } from '../../utils/supabase';

export default function MasterAdminPage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState<'company' | 'user' | null>(null);
  const [editItem, setEditItem] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [userForm] = Form.useForm();
  const [stats, setStats] = useState({ companies: 0, users: 0, employees: 0 });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [compRes, userRes, empRes] = await Promise.all([
        supabase.from('companies').select('*').order('name'),
        supabase.from('users').select('*, companies(name)').order('full_name'),
        supabase.from('employees').select('id', { count: 'exact', head: true }),
      ]);
      setCompanies(compRes.data || []);
      setUsers(userRes.data || []);
      setStats({
        companies: (compRes.data || []).length,
        users: (userRes.data || []).filter((u: any) => !u.is_super_admin).length,
        employees: empRes.count || 0,
      });
    } catch {} finally { setLoading(false); }
  }

  async function saveCompany(values: any) {
    setSaving(true);
    try {
      if (editItem) {
        await supabase.from('companies').update(values).eq('id', editItem.id);
      } else {
        await supabase.from('companies').insert(values);
      }
      message.success('Company saved');
      setModalOpen(null);
      loadData();
    } catch (err: any) { message.error(err.message); } finally { setSaving(false); }
  }

  async function saveUser(values: any) {
    setSaving(true);
    try {
      if (editItem) {
        await supabase.from('users').update({ roles: values.roles, full_name: values.full_name, phone: values.phone, is_active: values.is_active }).eq('id', editItem.id);
      } else {
        const username = values.username.toUpperCase();
        const internalEmail = `${username.toLowerCase().replace(/[^a-z0-9]/g, '_')}@acchr.internal`;
        await supabase.from('users').insert({
          company_id: values.company_id,
          username,
          email: internalEmail,
          password_hash: values.password,
          full_name: values.full_name,
          roles: values.roles,
          phone: values.phone,
          is_active: 1,
        });
      }
      message.success('User saved');
      setModalOpen(null);
      loadData();
    } catch (err: any) { message.error(err.message); } finally { setSaving(false); }
  }

  async function deleteCompany(id: number) {
    await supabase.from('companies').delete().eq('id', id);
    message.success('Company deleted');
    loadData();
  }

  async function resetPassword(id: number) {
    const { data: u } = await supabase.from('users').select('email').eq('id', id).single();
    if (u) {
      await supabase.auth.admin.updateUserById(u.email, { password: 'password123' });
      message.success('Password reset to password123');
    }
  }

  const companyColumns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Country', dataIndex: 'country', key: 'country' },
    { title: 'Currency', dataIndex: 'currency', key: 'currency' },
    { title: 'Status', dataIndex: 'is_active', key: 'active', render: (v: number) => v ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag> },
    { title: 'Created', dataIndex: 'created_at', key: 'created', render: (v: string) => new Date(v).toLocaleDateString() },
    {
      title: 'Actions', key: 'actions',
      render: (_: any, row: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => { setEditItem(row); form.setFieldsValue(row); setModalOpen('company'); }} />
          <Popconfirm title="Delete company?" onConfirm={() => deleteCompany(row.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const userColumns = [
    { title: 'Username', dataIndex: 'username', key: 'username' },
    { title: 'Name', dataIndex: 'full_name', key: 'name' },
    { title: 'Company', dataIndex: ['companies', 'name'], key: 'company', render: (v: any) => v || '—' },
    { title: 'Roles', dataIndex: 'roles', key: 'roles', render: (roles: string[]) => roles?.map(r => <Tag key={r}>{r}</Tag>) },
    { title: 'Super Admin', dataIndex: 'is_super_admin', key: 'super', render: (v: number) => v ? <Tag color="red">AEGIS</Tag> : null },
    { title: 'Active', dataIndex: 'is_active', key: 'active', render: (v: number) => v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag> },
    {
      title: 'Actions', key: 'actions',
      render: (_: any, row: any) => row.is_super_admin ? null : (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => { setEditItem(row); userForm.setFieldsValue({ ...row, roles: row.roles || [] }); setModalOpen('user'); }} />
          <Button size="small" icon={<LockOutlined />} onClick={() => resetPassword(row.id)} title="Reset password to password123" />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={3}><LockOutlined /> AEGIS Master Control Panel</Typography.Title>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card><Statistic title="Companies" value={stats.companies} prefix={<BankOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="Users" value={stats.users} prefix={<TeamOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="Employees" value={stats.employees} /></Card></Col>
      </Row>

      <Card title="Companies" style={{ marginBottom: 24 }} extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditItem(null); form.resetFields(); setModalOpen('company'); }}>New Company</Button>}>
        <Table dataSource={companies} columns={companyColumns} rowKey="id" loading={loading} size="small" />
      </Card>

      <Card title="Users" extra={<Button icon={<PlusOutlined />} onClick={() => { setEditItem(null); userForm.resetFields(); setModalOpen('user'); }}>Add User</Button>}>
        <Table dataSource={users} columns={userColumns} rowKey="id" loading={loading} size="small" />
      </Card>

      <Modal title={editItem ? 'Edit Company' : 'New Company'} open={modalOpen === 'company'} onCancel={() => setModalOpen(null)} footer={null}>
        <Form form={form} layout="vertical" onFinish={saveCompany}>
          <Form.Item name="name" label="Company Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="country" label="Country"><Input /></Form.Item>
          <Form.Item name="currency" label="Currency"><Input /></Form.Item>
          <Form.Item name="phone" label="Phone"><Input /></Form.Item>
          <Form.Item name="email" label="Email"><Input type="email" /></Form.Item>
          <Form.Item name="is_active" label="Status"><Select><Select.Option value={1}>Active</Select.Option><Select.Option value={0}>Inactive</Select.Option></Select></Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>Save</Button>
        </Form>
      </Modal>

      <Modal title={editItem ? 'Edit User' : 'New User'} open={modalOpen === 'user'} onCancel={() => setModalOpen(null)} footer={null}>
        <Form form={userForm} layout="vertical" onFinish={saveUser} initialValues={{ roles: ['employee'], is_active: 1 }}>
              {!editItem && (
                <>
                  <Form.Item name="company_id" label="Company" rules={[{ required: true }]}>
                    <Select showSearch optionFilterProp="children">
                      {companies.map(c => <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>)}
                    </Select>
                  </Form.Item>
                  <Form.Item name="username" label="Username" rules={[{ required: true, min: 3 }]}><Input /></Form.Item>
                  <Form.Item name="password" label="Initial Password" rules={[{ required: true, min: 4 }]}><Input.Password /></Form.Item>
                </>
              )}
          <Form.Item name="full_name" label="Full Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="roles" label="Roles" rules={[{ required: true }]}>
            <Select mode="multiple" placeholder="Select roles">
              <Select.Option value="admin">Admin (Boss - full access)</Select.Option>
              <Select.Option value="hr">HR</Select.Option>
              <Select.Option value="accountant">Accountant</Select.Option>
              <Select.Option value="manager">Manager</Select.Option>
              <Select.Option value="employee">Employee</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="is_active" label="Active"><Select><Select.Option value={1}>Active</Select.Option><Select.Option value={0}>Inactive</Select.Option></Select></Form.Item>
          <Form.Item name="phone" label="Phone"><Input /></Form.Item>
          {!editItem && <Typography.Text type="secondary">New users get a welcome email to set their password via Supabase Auth.</Typography.Text>}
          <Button type="primary" htmlType="submit" loading={saving} block style={{ marginTop: 16 }}>Save</Button>
        </Form>
      </Modal>
    </div>
  );
}
