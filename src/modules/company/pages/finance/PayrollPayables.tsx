import { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Button, Space, Card, Statistic, Modal, InputNumber, DatePicker, Select, Input, message, Empty, Typography, Popconfirm, Tag } from 'antd';
import dayjs from 'dayjs';
import { loadLedgerInput, journalService } from '../../../../services/finance';
import { buildLedger, payrollDue, systemAccount, splitByShare, type PayrollDue } from '../../../../data/ledger';
import { money } from '../../../../data/documentLayouts';
import { schemeLabel } from '../../../../data/finance';
import type { FinanceData } from './DocList';
import { AmountInput } from '../../../../components/AmountInput';
import { useCompanyAccess } from '../../../../contexts/CompanyAccess';
import { fmtDate } from '../../../../utils/dateFormat';

const { Text } = Typography;
const period = (r: PayrollDue['run']) => dayjs(`${r.period_year}-${String(r.period_month).padStart(2, '0')}-01`).format('MMM YYYY');

/** Payables → Payroll: net salaries and CPF (or the country's contributions) still to pay for each finalised payroll run. */
export function PayrollPayables({ data }: { data: FinanceData }) {
  const access = useCompanyAccess();
  const [input, setInput] = useState<Awaited<ReturnType<typeof loadLedgerInput>> | null>(null);
  const [paying, setPaying] = useState<{ due: PayrollDue; what: 'net' | 'stat' } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setInput(await loadLedgerInput(data.companyId)); } catch (e: any) { message.error(e.message); }
  }, [data.companyId]);
  useEffect(() => { load(); }, [load, data.docs]);
  const dues = useMemo(() => (input ? payrollDue(input as any, buildLedger(input as any)).reverse() : []), [input]);
  if (!input) return null;
  const sal = systemAccount(input.accounts, 'payroll_payable');
  const bank = input.accounts.find(a => a.subtype === 'bank' && !a.archived);
  const netDue = dues.reduce((s, d) => s + d.netDue, 0), statDue = dues.reduce((s, d) => s + d.statDue, 0);
  const M = (n: number) => money(n, data.currency);
  const X = schemeLabel(data.company?.country); // CPF in Singapore

  const markAllNet = async () => {
    if (!sal || !bank) return;
    setBusy(true);
    try {
      for (const d of dues.filter(x => x.netDue > 0)) {
        await journalService.save(data.companyId, { journal_date: d.run.pay_date, memo: `Salaries paid — ${period(d.run)}` }, [
          { account_id: sal.id, debit: d.netDue, credit: 0, description: `Net pay ${period(d.run)}` },
          { account_id: bank.id, debit: 0, credit: d.netDue, description: `Net pay ${period(d.run)}` },
        ]);
      }
      message.success('Salaries marked as paid on their pay dates'); load(); data.reload();
    } catch (e: any) { message.error(e.message); }
    setBusy(false);
  };

  if (!dues.length) {
    return <Empty description={input.payroll.length ? 'No finalised payroll runs yet. Finalise a run in HR → Payroll.' : 'No payroll runs, or you don’t have pay access.'} />;
  }
  return (
    <div>
      <Space size={16} wrap style={{ marginBottom: 12 }}>
        <Card size="small" style={{ minWidth: 200 }}><Statistic title="Salaries to pay" value={M(netDue)} /></Card>
        <Card size="small" style={{ minWidth: 200 }}><Statistic title={`${X} to pay`} value={M(statDue)} /></Card>
        {access.canWrite('finance') && netDue > 0 && (
          <Popconfirm title="Mark every unpaid salary as paid from the bank on its pay date?"
            description="Use this if salaries were already paid. Don't also match those bank lines in Bank." onConfirm={markAllNet}>
            <Button loading={busy}>Mark all salaries as paid on their pay dates</Button>
          </Popconfirm>
        )}
      </Space>
      <Table rowKey={d => d.run.id} size="small" dataSource={dues} pagination={false}
        columns={[
          { title: 'Payroll', key: 'p', render: (_, d) => period(d.run) },
          { title: 'Pay date', key: 'pd', render: (_, d) => fmtDate(d.run.pay_date) },
          { title: 'Net salaries', key: 'n', align: 'right' as const, render: (_, d) => M(d.net) },
          {
            title: 'Salaries to pay', key: 'nd', align: 'right' as const,
            render: (_, d) => d.netDue > 0 ? <b>{M(d.netDue)}</b> : <Tag color="green">Paid</Tag>,
          },
          { title: `${X} (employee + employer)`, key: 's', align: 'right' as const, render: (_, d) => M(d.stat) },
          {
            title: `${X} to pay`, key: 'sd', align: 'right' as const,
            render: (_, d) => d.statDue > 0 ? <b>{M(d.statDue)}</b> : <Tag color="green">Paid</Tag>,
          },
          {
            title: '', key: 'a', width: 200, render: (_, d) => access.canWrite('finance') && (
              <Space size={4}>
                {d.netDue > 0 && <Button size="small" onClick={() => setPaying({ due: d, what: 'net' })}>Pay salaries</Button>}
                {d.statDue > 0 && <Button size="small" onClick={() => setPaying({ due: d, what: 'stat' })}>Pay {X}</Button>}
              </Space>
            ),
          },
        ]} />
      <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
        When the money leaves the bank, either click Pay here or match the bank statement line in Bank → Match → Payroll — not both.
      </Text>
      {paying && sal && (
        <PayModal data={data} accounts={input.accounts} title={`${paying.what === 'net' ? 'Pay salaries' : `Pay ${X}`} — ${period(paying.due.run)}`}
          amount={paying.what === 'net' ? paying.due.netDue : paying.due.statDue} date={paying.due.run.pay_date}
          to={paying.what === 'net' ? [{ account_id: sal.id, share: 1 }] : paying.due.statParts}
          memo={`${paying.what === 'net' ? 'Salaries' : X} paid — ${period(paying.due.run)}`}
          onClose={() => setPaying(null)} onDone={() => { setPaying(null); load(); data.reload(); }} />
      )}
    </div>
  );
}

function PayModal({ data, accounts, title, amount, date, to, memo, onClose, onDone }: {
  data: FinanceData; accounts: FinanceData['accounts']; title: string; amount: number; date: string; to: { account_id: number; share: number }[]; memo: string;
  onClose: () => void; onDone: () => void;
}) {
  const banks = accounts.filter(a => !a.archived && (a.subtype === 'bank' || a.subtype === 'cash') && !a.currency);
  const [amt, setAmt] = useState<number | null>(amount);
  const [day, setDay] = useState(dayjs(date));
  const [from, setFrom] = useState<number | undefined>(banks.find(b => b.subtype === 'bank')?.id);
  const [note, setNote] = useState(memo);
  const [saving, setSaving] = useState(false);
  return (
    <Modal open title={title} okText="Record payment" confirmLoading={saving} onCancel={onClose} okButtonProps={{ disabled: !amt || !from }}
      onOk={async () => {
        setSaving(true);
        try {
          await journalService.save(data.companyId, { journal_date: day.format('YYYY-MM-DD'), memo: note }, [
            // CPF is split over employee's / employer's CPF payable (and SDL etc.) in the run's proportions
            ...splitByShare(amt!, to).map(p => ({ account_id: p.account_id, debit: p.amount, credit: 0, description: note })),
            { account_id: from!, debit: 0, credit: amt!, description: note },
          ]);
          message.success('Payment recorded'); onDone();
        } catch (e: any) { message.error(e.message); }
        setSaving(false);
      }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><Text type="secondary">Amount</Text><AmountInput style={{ width: '100%' }} min={0.01} precision={2} prefix={data.currency} value={amt} onChange={setAmt} /></div>
        <div><Text type="secondary">Paid on</Text><DatePicker style={{ width: '100%' }} allowClear={false} value={day} onChange={d => d && setDay(d)} /></div>
        <div><Text type="secondary">From</Text><Select style={{ width: '100%' }} value={from} onChange={setFrom} options={banks.map(b => ({ value: b.id, label: b.name }))} /></div>
        <div><Text type="secondary">Details</Text><Input value={note} onChange={e => setNote(e.target.value)} /></div>
      </div>
    </Modal>
  );
}
