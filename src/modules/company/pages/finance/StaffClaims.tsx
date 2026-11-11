import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Select, message, Empty, Space, Typography } from 'antd';
import { claimService, accountForCategory, type Claim } from '../../../../services/claims';
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
      const list = (await claimService.list(companyId)).filter(c => c.status === 'approved' && !c.document_id);
      setClaims(list);
      setAccountOf(Object.fromEntries(list.map(c => [c.id, accountForCategory(c.category, accounts)])));
      setChosen(list.map(c => c.id));
      setError(null);
    } catch (e: any) { setError(e.message); setClaims([]); }
  }, [companyId, accounts]);
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

  if (error) return <Text type="secondary">{error}</Text>;
  return (
    <div>
      {canWrite && !!claims?.length && (
        <Space style={{ marginBottom: 12 }}>
          <Button type="primary" loading={busy} disabled={!chosen.length} onClick={book}>Record {chosen.length} in Finance</Button>
          <Text type="secondary">One expense per person and currency, owed to them until paid.</Text>
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
          { title: 'Expense account', key: 'acc', width: 280, render: (_, c) => (
            <Select style={{ width: '100%' }} showSearch optionFilterProp="label" disabled={!canWrite} options={expenseAccounts}
              value={accountOf[c.id] ?? undefined} onChange={v => setAccountOf(m => ({ ...m, [c.id]: v }))} />
          ) },
        ]} />
    </div>
  );
}
