import { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, message, Typography, Checkbox, Space, Tag, Divider, Switch, Tooltip, Alert, Segmented } from 'antd';
import { PlusOutlined, SafetyOutlined } from '@ant-design/icons';
import { supabase } from '../../../utils/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { MODULES, type ModuleAction } from '../../../types';
import { MODULE_GUIDE, PERMISSION_TICKS } from '../../../data/permissionGuide';
import { useCompanyAccess } from '../../../contexts/CompanyAccess';

const { Title, Text } = Typography;
const ALL_ACTIONS: ModuleAction[] = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'print', 'void'];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function CompanyRolesPage() {
  const { companyId, user } = useAuth();
  const access = useCompanyAccess();
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [permModalOpen, setPermModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<any>(null);
  const [permissions, setPermissions] = useState<Record<string, Record<string, ModuleAction[]>>>({});
  const [form] = Form.useForm();
  const [view, setView] = useState<'roles' | 'users'>('roles');
  const [users, setUsers] = useState<any[]>([]);
  const [roleOf, setRoleOf] = useState<Record<number, number>>({});

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase.from('company_roles').select('*').eq('company_id', companyId);
    setRoles(data || []);
    const u = await supabase.from('company_users').select('id, username, full_name, job_title, is_active').eq('company_id', companyId).order('full_name');
    setUsers(u.data || []);
    const ids = (u.data || []).map((x: any) => x.id);
    const links = ids.length ? await supabase.from('company_user_roles').select('user_id, role_id').in('user_id', ids) : { data: [] as any[] };
    setRoleOf(Object.fromEntries((links.data || []).map((l: any) => [l.user_id, l.role_id])));
    setLoading(false);
  };

  useEffect(() => { load(); }, [companyId]);

  const handleCreate = async (values: any) => {
    const { error } = await supabase.from('company_roles').insert({ company_id: companyId, name: values.name, is_system: false, can_view_pay: !!values.can_view_pay });
    if (error) { message.error(error.message); return; }
    message.success('Role created');
    setModalOpen(false);
    form.resetFields();
    load();
  };

  const openPermissions = async (role: any) => {
    setSelectedRole(role);
    const { data } = await supabase.from('company_permissions').select('*').eq('role_id', role.id);
    // One row per section. Older per-feature ticks always counted for the whole section, so they show as such.
    const perms: Record<string, Record<string, ModuleAction[]>> = {};
    for (const mod of Object.keys(PERMISSION_TICKS)) perms[mod] = { '*': [] };
    (data || []).forEach((p: any) => {
      if (!PERMISSION_TICKS[p.module]?.[p.action]) return;
      if (!perms[p.module]['*'].includes(p.action)) perms[p.module]['*'].push(p.action);
    });
    setPermissions(perms);
    setPermModalOpen(true);
  };

  const togglePerm = (mod: string, feat: string, action: ModuleAction) => {
    setPermissions(prev => {
      const next = { ...prev };
      const current = next[mod]?.[feat] || [];
      next[mod] = { ...next[mod], [feat]: current.includes(action) ? current.filter(a => a !== action) : [...current, action] };
      return next;
    });
  };

  const savePermissions = async () => {
    if (!selectedRole) return;
    const flattened: { role_id: number; module: string; feature: string; action: string }[] = [];
    for (const [mod, feats] of Object.entries(permissions)) {
      for (const [feat, actions] of Object.entries(feats)) {
        actions.forEach(action => flattened.push({ role_id: selectedRole.id, module: mod, feature: feat, action }));
      }
    }
    await supabase.from('company_permissions').delete().eq('role_id', selectedRole.id);
    if (flattened.length > 0) {
      await supabase.from('company_permissions').insert(flattened);
    }
    message.success('Permissions saved');
    setPermModalOpen(false);
    access.reload();
  };

  const togglePay = async (role: any, on: boolean) => {
    const { error } = await supabase.from('company_roles').update({ can_view_pay: on }).eq('id', role.id);
    if (error) { message.error(error.message); return; }
    message.success(on ? `${role.name} can now see pay and manage users` : `${role.name} can no longer see pay or manage users`);
    load();
  };

  // The company's master role (Admin / Director) always has full access; the
  // database enforces it (migration 021), so there's nothing to configure.
  const isMaster = (r: any) => ['admin', 'director'].includes(String(r?.name || '').toLowerCase());

  const isMe = (u: any) => !!user && Number(user.id) === Number(u.id);
  const changeRole = async (u: any, roleId: number) => {
    const add = await supabase.from('company_user_roles').insert({ user_id: u.id, role_id: roleId });
    if (add.error && !/duplicate|unique/i.test(add.error.message)) { message.error(add.error.message); return; }
    const del = await supabase.from('company_user_roles').delete().eq('user_id', u.id).neq('role_id', roleId);
    if (del.error) { message.error(del.error.message); return; }
    message.success(`${u.full_name} is now ${roles.find(r => r.id === roleId)?.name || 'updated'}`);
    load();
  };
  const userColumns = [
    { title: 'Name', key: 'name', render: (_: any, u: any) => <span style={{ color: '#f0ede6' }}>{u.full_name}{!u.is_active && <Tag style={{ marginLeft: 8 }}>Inactive</Tag>}</span> },
    { title: 'Username', dataIndex: 'username', key: 'username', render: (v: string) => v || '-' },
    {
      title: 'Role', key: 'role', width: 240,
      render: (_: any, u: any) => isMe(u)
        ? <Tooltip title="Your own role is changed by another person who manages users"><Select style={{ width: 200 }} disabled value={roleOf[u.id]} options={roles.map(r => ({ value: r.id, label: r.name }))} /></Tooltip>
        : <Select style={{ width: 200 }} placeholder="Choose a role" value={roleOf[u.id]} onChange={v => changeRole(u, v)} options={roles.map(r => ({ value: r.id, label: r.name }))} />,
    },
    {
      title: 'Can see pay & manage users', key: 'pay',
      render: (_: any, u: any) => { const r = roles.find(x => x.id === roleOf[u.id]); return r && (isMaster(r) || r.can_view_pay) ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>; },
    },
    {
      title: 'Access', key: 'actions',
      render: (_: any, u: any) => {
        const r = roles.find(x => x.id === roleOf[u.id]);
        if (!r) return <Tag color="red">No role · cannot open anything</Tag>;
        return isMaster(r) ? <Tag color="gold">Master role · full access to everything</Tag>
          : <Button type="link" onClick={() => openPermissions(r)}>Configure {r.name} Permissions</Button>;
      },
    },
  ];

  const columns = [
    { title: 'Role Name', dataIndex: 'name', key: 'name', render: (v: string) => <span style={{ color: '#f0ede6' }}><SafetyOutlined style={{ marginRight: 8 }} />{v}</span> },
    {
      title: <Tooltip title="Sees salaries, payroll, payslips and ID / bank numbers, and can create users and change roles">Can see pay &amp; manage users</Tooltip>,
      dataIndex: 'can_view_pay', key: 'pay',
      render: (v: boolean, r: any) => isMaster(r)
        ? <Tooltip title="The master role always has full access"><Switch checked disabled /></Tooltip>
        : <Switch checked={!!v} onChange={on => togglePay(r, on)} />,
    },
    {
      title: 'Access', key: 'actions',
      render: (_: any, record: any) => isMaster(record)
        ? <Tag color="gold">Master role · full access to everything</Tag>
        : <Button type="link" onClick={() => openPermissions(record)}>Configure Permissions</Button>,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Space size={16}>
          <Title level={4} style={{ color: '#f0ede6', margin: 0 }}>Roles & Permissions</Title>
          <Segmented value={view} onChange={v => setView(v as 'roles' | 'users')} options={[{ value: 'roles', label: 'By Roles' }, { value: 'users', label: 'By Users' }]} />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}
          style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>
          Create Role
        </Button>
      </div>
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message="Each person's role decides what they can open. Only roles with “Can see pay & manage users” see salaries and payroll, and can add users or change roles." />
      {view === 'roles'
        ? <Table dataSource={roles} columns={columns} loading={loading} rowKey="id" style={{ background: 'transparent' }} pagination={false} />
        : <Table dataSource={users} columns={userColumns} loading={loading} rowKey="id" style={{ background: 'transparent' }} pagination={false} />}

      <Modal title="Create Role" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}
        styles={{ header: { background: '#151a1e', color: '#f0ede6' }, body: { background: '#151a1e' } }}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="Role Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Manager" />
          </Form.Item>
          <Form.Item name="can_view_pay" valuePropName="checked" label="Can see pay & manage users">
            <Switch />
          </Form.Item>
          <Button type="primary" htmlType="submit" block style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>
            Create
          </Button>
        </Form>
      </Modal>

      <Modal title={`Permissions: ${selectedRole?.name || ''}`} open={permModalOpen}
        onCancel={() => setPermModalOpen(false)} width={800}
        footer={<Button type="primary" onClick={savePermissions} style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>Save Permissions</Button>}
        styles={{ header: { background: '#151a1e', color: '#f0ede6' }, body: { background: '#151a1e', maxHeight: 500, overflow: 'auto' } }}>
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="Tick what people with this role may do. Unticked means hidden or not allowed. People see the change the next time they open Quantivra."
          description={<span style={{ fontSize: 12 }}>Payroll, salaries, Settings, Document Templates, Users and Roles follow the role’s <b>Can see pay &amp; manage users</b> switch, not these ticks.</span>} />
        {Object.entries(PERMISSION_TICKS).map(([modKey, ticks]) => (
          <div key={modKey} style={{ marginBottom: 20 }}>
            <Space>
              <Text style={{ color: '#f0ede6', fontWeight: 600, fontSize: 14 }}>{(MODULES as any)[modKey]?.label || modKey}</Text>
              {!access.isOn(modKey) && <Tag>Switched off in Settings → Modules</Tag>}
            </Space>
            <Divider style={{ margin: '8px 0', borderColor: 'rgba(255,255,255,0.06)' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '6px 12px', alignItems: 'center' }}>
              {ALL_ACTIONS.filter(a => ticks[a]).map(action => (
                <label key={action} style={{ display: 'contents', cursor: 'pointer' }}>
                  <Checkbox
                    checked={permissions[modKey]?.['*']?.includes(action) || false}
                    onChange={() => togglePerm(modKey, '*', action)}
                    style={{ color: '#f0ede6' }}
                  >
                    {cap(action)}
                  </Checkbox>
                  <span style={{ color: 'rgba(240,237,230,0.6)', fontSize: 12 }}>{ticks[action]}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </Modal>
    </div>
  );
}

