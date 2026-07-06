import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber, message, Space, Tag, Typography, Divider } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { supabase } from '../../utils/supabase';
import { useCompanyId } from '../../utils/useCompany';

export default function JournalEntriesPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [lines, setLines] = useState<any[]>([{ account_id: null, debit: 0, credit: 0, description: '' }]);

  useEffect(() => { loadData(); }, []);

  const companyId = useCompanyId();

  async function loadData() {
    try {
      const [entRes, accRes] = await Promise.all([
        supabase.from('journal_entries').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
        supabase.from('chart_of_accounts').select('*').eq('company_id', companyId).eq('is_active', 1).order('code'),
      ]);
      setEntries(entRes.data || []);
      setAccounts(accRes.data || []);
    } catch {} finally { setLoading(false); }
  }

  async function handleSave(values: any) {
    setSaving(true);
    try {
      const totalDebit = lines.reduce((s: number, l: any) => s + (parseFloat(l.debit) || 0), 0);
      const totalCredit = lines.reduce((s: number, l: any) => s + (parseFloat(l.credit) || 0), 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        message.error('Debits must equal credits');
        return;
      }
      if (lines.some(l => !l.account_id)) {
        message.error('All lines need an account');
        return;
      }

      const { data: entry, error: entryErr } = await supabase.from('journal_entries').insert({
        company_id: companyId,
        entry_date: values.entry_date.format('YYYY-MM-DD'),
        reference: values.reference,
        description: values.description,
        created_by: 1,
      }).select().single();

      if (entryErr) throw entryErr;

      const journalLines = lines.filter(l => l.account_id).map(l => ({
        journal_entry_id: entry.id,
        account_id: l.account_id,
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        description: l.description,
      }));

      const { error: linesErr } = await supabase.from('journal_lines').insert(journalLines);
      if (linesErr) throw linesErr;

      message.success('Journal entry saved');
      setModalOpen(false);
      loadData();
    } catch (err: any) { message.error(err.message); } finally { setSaving(false); }
  }

  function addLine() { setLines([...lines, { account_id: null, debit: 0, credit: 0, description: '' }]); }
  function removeLine(idx: number) { if (lines.length > 1) setLines(lines.filter((_, i) => i !== idx)); }
  function updateLine(idx: number, field: string, value: any) {
    const newLines = [...lines];
    newLines[idx][field] = value;
    setLines(newLines);
  }

  const columns = [
    { title: 'Date', dataIndex: 'entry_date', key: 'date' },
    { title: 'Reference', dataIndex: 'reference', key: 'ref' },
    { title: 'Description', dataIndex: 'description', key: 'desc' },
    { title: 'Created', dataIndex: 'created_at', key: 'created' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Journal Entries</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setLines([{ account_id: null, debit: 0, credit: 0, description: '' }]); setModalOpen(true); }}>New Entry</Button>
      </div>
      <Table dataSource={entries} columns={columns} rowKey="id" loading={loading} />

      <Modal title="New Journal Entry" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={700}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="entry_date" label="Entry Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reference" label="Reference">
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>

          <Divider>Journal Lines (Debits = Credits)</Divider>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <th style={{ padding: 8, textAlign: 'left', width: '35%' }}>Account</th>
                <th style={{ padding: 8, textAlign: 'right', width: '15%' }}>Debit</th>
                <th style={{ padding: 8, textAlign: 'right', width: '15%' }}>Credit</th>
                <th style={{ padding: 8, textAlign: 'left', width: '25%' }}>Description</th>
                <th style={{ padding: 8, width: '10%' }}></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={idx}>
                  <td style={{ padding: 4 }}>
                    <Select style={{ width: '100%' }} value={line.account_id} onChange={v => updateLine(idx, 'account_id', v)} showSearch optionFilterProp="children">
                      {accounts.map(a => <Select.Option key={a.id} value={a.id}>{a.code} - {a.name}</Select.Option>)}
                    </Select>
                  </td>
                  <td style={{ padding: 4 }}><InputNumber style={{ width: '100%' }} value={line.debit} onChange={v => updateLine(idx, 'debit', v)} min={0} /></td>
                  <td style={{ padding: 4 }}><InputNumber style={{ width: '100%' }} value={line.credit} onChange={v => updateLine(idx, 'credit', v)} min={0} /></td>
                  <td style={{ padding: 4 }}><Input value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)} /></td>
                  <td style={{ padding: 4 }}><Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeLine(idx)} disabled={lines.length <= 1} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button type="dashed" onClick={addLine} block style={{ marginTop: 8 }}>+ Add Line</Button>

          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <span>Total Debit: <strong>${lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0).toFixed(2)}</strong></span>
            <span style={{ marginLeft: 16 }}>Total Credit: <strong>${lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0).toFixed(2)}</strong></span>
          </div>

          <Button type="primary" htmlType="submit" loading={saving} block style={{ marginTop: 16 }}>Post Entry</Button>
        </Form>
      </Modal>
    </div>
  );
}
