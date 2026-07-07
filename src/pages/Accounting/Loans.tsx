import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, message, Space, Tag, Typography, Tabs } from 'antd';
import { PlusOutlined, CalculatorOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { supabase } from '../../utils/supabase';
import { useCompanyId } from '../../utils/useCompany';

export default function LoansPage() {
  const [loans, setLoans] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editLoan, setEditLoan] = useState<any>(null);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => { load(); }, []);

  const companyId = useCompanyId();

  async function load() {
    const [lRes, aRes] = await Promise.all([
      supabase.from('loans').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
      supabase.from('chart_of_accounts').select('id, code, name').eq('company_id', companyId).order('code'),
    ]);
    setLoans(lRes.data || []);
    setAccounts(aRes.data || []);
    setLoading(false);
  }

  async function loadSchedules(loanId: number) {
    const { data } = await supabase.from('loan_schedules').select('*').eq('loan_id', loanId).order('installment_no');
    setSchedules(data || []);
  }

  function calcSchedule(principal: number, rate: number, term: number): any[] {
    const monthlyRate = rate / 100 / 12;
    const payment = principal * monthlyRate * Math.pow(1 + monthlyRate, term) / (Math.pow(1 + monthlyRate, term) - 1);
    let balance = principal;
    const schedule = [];
    for (let i = 1; i <= term; i++) {
      const interest = balance * monthlyRate;
      const principalPart = payment - interest;
      balance -= principalPart;
      schedule.push({
        installment_no: i,
        due_date: dayjs().add(i, 'month').format('YYYY-MM-DD'),
        principal: Math.round(principalPart * 100) / 100,
        interest: Math.round(interest * 100) / 100,
        total: Math.round(payment * 100) / 100,
        balance_after: Math.round(Math.max(balance, 0) * 100) / 100,
      });
    }
    return schedule;
  }

  async function handleSave(values: any) {
    setSaving(true);
    try {
      const payload = {
        ...values, company_id: companyId,
        start_date: values.start_date?.format('YYYY-MM-DD'),
      };
      const schedule = calcSchedule(values.principal_amount, values.interest_rate, values.term_months);
      payload.remaining_balance = schedule[schedule.length - 1]?.balance_after || 0;
      payload.payment_amount = schedule[0]?.total || 0;

      if (editLoan) {
        await supabase.from('loans').update(payload).eq('id', editLoan.id);
        await supabase.from('loan_schedules').delete().eq('loan_id', editLoan.id);
      } else {
        const { data: newLoan } = await supabase.from('loans').insert(payload).select().single();
        if (newLoan) {
          await supabase.from('loan_schedules').insert(
            schedule.map(s => ({ ...s, loan_id: newLoan.id }))
          );
        }
      }
      message.success('Loan saved with repayment schedule');
      setModalOpen(false);
      load();
    } catch (err: any) { message.error(err.message); } finally { setSaving(false); }
  }

  async function handleSettle(loan: any) {
    const price = prompt('Settlement price:', '0');
    if (price === null) return;
    const settlePrice = parseFloat(price) || 0;

    const gainLoss = loan.remaining_balance - settlePrice;
    const gainLossAcct = accounts.find(a => a.code === (gainLoss > 0 ? '4200' : '6500'))?.id;

    // Create journal entry for settlement
    const { data: je } = await supabase.from('journal_entries').insert({
      company_id: companyId, entry_date: dayjs().format('YYYY-MM-DD'),
      reference: `LOAN-SETTLE-${loan.id}`, description: `Settlement - ${loan.name}`,
    }).select().single();

    if (je) {
      const lines = [
        { journal_entry_id: je.id, account_id: loan.liability_account_id, debit: loan.remaining_balance, credit: 0, description: 'Loan settlement' },
        { journal_entry_id: je.id, account_id: loan.asset_account_id, debit: 0, credit: settlePrice, description: 'Asset disposal' },
      ];
      if (gainLoss !== 0 && gainLossAcct) {
        lines.push({
          journal_entry_id: je.id, account_id: gainLossAcct,
          debit: gainLoss > 0 ? gainLoss : 0, credit: gainLoss < 0 ? Math.abs(gainLoss) : 0,
          description: gainLoss > 0 ? 'Loss on disposal' : 'Gain on disposal',
        });
      }
      await supabase.from('journal_lines').insert(lines);
    }

    await supabase.from('loans').update({
      status: 'settled', settlement_date: dayjs().format('YYYY-MM-DD'),
      settlement_price: settlePrice, gain_loss_account_id: gainLossAcct || null,
    }).eq('id', loan.id);
    await supabase.from('loan_schedules').update({ status: 'settled' }).eq('loan_id', loan.id);

    message.success('Loan settled');
    load();
  }

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Type', dataIndex: 'loan_type', key: 'type', render: (s: string) => <Tag>{s}</Tag> },
    { title: 'Principal', dataIndex: 'principal_amount', key: 'principal', render: (v: number) => `$${v?.toLocaleString()}` },
    { title: 'Interest', dataIndex: 'interest_rate', key: 'rate', render: (v: number) => `${v}%` },
    { title: 'Term', dataIndex: 'term_months', key: 'term', render: (v: number) => `${v}m` },
    { title: 'Payment', dataIndex: 'payment_amount', key: 'pmt', render: (v: number) => `$${v?.toFixed(2)}` },
    { title: 'Balance', dataIndex: 'remaining_balance', key: 'bal', render: (v: number) => `$${v?.toLocaleString()}` },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'active' ? 'green' : 'default'}>{s}</Tag> },
    {
      title: 'Actions', key: 'actions',
      render: (_: any, row: any) => (
        <Space>
          <Button size="small" icon={<CalculatorOutlined />} onClick={() => { loadSchedules(row.id); setScheduleModalOpen(true); }}>Schedule</Button>
          {row.status === 'active' && (
            <>
              <Button size="small" onClick={() => { setEditLoan(row); form.setFieldsValue({ ...row, start_date: row.start_date ? dayjs(row.start_date) : null }); setModalOpen(true); }}>Edit</Button>
              <Button size="small" danger onClick={() => handleSettle(row)}>Settle</Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  const scheduleColumns = [
    { title: '#', dataIndex: 'installment_no', key: 'no', width: 60 },
    { title: 'Due Date', dataIndex: 'due_date', key: 'date' },
    { title: 'Principal', dataIndex: 'principal', key: 'principal', render: (v: number) => `$${v?.toFixed(2)}` },
    { title: 'Interest', dataIndex: 'interest', key: 'interest', render: (v: number) => `$${v?.toFixed(2)}` },
    { title: 'Total', dataIndex: 'total', key: 'total', render: (v: number) => `$${v?.toFixed(2)}` },
    { title: 'Balance', dataIndex: 'balance_after', key: 'balance', render: (v: number) => `$${v?.toLocaleString()}` },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'paid' ? 'green' : s === 'settled' ? 'default' : 'orange'}>{s || 'pending'}</Tag> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Loans</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditLoan(null); form.resetFields(); setModalOpen(true); }}>Add Loan</Button>
      </div>
      <Table dataSource={loans} columns={columns} rowKey="id" loading={loading} />

      <Modal title={editLoan ? 'Edit Loan' : 'New Loan'} open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={520}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="Loan Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Toyota Hilux 2024" />
          </Form.Item>
          <Form.Item name="loan_type" label="Type" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="vehicle">Vehicle</Select.Option>
              <Select.Option value="equipment">Equipment</Select.Option>
              <Select.Option value="other">Other</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="asset_account_id" label="Asset Account" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children">
              {accounts.filter(a => a.code.startsWith('1')).map(a => <Select.Option key={a.id} value={a.id}>{a.code} - {a.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="liability_account_id" label="Liability Account" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children">
              {accounts.filter(a => a.code.startsWith('2')).map(a => <Select.Option key={a.id} value={a.id}>{a.code} - {a.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="interest_expense_account_id" label="Interest Expense Account" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children">
              {accounts.filter(a => a.code === '5700').concat(accounts.filter(a => a.code.startsWith('5'))).map(a => <Select.Option key={a.id} value={a.id}>{a.code} - {a.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="principal_amount" label="Principal Amount" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} prefix="$" />
          </Form.Item>
          <Form.Item name="interest_rate" label="Interest Rate (%)" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} step={0.01} />
          </Form.Item>
          <Form.Item name="term_months" label="Term (months)" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="start_date" label="Start Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>Save & Generate Schedule</Button>
        </Form>
      </Modal>

      <Modal title="Repayment Schedule" open={scheduleModalOpen} onCancel={() => setScheduleModalOpen(false)} footer={null} width={700}>
        <Table dataSource={schedules} columns={scheduleColumns} rowKey="installment_no" pagination={false} size="small" />
      </Modal>
    </div>
  );
}
