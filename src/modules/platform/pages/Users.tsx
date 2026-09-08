import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Typography, Tag, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { supabase } from '../../../utils/supabase';

const { Title } = Typography;

export function PlatformUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    const [u, c] = await Promise.all([
      supabase.from('company_users').select('*, companies(name)').order('created_at', { ascending: false }),
      supabase.from('companies').select('id, name, company_code').eq('is_active', true),
    ]);
    setUsers(u.data || []);
    setCompanies(c.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (values: any) => {
    const { error } = await supabase.from('company_users').insert({
      company_id: values.company_id,
      email: values.email,
      username: values.username,
      full_name: values.full_name,
      password_hash: 'temp',
    });
    if (error) { message.error(error.message); return; }
    message.success('User created');
    setModalOpen(false);
    form.resetFields();
    load();
  };

  const columns = [
    { title: 'Username', dataIndex: 'username', key: 'username', render: (v: string) => <span style={{ color: '#f0ede6' }}>{v || '-'}</span> },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Name', dataIndex: 'full_name', key: 'full_name' },
    { title: 'Company', key: 'company', render: (_: any, r: any) => r.companies?.name || r.company_id },
    { title: 'Status', dataIndex: 'is_active', key: 'status', render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag> },
    { title: 'Created', dataIndex: 'created_at', key: 'created', render: (v: string) => new Date(v).toLocaleDateString() },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ color: '#f0ede6', margin: 0 }}>Company Users</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}
          style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>
          Create User
        </Button>
      </div>
      <Table dataSource={users} columns={columns} loading={loading} rowKey="id"
        style={{ background: 'transparent' }} pagination={false}
        locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No users</span> }} />

      <Modal title="Create Company User" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}
        styles={{ header: { background: '#151a1e', color: '#f0ede6' }, body: { background: '#151a1e' } }}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="company_id" label="Company" rules={[{ required: true }]}>
            <Select options={companies.map((c: any) => ({ label: c.name, value: c.id }))} />
          </Form.Item>
          <Form.Item name="username" label="Username" rules={[{ required: true }]}>
            <Input placeholder="johndoe" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="john@company.com" />
          </Form.Item>
          <Form.Item name="full_name" label="Full Name" rules={[{ required: true }]}>
            <Input placeholder="John Doe" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>
            Create
          </Button>
        </Form>
      </Modal>
    </div>
  );
}

