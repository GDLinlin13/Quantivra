import { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, message, Typography, Checkbox, Space, Tag, Divider } from 'antd';
import { PlusOutlined, SafetyOutlined } from '@ant-design/icons';
import { supabase } from '../../../utils/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { MODULES, type ModuleAction } from '../../../types';

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
    await supabase.from('company_roles').insert({ company_id: companyId, name: values.name, is_system: false });
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
      perms[mod] = {};
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

  const columns = [
    { title: 'Role Name', dataIndex: 'name', key: 'name', render: (v: string) => <span style={{ color: '#f0ede6' }}><SafetyOutlined style={{ marginRight: 8 }} />{v}</span> },
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
      <Table dataSource={roles} columns={columns} loading={loading} rowKey="id"
        style={{ background: 'transparent' }} pagination={false} />

      <Modal title="Create Role" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}
        styles={{ header: { background: '#151a1e', color: '#f0ede6' }, body: { background: '#151a1e' } }}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="Role Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Manager" />
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
        {Object.entries(MODULES).map(([modKey, mod]) => (
          <div key={modKey} style={{ marginBottom: 20 }}>
            <Text style={{ color: '#f0ede6', fontWeight: 600, fontSize: 14 }}>{mod.label}</Text>
            <Divider style={{ margin: '8px 0', borderColor: 'rgba(255,255,255,0.06)' }} />
            {mod.features.map(feat => (
              <div key={feat} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: 'rgba(240,237,230,0.7)', width: 120, textTransform: 'capitalize' }}>{feat}</Text>
                <Space>
                  {ALL_ACTIONS.map(action => (
                    <Checkbox
                      key={action}
                      checked={permissions[modKey]?.[feat]?.includes(action) || false}
                      onChange={() => togglePerm(modKey, feat, action)}
                      style={{ color: '#f0ede6', fontSize: 12 }}
                    >
                      {action}
                    </Checkbox>
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

