import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Table, Typography, Spin, Alert } from 'antd';
import { TeamOutlined, CalendarOutlined, DollarOutlined, FileTextOutlined } from '@ant-design/icons';
import { supabase } from '../../utils/supabase';
import { useCompanyId } from '../../utils/useCompany';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ employees: 0, pendingLeave: 0, invoices: 0, revenue: 0 });
  const [pendingLeaves, setPendingLeaves] = useState<any[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);

  const companyId = useCompanyId();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [empRes, leaveRes, invRes, pendingLeaveRes, recentInvRes] = await Promise.all([
        supabase.from('employees').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'active'),
        supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('invoices').select('total_amount').eq('company_id', companyId),
        supabase.from('leave_requests').select('*, employees(full_name), leave_types(name)').eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
        supabase.from('invoices').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(5),
      ]);

      const totalRevenue = (invRes.data || []).reduce((sum: number, inv: any) => sum + (inv.total_amount || 0), 0);

      setStats({
        employees: empRes.count || 0,
        pendingLeave: leaveRes.count || 0,
        invoices: invRes.count || 0,
        revenue: totalRevenue,
      });
      setPendingLeaves(pendingLeaveRes.data || []);
      setRecentInvoices(recentInvRes.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <Spin size="large" />;
  if (error) return <Alert type="error" message={error} />;

  const leaveColumns = [
    { title: 'Employee', dataIndex: ['employees', 'full_name'], key: 'employee' },
    { title: 'Type', dataIndex: ['leave_types', 'name'], key: 'type' },
    { title: 'From', dataIndex: 'start_date', key: 'start' },
    { title: 'To', dataIndex: 'end_date', key: 'end' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <span style={{ color: '#faad14' }}>{s}</span> },
  ];

  const invoiceColumns = [
    { title: '#', dataIndex: 'invoice_number', key: 'num' },
    { title: 'Client', dataIndex: 'client_name', key: 'client' },
    { title: 'Amount', dataIndex: 'total_amount', key: 'amount', render: (v: number) => `$${v?.toFixed(2)}` },
    { title: 'Status', dataIndex: 'status', key: 'status' },
    { title: 'Date', dataIndex: 'issue_date', key: 'date' },
  ];

  return (
    <div>
      <Typography.Title level={4}>Dashboard</Typography.Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="Active Employees" value={stats.employees} prefix={<TeamOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="Pending Leave" value={stats.pendingLeave} prefix={<CalendarOutlined />} valueStyle={{ color: '#faad14' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="Total Invoices" value={stats.invoices} prefix={<FileTextOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="Total Revenue" value={stats.revenue} prefix={<DollarOutlined />} precision={2} /></Card></Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Card title="Pending Leave Requests" size="small"><Table dataSource={pendingLeaves} columns={leaveColumns} rowKey="id" pagination={false} size="small" /></Card>
        </Col>
        <Col span={12}>
          <Card title="Recent Invoices" size="small"><Table dataSource={recentInvoices} columns={invoiceColumns} rowKey="id" pagination={false} size="small" /></Card>
        </Col>
      </Row>
    </div>
  );
}
