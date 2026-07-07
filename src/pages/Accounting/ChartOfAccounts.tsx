import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Space, Tag, Typography } from 'antd';
import { PlusOutlined, DatabaseOutlined } from '@ant-design/icons';
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

  async function seedAccounts() {
    const { data: existing } = await supabase.from('chart_of_accounts').select('id').eq('company_id', companyId).limit(1);
    if (existing && existing.length > 0) { message.warning('Accounts already exist'); return; }
    const stdAccounts = [
      { code: '1000', name: 'Cash', type: 'asset', subtype: 'Current Asset' },
      { code: '1100', name: 'Bank Account', type: 'asset', subtype: 'Current Asset' },
      { code: '1200', name: 'Accounts Receivable', type: 'asset', subtype: 'Current Asset' },
      { code: '1300', name: 'Inventory', type: 'asset', subtype: 'Current Asset' },
      { code: '1400', name: 'Prepaid Expenses', type: 'asset', subtype: 'Current Asset' },
      { code: '1500', name: 'Equipment', type: 'asset', subtype: 'Fixed Asset' },
      { code: '1510', name: 'Accum. Depreciation - Equipment', type: 'asset', subtype: 'Fixed Asset' },
      { code: '1600', name: 'Vehicles', type: 'asset', subtype: 'Fixed Asset' },
      { code: '1610', name: 'Accum. Depreciation - Vehicles', type: 'asset', subtype: 'Fixed Asset' },
      { code: '1700', name: 'Land & Buildings', type: 'asset', subtype: 'Fixed Asset' },
      { code: '1710', name: 'Accum. Depreciation - Buildings', type: 'asset', subtype: 'Fixed Asset' },
      { code: '2000', name: 'Accounts Payable', type: 'liability', subtype: 'Current Liability' },
      { code: '2100', name: 'Accrued Liabilities', type: 'liability', subtype: 'Current Liability' },
      { code: '2200', name: 'Short-term Loans', type: 'liability', subtype: 'Current Liability' },
      { code: '2300', name: 'Long-term Loans', type: 'liability', subtype: 'Long-term Liability' },
      { code: '2400', name: 'Vehicle Loans Payable', type: 'liability', subtype: 'Long-term Liability' },
      { code: '2500', name: 'Statutory Payables', type: 'liability', subtype: 'Current Liability' },
      { code: '3000', name: "Owner's Equity", type: 'equity', subtype: 'Equity' },
      { code: '3100', name: 'Retained Earnings', type: 'equity', subtype: 'Equity' },
      { code: '3200', name: 'Drawings', type: 'equity', subtype: 'Equity' },
      { code: '4000', name: 'Sales Revenue', type: 'income', subtype: 'Revenue' },
      { code: '4100', name: 'Service Revenue', type: 'income', subtype: 'Revenue' },
      { code: '4200', name: 'Interest Income', type: 'income', subtype: 'Other Income' },
      { code: '5000', name: 'Cost of Goods Sold', type: 'expense', subtype: 'COGS' },
      { code: '5100', name: 'Salaries & Wages', type: 'expense', subtype: 'Operating' },
      { code: '5200', name: 'Rent', type: 'expense', subtype: 'Operating' },
      { code: '5300', name: 'Utilities', type: 'expense', subtype: 'Operating' },
      { code: '5400', name: 'Office Supplies', type: 'expense', subtype: 'Operating' },
      { code: '5500', name: 'Depreciation', type: 'expense', subtype: 'Operating' },
      { code: '5600', name: 'Vehicle Expenses', type: 'expense', subtype: 'Operating' },
      { code: '5700', name: 'Loan Interest', type: 'expense', subtype: 'Financing' },
      { code: '5800', name: 'Bank Charges', type: 'expense', subtype: 'Operating' },
      { code: '5900', name: 'Statutory Contributions', type: 'expense', subtype: 'Operating' },
      { code: '6000', name: 'Insurance', type: 'expense', subtype: 'Operating' },
      { code: '6100', name: 'Professional Fees', type: 'expense', subtype: 'Operating' },
      { code: '6200', name: 'Repairs & Maintenance', type: 'expense', subtype: 'Operating' },
      { code: '6300', name: 'Travel', type: 'expense', subtype: 'Operating' },
      { code: '6400', name: 'Advertising', type: 'expense', subtype: 'Operating' },
      { code: '6500', name: 'Other Expenses', type: 'expense', subtype: 'Operating' },
    ].map(a => ({ ...a, company_id: companyId }));
    const { error } = await supabase.from('chart_of_accounts').insert(stdAccounts);
    if (error) { message.error('Seed failed: ' + error.message); return; }
    message.success('Standard accounts created');
    loadAccounts();
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
        <Space>
          <Button icon={<DatabaseOutlined />} onClick={seedAccounts}>Seed Standard Accounts</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditAccount(null); form.resetFields(); setModalOpen(true); }}>Add Account</Button>
        </Space>
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
