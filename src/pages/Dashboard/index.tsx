import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Table, Typography, Spin, Alert, Tabs } from 'antd';
import { TeamOutlined, CalendarOutlined, DollarOutlined, FileTextOutlined, UserOutlined, BankOutlined } from '@ant-design/icons';
import { supabase } from '../../utils/supabase';
import { useCompanyId } from '../../utils/useCompany';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hrStats, setHrStats] = useState({ employees: 0, pendingLeave: 0, pendingClaims: 0, activeEmployees: 0 });
  const [pendingLeaves, setPendingLeaves] = useState<any[]>([]);
  const [pendingClaims, setPendingClaims] = useState<any[]>([]);
  const [finStats, setFinStats] = useState({ invoices: 0, revenue: 0, receivables: 0, payables: 0 });
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);
  const [tab, setTab] = useState('hr');

  const companyId = useCompanyId();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [
        empRes, leaveRes, claimRes, activeEmpRes,
        invRes, pendingClaimRes, pendingLeaveRes, recentInvRes,
      ] = await Promise.all([
        supabase.from('employees').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
        supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'pending'),
        supabase.from('claims').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'pending'),
        supabase.from('employees').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'active'),
        supabase.from('invoices').select('total_amount, status').eq('company_id', companyId),
        supabase.from('claims').select('*, employees(full_name)').eq('company_id', companyId).eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
        supabase.from('leave_requests').select('*, employees(full_name), leave_types(name)').eq('company_id', companyId).eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
        supabase.from('invoices').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(5),
      ]);

      const totalRevenue = (invRes.data || []).reduce((sum: number, inv: any) => sum + (inv.total_amount || 0), 0);
      const receivables = (invRes.data || []).filter((inv: any) => inv.status === 'sent' || inv.status === 'overdue').reduce((sum: number, inv: any) => sum + (inv.total_amount || 0), 0);

      setHrStats({
        employees: empRes.count || 0,
        pendingLeave: leaveRes.count || 0,
        pendingClaims: claimRes.count || 0,
        activeEmployees: activeEmpRes.count || 0,
      });
      setFinStats({
        invoices: invRes.count || 0,
        revenue: totalRevenue,
        receivables,
        payables: 0,
      });
      setPendingLeaves(pendingLeaveRes.data || []);
      setPendingClaims(pendingClaimRes.data || []);
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

  const claimColumns = [
    { title: 'Title', dataIndex: 'title', key: 'title' },
    { title: 'Employee', dataIndex: ['employees', 'full_name'], key: 'emp' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (v: number) => `$${v?.toFixed(2)}` },
    { title: 'Status', dataIndex: 'status', key: 'status', render: () => <span style={{ color: '#faad14' }}>pending</span> },
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
      <Tabs activeKey={tab} onChange={setTab} style={{ marginBottom: 16 }}
        items={[
          {
            key: 'hr',
            label: <span><TeamOutlined style={{ marginRight: 6 }} />HR Overview</span>,
            children: (
              <>
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                  <Col xs={12} sm={6}><Card><Statistic title="Total Employees" value={hrStats.employees} prefix={<UserOutlined />} /></Card></Col>
                  <Col xs={12} sm={6}><Card><Statistic title="Active" value={hrStats.activeEmployees} prefix={<TeamOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
                  <Col xs={12} sm={6}><Card><Statistic title="Pending Leave" value={hrStats.pendingLeave} prefix={<CalendarOutlined />} valueStyle={{ color: '#faad14' }} /></Card></Col>
                  <Col xs={12} sm={6}><Card><Statistic title="Pending Claims" value={hrStats.pendingClaims} prefix={<DollarOutlined />} valueStyle={{ color: '#faad14' }} /></Card></Col>
                </Row>
                <Row gutter={[16, 16]}>
                  <Col xs={24} sm={12}>
                    <Card title="Pending Leave Requests" size="small"><Table dataSource={pendingLeaves} columns={leaveColumns} rowKey="id" pagination={false} size="small" /></Card>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Card title="Pending Claims" size="small"><Table dataSource={pendingClaims} columns={claimColumns} rowKey="id" pagination={false} size="small" /></Card>
                  </Col>
                </Row>
              </>
            ),
          },
          {
            key: 'finance',
            label: <span><BankOutlined style={{ marginRight: 6 }} />Finance Overview</span>,
            children: (
              <>
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                  <Col xs={12} sm={6}><Card><Statistic title="Total Invoices" value={finStats.invoices} prefix={<FileTextOutlined />} /></Card></Col>
                  <Col xs={12} sm={6}><Card><Statistic title="Total Revenue" value={finStats.revenue} prefix={<DollarOutlined />} precision={2} /></Card></Col>
                  <Col xs={12} sm={6}><Card><Statistic title="Receivables" value={finStats.receivables} prefix={<DollarOutlined />} precision={2} valueStyle={{ color: '#faad14' }} /></Card></Col>
                  <Col xs={12} sm={6}><Card><Statistic title="Payables" value={finStats.payables} prefix={<DollarOutlined />} precision={2} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
                </Row>
                <Row gutter={[16, 16]}>
                  <Col span={24}>
                    <Card title="Recent Invoices" size="small"><Table dataSource={recentInvoices} columns={invoiceColumns} rowKey="id" pagination={false} size="small" /></Card>
                  </Col>
                </Row>
              </>
            ),
          },
        ]}
      />
    </div>
  );
}