import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import {
  Tabs, Segmented, DatePicker, Space, Button, Table, Tag, Modal, Form, Input, Select, InputNumber, message, Popconfirm, Drawer,
  Typography, Spin, Empty, Alert, Checkbox,
} from 'antd';
import { PlusOutlined, PrinterOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { loadLedgerInput, accountService, journalService, type JournalRow } from '../../../../services/finance';
import { buildLedger, profitAndLoss, balanceSheet, gstReturn, aged, balances, accountLedger, type LedgerEntry } from '../../../../data/ledger';
import { ACCOUNT_TYPE_LABEL, today, chartStyleOf, type Account, type AccountType } from '../../../../data/finance';
import { money } from '../../../../data/documentLayouts';
import { PRINT_CSS } from '../hr/PayslipView';
import type { FinanceData } from './DocList';
import { AmountInput } from '../../../../components/AmountInput';
import { useCompanyAccess } from '../../../../contexts/CompanyAccess';
import { fmtDate } from '../../../../utils/dateFormat';

const { Text } = Typography;
const { RangePicker } = DatePicker;
import { FixedAssets } from './FixedAssets';

type Loaded = Awaited<ReturnType<typeof loadLedgerInput>>;

/** Accounting: reports, chart of accounts and manual journals. */
export function Accounting({ data }: { data: FinanceData }) {
  const [input, setInput] = useState<Loaded | null>(null);
  const [tab, setTab] = useState('reports');
  const load = useCallback(async () => {
    try { setInput(await loadLedgerInput(data.companyId)); } catch (e: any) { message.error(e.message); }
  }, [data.companyId]);
  useEffect(() => { load(); }, [load, data.docs]);
  const entries = useMemo(() => (input ? buildLedger(input as any) : []), [input]);
  if (!input) return <Spin />;
  return (
    <Tabs activeKey={tab} onChange={setTab} items={[
      { key: 'reports', label: 'Reports', children: <Reports data={data} input={input} entries={entries} reload={load} /> },
      { key: 'accounts', label: 'Chart of accounts', children: <ChartOfAccounts data={data} accounts={input.accounts} entries={entries} reload={load} /> },
      { key: 'assets', label: 'Fixed assets', children: <FixedAssets data={data} accounts={input.accounts} assets={(input as any).assets || []} reload={load} /> },
      { key: 'journals', label: 'Journal entries', children: <Journals data={data} accounts={input.accounts} journals={input.journals} reload={load} /> },
    ]} />
  );
}

// ---- period picker -----------------------------------------------------------------------

const PRESETS: Record<string, () => [Dayjs, Dayjs]> = {
  'This month': () => [dayjs().startOf('month'), dayjs().endOf('month')],
  'Last month': () => [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')],
  'This quarter': () => { const q = Math.floor(dayjs().month() / 3); const s = dayjs().month(q * 3).startOf('month'); return [s, s.add(2, 'month').endOf('month')]; },
  'This year': () => [dayjs().startOf('year'), dayjs().endOf('year')],
  'Last year': () => [dayjs().subtract(1, 'year').startOf('year'), dayjs().subtract(1, 'year').endOf('year')],
};

function PeriodPicker({ value, onChange, single }: { value: [Dayjs, Dayjs]; onChange: (v: [Dayjs, Dayjs]) => void; single?: boolean }) {
  return single
    ? <Space><Text type="secondary">As at</Text><DatePicker allowClear={false} value={value[1]} onChange={d => d && onChange([value[0], d])} /></Space>
    : <RangePicker allowClear={false} value={value} onChange={v => v && v[0] && v[1] && onChange([v[0], v[1]])}
        presets={Object.entries(PRESETS).map(([label, f]) => ({ label, value: f() }))} />;
}

// ---- printable report sheet ------------------------------------------------------------------

const sheet = { background: '#fff', color: '#111', borderRadius: 8, padding: 24, maxWidth: 820, fontFamily: 'system-ui, -apple-system, sans-serif' } as const;
const th = { textAlign: 'left' as const, padding: '6px 8px', borderBottom: '2px solid #333', fontSize: 13 };
const td = { padding: '4px 8px', borderBottom: '1px solid #eee', fontSize: 13 };
const num = { ...td, textAlign: 'right' as const, whiteSpace: 'nowrap' as const };

function Sheet({ id, title, subtitle, company, currency, children }: { id: string; title: string; subtitle: string; company: string; currency?: string; children: ReactNode }) {
  const print = () => {
    const el = document.getElementById(id);
    const w = el && window.open('', '_blank', 'width=900,height=1000');
    if (!el || !w) { message.error('Allow pop-ups to print'); return; }
    w.document.write(`<html><head><title>${title} - ${subtitle}</title><style>${PRINT_CSS}</style></head><body>${el.innerHTML}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };
  return (
    <div>
      <div id={id} style={sheet}>
        <div style={{ fontSize: 12, color: '#666' }}>{company}</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
        {/* the currency once, at the top (the amounts below are plain numbers) */}
        <div style={{ fontSize: 12, color: '#666', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}><span>{subtitle}</span>{currency && <b style={{ color: '#333' }}>{currency}</b>}</div>
        {children}
      </div>
      <Button icon={<PrinterOutlined />} style={{ marginTop: 8 }} onClick={print}>Print / save as PDF</Button>
    </div>
  );
}

// ---- reports ---------------------------------------------------------------------------------

function Reports({ data, input, entries, reload }: { data: FinanceData; input: Loaded; entries: LedgerEntry[]; reload: () => void }) {
  const access = useCompanyAccess();
  const canWrite = access.canWrite('finance'), canRemove = access.canRemove('finance');
  const [paying, setPaying] = useState<{ account: Account; amount: number } | null>(null);
  const [report, setReport] = useState('pl');
  const [range, setRange] = useState<[Dayjs, Dayjs]>(PRESETS['This year']());
  const cur = data.currency;
  // amounts without the currency: it is shown once at the top of each report
  const M = (n: number) => money(n, cur, 'number');
  const from = range[0].format('YYYY-MM-DD'), to = range[1].format('YYYY-MM-DD');
  const period = `${fmtDate(from)} – ${fmtDate(to)}`;
  const asAt = `As at ${fmtDate(to)}`;
  const company = data.branding?.legal_name || data.company?.name || '';
  const contact = (id: number | null) => data.contacts.find(c => c.id === id)?.name || '(no contact)';

  const section = (label: string, rows: { account: Account; balance: number }[], total: number) => (
    <>
      <tr><td colSpan={2} style={{ ...td, fontWeight: 700, padding: '12px 8px 4px', borderBottom: 'none' }}>{label}</td></tr>
      {rows.map(r => <tr key={r.account.id}><td style={{ ...td, padding: '4px 8px 4px 20px' }}>{r.account.code} {r.account.name}</td><td style={num}>{M(r.balance)}</td></tr>)}
      {rows.length === 0 && <tr><td style={{ ...td, padding: '4px 8px 4px 20px', color: '#999' }}>None</td><td style={num} /></tr>}
      <tr><td style={{ ...td, fontWeight: 600 }}>Total {label.toLowerCase()}</td><td style={{ ...num, fontWeight: 600 }}>{M(total)}</td></tr>
    </>
  );

  let body: ReactNode = null;
  if (report === 'pl') {
    const pl = profitAndLoss(input.accounts, entries, from, to);
    body = (
      <Sheet id="rep-pl" title="Profit and loss" subtitle={period} company={company} currency={cur}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
          {section('Income', pl.income, pl.totalIncome)}
          {section('Expenses', pl.expenses, pl.totalExpenses)}
          <tr><td style={{ ...td, fontWeight: 700, fontSize: 15, borderTop: '2px solid #333' }}>{pl.profit >= 0 ? 'Net profit' : 'Net loss'}</td>
            <td style={{ ...num, fontWeight: 700, fontSize: 15, borderTop: '2px solid #333', color: pl.profit >= 0 ? '#15803d' : '#b91c1c' }}>{M(pl.profit)}</td></tr>
        </tbody></table>
      </Sheet>
    );
  } else if (report === 'bs') {
    const bs = balanceSheet(input.accounts, entries, to);
    body = (
      <Sheet id="rep-bs" title="Balance sheet" subtitle={asAt} company={company} currency={cur}>
        {!bs.balanced && <Alert type="warning" showIcon style={{ marginBottom: 8 }} title="The balance sheet doesn't balance — check journal entries and opening balances." />}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
          {section('Assets', bs.assets, bs.totalAssets)}
          {section('Liabilities', bs.liabilities, bs.totalLiabilities)}
          <tr><td colSpan={2} style={{ ...td, fontWeight: 700, padding: '12px 8px 4px', borderBottom: 'none' }}>Equity</td></tr>
          {bs.equity.filter(r => r.account.subtype !== 'retained').map(r => <tr key={r.account.id}><td style={{ ...td, padding: '4px 8px 4px 20px' }}>{r.account.code} {r.account.name}</td><td style={num}>{M(r.balance)}</td></tr>)}
          {/* retained earnings: what was carried in plus every profit / loss so far (nothing to move by hand) */}
          {(() => {
            const acc = input.accounts.find(a => a.subtype === 'retained');
            const carried = bs.equity.find(r => r.account.subtype === 'retained')?.balance || 0;
            return <tr><td style={{ ...td, padding: '4px 8px 4px 20px' }}>{acc ? `${acc.code} ${acc.name}` : 'Retained earnings'}</td><td style={num}>{M(Math.round((carried + bs.earnings) * 100) / 100)}</td></tr>;
          })()}
          <tr><td style={{ ...td, fontWeight: 600 }}>Total equity</td><td style={{ ...num, fontWeight: 600 }}>{M(bs.totalEquity)}</td></tr>
          <tr><td style={{ ...td, fontWeight: 700, borderTop: '2px solid #333' }}>Liabilities and equity</td><td style={{ ...num, fontWeight: 700, borderTop: '2px solid #333' }}>{M(bs.totalLiabilities + bs.totalEquity)}</td></tr>
        </tbody></table>
      </Sheet>
    );
  } else if (report === 'gst') {
    const g = gstReturn(input.docs as any, from, to);
    const row = (box: string, label: string, v: number, bold = false) => (
      <tr><td style={{ ...td, width: 70, color: '#666' }}>{box}</td><td style={{ ...td, fontWeight: bold ? 700 : 400 }}>{label}</td><td style={{ ...num, fontWeight: bold ? 700 : 400 }}>{M(v)}</td></tr>
    );
    body = (
      <Sheet id="rep-gst" title="GST return (F5)" subtitle={period} company={company} currency={cur}>
        {!data.settings.gstRegistered && <Alert type="info" showIcon style={{ marginBottom: 8 }} title="GST is switched off in GST & settings, so new documents don't charge GST." />}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
          {row('Box 1', 'Total value of standard-rated supplies', g.box1_standard)}
          {row('Box 2', 'Total value of zero-rated supplies', g.box2_zero)}
          {row('Box 4', 'Total value of (1) + (2)', g.box4_total, true)}
          {row('Box 5', 'Total value of taxable purchases', g.box5_purchases)}
          {row('Box 6', 'Output tax due', g.box6_output_tax)}
          {row('Box 7', 'Input tax and refunds claimed', g.box7_input_tax)}
          {row('Box 8', g.box8_net >= 0 ? 'Net GST to be paid to IRAS' : 'Net GST to be claimed from IRAS', Math.abs(g.box8_net), true)}
        </tbody></table>
        <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>Worked out from approved invoices, bills and expenses dated in the period. Check against your records before filing with IRAS.</div>
      </Sheet>
    );
  } else if (report === 'ar' || report === 'ap') {
    const a = aged(data.docs, report === 'ar' ? 'receivable' : 'payable', to);
    const cols = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90'] as const;
    const heads = ['Not yet due', '1–30 days', '31–60 days', '61–90 days', 'Over 90 days'];
    // Besides suppliers, the company also owes CPF, GST, salaries and staff claims.
    const other = report === 'ap'
      ? balances(input.accounts, entries, undefined, to).filter(b => b.account.type === 'liability' && b.account.subtype !== 'payable' && Math.abs(b.balance) >= 0.005)
      : [];
    body = (
      <>
      <Sheet id={`rep-${report}`} title={report === 'ar' ? 'Customers owe us (aged)' : 'We owe'} subtitle={asAt} company={company} currency={cur}>
        {report === 'ap' && <div style={{ fontWeight: 700, margin: '4px 0' }}>Suppliers and expenses</div>}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>{report === 'ar' ? 'Customer' : 'Supplier'}</th>{heads.map(h => <th key={h} style={{ ...th, textAlign: 'right' }}>{h}</th>)}<th style={{ ...th, textAlign: 'right' }}>Total</th></tr></thead>
          <tbody>
            {a.rows.map(r => <tr key={String(r.contact_id)}><td style={td}>{contact(r.contact_id)}</td>{cols.map(c => <td key={c} style={num}>{r[c] ? M(r[c]) : ''}</td>)}<td style={{ ...num, fontWeight: 600 }}>{M(r.total)}</td></tr>)}
            {a.rows.length === 0 && <tr><td colSpan={7} style={{ ...td, color: '#999' }}>Nothing owed</td></tr>}
            <tr><td style={{ ...td, fontWeight: 700 }}>Total</td>{cols.map(c => <td key={c} style={{ ...num, fontWeight: 700 }}>{M(a.totals[c])}</td>)}
              <td style={{ ...num, fontWeight: 700 }}>{M(cols.reduce((s, c) => s + a.totals[c], 0))}</td></tr>
          </tbody>
        </table>
        {report === 'ap' && (
          <>
            <div style={{ fontWeight: 700, margin: '16px 0 4px' }}>Salaries, payroll contributions, tax and other amounts owed</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
              {other.map(b => <tr key={b.account.id}><td style={td}>{b.account.code} {b.account.name}</td><td style={num}>{M(b.balance)}</td></tr>)}
              {other.length === 0 && <tr><td style={{ ...td, color: '#999' }}>Nothing owed</td><td style={num} /></tr>}
            </tbody></table>
          </>
        )}
      </Sheet>
      {canWrite && other.filter(b => b.balance > 0).length > 0 && (
        <Space wrap style={{ marginTop: 8 }}>
          {other.filter(b => b.balance > 0).map(b => (
            <Button key={b.account.id} onClick={() => setPaying({ account: b.account, amount: b.balance })}>Record payment: {b.account.name}</Button>
          ))}
        </Space>
      )}
      </>
    );
  } else if (report === 'tb') {
    const b = balances(input.accounts, entries, undefined, to).filter(x => x.debit || x.credit);
    const dr = b.reduce((s, x) => s + Math.max(0, x.debit - x.credit), 0), cr = b.reduce((s, x) => s + Math.max(0, x.credit - x.debit), 0);
    body = (
      <Sheet id="rep-tb" title="Trial balance" subtitle={asAt} company={company} currency={cur}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Account</th><th style={{ ...th, textAlign: 'right' }}>Debit</th><th style={{ ...th, textAlign: 'right' }}>Credit</th></tr></thead>
          <tbody>
            {b.map(x => <tr key={x.account.id}><td style={td}>{x.account.code} {x.account.name}</td>
              <td style={num}>{x.debit > x.credit ? M(x.debit - x.credit) : ''}</td><td style={num}>{x.credit > x.debit ? M(x.credit - x.debit) : ''}</td></tr>)}
            <tr><td style={{ ...td, fontWeight: 700 }}>Total</td><td style={{ ...num, fontWeight: 700 }}>{M(dr)}</td><td style={{ ...num, fontWeight: 700 }}>{M(cr)}</td></tr>
          </tbody>
        </table>
      </Sheet>
    );
  }

  const pointInTime = report === 'bs' || report === 'ar' || report === 'ap' || report === 'tb';
  return (
    <div>
      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented value={report} onChange={v => setReport(String(v))} options={[
          { value: 'pl', label: 'Profit & loss' }, { value: 'bs', label: 'Balance sheet' }, { value: 'gst', label: 'GST return' },
          { value: 'ar', label: 'Customers owe' }, { value: 'ap', label: 'We owe' }, { value: 'tb', label: 'Trial balance' },
        ]} />
        <PeriodPicker value={range} onChange={setRange} single={pointInTime} />
      </Space>
      {body}
      {paying && <PayLiability data={data} accounts={input.accounts} account={paying.account} amount={paying.amount}
        onClose={() => setPaying(null)} onDone={() => { setPaying(null); reload(); }} />}
      {input.payroll.some(r => r.status === 'draft') && (
        <Alert type="warning" showIcon style={{ marginTop: 12 }}
          title={`Payroll still in draft isn't in the books: ${input.payroll.filter(r => r.status === 'draft').map(r => dayjs(`${r.period_year}-${String(r.period_month).padStart(2, '0')}-01`).format('MMM YYYY')).join(', ')}.`}
          description="Open HR → Payroll, view the run and click “Finalise Run”. Salaries, employer contributions and what is owed then appear here." />
      )}
      {input.payroll.length === 0 && <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>Payroll isn't included: there are no payroll runs, or you don't have pay access.</Text>}
    </div>
  );
}

// ---- chart of accounts -------------------------------------------------------------------------

const SUBTYPE_OPTIONS = [
  { value: '', label: '—' }, { value: 'bank', label: 'Bank account' }, { value: 'cash', label: 'Cash' },
];

function ChartOfAccounts({ data, accounts, entries, reload }: { data: FinanceData; accounts: Account[]; entries: LedgerEntry[]; reload: () => void }) {
  const access = useCompanyAccess();
  const canWrite = access.canWrite('finance'), canRemove = access.canRemove('finance');
  const [editing, setEditing] = useState<Partial<Account> | null>(null);
  const [history, setHistory] = useState<Account | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const bal = useMemo(() => new Map(balances(accounts, entries, undefined, today()).map(b => [b.account.id, b.balance])), [accounts, entries]);
  const rows = accounts.filter(a => showArchived || !a.archived);
  const [switching, setSwitching] = useState(false);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Space><Segmented value={showArchived ? 'all' : 'active'} onChange={v => setShowArchived(v === 'all')} options={[{ value: 'active', label: 'In use' }, { value: 'all', label: 'Include archived' }]} /></Space>
        <Space>
          {canWrite && chartStyleOf(accounts) === 'legacy' && <Button onClick={() => setSwitching(true)}>Use the recommended chart</Button>}
          {canWrite && <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ type: 'expense' })}>Add account</Button>}
        </Space>
      </div>
      {switching && <RecommendedChartModal companyId={data.companyId} onClose={() => setSwitching(false)} onDone={() => { setSwitching(false); reload(); data.reload(); }} />}
      <Table rowKey="id" size="small" dataSource={rows} pagination={false}
        columns={[
          { title: 'Code', dataIndex: 'code', width: 80 },
          { title: 'Name', key: 'n', render: (_, a) => <a onClick={() => setHistory(a)}>{a.name}</a> },
          { title: 'Type', dataIndex: 'type', render: (t: AccountType) => <Tag>{ACCOUNT_TYPE_LABEL[t]}</Tag>, filters: Object.entries(ACCOUNT_TYPE_LABEL).map(([value, text]) => ({ value, text })), onFilter: (v, a) => a.type === v },
          { title: '', key: 'k', width: 80, render: (_, a) => (a.subtype === 'bank' || a.subtype === 'cash') ? <Tag color="blue" style={{ marginInlineEnd: 0 }}>{a.subtype}</Tag> : null },
          { title: '', key: 's', width: 190, render: (_, a) => <Space size={4}>{a.is_system && <Tag style={{ marginInlineEnd: 0 }}>used automatically</Tag>}{a.archived && <Tag style={{ marginInlineEnd: 0 }}>archived</Tag>}</Space> },
          { title: 'Balance today', key: 'b', align: 'right' as const, render: (_, a) => money(bal.get(a.id) || 0, data.currency) },
          {
            title: '', key: 'a', width: 90, render: (_, a) => canWrite && (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(a)} />
                {canRemove && !a.is_system && (
                  <Popconfirm title={`Delete ${a.name}?`} description="Accounts that are used can't be deleted — archive them instead."
                    onConfirm={async () => { try { await accountService.remove(a.id); message.success('Deleted'); reload(); } catch (e: any) { message.error(e.message); } }}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]} />
      {editing && <AccountModal data={data} account={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); data.reload(); }} />}
      {history && <AccountHistory account={history} entries={entries} currency={data.currency} onClose={() => setHistory(null)} />}
    </div>
  );
}

/** Shows what moving to the recommended chart of accounts changes, and does it when asked. */
function RecommendedChartModal({ companyId, onClose, onDone }: { companyId: number; onClose: () => void; onDone: () => void }) {
  const [plan, setPlan] = useState<Awaited<ReturnType<typeof accountService.recommendedPlan>> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { accountService.recommendedPlan(companyId).then(setPlan).catch(e => { message.error(e.message); onClose(); }); }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps
  const apply = async () => {
    if (!plan) return;
    setBusy(true);
    try { await accountService.applyRecommendedPlan(companyId, plan); message.success('Chart of accounts updated'); onDone(); }
    catch (e: any) { message.error(e.message); }
    setBusy(false);
  };
  const changed = plan?.moves.filter(m => m.to !== m.from) || [];
  return (
    <Modal open onCancel={onClose} width={720} title="Use the recommended chart of accounts" okText="Update my chart" confirmLoading={busy}
      okButtonProps={{ disabled: !plan || (!changed.length && !plan.add.length) }} onOk={apply}>
      {!plan ? <Spin /> : (
        <div style={{ maxHeight: 460, overflow: 'auto' }}>
          <p>Accounts get the recommended codes: 1xxx assets, 2xxx liabilities, 3xxx equity, 4xxx revenue, 5xxx cost of sales, 6xxx operating expenses, 7xxx other income and expenses, 8xxx taxation. Your invoices, bills, payments and journals are not touched: they stay linked to the same accounts.</p>
          <Typography.Title level={5}>Accounts that change code ({changed.length})</Typography.Title>
          <Table size="small" rowKey="id" pagination={false} dataSource={changed}
            columns={[{ title: 'Account', key: 'n', render: (_, m) => m.name ? `${m.fromName} → ${m.name}` : m.fromName }, { title: 'Now', dataIndex: 'from', width: 80 }, { title: 'New code', dataIndex: 'to', width: 90 }]} />
          <Typography.Title level={5} style={{ marginTop: 16 }}>Accounts added ({plan.add.length})</Typography.Title>
          <div style={{ columns: 2, fontSize: 12 }}>{plan.add.map(a => <div key={a.code}>{a.code} {a.name}</div>)}</div>
          {plan.skipped.length > 0 && (
            <Alert style={{ marginTop: 12 }} type="info" showIcon title="Not added, because you already use the code for your own account"
              description={plan.skipped.map(s => `${s.code} ${s.name}`).join(' · ')} />
          )}
        </div>
      )}
    </Modal>
  );
}

function AccountModal({ data, account, onClose, onSaved }: { data: FinanceData; account: Partial<Account>; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const type = Form.useWatch('type', form);
  const subtype = Form.useWatch('subtype', form);
  const submit = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      await accountService.save(data.companyId, {
        ...account, ...v, subtype: account.is_system ? account.subtype : (v.subtype || null), opening_date: v.opening_date ? v.opening_date.format('YYYY-MM-DD') : null,
      });
      message.success('Saved'); onSaved();
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };
  return (
    <Modal open onCancel={onClose} onOk={submit} confirmLoading={saving} title={account.id ? `Edit ${account.name}` : 'New account'} width={560}>
      <Form form={form} layout="vertical" initialValues={{ ...account, subtype: account.subtype || '', opening_date: account.opening_date ? dayjs(account.opening_date) : null }}>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, alignItems: 'end' }}>
          <Form.Item name="code" label="Code" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Select disabled={account.is_system} options={Object.entries(ACCOUNT_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          {type === 'asset' && !account.is_system && <Form.Item name="subtype" label="Kind"><Select options={SUBTYPE_OPTIONS} /></Form.Item>}
        </div>
        {(subtype === 'bank' || account.subtype === 'bank') && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
            <Form.Item name="bank_name" label="Bank"><Input /></Form.Item>
            <Form.Item name="bank_account_no" label="Account no."><Input /></Form.Item>
          </div>
        )}
        <Form.Item name="description" label="Description"><Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} /></Form.Item>
        {['asset', 'liability', 'equity'].includes(type) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
            <Form.Item name="opening_balance" label="Opening balance" tooltip="What the account held when you started using Quantivra (e.g. your bank balance)."><AmountInput precision={2} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="opening_date" label="As at"><DatePicker style={{ width: '100%' }} /></Form.Item>
          </div>
        )}
        <Form.Item name="archived" valuePropName="checked"><Checkbox>Archived (hide from lists)</Checkbox></Form.Item>
      </Form>
    </Modal>
  );
}

function AccountHistory({ account, entries, currency, onClose }: { account: Account; entries: LedgerEntry[]; currency: string; onClose: () => void }) {
  const [range, setRange] = useState<[Dayjs, Dayjs]>(PRESETS['This year']());
  const h = accountLedger(account, entries, range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'));
  const M = (n: number) => money(n, currency);
  const SOURCE: Record<string, string> = { invoice: 'Invoice', credit_note: 'Credit note', bill: 'Bill', expense: 'Expense', payment_in: 'Payment received', payment_out: 'Payment made', payroll: 'Payroll', journal: 'Journal', opening: 'Opening balance' };
  return (
    <Drawer open onClose={onClose} size={900} title={`${account.code} ${account.name}`}>
      <PeriodPicker value={range} onChange={setRange} />
      <Table rowKey={(r: any) => `${r.date}-${r.ref}-${r.debit}-${r.credit}-${r.balance}`} size="small" style={{ marginTop: 12 }} pagination={false}
        dataSource={h.rows} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing in this period" /> }}
        title={() => <Text>Opening balance: <b>{M(h.opening)}</b></Text>}
        footer={() => <Text>Closing balance: <b>{M(h.closing)}</b></Text>}
        columns={[
          { title: 'Date', dataIndex: 'date', render: (v: string) => fmtDate(v), width: 100 },
          { title: 'From', dataIndex: 'source', render: (s: string) => SOURCE[s] || s, width: 130 },
          { title: 'Ref', dataIndex: 'ref', width: 140 },
          { title: 'Details', dataIndex: 'memo' },
          { title: 'Debit', dataIndex: 'debit', align: 'right' as const, render: (v: number) => (v ? M(v) : '') },
          { title: 'Credit', dataIndex: 'credit', align: 'right' as const, render: (v: number) => (v ? M(v) : '') },
          { title: 'Balance', dataIndex: 'balance', align: 'right' as const, render: (v: number) => M(v) },
        ]} />
    </Drawer>
  );
}

// ---- manual journals ---------------------------------------------------------------------------

function Journals({ data, accounts, journals, reload }: { data: FinanceData; accounts: Account[]; journals: JournalRow[]; reload: () => void }) {
  const access = useCompanyAccess();
  const canWrite = access.canWrite('finance'), canRemove = access.canRemove('finance');
  const [editing, setEditing] = useState<Partial<JournalRow> | null>(null);
  const name = (id: number) => { const a = accounts.find(x => x.id === id); return a ? `${a.code} ${a.name}` : '?'; };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
        <Text type="secondary">For anything not covered by invoices, bills, expenses or payroll — e.g. loans, depreciation, year-end adjustments.</Text>
        {canWrite && <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ journal_date: today(), lines: [] })}>New journal entry</Button>}
      </div>
      <Table rowKey="id" size="small" dataSource={journals} pagination={{ pageSize: 50, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No journal entries" /> }}
        columns={[
          { title: 'Date', dataIndex: 'journal_date', render: (v: string) => fmtDate(v), width: 110 },
          { title: 'Number', dataIndex: 'number', width: 140 },
          { title: 'Memo', dataIndex: 'memo' },
          { title: 'Lines', key: 'l', render: (_, j) => j.lines.map(l => <div key={l.id} style={{ fontSize: 12 }}>{name(l.account_id)}: {l.debit ? `Dr ${money(l.debit, data.currency)}` : `Cr ${money(l.credit, data.currency)}`}</div>) },
          {
            title: '', key: 'a', width: 90, render: (_, j) => canWrite && (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(j)} />
                {canRemove && <Popconfirm title="Delete this journal entry?" onConfirm={async () => { await journalService.remove(j.id); message.success('Deleted'); reload(); }}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>}
              </Space>
            ),
          },
        ]} />
      {editing && <JournalModal data={data} accounts={accounts} journal={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function JournalModal({ data, accounts, journal, onClose, onSaved }: { data: FinanceData; accounts: Account[]; journal: Partial<JournalRow>; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(journal.journal_date || today());
  const [memo, setMemo] = useState(journal.memo || '');
  const [lines, setLines] = useState<JournalRow['lines']>(journal.lines?.length ? journal.lines.map(l => ({ ...l, debit: Number(l.debit), credit: Number(l.credit) }))
    : [{ account_id: 0, debit: 0, credit: 0 }, { account_id: 0, debit: 0, credit: 0 }]);
  const [saving, setSaving] = useState(false);
  const dr = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0), cr = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const setLine = (i: number, patch: Partial<JournalRow['lines'][number]>) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const submit = async () => {
    setSaving(true);
    try { await journalService.save(data.companyId, { ...journal, journal_date: date, memo }, lines); message.success('Saved'); onSaved(); } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };
  return (
    <Modal open onCancel={onClose} onOk={submit} confirmLoading={saving} width={820} title={journal.id ? `Journal ${journal.number || ''}` : 'New journal entry'}
      okButtonProps={{ disabled: Math.round(dr * 100) !== Math.round(cr * 100) || !dr }}>
      <Space style={{ marginBottom: 12 }} wrap>
        <DatePicker allowClear={false} value={dayjs(date)} onChange={d => d && setDate(d.format('YYYY-MM-DD'))} />
        <Input style={{ width: 420 }} placeholder="What is this for?" value={memo} onChange={e => setMemo(e.target.value)} />
      </Space>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 120px 120px 32px', gap: 6, marginBottom: 6 }}>
          <Select showSearch optionFilterProp="label" placeholder="Account" value={l.account_id || undefined} onChange={v => setLine(i, { account_id: v })}
            options={accounts.filter(a => !a.archived).map(a => ({ value: a.id, label: `${a.code} ${a.name}` }))} />
          <Input placeholder="Details" value={l.description || ''} onChange={e => setLine(i, { description: e.target.value })} />
          <AmountInput placeholder="Debit" min={0} precision={2} value={l.debit || undefined} onChange={v => setLine(i, { debit: Number(v) || 0, credit: v ? 0 : l.credit })} />
          <AmountInput placeholder="Credit" min={0} precision={2} value={l.credit || undefined} onChange={v => setLine(i, { credit: Number(v) || 0, debit: v ? 0 : l.debit })} />
          <Button icon={<DeleteOutlined />} onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button size="small" icon={<PlusOutlined />} onClick={() => setLines(ls => [...ls, { account_id: 0, debit: 0, credit: 0 }])}>Add a line</Button>
      <div style={{ marginTop: 12 }}>
        Debits {money(dr, data.currency)} · Credits {money(cr, data.currency)}
        {Math.round(dr * 100) !== Math.round(cr * 100) && <Text type="danger"> — they must be equal (difference {money(Math.abs(dr - cr), data.currency)})</Text>}
      </div>
    </Modal>
  );
}

/** Pay something the company owes that isn't a supplier bill (payroll contributions, tax, salaries…): a journal from the bank. */
function PayLiability({ data, accounts, account, amount, onClose, onDone }: {
  data: FinanceData; accounts: Account[]; account: Account; amount: number; onClose: () => void; onDone: () => void;
}) {
  const banks = accounts.filter(a => !a.archived && (a.subtype === 'bank' || a.subtype === 'cash'));
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      await journalService.save(data.companyId, { journal_date: v.date.format('YYYY-MM-DD'), memo: v.memo || `Paid ${account.name}` }, [
        { account_id: account.id, debit: v.amount, credit: 0, description: v.memo },
        { account_id: v.bank, debit: 0, credit: v.amount, description: v.memo },
      ]);
      message.success('Payment recorded'); onDone();
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };
  return (
    <Modal open onCancel={onClose} onOk={submit} confirmLoading={saving} okText="Record payment" title={`Pay ${account.name}`}>
      <Text type="secondary">Owed: {money(amount, data.currency)}. If you match bank statement lines in Bank instead, don't record it here as well.</Text>
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}
        initialValues={{ amount, date: dayjs(), bank: banks.find(b => b.subtype === 'bank')?.id, memo: `Paid ${account.name}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}><AmountInput min={0.01} precision={2} style={{ width: '100%' }} prefix={data.currency} /></Form.Item>
          <Form.Item name="date" label="Paid on" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} allowClear={false} /></Form.Item>
          <Form.Item name="bank" label="From" rules={[{ required: true }]}><Select options={banks.map(b => ({ value: b.id, label: b.name }))} /></Form.Item>
          <Form.Item name="memo" label="Details"><Input /></Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
