import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber, message, Space, Tag, Typography, Row, Col, Card, Statistic } from 'antd';
import { PlusOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { supabase } from '../../utils/supabase';
import { useCompanyId } from '../../utils/useCompany';

export default function InvoicesPage() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ draft: 0, sent: 0, paid: 0, overdue: 0, total: 0 });

  useEffect(() => { loadInvoices(); }, []);

  const companyId = useCompanyId();

  async function loadInvoices() {
    try {
      const { data } = await supabase.from('invoices').select('*').eq('company_id', companyId).order('created_at', { ascending: false });
      setInvoices(data || []);
      setStats({
        draft: (data || []).filter((i: any) => i.status === 'draft').length,
        sent: (data || []).filter((i: any) => i.status === 'sent').length,
        paid: (data || []).filter((i: any) => i.status === 'paid').length,
        overdue: (data || []).filter((i: any) => i.status === 'overdue').length,
        total: (data || []).reduce((s: number, i: any) => s + (i.total_amount || 0), 0),
      });
    } catch {} finally { setLoading(false); }
  }

  async function updateStatus(id: number, status: string) {

    await supabase.from('invoices').update({ status }).eq('id', id);
    message.success(`Invoice ${status}`);
    loadInvoices();
  }

  const statusColors: Record<string, string> = { draft: 'default', sent: 'blue', paid: 'green', overdue: 'red', cancelled: 'grey' };

  const columns = [
    { title: 'Invoice #', dataIndex: 'invoice_number', key: 'num' },
    { title: 'Client', dataIndex: 'client_name', key: 'client' },
    { title: 'Issue Date', dataIndex: 'issue_date', key: 'issue' },
    { title: 'Due Date', dataIndex: 'due_date', key: 'due' },
    { title: 'Amount', dataIndex: 'total_amount', key: 'amount', render: (v: number) => `$${v?.toFixed(2)}` },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={statusColors[s]}>{s}</Tag> },
    {
      title: 'Actions', key: 'actions',
      render: (_: any, row: any) => (
        <Space>
          <Button size="small" onClick={() => navigate(`/invoicing/edit/${row.id}`)}>Edit</Button>
          <Select size="small" value={row.status} onChange={v => updateStatus(row.id, v)} style={{ width: 100 }}>
            <Select.Option value="draft">Draft</Select.Option>
            <Select.Option value="sent">Sent</Select.Option>
            <Select.Option value="paid">Paid</Select.Option>
            <Select.Option value="overdue">Overdue</Select.Option>
            <Select.Option value="cancelled">Cancelled</Select.Option>
          </Select>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Sales Invoices</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/invoicing/new')}>New Invoice</Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}><Card size="small"><Statistic title="Draft" value={stats.draft} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="Sent" value={stats.sent} valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="Paid" value={stats.paid} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="Overdue" value={stats.overdue} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="Total Revenue" value={stats.total} precision={2} prefix="$" /></Card></Col>
      </Row>

      <Table dataSource={invoices} columns={columns} rowKey="id" loading={loading} />
    </div>
  );
}
