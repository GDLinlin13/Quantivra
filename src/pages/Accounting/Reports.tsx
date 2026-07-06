import React, { useState } from 'react';
import { Card, Tabs, DatePicker, Table, Typography, Spin, Alert, Button, Space, Select } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { supabase } from '../../utils/supabase';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const { RangePicker } = DatePicker;

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('trial');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>({});
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs().startOf('year'), dayjs().endOf('year')]);
  const [asOfDate, setAsOfDate] = useState<dayjs.Dayjs>(dayjs());

  async function loadTrialBalance() {
    setLoading(true); setError('');
    try {
      const dateStr = asOfDate.format('YYYY-MM-DD');
      const { data: entries } = await supabase.from('journal_lines')
        .select('*, chart_of_accounts!inner(code, name, type), journal_entries!inner(entry_date)')
        .lte('journal_entries.entry_date', dateStr);

      const accountMap = new Map<string, { code: string; name: string; type: string; debit: number; credit: number }>();
      for (const line of entries || []) {
        const key = line.chart_of_accounts.code;
        if (!accountMap.has(key)) {
          accountMap.set(key, { code: key, name: line.chart_of_accounts.name, type: line.chart_of_accounts.type, debit: 0, credit: 0 });
        }
        const acc = accountMap.get(key)!;
        acc.debit += line.debit || 0;
        acc.credit += line.credit || 0;
      }
      const result = Array.from(accountMap.values()).sort((a, b) => a.code.localeCompare(b.code));
      setData(result);
      setTotals({
        debit: result.reduce((s, r) => s + r.debit, 0),
        credit: result.reduce((s, r) => s + r.credit, 0),
      });
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }

  async function loadPnL() {
    setLoading(true); setError('');
    try {
      const start = dateRange[0].format('YYYY-MM-DD');
      const end = dateRange[1].format('YYYY-MM-DD');
      const { data: lines } = await supabase.from('journal_lines')
        .select('*, chart_of_accounts!inner(code, name, type), journal_entries!inner(entry_date)')
        .gte('journal_entries.entry_date', start)
        .lte('journal_entries.entry_date', end);

      const incomeMap = new Map<string, { code: string; name: string; amount: number }>();
      const expenseMap = new Map<string, { code: string; name: string; amount: number }>();
      for (const line of lines || []) {
        const acct = line.chart_of_accounts;
        const map = acct.type === 'income' ? incomeMap : acct.type === 'expense' ? expenseMap : null;
        if (!map) continue;
        const key = acct.code;
        if (!map.has(key)) map.set(key, { code: key, name: acct.name, amount: 0 });
        map.get(key)!.amount += (line.credit || 0) - (line.debit || 0);
      }
      const income = Array.from(incomeMap.values());
      const expense = Array.from(expenseMap.values());
      const totalIncome = income.reduce((s, r) => s + r.amount, 0);
      const totalExpense = expense.reduce((s, r) => s + r.amount, 0);
      setData([...income.map(r => ({ ...r, type: 'Income' })), ...expense.map(r => ({ ...r, type: 'Expense' })), { code: '', name: 'NET PROFIT/LOSS', amount: totalIncome - totalExpense, type: '' }]);
      setTotals({ income: totalIncome, expense: totalExpense, net: totalIncome - totalExpense });
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }

  async function loadBalanceSheet() {
    setLoading(true); setError('');
    try {
      const dateStr = asOfDate.format('YYYY-MM-DD');
      const { data: lines } = await supabase.from('journal_lines')
        .select('*, chart_of_accounts!inner(code, name, type, subtype), journal_entries!inner(entry_date)')
        .lte('journal_entries.entry_date', dateStr);

      const accountMap = new Map<string, { code: string; name: string; type: string; subtype: string; amount: number }>();
      for (const line of lines || []) {
        const acct = line.chart_of_accounts;
        if (!['asset', 'liability', 'equity'].includes(acct.type)) continue;
        const key = acct.code;
        if (!accountMap.has(key)) accountMap.set(key, { code: key, name: acct.name, type: acct.type, subtype: acct.subtype || '', amount: 0 });
        const acc = accountMap.get(key)!;
        if (acct.type === 'asset') acc.amount += (line.debit || 0) - (line.credit || 0);
        else acc.amount += (line.credit || 0) - (line.debit || 0);
      }
      const result = Array.from(accountMap.values()).sort((a, b) => a.code.localeCompare(b.code));
      setData(result);
      const totalAssets = result.filter(r => r.type === 'asset').reduce((s, r) => s + r.amount, 0);
      const totalLiabilities = result.filter(r => r.type === 'liability').reduce((s, r) => s + r.amount, 0);
      const totalEquity = result.filter(r => r.type === 'equity').reduce((s, r) => s + r.amount, 0);
      setTotals({ assets: totalAssets, liabilities: totalLiabilities, equity: totalEquity });
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }

  function downloadPdf(title: string, columns: any[], rows: any[]) {
    const doc = new jsPDF();
    doc.text(title, 14, 15);
    (doc as any).autoTable({ head: columns, body: rows.map(r => columns.map(c => r[c.dataKey || c.key])), startY: 25 });
    doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
  }

  const trialColumns = [
    { title: 'Code', dataIndex: 'code', key: 'code' },
    { title: 'Account', dataIndex: 'name', key: 'name' },
    { title: 'Type', dataIndex: 'type', key: 'type' },
    { title: 'Debit', dataIndex: 'debit', key: 'debit', render: (v: number) => `$${v?.toFixed(2)}` },
    { title: 'Credit', dataIndex: 'credit', key: 'credit', render: (v: number) => `$${v?.toFixed(2)}` },
  ];

  const pnlColumns = [
    { title: 'Account', dataIndex: 'name', key: 'name', render: (v: string, r: any) => r.type ? v : <strong>{v}</strong> },
    { title: 'Type', dataIndex: 'type', key: 'type' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (v: number, r: any) => r.type ? `$${v?.toFixed(2)}` : <strong>$${v?.toFixed(2)}</strong> },
  ];

  const bsColumns = [
    { title: 'Code', dataIndex: 'code', key: 'code' },
    { title: 'Account', dataIndex: 'name', key: 'name' },
    { title: 'Type', dataIndex: 'type', key: 'type' },
    { title: 'Subtype', dataIndex: 'subtype', key: 'subtype' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (v: number) => `$${v?.toFixed(2)}` },
  ];

  return (
    <div>
      <Typography.Title level={4}>Accounting Reports</Typography.Title>
      <Tabs activeKey={activeTab} onChange={k => { setActiveTab(k); setData([]); setTotals({}); }}>
        <Tabs.TabPane tab="Trial Balance" key="trial">
          <Space style={{ marginBottom: 16 }}>
            <DatePicker value={asOfDate} onChange={v => v && setAsOfDate(v)} />
            <Button type="primary" onClick={loadTrialBalance} loading={loading}>Generate</Button>
            {data.length > 0 && <Button icon={<DownloadOutlined />} onClick={() => downloadPdf('Trial Balance', trialColumns.map(c => ({ header: c.title, dataKey: c.key })), data)}>PDF</Button>}
          </Space>
          {loading && <Spin />}
          {error && <Alert type="error" message={error} />}
          {data.length > 0 && (
            <>
              <Table dataSource={data} columns={trialColumns} rowKey="code" pagination={false} size="small" />
              <div style={{ marginTop: 8, textAlign: 'right' }}>
                <strong>Total Debit: ${totals.debit?.toFixed(2)} | Total Credit: ${totals.credit?.toFixed(2)}</strong>
              </div>
            </>
          )}
        </Tabs.TabPane>

        <Tabs.TabPane tab="Profit & Loss" key="pnl">
          <Space style={{ marginBottom: 16 }}>
            <RangePicker value={dateRange as any} onChange={(v) => v && setDateRange(v as [dayjs.Dayjs, dayjs.Dayjs])} />
            <Button type="primary" onClick={loadPnL} loading={loading}>Generate</Button>
            {data.length > 0 && <Button icon={<DownloadOutlined />} onClick={() => downloadPdf('Profit_and_Loss', pnlColumns.map(c => ({ header: c.title, dataKey: c.key })), data)}>PDF</Button>}
          </Space>
          {loading && <Spin />}
          {error && <Alert type="error" message={error} />}
          {data.length > 0 && (
            <>
              <Table dataSource={data} columns={pnlColumns} rowKey={(r: any) => r.code || 'net'} pagination={false} size="small" />
              <div style={{ marginTop: 8 }}>
                <p><strong>Total Income:</strong> ${totals.income?.toFixed(2)}</p>
                <p><strong>Total Expenses:</strong> ${totals.expense?.toFixed(2)}</p>
                <p><strong style={{ color: totals.net >= 0 ? '#52c41a' : '#ff4d4f' }}>Net Profit/Loss: ${totals.net?.toFixed(2)}</strong></p>
              </div>
            </>
          )}
        </Tabs.TabPane>

        <Tabs.TabPane tab="Balance Sheet" key="bs">
          <Space style={{ marginBottom: 16 }}>
            <DatePicker value={asOfDate} onChange={v => v && setAsOfDate(v)} />
            <Button type="primary" onClick={loadBalanceSheet} loading={loading}>Generate</Button>
            {data.length > 0 && <Button icon={<DownloadOutlined />} onClick={() => downloadPdf('Balance_Sheet', bsColumns.map(c => ({ header: c.title, dataKey: c.key })), data)}>PDF</Button>}
          </Space>
          {loading && <Spin />}
          {error && <Alert type="error" message={error} />}
          {data.length > 0 && (
            <>
              <Table dataSource={data} columns={bsColumns} rowKey="code" pagination={false} size="small" />
              <div style={{ marginTop: 8 }}>
                <p><strong>Total Assets:</strong> ${totals.assets?.toFixed(2)}</p>
                <p><strong>Total Liabilities:</strong> ${totals.liabilities?.toFixed(2)}</p>
                <p><strong>Total Equity:</strong> ${totals.equity?.toFixed(2)}</p>
              </div>
            </>
          )}
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
}
