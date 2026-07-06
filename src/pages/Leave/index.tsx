import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Select, DatePicker, InputNumber, Input, message, Space, Tag, Typography, Row, Col, Card, Statistic } from 'antd';
import { PlusOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { supabase } from '../../utils/supabase';
import { useCompanyId } from '../../utils/useCompany';
import { useAuth } from '../../contexts/AuthContext';
import { can } from '../../utils/permissions';

export default function LeavePage() {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [myEmployeeId, setMyEmployeeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [form] = Form.useForm();

  const canApprove = can('leave.approve', user?.roles);
  const canViewAll = can('leave.view_all', user?.roles);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      let empId: number | null = null;
      if (!canViewAll && user) {
        const { data: emp } = await supabase.from('employees').select('id').eq('user_id', user.id).eq('company_id', companyId).maybeSingle();
        empId = emp?.id || null;
        setMyEmployeeId(empId);
      }

      let query = supabase.from('leave_requests').select('*, employees(full_name, department), leave_types(name)').eq('company_id', companyId);
      if (empId) query = query.eq('employee_id', empId);
      const { data } = await query.order('created_at', { ascending: false });
      setRequests(data || []);

      const [ltRes, empRes] = await Promise.all([
        supabase.from('leave_types').select('*').eq('company_id', companyId),
        supabase.from('employees').select('id, full_name').eq('company_id', companyId).eq('status', 'active'),
      ]);
      setLeaveTypes(ltRes.data || []);
      setEmployees(empRes.data || []);
      setStats({
        pending: (data || []).filter((r: any) => r.status === 'pending').length,
        approved: (data || []).filter((r: any) => r.status === 'approved').length,
        rejected: (data || []).filter((r: any) => r.status === 'rejected').length,
      });
    } catch {} finally { setLoading(false); }
  }

  async function handleSave(values: any) {
    setSaving(true);
    try {
      const start = values.start_date.format('YYYY-MM-DD');
      const end = values.end_date.format('YYYY-MM-DD');
      const days = values.days || dayjs(end).diff(dayjs(start), 'day') + 1;
      const employeeId = values.employee_id || myEmployeeId;
      await supabase.from('leave_requests').insert({
        employee_id: employeeId,
        leave_type_id: values.leave_type_id,
        start_date: start, end_date: end, days, reason: values.reason, status: 'pending',
      });
      message.success('Leave request submitted');
      setModalOpen(false);
      loadData();
    } catch (err: any) { message.error(err.message); } finally { setSaving(false); }
  }

  async function approveLeave(id: number) { await updateStatus(id, 'approved'); }
  async function rejectLeave(id: number) { await updateStatus(id, 'rejected'); }
  async function updateStatus(id: number, status: string) {
    await supabase.from('leave_requests').update({ status, approved_by: user?.id, approved_at: new Date().toISOString() }).eq('id', id);
    message.success(`Leave ${status}`);
    loadData();
  }

  const columns = [
    { title: 'Employee', dataIndex: ['employees', 'full_name'], key: 'emp' },
    { title: 'Department', dataIndex: ['employees', 'department'], key: 'dept' },
    { title: 'Type', dataIndex: ['leave_types', 'name'], key: 'type' },
    { title: 'From', dataIndex: 'start_date', key: 'start' },
    { title: 'To', dataIndex: 'end_date', key: 'end' },
    { title: 'Days', dataIndex: 'days', key: 'days' },
    { title: 'Reason', dataIndex: 'reason', key: 'reason', ellipsis: true },
    {
      title: 'Status', dataIndex: 'status', key: 'status',
      render: (s: string) => {
        const colors: Record<string, string> = { pending: 'gold', approved: 'green', rejected: 'red', cancelled: 'default' };
        return <Tag color={colors[s] || 'default'}>{s}</Tag>;
      },
    },
    ...(canApprove ? [{
      title: 'Actions', key: 'actions', width: 160,
      render: (_: any, row: any) => row.status === 'pending' ? (
        <Space>
          <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => approveLeave(row.id)}>Approve</Button>
          <Button size="small" danger icon={<CloseOutlined />} onClick={() => rejectLeave(row.id)}>Reject</Button>
        </Space>
      ) : null,
    }] : []),
  ];

  return (
    <div>
      <Typography.Title level={4}>Leave Management</Typography.Title>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card><Statistic title="Pending" value={stats.pending} valueStyle={{ color: '#faad14' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="Approved" value={stats.approved} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="Rejected" value={stats.rejected} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
      </Row>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>New Leave Request</Button>
      </div>
      <Table dataSource={requests} columns={columns} rowKey="id" loading={loading} />

      <Modal title="New Leave Request" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          {canViewAll && (
            <Form.Item name="employee_id" label="Employee" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="children">
                {employees.map(e => <Select.Option key={e.id} value={e.id}>{e.full_name}</Select.Option>)}
              </Select>
            </Form.Item>
          )}
          <Form.Item name="leave_type_id" label="Leave Type" rules={[{ required: true }]}>
            <Select>
              {leaveTypes.map(lt => <Select.Option key={lt.id} value={lt.id}>{lt.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="start_date" label="Start Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="end_date" label="End Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="days" label="Number of Days">
            <InputNumber style={{ width: '100%' }} min={0.5} />
          </Form.Item>
          <Form.Item name="reason" label="Reason">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>Submit Request</Button>
        </Form>
      </Modal>
    </div>
  );
}
