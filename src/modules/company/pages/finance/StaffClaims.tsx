import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Select, message, Empty, Space, Typography, Tag } from 'antd';
import { claimService, claimAccountService, claimAccountOf, accountForCategory, type Claim } from '../../../../services/claims';
import { money } from '../../../../data/documentLayouts';
import { useCompanyAccess } from '../../../../contexts/CompanyAccess';
import type { FinanceData } from './DocList';
import { fmtDate } from '../../../../utils/dateFormat';

const { Text } = Typography;

/** Finance → Payables → Staff claims: approved claims waiting to be booked as staff-claim expenses. */
export function StaffClaims({ data }: { data: FinanceData }) {
  const { companyId, accounts, employees, currency, reload } = data;
  const canWrite = useCompanyAccess().canWrite('finance');
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<number[]>([]);
  const [accountOf, setAccountOf] = useState<Record<number, number | null>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      // approved by the approver, not yet recorded in Finance and not taken by a payroll run
      const list = (await claimService.list(companyId)).filter(c => c.status === 'approved' && !c.document_id && !c.payroll_run_id);
      setClaims(list);
      const byCategory = await claimAccountService.get(companyId).catch(() => ({} as Record<string, number>));
      setAccountOf(Object.fromEntries(list.map(c => [c.id, claimAccountOf(c, byCategory) ?? accountForCategory(c.category, accounts)])));
      setChosen(list.filter(c => !c.finance_approved_at).map(c => c.id));
      setError(null);
    } catch (e: any) { setError(e.message); setClaims([]); }
  }, [companyId, accounts, currency]);
  useEffect(() => { load(); }, [load]);

  const name = (id: number) => employees.find(e => e.id === id)?.full_name || '—';
  const expenseAccounts = accounts.filter(a => a.type === 'expense' && !a.archived).map(a => ({ value: a.id, label: `${a.code} ${a.name}` }));

  const book = async () => {
    const picked = (claims || []).filter(c => chosen.includes(c.id));
    // one staff-claim expense per person and currency
    const groups = new Map<string, Claim[]>();
    for (const c of picked) groups.set(`${c.employee_id}|${c.currency}`, [...(groups.get(`${c.employee_id}|${c.currency}`) || []), c]);
    setBusy(true);
    let made = 0;
    for (const g of groups.values()) {
      try { await claimService.toExpense(companyId, g, c => accountOf[c.id] ?? null, currency, name(g[0].employee_id)); made++; }
      catch (e: any) { message.error(`${name(g[0].employee_id)}: ${e.message}`); }
    }
    setBusy(false);
    if (made) { message.success(`${made} staff claim expense${made > 1 ? 's' : ''} recorded — pay them from Bills`); reload(); }
    load();
  };

  // Finance approves a claim (and its account): payroll then pays it in the next run unless Finance records / pays it first
  const approve = async () => {
    setBusy(true);
    try {
      await claimService.financeApprove(chosen, id => accountOf[id] ?? null);
      message.success(`${chosen.length} claim${chosen.length > 1 ? 's' : ''} approved by Finance`);
      await load();
    } catch (e: any) { message.error(e.message); }
    setBusy(false);
  };

  if (error) return <Text type="secondary">{error}</Text>;
  return (
    <div>
      {canWrite && !!claims?.length && (
        <Space style={{ marginBottom: 12 }} wrap>
          <Button type="primary" loading={busy} disabled={!chosen.length} onClick={approve}>Approve {chosen.length}</Button>
          <Button loading={busy} disabled={!chosen.length} onClick={book}>Record {chosen.length} in Finance</Button>
          <Text type="secondary">Approved claims go into the next payroll run, unless you record and pay them in Finance before then.</Text>
        </Space>
      )}
      <Table rowKey="id" size="small" loading={claims === null} dataSource={claims || []} pagination={false}
        rowSelection={canWrite ? { selectedRowKeys: chosen, onChange: k => setChosen(k as number[]) } : undefined}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No approved claims waiting" /> }}
        columns={[
          { title: 'Employee', key: 'e', render: (_, c) => name(c.employee_id) },
          { title: 'Date', dataIndex: 'claim_date', render: (v: string) => fmtDate(v), width: 110 },
          { title: 'Category', dataIndex: 'category' },
          { title: 'Description', dataIndex: 'description', render: (v: string | null) => v || '—' },
          { title: 'Amount', key: 'a', align: 'right' as const, render: (_, c) => money(c.amount, c.currency) },
          { title: 'Finance', key: 'fa', width: 170, render: (_, c) => (c.finance_approved_at
            ? <Tag color="green">{c.currency === currency ? 'Approved · next payroll' : 'Approved'}</Tag> : <Tag>To approve</Tag>) },
          { title: 'Expense account', key: 'acc', width: 280, render: (_, c) => (
            <Select style={{ width: '100%' }} showSearch optionFilterProp="label" disabled={!canWrite} options={expenseAccounts}
              value={accountOf[c.id] ?? undefined} onChange={v => setAccountOf(m => ({ ...m, [c.id]: v }))} />
          ) },
        ]} />
    </div>
  );
}
