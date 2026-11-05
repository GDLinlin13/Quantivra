import { useState, useEffect, Fragment } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, message, Typography, Checkbox, Space, Tag, Divider, Switch, Tooltip, Alert } from 'antd';
import { PlusOutlined, SafetyOutlined } from '@ant-design/icons';
import { supabase } from '../../../utils/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { MODULES, type ModuleAction } from '../../../types';
import { MODULE_GUIDE, ACTION_GUIDE } from '../../../data/permissionGuide';

const { Title, Text } = Typography;
const ALL_ACTIONS: ModuleAction[] = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'print', 'void'];

export function CompanyRolesPage() {
  const { companyId } = useAuth();
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [permModalOpen, setPermModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<any>(null);
  const [permissions, setPermissions] = useState<Record<string, Record<string, ModuleAction[]>>>({});
  const [form] = Form.useForm();

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase.from('company_roles').select('*').eq('company_id', companyId);
    setRoles(data || []);
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
    const perms: Record<string, Record<string, ModuleAction[]>> = {};
    for (const [mod, modData] of Object.entries(MODULES)) {
      perms[mod] = { '*': [] };
      for (const feat of modData.features) {
        perms[mod][feat] = [];
      }
    }
    (data || []).forEach((p: any) => {
      if (!perms[p.module]) perms[p.module] = {};
      if (!perms[p.module][p.feature]) perms[p.module][p.feature] = [];
      if (!perms[p.module][p.feature].includes(p.action)) perms[p.module][p.feature].push(p.action);
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
  };

  const togglePay = async (role: any, on: boolean) => {
    const { error } = await supabase.from('company_roles').update({ can_view_pay: on }).eq('id', role.id);
    if (error) { message.error(error.message); return; }
    message.success(on ? `${role.name} can now see pay and manage users` : `${role.name} can no longer see pay or manage users`);
    load();
  };

  const columns = [
    { title: 'Role Name', dataIndex: 'name', key: 'name', render: (v: string) => <span style={{ color: '#f0ede6' }}><SafetyOutlined style={{ marginRight: 8 }} />{v}</span> },
    {
      title: <Tooltip title="Sees salaries, payroll, payslips and ID / bank numbers, and can create users and change roles">Can see pay &amp; manage users</Tooltip>,
      dataIndex: 'can_view_pay', key: 'pay',
      render: (v: boolean, r: any) => <Switch checked={!!v} onChange={on => togglePay(r, on)} />,
    },
    { title: 'System', dataIndex: 'is_system', key: 'system', render: (v: boolean) => v ? <Tag>System</Tag> : null },
    {
      title: 'Actions', key: 'actions',
      render: (_: any, record: any) => (
        <Button type="link" onClick={() => openPermissions(record)}>Configure Permissions</Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ color: '#f0ede6', margin: 0 }}>Roles & Permissions</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}
          style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>
          Create Role
        </Button>
      </div>
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message="Each person's role decides what they can open. Only roles with “Can see pay & manage users” see salaries and payroll, and can add users or change roles." />
      <Table dataSource={roles} columns={columns} loading={loading} rowKey="id"
        style={{ background: 'transparent' }} pagination={false} />

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
          message="How permissions work"
          description={
            <div style={{ fontSize: 12 }}>
              Tick what people with this role may do in each section. Ticks marked ✓ are already used by Quantivra; the others take effect as those features are built.
              <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '2px 12px', marginTop: 8 }}>
                {ALL_ACTIONS.map(a => (
                  <Fragment key={a}><b>{a}{ACTION_GUIDE[a]?.usedNow ? ' ✓' : ''}</b><span>{ACTION_GUIDE[a]?.means} — {ACTION_GUIDE[a]?.example}</span></Fragment>
                ))}
              </div>
              <div style={{ marginTop: 8 }}>Salaries, payroll and ID numbers are controlled by the role’s <b>Can see pay &amp; manage users</b> switch, not by these ticks.</div>
            </div>
          } />
        {Object.entries(MODULES).filter(([modKey]) => modKey !== 'platform').map(([modKey, mod]) => (
          <div key={modKey} style={{ marginBottom: 20 }}>
            <Space>
              <Text style={{ color: '#f0ede6', fontWeight: 600, fontSize: 14 }}>{mod.label}</Text>
              {MODULE_GUIDE[modKey] && !MODULE_GUIDE[modKey].built && <Tag>Not built yet</Tag>}
            </Space>
            {MODULE_GUIDE[modKey] && <div style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>{MODULE_GUIDE[modKey].covers}</div>}
            <Divider style={{ margin: '8px 0', borderColor: 'rgba(255,255,255,0.06)' }} />
            {['*', ...mod.features].map(feat => (
              <div key={feat} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: feat === '*' ? '#f0ede6' : 'rgba(240,237,230,0.7)', width: 120, textTransform: 'capitalize', fontWeight: feat === '*' ? 600 : 400 }}>
                  {feat === '*' ? 'Whole section' : feat}
                </Text>
                <Space wrap>
                  {ALL_ACTIONS.map(action => (
                    <Tooltip key={action} title={`${ACTION_GUIDE[action]?.means}${ACTION_GUIDE[action]?.usedNow ? '' : ' (takes effect when built)'}`}>
                      <Checkbox
                        checked={permissions[modKey]?.[feat]?.includes(action) || false}
                        onChange={() => togglePerm(modKey, feat, action)}
                        style={{ color: '#f0ede6', fontSize: 12 }}
                      >
                        {action}
                      </Checkbox>
                    </Tooltip>
                  ))}
                </Space>
              </div>
            ))}
          </div>
        ))}
      </Modal>
    </div>
  );
}

