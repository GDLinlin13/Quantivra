import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Typography, Tag, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { supabase } from '../../../utils/supabase';
import { adminUsersService, MIN_PASSWORD_LENGTH } from '../../../services/adminUsers';
import { USERNAME_PATTERN, USERNAME_RULE_TEXT } from '../../../utils/loginEmail';

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
      supabase.from('company_users').select('id, company_id, username, email, full_name, is_active, created_at, companies(name)').order('created_at', { ascending: false }),
      supabase.from('companies').select('id, name, company_code').eq('is_active', true),
    ]);
    setUsers(u.data || []);
    setCompanies(c.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (values: any) => {
    try {
      const res = await adminUsersService.createCompanyUser({
        company_id: values.company_id,
        username: values.username,
        email: values.email || undefined,
        password: values.password,
        full_name: values.full_name,
      });
      if (res.existing_login) {
        message.info('This email already had a Quantivra login, so it keeps its existing password.');
      } else {
        message.success('User created');
      }
      setModalOpen(false);
      form.resetFields();
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const columns = [
    { title: 'Username', dataIndex: 'username', key: 'username', render: (v: string) => v || '-' },
    { title: 'Email', dataIndex: 'email', key: 'email', render: (v: string) => v || '-' },
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
          <Form.Item name="username" label="Username" tooltip="Used to sign in, together with the company code"
            normalize={(v: string) => (v || '').trim().toLowerCase()}
            rules={[{ required: true }, { pattern: USERNAME_PATTERN, message: USERNAME_RULE_TEXT }]}>
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item name="email" label="Email (optional)" rules={[{ type: 'email', message: 'Enter a valid email, or leave it empty' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="full_name" label="Full Name" rules={[{ required: true }]}>
            <Input placeholder="John Doe" />
          </Form.Item>
          <Form.Item name="password" label="Temporary Password" rules={[{ required: true, min: MIN_PASSWORD_LENGTH }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" block style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>
            Create
          </Button>
        </Form>
      </Modal>
    </div>
  );
}

