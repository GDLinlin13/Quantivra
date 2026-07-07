import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Select, message, Tag, Space, Typography, Switch, Form, Input, Checkbox } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
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
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addForm] = Form.useForm();
  const addRoles = Form.useWatch('_roles', addForm);

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
      const preservedRoles = (selectedUser.roles || []).filter((r: string) => !['hr','accountant','employee','hr:leave_approve','hr:payroll','accountant:view_only'].includes(r));
      const merged = [...new Set([...preservedRoles, ...selectedRoles])];
      await supabase.from('users').update({ roles: merged }).eq('id', selectedUser.id);
      message.success('Roles updated');
      setRolesModal(false);
      load();
    } catch (err: any) { message.error(err.message); } finally { setSaving(false); }
  }

  const roleColors: Record<string, string> = { master: 'purple', hr: 'cyan', accountant: 'geekblue', employee: 'green', 'hr:leave_approve': 'cyan', 'hr:payroll': 'cyan', 'accountant:view_only': 'geekblue' };

  const roleLabels: Record<string, string> = {
    hr: 'HR',
    accountant: 'Accountant',
    employee: 'Employee',
    master: 'Master',
    'hr:leave_approve': 'Leave Approvals',
    'hr:payroll': 'Payroll Access',
    'accountant:view_only': 'View Only',
  };

  async function handleAddUser(values: any) {
    setAdding(true);
    try {
      const roles = values._roles?.length ? values._roles : ['hr'];
      const internalEmail = `${values.username.toLowerCase().replace(/[^a-z0-9]/g, '_')}@acchr.internal`;
      const allRoles = [...roles];
      if (values._role_hr_leave) allRoles.push('hr:leave_approve');
      if (values._role_hr_payroll) allRoles.push('hr:payroll');
      if (values._role_acc_viewonly) allRoles.push('accountant:view_only');
      await supabase.from('users').insert({
        company_id: companyId,
        username: values.username,
        email: internalEmail,
        full_name: values.full_name,
        password_hash: values.password,
        roles: allRoles,
        is_active: 1,
      });
      message.success('User created');
      setAddModalOpen(false);
      addForm.resetFields();
      load();
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>User Management</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { addForm.resetFields(); addForm.setFieldValue('_roles', ['hr']); setAddModalOpen(true); }}>Add User</Button>
      </div>
      <Table dataSource={users} rowKey="id" loading={loading}
        columns={[
          { title: 'Name', dataIndex: 'full_name', key: 'name' },
          { title: 'Username', dataIndex: 'username', key: 'username' },
          {
            title: 'Roles', key: 'roles',
            render: (_: any, row: any) => (
              <Space size={4} wrap>
                {(row.roles || []).filter((r: string) => r !== 'employee').map((r: string) => (
                  <Tag key={r} color={roleColors[r]}>{roleLabels[r] || r}</Tag>
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
        {(selectedUser?.roles || []).includes('master') ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
            <Tag color="purple" style={{ fontSize: 16, padding: '4px 12px' }}>master</Tag>
            <div style={{ marginTop: 8 }}>Full system access</div>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 8 }}>Roles</div>
            <Checkbox checked={selectedRoles.includes('hr')}
              onChange={e => setSelectedRoles(prev => e.target.checked ? [...prev, 'hr'] : prev.filter(r => r !== 'hr' && r !== 'hr:leave_approve' && r !== 'hr:payroll'))}>
              HR
            </Checkbox>
            {selectedRoles.includes('hr') && (
              <div style={{ paddingLeft: 28, marginBottom: 8 }}>
                <Checkbox checked={selectedRoles.includes('hr:leave_approve')}
                  onChange={e => setSelectedRoles(prev => e.target.checked ? [...prev, 'hr:leave_approve'] : prev.filter(r => r !== 'hr:leave_approve'))}>
                  Leave Approvals
                </Checkbox>
                <br />
                <Checkbox checked={selectedRoles.includes('hr:payroll')}
                  onChange={e => setSelectedRoles(prev => e.target.checked ? [...prev, 'hr:payroll'] : prev.filter(r => r !== 'hr:payroll'))}>
                  Payroll Access
                </Checkbox>
              </div>
            )}
            <div style={{ marginBottom: 8 }}>
              <Checkbox checked={selectedRoles.includes('accountant')}
                onChange={e => setSelectedRoles(prev => e.target.checked ? [...prev, 'accountant'] : prev.filter(r => r !== 'accountant' && r !== 'accountant:view_only'))}>
                Accountant
              </Checkbox>
              {selectedRoles.includes('accountant') && (
                <div style={{ paddingLeft: 28 }}>
                  <Checkbox checked={selectedRoles.includes('accountant:view_only')}
                    onChange={e => setSelectedRoles(prev => e.target.checked ? [...prev, 'accountant:view_only'] : prev.filter(r => r !== 'accountant:view_only'))}>
                    View Only
                  </Checkbox>
                </div>
              )}
            </div>
            <Checkbox checked={selectedRoles.includes('employee')}
              onChange={e => setSelectedRoles(prev => e.target.checked ? [...prev, 'employee'] : prev.filter(r => r !== 'employee'))}>
              Employee
            </Checkbox>
            <Button type="primary" block style={{ marginTop: 12 }} loading={saving} onClick={saveRoles}>Save Roles</Button>
          </div>
        )}
      </Modal>

      <Modal title="Add User" open={addModalOpen} onCancel={() => setAddModalOpen(false)} footer={null}>
        <Form form={addForm} layout="vertical" onFinish={handleAddUser}>
          <Form.Item name="username" label="Username" rules={[{ required: true }]}>
            <Input style={{ textTransform: 'uppercase' }} onChange={e => { e.target.value = e.target.value.toUpperCase(); }} />
          </Form.Item>
          <Form.Item name="full_name" label="Full Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, min: 4 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="_roles" label="Roles">
            <Checkbox.Group>
              <Checkbox value="hr">HR</Checkbox>
              <Checkbox value="accountant">Accountant</Checkbox>
            </Checkbox.Group>
          </Form.Item>
          {(addRoles || []).includes('hr') && (
            <div style={{ paddingLeft: 28, marginBottom: 12 }}>
              <Form.Item name="_role_hr_leave" valuePropName="checked"><Checkbox>Leave Approvals</Checkbox></Form.Item>
              <Form.Item name="_role_hr_payroll" valuePropName="checked"><Checkbox>Payroll Access</Checkbox></Form.Item>
            </div>
          )}
          {(addRoles || []).includes('accountant') && (
            <div style={{ paddingLeft: 28, marginBottom: 12 }}>
              <Form.Item name="_role_acc_viewonly" valuePropName="checked"><Checkbox>View Only</Checkbox></Form.Item>
            </div>
          )}
          <Button type="primary" htmlType="submit" loading={adding} block>Create User</Button>
        </Form>
      </Modal>
    </div>
  );
}
