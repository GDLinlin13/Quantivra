import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Typography, Tag, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { supabase } from '../../../utils/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { adminUsersService, MIN_PASSWORD_LENGTH } from '../../../services/adminUsers';
import { USERNAME_PATTERN, USERNAME_RULE_TEXT } from '../../../utils/loginEmail';

const { Title } = Typography;

export function CompanyUsersPage() {
  const { companyId } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    const [u, r] = await Promise.all([
      supabase.from('company_users').select('id, company_id, username, email, full_name, job_title, is_active, created_at').eq('company_id', companyId).order('created_at', { ascending: false }),
      supabase.from('company_roles').select('*').eq('company_id', companyId),
    ]);
    setUsers(u.data || []);
    setRoles(r.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [companyId]);

  const handleCreate = async (values: any) => {
    if (!companyId) return;
    try {
      const res = await adminUsersService.createCompanyUser({
        company_id: companyId,
        username: values.username,
        email: values.email || undefined,
        password: values.password,
        full_name: values.full_name,
        job_title: values.job_title,
        role_id: values.role_id,
      });
      if (res.existing_login) {
        message.info('This person already had a Quantivra login, so they keep their existing password.');
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
    { title: 'Name', dataIndex: 'full_name', key: 'name', render: (v: string) => <span style={{ color: '#f0ede6' }}>{v}</span> },
    { title: 'Username', dataIndex: 'username', key: 'username', render: (v: string) => v || '-' },
    { title: 'Email', dataIndex: 'email', key: 'email', render: (v: string) => v || '-' },
    { title: 'Job Title', dataIndex: 'job_title', key: 'job_title' },
    { title: 'Status', dataIndex: 'is_active', key: 'status', render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag> },
    { title: 'Created', dataIndex: 'created_at', key: 'created', render: (v: string) => new Date(v).toLocaleDateString() },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ color: '#f0ede6', margin: 0 }}>Company Users</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}
          style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>
          Add User
        </Button>
      </div>
      <Table dataSource={users} columns={columns} loading={loading} rowKey="id"
        style={{ background: 'transparent' }} pagination={false}
        locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No users yet</span> }} />

      <Modal title="Add User" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}
        styles={{ header: { background: '#151a1e', color: '#f0ede6' }, body: { background: '#151a1e' } }}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="full_name" label="Full Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="username" label="Username" tooltip="Used to sign in, together with the company code"
            normalize={(v: string) => (v || '').trim().toLowerCase()}
            rules={[{ required: true }, { pattern: USERNAME_PATTERN, message: USERNAME_RULE_TEXT }]}>
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item name="email" label="Email (optional)" rules={[{ type: 'email', message: 'Enter a valid email, or leave it empty' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="job_title" label="Job Title">
            <Input />
          </Form.Item>
          <Form.Item name="password" label="Temporary Password" rules={[{ required: true, min: MIN_PASSWORD_LENGTH }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role_id" label="Role">
            <Select allowClear options={roles.map((r: any) => ({ label: r.name, value: r.id }))} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>
            Create
          </Button>
        </Form>
      </Modal>
    </div>
  );
}

