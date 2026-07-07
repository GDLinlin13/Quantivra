import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, message, Space, Tag, Typography } from 'antd';
import { PlusOutlined, PlayCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { supabase } from '../../utils/supabase';
import { useCompanyId } from '../../utils/useCompany';

export default function StandingInstructionsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logInstruction, setLogInstruction] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => { load(); }, []);

  const companyId = useCompanyId();

  async function load() {
    const [iRes, aRes] = await Promise.all([
      supabase.from('standing_instructions').select('*').eq('company_id', companyId).order('name'),
      supabase.from('chart_of_accounts').select('id, code, name').eq('company_id', companyId).order('code'),
    ]);
    setItems(iRes.data || []);
    setAccounts(aRes.data || []);
    setLoading(false);
  }

  async function loadLogs(instructionId: number) {
    const { data } = await supabase.from('standing_instruction_logs').select('*').eq('instruction_id', instructionId).order('period', { ascending: false });
    setLogs(data || []);
  }

  async function handleSave(values: any) {
    setSaving(true);
    try {
      const payload = { ...values, company_id: companyId, next_date: values.next_date?.format('YYYY-MM-DD') };
      if (editItem) {
        await supabase.from('standing_instructions').update(payload).eq('id', editItem.id);
      } else {
        await supabase.from('standing_instructions').insert(payload);
      }
      message.success('Saved');
      setModalOpen(false);
      load();
    } catch (err: any) { message.error(err.message); } finally { setSaving(false); }
  }

  async function handlePost(instruction: any) {
    const period = dayjs().format('YYYY-MM');
    const { data: existing } = await supabase.from('standing_instruction_logs').select('id').eq('instruction_id', instruction.id).eq('period', period).maybeSingle();
    if (existing) { message.warning('Already posted for this period'); return; }

    const amount = instruction.adjustable ? instruction.amount : instruction.amount;
    const { data: jEntry } = await supabase.from('journal_entries').insert({
      company_id: companyId, entry_date: dayjs().format('YYYY-MM-DD'),
      reference: `SI-${instruction.id}-${period}`, description: `${instruction.name} - ${period}`,
    }).select().single();

    if (jEntry) {
      // Find the bank account or default expense account
      const bankAcct = accounts.find(a => a.code === '1100') || accounts[0];
      await supabase.from('journal_lines').insert([
        { journal_entry_id: jEntry.id, account_id: instruction.account_id, debit: amount, credit: 0, description: instruction.name },
        { journal_entry_id: jEntry.id, account_id: bankAcct.id, debit: 0, credit: amount, description: instruction.name },
      ]);
      await supabase.from('standing_instruction_logs').insert({
        instruction_id: instruction.id, period, original_amount: amount, adjusted_amount: amount,
        status: 'posted', journal_entry_id: jEntry.id,
      });
      await supabase.from('standing_instructions').update({ last_processed: dayjs().format('YYYY-MM-DD') }).eq('id', instruction.id);
      message.success('Posted');
      load();
    }
  }

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (v: number) => `$${v?.toFixed(2)}` },
    { title: 'Account', dataIndex: 'account_id', key: 'acct', render: (id: number) => accounts.find(a => a.id === id)?.name || '—' },
    { title: 'Frequency', dataIndex: 'frequency', key: 'freq' },
    { title: 'Next Date', dataIndex: 'next_date', key: 'next' },
    { title: 'Adjustable', dataIndex: 'adjustable', key: 'adj', render: (v: number) => v ? <Tag color="blue">Yes</Tag> : <Tag>No</Tag> },
    { title: 'Status', dataIndex: 'is_active', key: 'active', render: (v: number) => v ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag> },
    {
      title: 'Actions', key: 'actions',
      render: (_: any, row: any) => (
        <Space>
          <Button size="small" icon={<PlayCircleOutlined />} onClick={() => handlePost(row)}>Post</Button>
          <Button size="small" onClick={() => { setLogInstruction(row); loadLogs(row.id); setLogModalOpen(true); }}>Log</Button>
          <Button size="small" onClick={() => { setEditItem(row); form.setFieldsValue({ ...row, next_date: row.next_date ? dayjs(row.next_date) : null }); setModalOpen(true); }}>Edit</Button>
        </Space>
      ),
    },
  ];

  const logColumns = [
    { title: 'Period', dataIndex: 'period', key: 'period' },
    { title: 'Original', dataIndex: 'original_amount', key: 'orig', render: (v: number) => `$${v?.toFixed(2)}` },
    { title: 'Adjusted', dataIndex: 'adjusted_amount', key: 'adj', render: (v: number) => v != null ? `$${v.toFixed(2)}` : '—' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'posted' ? 'green' : s === 'pending' ? 'orange' : 'default'}>{s}</Tag> },
    { title: 'JE ID', dataIndex: 'journal_entry_id', key: 'je' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Standing Instructions</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditItem(null); form.resetFields(); setModalOpen(true); }}>Add Instruction</Button>
      </div>
      <Table dataSource={items} columns={columns} rowKey="id" loading={loading} />

      <Modal title={editItem ? 'Edit Instruction' : 'New Instruction'} open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="account_id" label="Expense Account" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children">
              {accounts.map(a => <Select.Option key={a.id} value={a.id}>{a.code} - {a.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} prefix="$" />
          </Form.Item>
          <Form.Item name="frequency" label="Frequency">
            <Select>
              <Select.Option value="monthly">Monthly</Select.Option>
              <Select.Option value="quarterly">Quarterly</Select.Option>
              <Select.Option value="yearly">Yearly</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="next_date" label="Next Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="adjustable" label="Allow adjustment before posting" valuePropName="checked" initialValue={1}>
            <Select>
              <Select.Option value={1}>Yes</Select.Option>
              <Select.Option value={0}>No</Select.Option>
            </Select>
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>Save</Button>
        </Form>
      </Modal>

      <Modal title={`Log - ${logInstruction?.name}`} open={logModalOpen} onCancel={() => setLogModalOpen(false)} footer={null} width={600}>
        <Table dataSource={logs} columns={logColumns} rowKey="id" pagination={false} size="small" />
      </Modal>
    </div>
  );
}
