import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Space, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { supabase } from '../../utils/supabase';
import { useCompanyId } from '../../utils/useCompany';

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => { loadAccounts(); }, []);

  const companyId = useCompanyId();

  async function loadAccounts() {
    try {
      const { data } = await supabase.from('chart_of_accounts').select('*').eq('company_id', companyId).order('code');
      setAccounts(data || []);
    } catch {} finally { setLoading(false); }
  }

  async function handleSave(values: any) {
    setSaving(true);
    try {
      const payload = { ...values, company_id: companyId };
      if (editAccount) {
        await supabase.from('chart_of_accounts').update(payload).eq('id', editAccount.id);
      } else {
        await supabase.from('chart_of_accounts').insert(payload);
      }
      message.success('Account saved');
      setModalOpen(false);
      loadAccounts();
    } catch (err: any) { message.error(err.message); } finally { setSaving(false); }
  }

  const typeColors: Record<string, string> = { asset: 'blue', liability: 'orange', equity: 'purple', income: 'green', expense: 'red' };
  const columns = [
    { title: 'Code', dataIndex: 'code', key: 'code', width: 100 },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Type', dataIndex: 'type', key: 'type', render: (s: string) => <Tag color={typeColors[s]}>{s}</Tag> },
    { title: 'Subtype', dataIndex: 'subtype', key: 'subtype' },
    { title: 'Status', dataIndex: 'is_active', key: 'active', render: (v: number) => v ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag> },
    {
      title: 'Actions', key: 'actions',
      render: (_: any, row: any) => (
        <Button size="small" onClick={() => { setEditAccount(row); form.setFieldsValue(row); setModalOpen(true); }}>Edit</Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Chart of Accounts</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditAccount(null); form.resetFields(); setModalOpen(true); }}>Add Account</Button>
      </div>
      <Table dataSource={accounts} columns={columns} rowKey="id" loading={loading} />

      <Modal title={editAccount ? 'Edit Account' : 'Add Account'} open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="code" label="Account Code" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label="Account Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="asset">Asset</Select.Option>
              <Select.Option value="liability">Liability</Select.Option>
              <Select.Option value="equity">Equity</Select.Option>
              <Select.Option value="income">Income</Select.Option>
              <Select.Option value="expense">Expense</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="subtype" label="Subtype">
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>Save</Button>
        </Form>
      </Modal>
    </div>
  );
}
