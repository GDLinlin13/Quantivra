import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Select, message, Tag, Space, Typography, Switch } from 'antd';
import { supabase } from '../../utils/supabase';
import { useCompanyId } from '../../utils/useCompany';

export default function UserManagementPage() {
  const companyId = useCompanyId();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolesModal, setRolesModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('users').select('*').eq('company_id', companyId).order('full_name');
    setUsers(data || []);
    setLoading(false);
  }

  async function toggleActive(u: any) {
    await supabase.from('users').update({ is_active: u.is_active ? 0 : 1 }).eq('id', u.id);
    message.success(u.is_active ? 'User deactivated' : 'User activated');
    load();
  }

  async function resetPassword(u: any) {
    try {
      const { data: emp } = await supabase.from('employees').select('employee_code').eq('user_id', u.id).maybeSingle();
      const newPw = emp?.employee_code || 'password123';
      await supabase.from('users').update({ password_hash: newPw }).eq('id', u.id);
      message.success(`Password reset to: ${newPw}`);
    } catch (err: any) {
      message.error(err.message);
    }
  }

  function openRoles(u: any) {
    setSelectedUser(u);
    setSelectedRoles(u.roles || []);
    setRolesModal(true);
  }

  async function saveRoles() {
    setSaving(true);
    try {
      await supabase.from('users').update({ roles: selectedRoles }).eq('id', selectedUser.id);
      message.success('Roles updated');
      setRolesModal(false);
      load();
    } catch (err: any) { message.error(err.message); } finally { setSaving(false); }
  }

  const roleColors: Record<string, string> = { master: 'purple', hr: 'cyan', accountant: 'geekblue', employee: 'green' };

  return (
    <div>
      <Typography.Title level={4}>User Management</Typography.Title>
      <Table dataSource={users} rowKey="id" loading={loading}
        columns={[
          { title: 'Name', dataIndex: 'full_name', key: 'name' },
          { title: 'Email', dataIndex: 'email', key: 'email' },
          { title: 'Username', dataIndex: 'username', key: 'username' },
          {
            title: 'Roles', key: 'roles',
            render: (_: any, row: any) => (
              <Space size={4}>
                {(row.roles || []).filter((r: string) => r !== 'master' && r !== 'employee').map((r: string) => (
                  <Tag key={r} color={roleColors[r]}>{r}</Tag>
                ))}
              </Space>
            ),
          },
          {
            title: 'Active', key: 'active',
            render: (_: any, row: any) => (
              <Switch checked={row.is_active === 1} onChange={() => toggleActive(row)} size="small" />
            ),
          },
          {
            title: 'Actions', key: 'actions', width: 200,
            render: (_: any, row: any) => (
              <Space>
                <Button size="small" onClick={() => openRoles(row)}>Roles</Button>
                <Button size="small" onClick={() => resetPassword(row)}>Reset PW</Button>
              </Space>
            ),
          },
        ]}
      />

      <Modal title={`Roles — ${selectedUser?.full_name || ''}`} open={rolesModal} onCancel={() => setRolesModal(false)} footer={null}>
        <Select mode="multiple" style={{ width: '100%' }} value={selectedRoles}
          onChange={setSelectedRoles} placeholder="Select roles">
          <Select.Option value="hr">HR</Select.Option>
          <Select.Option value="accountant">Accountant</Select.Option>
          <Select.Option value="employee">Employee</Select.Option>
        </Select>
        <Button type="primary" block style={{ marginTop: 12 }} loading={saving} onClick={saveRoles}>Save Roles</Button>
      </Modal>
    </div>
  );
}
