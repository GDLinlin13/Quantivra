import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, InputNumber, message, Space, Tag, Typography, Row, Col, Card, Statistic, Upload } from 'antd';
import { PlusOutlined, UploadOutlined, EyeOutlined } from '@ant-design/icons';
import { supabase } from '../../utils/supabase';
import { useCompanyId } from '../../utils/useCompany';
import { useAuth } from '../../contexts/AuthContext';
import { can } from '../../utils/permissions';

export default function ClaimsPage() {
  const companyId = useCompanyId();
  const { user, hasRole } = useAuth();
  const [claims, setClaims] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [stats, setStats] = useState({ pending: 0, approved: 0, paid: 0 });

  const isEmployee = hasRole('employee') && !hasRole('hr', 'accountant', 'master');
  const canApprove = can('claim.approve', user?.roles);
  const canViewAll = can('claim.view_all', user?.roles);
  const canApply = can('claim.apply', user?.roles);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      let query = supabase.from('claims').select('*, employees(full_name)').eq('company_id', companyId);
      if (isEmployee && user) {
        const emp = await supabase.from('employees').select('id').eq('user_id', user.id).single();
        if (emp.data) query = query.eq('employee_id', emp.data.id);
      }
      const { data } = await query.order('created_at', { ascending: false });
      setClaims(data || []);
      setStats({
        pending: (data || []).filter((c: any) => c.status === 'pending').length,
        approved: (data || []).filter((c: any) => c.status === 'approved').length,
        paid: (data || []).filter((c: any) => c.status === 'paid').length,
      });

      if (canViewAll) {
        const { data: emps } = await supabase.from('employees').select('id, full_name').eq('company_id', companyId).eq('status', 'active');
        setEmployees(emps || []);
      } else if (user) {
        const { data: emp } = await supabase.from('employees').select('id, full_name').eq('user_id', user.id).single();
        setEmployees(emp ? [emp] : []);
      }
    } catch {} finally { setLoading(false); }
  }

  async function handleSave(values: any) {
    setSaving(true);
    try {
      let employeeId = values.employee_id;
      if (!employeeId && user) {
        const { data: emp } = await supabase.from('employees').select('id').eq('user_id', user.id).single();
        employeeId = emp?.id;
      }
      await supabase.from('claims').insert({
        company_id: companyId,
        employee_id: employeeId,
        claim_type: values.claim_type,
        title: values.title,
        description: values.description,
        amount: values.amount,
        status: 'pending',
      });
      message.success('Claim submitted');
      setModalOpen(false);
      loadData();
    } catch (err: any) { message.error(err.message); } finally { setSaving(false); }
  }

  async function updateStatus(id: number, status: string) {
    await supabase.from('claims').update({ status, approved_by: user?.id, approved_at: new Date().toISOString() }).eq('id', id);
    message.success(`Claim ${status}`);
    loadData();
  }

  const statusColors: Record<string, string> = { pending: 'gold', approved: 'blue', rejected: 'red', paid: 'green' };

  const columns = [
    { title: 'Title', dataIndex: 'title', key: 'title' },
    { title: 'Employee', dataIndex: ['employees', 'full_name'], key: 'emp' },
    { title: 'Type', dataIndex: 'claim_type', key: 'type', render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (v: number) => `$${v?.toFixed(2)}` },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={statusColors[s]}>{s}</Tag> },
    {
      title: 'Actions', key: 'actions',
      render: (_: any, row: any) => (
        <Space>
          {canApprove && row.status === 'pending' && (
            <>
              <Button size="small" type="primary" onClick={() => updateStatus(row.id, 'approved')}>Approve</Button>
              <Button size="small" danger onClick={() => updateStatus(row.id, 'rejected')}>Reject</Button>
            </>
          )}
          {row.status === 'approved' && <Button size="small" onClick={() => updateStatus(row.id, 'paid')}>Mark Paid</Button>}
          {row.receipt_url && <Button size="small" icon={<EyeOutlined />} onClick={() => window.open(row.receipt_url, '_blank')}>Receipt</Button>}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Expense Claims</Typography.Title>
        {canApply && <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>New Claim</Button>}
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}><Card size="small"><Statistic title="Pending" value={stats.pending} valueStyle={{ color: '#faad14' }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="Approved" value={stats.approved} valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="Paid" value={stats.paid} valueStyle={{ color: '#52c41a' }} /></Card></Col>
      </Row>

      <Table dataSource={claims} columns={columns} rowKey="id" loading={loading} />

      <Modal title="New Claim" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          {canViewAll && (
            <Form.Item name="employee_id" label="Employee" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="children">
                {employees.map(e => <Select.Option key={e.id} value={e.id}>{e.full_name}</Select.Option>)}
              </Select>
            </Form.Item>
          )}
          <Form.Item name="claim_type" label="Claim Type" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="travel">Travel</Select.Option>
              <Select.Option value="medical">Medical</Select.Option>
              <Select.Option value="transport">Transport</Select.Option>
              <Select.Option value="meals">Meals</Select.Option>
              <Select.Option value="supplies">Supplies</Select.Option>
              <Select.Option value="other">Other</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} prefix="$" /></Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>Submit Claim</Button>
        </Form>
      </Modal>
    </div>
  );
}
