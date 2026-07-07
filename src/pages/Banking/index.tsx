import React, { useEffect, useState } from 'react';
import { Table, Button, Upload, Select, message, Typography, Card, Tabs, Tag, Space } from 'antd';
import { UploadOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { supabase } from '../../utils/supabase';
import { useCompanyId } from '../../utils/useCompany';

export default function BankingPage() {
  const companyId = useCompanyId();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [instructions, setInstructions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importBatch, setImportBatch] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const [tRes, iRes] = await Promise.all([
      supabase.from('bank_transactions').select('*').eq('company_id', companyId).order('transaction_date', { ascending: false }).limit(100),
      supabase.from('standing_instructions').select('*').eq('company_id', companyId).eq('is_active', 1),
    ]);
    setTransactions(tRes.data || []);
    setInstructions(iRes.data || []);
    setLoading(false);
  }

  function parseCSV(text: string) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) { message.error('CSV must have header + data rows'); return; }
    const header = lines[0].toLowerCase().split(',');
    const dateIdx = header.findIndex((h: string) => h.includes('date'));
    const descIdx = header.findIndex((h: string) => h.includes('desc') || h.includes('narrative') || h.includes('detail'));
    const amountIdx = header.findIndex((h: string) => h.includes('amount') || h.includes('value'));
    const refIdx = header.findIndex((h: string) => h.includes('ref') || h.includes('cheque') || h.includes('reference'));

    if (dateIdx === -1 || amountIdx === -1) { message.error('CSV must have Date and Amount columns'); return; }

    const batch = Date.now().toString(36);
    setImportBatch(batch);
    const rows = lines.slice(1).map(line => {
      const cols = line.split(',');
      const date = cols[dateIdx]?.trim();
      const desc = descIdx >= 0 ? cols[descIdx]?.trim() : '';
      const amount = parseFloat(cols[amountIdx]?.trim()) || 0;
      const ref = refIdx >= 0 ? cols[refIdx]?.trim() : '';
      return { company_id: companyId, transaction_date: date, description: desc, amount, reference: ref, import_batch: batch };
    });

    return rows;
  }

  async function handleUpload(file: File) {
    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows || rows.length === 0) return false;

    const { error } = await supabase.from('bank_transactions').insert(rows);
    if (error) { message.error('Import failed: ' + error.message); } else {
      message.success(`${rows.length} transactions imported`);
      load();
    }
    return false;
  }

  async function handleAutoMatch() {
    let matched = 0;
    for (const tx of transactions.filter(t => t.status === 'unmatched')) {
      const match = instructions.find(i => {
        const amtMatch = Math.abs(i.amount) === Math.abs(tx.amount);
        const descMatch = i.name.toLowerCase().split(' ').some((w: string) =>
          tx.description?.toLowerCase().includes(w)
        );
        return amtMatch && descMatch;
      });
      if (match) {
        await supabase.from('bank_transactions').update({
          status: 'matched', matched_to_type: 'standing_instruction', matched_to_id: match.id,
        }).eq('id', tx.id);
        matched++;
      }
    }
    message.success(`${matched} transactions matched`);
    load();
  }

  const columns = [
    { title: 'Date', dataIndex: 'transaction_date', key: 'date' },
    { title: 'Description', dataIndex: 'description', key: 'desc' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (v: number) => <span style={{ color: v < 0 ? '#f87171' : '#34d399' }}>${v?.toFixed(2)}</span> },
    { title: 'Reference', dataIndex: 'reference', key: 'ref' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'matched' ? 'green' : s === 'ignored' ? 'default' : 'orange'}>{s}</Tag> },
    { title: 'Match', key: 'match', render: (_: any, row: any) => (
      <Select size="small" style={{ width: 160 }} value={row.matched_to_id || undefined} allowClear
        onChange={async (val) => {
          await supabase.from('bank_transactions').update({
            status: val ? 'matched' : 'unmatched',
            matched_to_type: val ? 'standing_instruction' : null,
            matched_to_id: val || null,
          }).eq('id', row.id);
          load();
        }}
      >
        {instructions.map(i => <Select.Option key={i.id} value={i.id}>{i.name}</Select.Option>)}
      </Select>
    )},
  ];

  return (
    <div>
      <Typography.Title level={4}>Banking</Typography.Title>
      <Card>
        <Tabs items={[
          {
            key: 'reconciliation', label: 'Reconciliation',
            children: (
              <div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
                  <Upload beforeUpload={handleUpload} showUploadList={false} accept=".csv">
                    <Button icon={<UploadOutlined />}>Upload Bank Statement CSV</Button>
                  </Upload>
                  <Button icon={<CheckCircleOutlined />} onClick={handleAutoMatch}>Auto-match</Button>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                    CSV needs: Date, Description/Narrative, Amount columns
                  </span>
                </div>
                <Table dataSource={transactions} columns={columns} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 20 }} />
              </div>
            ),
          },
          {
            key: 'accounts', label: 'Bank Accounts',
            children: <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Bank accounts module coming soon</div>,
          },
          {
            key: 'transfers', label: 'Transfers',
            children: <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Transfers module coming soon</div>,
          },
        ]} />
      </Card>
    </div>
  );
}
