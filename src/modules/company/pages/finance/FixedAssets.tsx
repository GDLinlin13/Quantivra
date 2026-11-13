import { useMemo, useState } from 'react';
import { Table, Button, Drawer, Form, Input, InputNumber, DatePicker, Select, Switch, Space, Tag, Typography, Popconfirm, Modal, message, Empty } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, TableOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { assetService } from '../../../../services/finance';
import { depreciationSchedule, bookValue, loanSchedule, type FixedAsset } from '../../../../data/assets';
import type { Account } from '../../../../data/finance';
import { money } from '../../../../data/documentLayouts';
import { useCompanyAccess } from '../../../../contexts/CompanyAccess';
import { AmountInput } from '../../../../components/AmountInput';
import { fmtDate } from '../../../../utils/dateFormat';
import type { FinanceData } from './DocList';

const { Text } = Typography;
const CATEGORIES = ['Vehicles', 'Computer equipment', 'Office equipment and furniture', 'Machinery and equipment', 'Property and buildings', 'Other'];
const today = () => dayjs().format('YYYY-MM-DD');

/** Finance → Accounting → Fixed assets: each asset, its depreciation, and the loan it was bought on. */
export function FixedAssets({ data, accounts, assets, reload }: { data: FinanceData; accounts: Account[]; assets: FixedAsset[]; reload: () => void }) {
  const canWrite = useCompanyAccess().canWrite('finance');
  const [editing, setEditing] = useState<Partial<FixedAsset> | null>(null);
  const [schedule, setSchedule] = useState<FixedAsset | null>(null);
  const [disposing, setDisposing] = useState<FixedAsset | null>(null);
  const cur = data.currency;
  const rows = useMemo(() => assets.map(a => ({ a, ...bookValue(a, today()) })), [assets]);
  const totals = rows.reduce((t, r) => ({ cost: t.cost + Number(r.a.cost), nbv: t.nbv + r.netBookValue }), { cost: 0, nbv: 0 });

  return (
    <div>
      <Space style={{ marginBottom: 12 }} wrap>
        {canWrite && <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ status: 'active', purchase_date: today(), life_months: 60, residual_value: 0, start_month: dayjs().startOf('month').format('YYYY-MM-DD') })}>Add asset</Button>}
        {rows.length > 0 && <Text type="secondary">Cost {money(totals.cost, cur)} · Net book value {money(totals.nbv, cur)}</Text>}
      </Space>
      <Table rowKey={r => r.a.id} size="small" pagination={false} dataSource={rows}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No fixed assets yet" /> }}
        columns={[
          { title: 'Asset', key: 'n', render: (_, r) => <><a onClick={() => setSchedule(r.a)}>{r.a.name}</a>{r.a.code ? <Text type="secondary"> · {r.a.code}</Text> : null}</> },
          { title: 'Category', key: 'c', render: (_, r) => r.a.category || '—' },
          { title: 'Bought', key: 'd', width: 110, render: (_, r) => fmtDate(r.a.purchase_date) },
          { title: 'Cost', key: 'cost', align: 'right' as const, render: (_, r) => money(r.a.cost, cur) },
          { title: 'Depreciated', key: 'dep', align: 'right' as const, render: (_, r) => money(r.accumulated, cur) },
          { title: 'Net book value', key: 'nbv', align: 'right' as const, render: (_, r) => money(r.a.status === 'disposed' ? 0 : r.netBookValue, cur) },
          { title: 'Status', key: 's', width: 110, render: (_, r) => (r.a.status === 'disposed' ? <Tag>Disposed {fmtDate(r.a.disposed_date)}</Tag> : r.netBookValue <= Number(r.a.residual_value) + 0.004 ? <Tag color="green">Fully depreciated</Tag> : <Tag color="blue">In use</Tag>) },
          { title: '', key: 'x', width: 190, render: (_, r) => (
            <Space size={4}>
              <Button size="small" icon={<TableOutlined />} onClick={() => setSchedule(r.a)}>Schedule</Button>
              {canWrite && <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r.a)} />}
              {canWrite && r.a.status === 'active' && <Button size="small" onClick={() => setDisposing(r.a)}>Dispose</Button>}
              {canWrite && (
                <Popconfirm title={`Delete ${r.a.name}?`} description="Its depreciation and loan entries disappear from the books." okText="Delete" okButtonProps={{ danger: true }}
                  onConfirm={async () => { try { await assetService.remove(r.a.id); reload(); } catch (e: any) { message.error(e.message); } }}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              )}
            </Space>
          ) },
        ]} />
      {editing && <AssetDrawer companyId={data.companyId} currency={cur} accounts={accounts} asset={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {schedule && <ScheduleModal asset={schedule} currency={cur} onClose={() => setSchedule(null)} />}
      {disposing && <DisposeModal asset={disposing} accounts={accounts} onClose={() => setDisposing(null)} onDone={() => { setDisposing(null); reload(); }} companyId={data.companyId} />}
    </div>
  );
}

const named = (accounts: Account[], re: RegExp, type?: string) => accounts.find(a => !a.archived && (!type || a.type === type) && re.test(a.name))?.id;

function AssetDrawer({ companyId, currency, accounts, asset, onClose, onSaved }: {
  companyId: number; currency: string; accounts: Account[]; asset: Partial<FixedAsset>; onClose: () => void; onSaved: () => void;
}) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const live = accounts.filter(a => !a.archived);
  const opt = (list: Account[]) => list.map(a => ({ value: a.id, label: `${a.code} ${a.name}` }));
  const fixed = live.filter(a => a.type === 'asset' && a.subtype === 'fixed');
  const assetAccs = opt(fixed.length ? fixed : live.filter(a => a.type === 'asset'));
  const expenseAccs = opt(live.filter(a => a.type === 'expense'));
  const accumAccs = opt(live.filter(a => a.type === 'asset'));
  const liabilityAccs = opt(live.filter(a => a.type === 'liability'));
  // a deposit paid in cash is booked here (choose the cash account); one paid through a bank comes in from the bank statement
  const bankAccs = live.filter(a => a.type === 'asset' && a.subtype === 'cash').map(a => ({ value: a.id, label: `${a.code} ${a.name}` }));
  const [loanOn, setLoanOn] = useState(Number(asset.loan_amount) > 0);

  const w = Form.useWatch([], form) || {};
  const years = Number(w.years) || 0;
  const monthly = (() => { const cost = Number(w.cost) || 0, res = Number(w.residual_value) || 0, n = Math.max(1, Math.round(years * 12)); return n > 0 ? Math.round(((cost - res) / n) * 100) / 100 : 0; })();
  const loan = loanOn ? loanSchedule(Number(w.loan_amount) || 0, Number(w.loan_term_months) || 0, Number(w.monthly_repayment) || 0, (w.loan_start ? dayjs(w.loan_start) : dayjs()).format('YYYY-MM-DD')) : null;

  const submit = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      await assetService.save(companyId, {
        ...asset, name: v.name, code: v.code, category: v.category, cost: v.cost, residual_value: v.residual_value || 0,
        purchase_date: dayjs(v.purchase_date).format('YYYY-MM-DD'), life_months: Math.round(Number(v.years) * 12),
        start_month: dayjs(v.start_month).startOf('month').format('YYYY-MM-DD'),
        asset_account_id: v.asset_account_id, expense_account_id: v.expense_account_id, accumulated_account_id: v.accumulated_account_id, notes: v.notes,
        ...(loanOn ? {
          loan_amount: v.loan_amount, loan_term_months: v.loan_term_months, monthly_repayment: v.monthly_repayment,
          loan_start_month: dayjs(v.loan_start).startOf('month').format('YYYY-MM-DD'),
          loan_account_id: v.loan_account_id, interest_account_id: v.interest_account_id,
          book_purchase: !!v.book_purchase, deposit_account_id: v.deposit_account_id || null,
        } : { loan_amount: 0, loan_term_months: null, monthly_repayment: null, loan_start_month: null, loan_account_id: null, interest_account_id: null, book_purchase: false, deposit_account_id: null }),
      });
      message.success('Saved');
      onSaved();
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };

  return (
    <Drawer open onClose={onClose} size={820} title={asset.id ? asset.name : 'New fixed asset'} extra={<Button type="primary" loading={saving} onClick={submit}>Save</Button>}>
      <Form form={form} layout="vertical" initialValues={{
        name: asset.name, code: asset.code, category: asset.category, cost: asset.cost, residual_value: asset.residual_value || 0,
        purchase_date: asset.purchase_date ? dayjs(asset.purchase_date) : dayjs(), years: asset.life_months ? Math.round((asset.life_months / 12) * 100) / 100 : 5,
        start_month: asset.start_month ? dayjs(asset.start_month) : dayjs(),
        asset_account_id: asset.asset_account_id ?? fixed[0]?.id, expense_account_id: asset.expense_account_id ?? named(accounts, /depreciation/i, 'expense'),
        accumulated_account_id: asset.accumulated_account_id ?? named(accounts, /accumulated depreciation/i, 'asset'), notes: asset.notes,
        loan_amount: asset.loan_amount || undefined, loan_term_months: asset.loan_term_months || undefined, monthly_repayment: asset.monthly_repayment ?? undefined,
        loan_start: asset.loan_start_month ? dayjs(asset.loan_start_month) : dayjs().add(1, 'month'),
        loan_account_id: asset.loan_account_id ?? named(accounts, /loan|borrowing|hire purchase/i, 'liability'),
        interest_account_id: asset.interest_account_id ?? named(accounts, /interest/i, 'expense'), book_purchase: !!asset.book_purchase, deposit_account_id: asset.deposit_account_id ?? undefined,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 12 }}>
          <Form.Item name="name" label="Asset" rules={[{ required: true, message: 'Name the asset' }]}><Input /></Form.Item>
          <Form.Item name="code" label="Code"><Input /></Form.Item>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <Form.Item name="category" label="Category"><Select allowClear options={CATEGORIES.map(c => ({ value: c, label: c }))} /></Form.Item>
          <Form.Item name="purchase_date" label="Purchase date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="cost" label={`Purchase price (${currency})`} rules={[{ required: true, message: 'Enter the price' }]}><AmountInput min={0} precision={2} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="residual_value" label="Value left at the end"><AmountInput min={0} precision={2} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="years" label="Useful life (years)" rules={[{ required: true }]}><InputNumber min={0.5} step={0.5} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="start_month" label="Depreciation starts"><DatePicker picker="month" style={{ width: '100%' }} /></Form.Item>
        </div>
        <Text type="secondary">Depreciation: {money(monthly, currency)} a month, straight-line</Text>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginTop: 12 }}>
          <Form.Item name="asset_account_id" label="Asset account" rules={[{ required: true, message: 'Choose the account' }]}><Select showSearch optionFilterProp="label" options={assetAccs} /></Form.Item>
          <Form.Item name="expense_account_id" label="Depreciation expense" rules={[{ required: true, message: 'Choose the account' }]}><Select showSearch optionFilterProp="label" options={expenseAccs} /></Form.Item>
          <Form.Item name="accumulated_account_id" label="Accumulated depreciation" rules={[{ required: true, message: 'Choose the account' }]}><Select showSearch optionFilterProp="label" options={accumAccs} /></Form.Item>
        </div>

        <div style={{ margin: '8px 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Switch checked={loanOn} onChange={setLoanOn} /><Text>Bought on a loan</Text>
        </div>
        {loanOn && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              <Form.Item name="loan_amount" label={`Loan amount (${currency})`} rules={[{ required: true, message: 'Enter the loan' }]}><AmountInput min={0} precision={2} style={{ width: '100%' }} /></Form.Item>
              <Form.Item name="loan_term_months" label="Loan term (months)" rules={[{ required: true, message: 'Enter the term' }]}><InputNumber min={1} precision={0} style={{ width: '100%' }} /></Form.Item>
              <Form.Item name="monthly_repayment" label={`Monthly repayment (${currency})`} rules={[{ required: true, message: 'Enter the repayment' }]}><AmountInput min={0} precision={2} style={{ width: '100%' }} /></Form.Item>
              <Form.Item name="loan_start" label="First repayment"><DatePicker picker="month" style={{ width: '100%' }} /></Form.Item>
              <Form.Item name="loan_account_id" label="Loan account" rules={[{ required: true, message: 'Choose the account' }]}><Select showSearch optionFilterProp="label" options={liabilityAccs} /></Form.Item>
              <Form.Item name="interest_account_id" label="Interest expense" rules={[{ required: true, message: 'Choose the account' }]}><Select showSearch optionFilterProp="label" options={expenseAccs} /></Form.Item>
            </div>
            {loan && loan.rows.length > 0 && (
              <Text style={{ display: 'block', marginBottom: 12 }}>
                Interest about <b>{loan.annualRate.toFixed(2)}%</b> a year · <b>{money(loan.totalInterest, currency)}</b> interest in total · paid off in {loan.rows[loan.rows.length - 1].month}
              </Text>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Form.Item name="book_purchase" valuePropName="checked" noStyle><Switch /></Form.Item><Text>Book the purchase here (the loan, and a cash deposit)</Text>
            </div>
            {form.getFieldValue('book_purchase') && (
              <>
                <Form.Item name="deposit_account_id" label="Deposit paid in cash from"><Select allowClear showSearch optionFilterProp="label" placeholder="Paid through a bank" options={bankAccs} /></Form.Item>
                {!form.getFieldValue('deposit_account_id') && (
                  <Text style={{ display: 'block', marginBottom: 12 }}>The deposit is not booked here. When it shows on the bank statement, match it with Something else, and choose the asset account.</Text>
                )}
              </>
            )}
          </>
        )}
        <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </Drawer>
  );
}

function ScheduleModal({ asset, currency, onClose }: { asset: FixedAsset; currency: string; onClose: () => void }) {
  const dep = depreciationSchedule(asset, dayjs().add(asset.life_months + 2, 'month').format('YYYY-MM-DD'));
  const loan = Number(asset.loan_amount) > 0 && asset.loan_term_months && asset.monthly_repayment && asset.loan_start_month
    ? loanSchedule(Number(asset.loan_amount), asset.loan_term_months, Number(asset.monthly_repayment), asset.loan_start_month) : null;
  const t = today();
  let acc = 0;
  const depRows = dep.map(m => { acc += m.amount; return { ...m, accumulated: Math.round(acc * 100) / 100, net: Math.round((Number(asset.cost) - acc) * 100) / 100 }; });
  return (
    <Modal open onCancel={onClose} footer={null} width={760} title={asset.name} destroyOnHidden>
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Text strong>Depreciation</Text>
          <Table size="small" rowKey="month" pagination={{ pageSize: 12, hideOnSinglePage: true }} dataSource={depRows}
            rowClassName={r => (r.date <= t ? '' : 'qv-future')}
            columns={[
              { title: 'Month', dataIndex: 'month' },
              { title: 'Depreciation', key: 'a', align: 'right' as const, render: (_, r) => money(r.amount, currency) },
              { title: 'Accumulated', key: 'c', align: 'right' as const, render: (_, r) => money(r.accumulated, currency) },
              { title: 'Net book value', key: 'n', align: 'right' as const, render: (_, r) => money(r.net, currency) },
              { title: '', key: 'f', width: 90, render: (_, r) => (r.date <= t ? <Tag color="green">Booked</Tag> : <Tag>Later</Tag>) },
            ]} />
        </div>
        {loan && (
          <div>
            <Text strong>Loan — about {loan.annualRate.toFixed(2)}% a year, {money(loan.totalInterest, currency)} interest in total</Text>
            <Table size="small" rowKey="n" pagination={{ pageSize: 12, hideOnSinglePage: true }} dataSource={loan.rows}
              columns={[
                { title: 'Repayment', dataIndex: 'month' },
                { title: 'Pay', key: 'p', align: 'right' as const, render: (_, r) => money(r.payment, currency) },
                { title: 'Interest', key: 'i', align: 'right' as const, render: (_, r) => money(r.interest, currency) },
                { title: 'Loan paid off', key: 'pr', align: 'right' as const, render: (_, r) => money(r.principal, currency) },
                { title: 'Loan left', key: 'b', align: 'right' as const, render: (_, r) => money(r.balance, currency) },
              ]} />
          </div>
        )}
      </Space>
    </Modal>
  );
}

function DisposeModal({ asset, accounts, companyId, onClose, onDone }: { asset: FixedAsset; accounts: Account[]; companyId: number; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [account, setAccount] = useState<number | undefined>(asset.disposal_account_id ?? named(accounts, /non-operating|disposal|other.*expense/i, 'expense') ?? asset.expense_account_id ?? undefined);
  const [saving, setSaving] = useState(false);
  const go = async () => {
    setSaving(true);
    try { await assetService.save(companyId, { ...asset, status: 'disposed', disposed_date: date.format('YYYY-MM-DD'), disposal_account_id: account ?? null }); onDone(); }
    catch (e: any) { message.error(e.message); }
    setSaving(false);
  };
  return (
    <Modal open title={`Dispose of ${asset.name}`} okText="Dispose" confirmLoading={saving} onOk={go} onCancel={onClose} destroyOnHidden>
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <div><Text type="secondary" style={{ display: 'block' }}>Date</Text><DatePicker value={date} allowClear={false} onChange={v => v && setDate(v)} /></div>
        <div><Text type="secondary" style={{ display: 'block' }}>What is left on the books is written off to</Text>
          <Select style={{ width: '100%' }} showSearch optionFilterProp="label" value={account} onChange={setAccount}
            options={accounts.filter(a => !a.archived && a.type === 'expense').map(a => ({ value: a.id, label: `${a.code} ${a.name}` }))} /></div>
      </Space>
    </Modal>
  );
}
