import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Typography, Tag, Space, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, KeyOutlined, PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
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
  const [editing, setEditing] = useState<any>(null);
  const [resetting, setResetting] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [editForm] = Form.useForm();
  const [pwForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    const [u, c] = await Promise.all([
      supabase.from('company_users').select('id, company_id, username, email, full_name, job_title, is_active, created_at, companies(name)'),
      supabase.from('companies').select('id, name, company_code').eq('is_active', true),
    ]);
    // by company, then by name
    const byName = (a: string, b: string) => (a || '').localeCompare(b || '', undefined, { sensitivity: 'base' });
    setUsers([...(u.data || [])].sort((a: any, b: any) => byName(a.companies?.name, b.companies?.name) || byName(a.full_name, b.full_name) || byName(a.username, b.username)));
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

  const openEdit = (r: any) => { setEditing(r); editForm.setFieldsValue({ full_name: r.full_name, email: r.email || '', job_title: r.job_title || '' }); };
  const handleEdit = async (v: any) => {
    if (!editing) return;
    setSaving(true);
    try {
      const up = await supabase.from('company_users').update({ full_name: v.full_name.trim(), email: v.email?.trim() || null, job_title: v.job_title?.trim() || null }).eq('id', editing.id).select('id');
      if (up.error) throw new Error(up.error.message);
      if (!up.data?.length) throw new Error('Could not save');
      message.success('User updated'); setEditing(null); load();
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };
  const handleReset = async (v: any) => {
    if (!resetting) return;
    setSaving(true);
    try {
      await adminUsersService.setPassword(resetting.id, v.password);
      message.success(`Password reset — ${resetting.full_name} will be asked to choose a new one when they sign in`);
      setResetting(null); pwForm.resetFields();
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };
  const setSuspended = async (r: any, suspended: boolean) => {
    const up = await supabase.from('company_users').update({ is_active: !suspended }).eq('id', r.id).select('id');
    if (up.error || !up.data?.length) { message.error(up.error?.message || 'Could not change the status'); return; }
    message.success(suspended ? `${r.full_name} suspended — they can't sign in` : `${r.full_name} can sign in again`);
    load();
  };
  const companyNames = [...new Set(users.map((u: any) => u.companies?.name).filter(Boolean))] as string[];
  // One line per company: its director (else its first user); the others open underneath
  const groups = (() => {
    const by = new Map<number, any[]>();
    for (const u of users) by.set(u.company_id, [...(by.get(u.company_id) || []), u]);
    return [...by.values()].map(list => {
      const sorted = [...list].sort((a, b) => Number(!/director/i.test(a.job_title || '')) - Number(!/director/i.test(b.job_title || '')) || String(a.created_at).localeCompare(String(b.created_at)));
      return { ...sorted[0], others: sorted.slice(1) };
    });
  })();

  const columns = [
    { title: 'Username', dataIndex: 'username', key: 'username', render: (v: string) => v || '-' },
    { title: 'Email', dataIndex: 'email', key: 'email', render: (v: string) => v || '-' },
    { title: 'Name', dataIndex: 'full_name', key: 'full_name' },
    { title: 'Company', key: 'company', render: (_: any, r: any) => <>{r.companies?.name || r.company_id}{r.others?.length ? <span style={{ color: 'rgba(240,237,230,0.45)', fontSize: 12 }}>{`  +${r.others.length} more`}</span> : null}</>,
      filters: companyNames.map(n => ({ text: n, value: n })), onFilter: (v: any, r: any) => r.companies?.name === v },
    { title: 'Status', dataIndex: 'is_active', key: 'status', render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Suspended'}</Tag> },
    { title: 'Created', dataIndex: 'created_at', key: 'created', render: (v: string) => new Date(v).toLocaleDateString() },
    {
      title: '', key: 'del', render: (_: any, r: any) => (
        <Space size={4}>
        <Button size="small" icon={<EditOutlined />} title="Amend" onClick={() => openEdit(r)} />
        <Button size="small" icon={<KeyOutlined />} title="Reset password" onClick={() => { pwForm.resetFields(); setResetting(r); }} />
        {r.is_active
          ? <Popconfirm title={`Suspend ${r.full_name}?`} description="They can't sign in until you reactivate them. Nothing is deleted."
              okText="Suspend" onConfirm={() => setSuspended(r, true)}>
              <Button size="small" icon={<PauseCircleOutlined />} title="Suspend" />
            </Popconfirm>
          : <Button size="small" icon={<PlayCircleOutlined />} title="Reactivate" onClick={() => setSuspended(r, false)} />}
        <Popconfirm title={`Delete ${r.full_name}'s sign-in?`}
          description="They won't be able to sign in. A linked employee record is kept."
          okText="Delete" okButtonProps={{ danger: true }}
          onConfirm={() => adminUsersService.deleteCompanyUser(r.id)
            .then(() => { message.success('User deleted'); load(); })
            .catch((e: any) => message.error(e.message))}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
        </Space>
      ),
    },
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
      <Table dataSource={groups} columns={columns} loading={loading} rowKey="id"
        style={{ background: 'transparent' }} pagination={false}
        expandable={{
          rowExpandable: (r: any) => r.others.length > 0,
          expandedRowRender: (r: any) => (
            <Table dataSource={r.others} columns={columns.map(c => (c.key === 'company' ? { ...c, render: () => '', filters: undefined, onFilter: undefined } : c))} rowKey="id" size="small" pagination={false} showHeader={false} style={{ background: 'transparent' }} />
          ),
        }}
        locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No users</span> }} />

      <Modal title={`Amend ${editing?.full_name || ''}`} open={!!editing} onCancel={() => setEditing(null)} footer={null} destroyOnHidden
        styles={{ header: { background: '#151a1e', color: '#f0ede6' }, body: { background: '#151a1e' } }}>
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Form.Item label="Company"><Input value={editing?.companies?.name || ''} disabled /></Form.Item>
          <Form.Item label="Username"><Input value={editing?.username || ''} disabled /></Form.Item>
          <Form.Item name="full_name" label="Full Name" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="Email (optional)" rules={[{ type: 'email', message: 'Enter a valid email, or leave it empty' }]}><Input /></Form.Item>
          <Form.Item name="job_title" label="Job Title"><Input /></Form.Item>
          <Button type="primary" htmlType="submit" block loading={saving} style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>Save</Button>
        </Form>
      </Modal>

      <Modal title={`Reset password: ${resetting?.full_name || ''}`} open={!!resetting} onCancel={() => setResetting(null)} footer={null} destroyOnHidden
        styles={{ header: { background: '#151a1e', color: '#f0ede6' }, body: { background: '#151a1e' } }}>
        <Form form={pwForm} layout="vertical" onFinish={handleReset}>
          <Form.Item name="password" label="Temporary Password" rules={[{ required: true, min: MIN_PASSWORD_LENGTH }]}><Input.Password autoComplete="new-password" /></Form.Item>
          <Form.Item name="confirm" label="Type It Again" dependencies={['password']}
            rules={[{ required: true }, ({ getFieldValue }) => ({ validator: (_, v) => (!v || v === getFieldValue('password') ? Promise.resolve() : Promise.reject(new Error('The two passwords do not match'))) })]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={saving} style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>Reset Password</Button>
        </Form>
      </Modal>

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

