import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Select, DatePicker, InputNumber, message, Typography, Divider, Space, Upload, List } from 'antd';
import { PlusOutlined, DeleteOutlined, UploadOutlined, EyeOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { supabase } from '../../utils/supabase';
import { useCompanyId } from '../../utils/useCompany';

export default function InvoiceFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<any[]>([{ description: '', quantity: 1, unit_price: 0, total: 0 }]);
  const [attachments, setAttachments] = useState<any[]>([]);

  const companyId = useCompanyId();

  useEffect(() => {
    if (id) loadInvoice();
  }, [id]);

  async function loadInvoice() {
    setLoading(true);
    try {
      const { data: invoice } = await supabase.from('invoices').select('*').eq('id', id).single();
      if (invoice) {
        form.setFieldsValue({ ...invoice, issue_date: dayjs(invoice.issue_date), due_date: dayjs(invoice.due_date) });
        const { data: invItems } = await supabase.from('invoice_items').select('*').eq('invoice_id', id);
        if (invItems?.length) setItems(invItems);
        const { data: invAttachments } = await supabase.from('invoice_attachments').select('*').eq('invoice_id', id);
        setAttachments(invAttachments || []);
      }
    } catch (err: any) { message.error(err.message); } finally { setLoading(false); }
  }

  function updateItem(idx: number, field: string, value: any) {
    const newItems = [...items];
    newItems[idx][field] = value;
    if (field === 'quantity' || field === 'unit_price') {
      newItems[idx].total = (parseFloat(newItems[idx].quantity) || 0) * (parseFloat(newItems[idx].unit_price) || 0);
    }
    setItems(newItems);
  }

  function addItem() { setItems([...items, { description: '', quantity: 1, unit_price: 0, total: 0 }]); }
  function removeItem(idx: number) { if (items.length > 1) setItems(items.filter((_, i) => i !== idx)); }

  const subtotal = items.reduce((s, i) => s + (i.total || 0), 0);
  const taxRate = Form.useWatch('tax_rate', form) || 0;
  const taxAmount = subtotal * (taxRate / 100);
  const totalAmount = subtotal + taxAmount;

  async function handleSave(values: any) {
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        invoice_number: values.invoice_number,
        client_name: values.client_name,
        client_email: values.client_email,
        client_address: values.client_address,
        client_tax_id: values.client_tax_id,
        issue_date: values.issue_date.format('YYYY-MM-DD'),
        due_date: values.due_date.format('YYYY-MM-DD'),
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        notes: values.notes,
        status: values.status || 'draft',
      };

      let invoiceId = id ? parseInt(id) : null;

      if (invoiceId) {
        await supabase.from('invoices').update(payload).eq('id', invoiceId);
        await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId);
      } else {
        const { data: newInv, error: invErr } = await supabase.from('invoices').insert(payload).select().single();
        if (invErr) throw invErr;
        invoiceId = newInv.id;
      }

      if (invoiceId) {
        const lineItems = items.filter(i => i.description).map(i => ({
          invoice_id: invoiceId,
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unit_price,
          total: i.total,
        }));
        if (lineItems.length) await supabase.from('invoice_items').insert(lineItems);
      }

      message.success('Invoice saved');
      navigate('/invoicing');
    } catch (err: any) { message.error(err.message); } finally { setSaving(false); }
  }

  async function handleAttachmentUpload(file: File) {
    try {
      const ext = file.name.split('.').pop();
      const filePath = `invoice-attachments/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from('company-files').upload(filePath, file);
      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = supabase.storage.from('company-files').getPublicUrl(filePath);

      if (id) {
        await supabase.from('invoice_attachments').insert({
          invoice_id: parseInt(id),
          file_name: file.name,
          file_url: publicUrl,
          file_size: file.size,
        });
        loadInvoice();
      } else {
        setAttachments([...attachments, { file_name: file.name, file_url: publicUrl }]);
      }
      message.success('File attached');
    } catch (err: any) { message.error('Upload failed: ' + err.message); }
    return false;
  }

  if (loading) return <Typography.Text>Loading...</Typography.Text>;

  return (
    <div>
      <Typography.Title level={4}>{id ? 'Edit Invoice' : 'New Invoice'}</Typography.Title>
      <Card>
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ tax_rate: 0, status: 'draft' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="invoice_number" label="Invoice Number" rules={[{ required: true }]}>
              <Input placeholder="INV-001" />
            </Form.Item>
            <Form.Item name="status" label="Status">
              <Select>
                <Select.Option value="draft">Draft</Select.Option>
                <Select.Option value="sent">Sent</Select.Option>
                <Select.Option value="paid">Paid</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="issue_date" label="Issue Date" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="due_date" label="Due Date" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <Divider>Client</Divider>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="client_name" label="Client Name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="client_email" label="Client Email"><Input type="email" /></Form.Item>
            <Form.Item name="client_address" label="Client Address" style={{ gridColumn: '1 / -1' }}>
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item name="client_tax_id" label="Client Tax ID"><Input /></Form.Item>
          </div>

          <Divider>Invoice Items</Divider>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <th style={{ padding: 8, textAlign: 'left', width: '40%' }}>Description</th>
                <th style={{ padding: 8, textAlign: 'right', width: '15%' }}>Quantity</th>
                <th style={{ padding: 8, textAlign: 'right', width: '15%' }}>Unit Price</th>
                <th style={{ padding: 8, textAlign: 'right', width: '15%' }}>Total</th>
                <th style={{ padding: 8, width: '10%' }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td style={{ padding: 4 }}><Input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} placeholder="Item description" /></td>
                  <td style={{ padding: 4 }}><InputNumber style={{ width: '100%' }} value={item.quantity} onChange={v => updateItem(idx, 'quantity', v)} min={0.01} step={1} /></td>
                  <td style={{ padding: 4 }}><InputNumber style={{ width: '100%' }} value={item.unit_price} onChange={v => updateItem(idx, 'unit_price', v)} min={0} step={0.01} prefix="$" /></td>
                  <td style={{ padding: 4, textAlign: 'right' }}>${item.total?.toFixed(2)}</td>
                  <td style={{ padding: 4 }}><Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeItem(idx)} disabled={items.length <= 1} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button type="dashed" onClick={addItem} block style={{ marginTop: 8 }} icon={<PlusOutlined />}>Add Item</Button>

          <Divider>Summary</Divider>
          <div style={{ textAlign: 'right' }}>
            <p>Subtotal: <strong>${subtotal.toFixed(2)}</strong></p>
            <Form.Item name="tax_rate" label="Tax Rate (%)" style={{ display: 'inline-block', width: 150, marginLeft: 16 }}>
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
            <p>Tax: <strong>${taxAmount.toFixed(2)}</strong></p>
            <p style={{ fontSize: 18 }}>Total: <strong>${totalAmount.toFixed(2)}</strong></p>
          </div>

          <Divider>Attachments</Divider>
          <Upload beforeUpload={handleAttachmentUpload} showUploadList={false} accept=".pdf,.jpg,.png,.doc,.docx,.xls,.xlsx">
            <Button icon={<UploadOutlined />}>Attach File</Button>
          </Upload>
          {attachments.length > 0 && (
            <List style={{ marginTop: 8 }}
              dataSource={attachments}
              renderItem={(att: any) => (
                <List.Item actions={[<Button size="small" icon={<EyeOutlined />} onClick={() => window.open(att.file_url, '_blank')}>View</Button>]}>
                  {att.file_name}
                </List.Item>
              )}
            />
          )}

          <Divider />
          <Form.Item name="notes" label="Notes"><Input.TextArea rows={3} /></Form.Item>

          <Space>
            <Button type="primary" htmlType="submit" loading={saving}>Save Invoice</Button>
            <Button onClick={() => navigate('/invoicing')}>Cancel</Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}
