import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber, message, Space, Tag, Typography, Row, Col, Card, Statistic, Upload } from 'antd';
import { PlusOutlined, UploadOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { supabase } from '../../utils/supabase';
import { useCompanyId } from '../../utils/useCompany';

export default function SupplierInvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editInv, setEditInv] = useState<any>(null);
  const [form] = Form.useForm();
  const [stats, setStats] = useState({ pending: 0, approved: 0, paid: 0 });

  useEffect(() => { loadInvoices(); }, []);

  const companyId = useCompanyId();

  async function loadInvoices() {
    try {
      const { data } = await supabase.from('supplier_invoices').select('*').eq('company_id', companyId).order('created_at', { ascending: false });
      setInvoices(data || []);
      setStats({
        pending: (data || []).filter((i: any) => i.status === 'pending').length,
        approved: (data || []).filter((i: any) => i.status === 'approved').length,
        paid: (data || []).filter((i: any) => i.status === 'paid').length,
      });
    } catch {} finally { setLoading(false); }
  }

  async function handleSave(values: any) {
    setSaving(true);
    try {
      const payload = {
        ...values,
        company_id: companyId,
        date: values.date.format('YYYY-MM-DD'),
        due_date: values.due_date?.format('YYYY-MM-DD'),
      };
      if (editInv) {
        await supabase.from('supplier_invoices').update(payload).eq('id', editInv.id);
      } else {
        await supabase.from('supplier_invoices').insert(payload);
      }
      message.success('Supplier invoice saved');
      setModalOpen(false);
      loadInvoices();
    } catch (err: any) { message.error(err.message); } finally { setSaving(false); }
  }

  async function handleFileUpload(file: File) {
    try {
      const ext = file.name.split('.').pop();
      const filePath = `supplier-invoices/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from('company-files').upload(filePath, file);
      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = supabase.storage.from('company-files').getPublicUrl(filePath);
      form.setFieldValue('file_url', publicUrl);
      form.setFieldValue('file_name', file.name);
      message.success('File uploaded');
    } catch (err: any) { message.error('Upload failed: ' + err.message); }
    return false;
  }

  async function deleteInvoice(id: number) {
    await supabase.from('supplier_invoices').delete().eq('id', id);
    message.success('Deleted');
    loadInvoices();
  }

  const columns = [
    { title: 'Supplier', dataIndex: 'supplier_name', key: 'supplier' },
    { title: 'Invoice #', dataIndex: 'invoice_number', key: 'num' },
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (v: number) => `$${v?.toFixed(2)}` },
    { title: 'Category', dataIndex: 'category', key: 'category' },
    { title: 'File', dataIndex: 'file_name', key: 'file', render: (v: string, row: any) => v ? <Button type="link" icon={<EyeOutlined />} onClick={() => window.open(row.file_url, '_blank')}>{v}</Button> : '-' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => {
      const colors: Record<string, string> = { pending: 'gold', approved: 'blue', paid: 'green', cancelled: 'default' };
      return <Tag color={colors[s]}>{s}</Tag>;
    }},
    {
      title: 'Actions', key: 'actions',
      render: (_: any, row: any) => (
        <Space>
          <Button size="small" onClick={() => { setEditInv(row); form.setFieldsValue({ ...row, date: dayjs(row.date), due_date: row.due_date ? dayjs(row.due_date) : null }); setModalOpen(true); }}>Edit</Button>
          <Select size="small" value={row.status} onChange={v => { supabase.from('supplier_invoices').update({ status: v }).eq('id', row.id).then(() => loadInvoices()); }} style={{ width: 100 }}>
            <Select.Option value="pending">Pending</Select.Option>
            <Select.Option value="approved">Approved</Select.Option>
            <Select.Option value="paid">Paid</Select.Option>
            <Select.Option value="cancelled">Cancelled</Select.Option>
          </Select>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => deleteInvoice(row.id)} />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Supplier Invoices</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditInv(null); form.resetFields(); setModalOpen(true); }}>Add Supplier Invoice</Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}><Card size="small"><Statistic title="Pending" value={stats.pending} valueStyle={{ color: '#faad14' }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="Approved" value={stats.approved} valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="Paid" value={stats.paid} valueStyle={{ color: '#52c41a' }} /></Card></Col>
      </Row>

      <Table dataSource={invoices} columns={columns} rowKey="id" loading={loading} />

      <Modal title={editInv ? 'Edit Supplier Invoice' : 'Add Supplier Invoice'} open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={600}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="supplier_name" label="Supplier Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="invoice_number" label="Invoice Number">
            <Input />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="date" label="Date" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="due_date" label="Due Date">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={0} prefix="$" />
            </Form.Item>
            <Form.Item name="tax_amount" label="Tax Amount">
              <InputNumber style={{ width: '100%' }} min={0} prefix="$" />
            </Form.Item>
          </div>
          <Form.Item name="category" label="Category">
            <Select>
              <Select.Option value="office_supplies">Office Supplies</Select.Option>
              <Select.Option value="utilities">Utilities</Select.Option>
              <Select.Option value="rent">Rent</Select.Option>
              <Select.Option value="equipment">Equipment</Select.Option>
              <Select.Option value="consulting">Consulting</Select.Option>
              <Select.Option value="software">Software</Select.Option>
              <Select.Option value="travel">Travel</Select.Option>
              <Select.Option value="other">Other</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="Upload Invoice File">
            <Upload beforeUpload={handleFileUpload} showUploadList={false} accept=".pdf,.jpg,.png">
              <Button icon={<UploadOutlined />}>Upload File</Button>
            </Upload>
          </Form.Item>
          <Form.Item name="file_name" label="File">
            <Input disabled />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>Save</Button>
        </Form>
      </Modal>
    </div>
  );
}
