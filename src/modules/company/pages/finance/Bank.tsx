import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Select, Space, Button, Table, Tag, Card, Statistic, Upload, Modal, Form, DatePicker, Input, InputNumber, Segmented, message, Empty,
  Typography, Popconfirm, Tabs, Alert,
} from 'antd';
import { UploadOutlined, PlusOutlined, LinkOutlined, DisconnectOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { bankService, paymentService, loadLedgerInput, accountService, type BankTxn, type Payment } from '../../../../services/finance';
import { buildLedger, balances } from '../../../../data/ledger';
import { balanceDue, type Account, type FinDocument } from '../../../../data/finance';
import { parseBankCsv, type BankLine } from '../../../../data/bankCsv';
import { parseStatementText, pdfToLines } from '../../../../data/bankPdf';

type ImportLine = BankLine & { sure: boolean };
import { money } from '../../../../data/documentLayouts';
import type { FinanceData } from './DocList';

const { Text } = Typography;

/** Bank: statement lines (typed in or imported from CSV), matched to payments, invoices, bills or accounts. */
export function Bank({ data }: { data: FinanceData }) {
  const { companyId, currency, accounts } = data;
  const banks = accounts.filter(a => !a.archived && (a.subtype === 'bank' || a.subtype === 'cash'));
  const [accountId, setAccountId] = useState<number | null>(() => banks.find(b => b.subtype === 'bank')?.id ?? banks[0]?.id ?? null);
  const [txns, setTxns] = useState<BankTxn[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [allTxns, setAllTxns] = useState<BankTxn[]>([]);
  const [booksBalance, setBooksBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('unmatched');
  const [importing, setImporting] = useState<ImportLine[] | null>(null);
  const [bankEdit, setBankEdit] = useState<Partial<Account> | null>(null);
  const [adding, setAdding] = useState(false);
  const [matching, setMatching] = useState<BankTxn | null>(null);
  const account = accounts.find(a => a.id === accountId);

  const load = useCallback(async () => {
    if (!accountId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [t, all, pin, pout, input] = await Promise.all([
        bankService.list(companyId, accountId), bankService.listAll(companyId),
        paymentService.list(companyId, 'in'), paymentService.list(companyId, 'out'), loadLedgerInput(companyId),
      ]);
      setTxns(t); setAllTxns(all); setPayments([...pin, ...pout]);
      const b = balances(input.accounts, buildLedger(input as any)).find(x => x.account.id === accountId);
      setBooksBalance(b?.balance || 0);
    } catch (e: any) { message.error(e.message); }
    setLoading(false);
  }, [companyId, accountId]);
  useEffect(() => { load(); }, [load, data.docs]);

  const statementBalance = useMemo(() => Math.round(((Number(account?.opening_balance) || 0) + txns.reduce((s, t) => s + Number(t.amount), 0)) * 100) / 100, [txns, account]);
  const shown = txns.filter(t => filter === 'all' || t.status === filter);
  const unmatched = txns.filter(t => t.status === 'unmatched').length;

  const bankModal = bankEdit && (
    <BankAccountModal data={data} account={bankEdit} onClose={() => setBankEdit(null)}
      onSaved={id => { setBankEdit(null); setAccountId(id); data.reload(); }} />
  );
  if (!banks.length) {
    return (
      <div>
        <Empty description="No bank accounts yet">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setBankEdit({})}>Bank account</Button>
        </Empty>
        {bankModal}
      </div>
    );
  }

  const onFile = async (file: File) => {
    let r: { lines: ImportLine[]; error?: string };
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      const hide = message.loading('Reading the PDF…', 0);
      try {
        const parsed = parseStatementText(await pdfToLines(file));
        r = parsed.lines.length ? { lines: parsed.lines } : { lines: [], error: 'No transactions found in that PDF. Scanned (photo) statements can’t be read — download the statement from internet banking as PDF or CSV.' };
      } catch (e: any) { r = { lines: [], error: `Couldn’t read the PDF: ${e.message}` }; }
      hide();
    } else {
      const c = parseBankCsv(await file.text());
      r = { lines: c.lines.map(l => ({ ...l, sure: true })), error: c.error };
    }
    if (r.error) { message.error(r.error); return false; }
    // leave out lines already imported (same date, amount and description)
    const seen = new Set(txns.map(t => `${t.txn_date}|${Number(t.amount).toFixed(2)}|${t.description || ''}`));
    const fresh = r.lines.filter(l => !seen.has(`${l.txn_date}|${l.amount.toFixed(2)}|${l.description}`));
    if (!fresh.length) { message.info('Nothing new in that file'); return false; }
    setImporting(fresh);
    return false;
  };

  const describe = (t: BankTxn) => {
    if (t.payment_id) { const p = payments.find(x => x.id === t.payment_id); return p ? `Payment ${p.number || ''} · ${data.contacts.find(c => c.id === p.contact_id)?.name || ''}` : 'Payment'; }
    if (t.journal_id) return 'Booked to an account (journal)';
    return '';
  };

  return (
    <div>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select style={{ width: 280 }} value={accountId ?? undefined} onChange={setAccountId}
          options={banks.map(b => ({ value: b.id, label: `${b.name}${b.bank_account_no ? ` (${b.bank_account_no})` : ''}` }))} />
        <Button icon={<EditOutlined />} onClick={() => account && setBankEdit(account)} title="Edit this bank account" />
        <Button icon={<PlusOutlined />} onClick={() => setBankEdit({})}>Bank account</Button>
        <Upload accept=".csv,text/csv,.pdf,application/pdf" showUploadList={false} beforeUpload={onFile}><Button icon={<UploadOutlined />}>Import statement (PDF or CSV)</Button></Upload>
        <Button icon={<PlusOutlined />} onClick={() => setAdding(true)}>Add a line</Button>
      </Space>
      <Space size={16} wrap style={{ marginBottom: 12 }}>
        <Card size="small" style={{ minWidth: 200 }}><Statistic title="Balance per statement" value={money(statementBalance, currency)} /></Card>
        <Card size="small" style={{ minWidth: 200 }}><Statistic title="Balance in Quantivra" value={money(booksBalance, currency)} /></Card>
        <Card size="small" style={{ minWidth: 200 }}><Statistic title="Lines to match" value={unmatched} styles={{ content: { color: unmatched ? '#faad14' : undefined } }} /></Card>
      </Space>
      {booksBalance < 0 && !Number(account?.opening_balance) && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          title="The balance in Quantivra is negative because this account has no opening balance yet."
          description={<>Payroll net pay, payments and other money out are taken from this account, but the money that was in it when you started isn't recorded. Click <EditOutlined /> next to the account and enter the opening balance and its date (e.g. your bank balance on the day before your first payroll in Quantivra).</>} />
      )}
      {Math.abs(statementBalance - booksBalance) >= 0.01 && unmatched === 0 && txns.length > 0 && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          title={`The statement and Quantivra differ by ${money(Math.abs(statementBalance - booksBalance), currency)}. Check for payments recorded in Quantivra that aren't on the statement yet, or the account's opening balance.`} />
      )}
      <Segmented value={filter} onChange={v => setFilter(String(v))} style={{ marginBottom: 12 }}
        options={[{ value: 'unmatched', label: `To match (${unmatched})` }, { value: 'matched', label: 'Matched' }, { value: 'ignored', label: 'Ignored' }, { value: 'all', label: 'All' }]} />
      <Table rowKey="id" size="small" loading={loading} dataSource={shown} pagination={{ pageSize: 100, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={filter === 'unmatched' ? 'All matched' : 'No lines'} /> }}
        columns={[
          { title: 'Date', dataIndex: 'txn_date', width: 110 },
          { title: 'Description', dataIndex: 'description' },
          { title: 'Money in', key: 'in', align: 'right' as const, width: 140, render: (_, t) => t.amount > 0 ? <span style={{ color: '#73d13d' }}>{money(t.amount, currency)}</span> : '' },
          { title: 'Money out', key: 'out', align: 'right' as const, width: 140, render: (_, t) => t.amount < 0 ? <span style={{ color: '#ff7875' }}>{money(-t.amount, currency)}</span> : '' },
          { title: 'Matched to', key: 'm', render: (_, t) => t.status === 'ignored' ? <Tag>ignored</Tag> : describe(t) },
          {
            title: '', key: 'a', width: 170, render: (_, t) => (
              <Space size={4}>
                {t.status === 'unmatched'
                  ? <Button size="small" type="primary" icon={<LinkOutlined />} onClick={() => setMatching(t)}>Match</Button>
                  : (
                    <Popconfirm title="Undo this match?" description={t.journal_id ? 'The journal entry made for it is deleted too.' : 'The payment itself stays recorded.'}
                      onConfirm={async () => { await bankService.unmatch(t, !!t.journal_id); load(); data.reload(); }}>
                      <Button size="small" icon={<DisconnectOutlined />}>Undo</Button>
                    </Popconfirm>
                  )}
                {t.status === 'unmatched' && <Button size="small" onClick={async () => { await bankService.update(t.id, { status: 'ignored' }); load(); }}>Ignore</Button>}
                <Popconfirm title="Delete this statement line?" onConfirm={async () => { await bankService.remove(t.id); load(); }}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]} />

      {importing && (
        <Modal open width={860} title={`Import ${importing.length} lines into ${account?.name}`} okText={`Import ${importing.length} lines`}
          onCancel={() => setImporting(null)}
          onOk={async () => { try { await bankService.add(companyId, accountId!, importing.map(({ sure: _s, ...l }) => l)); message.success('Imported'); setImporting(null); load(); } catch (e: any) { message.error(e.message); } }}>
          {importing.some(l => !l.sure) && (
            <Alert type="warning" showIcon style={{ marginBottom: 8 }}
              title={`${importing.filter(l => !l.sure).length} lines are marked “check”: the statement didn't show a running balance for them, so money in / out was guessed. Flip any that are wrong.`} />
          )}
          <Table size="small" rowKey={(_l: ImportLine) => importing.indexOf(_l)} pagination={{ pageSize: 12 }} dataSource={importing}
            columns={[
              { title: 'Date', dataIndex: 'txn_date', width: 110 },
              { title: 'Description', dataIndex: 'description' },
              { title: 'Amount', key: 'a', align: 'right' as const, width: 140, render: (_: any, l: ImportLine) => <span style={{ color: l.amount > 0 ? '#73d13d' : '#ff7875' }}>{money(l.amount, currency)}</span> },
              {
                title: 'In / out', key: 'f', width: 190, render: (_: any, l: ImportLine) => (
                  <Space size={4}>
                    <Segmented size="small" value={l.amount > 0 ? 'in' : 'out'} options={[{ value: 'in', label: 'In' }, { value: 'out', label: 'Out' }]}
                      onChange={v => setImporting(ls => ls!.map(x => (x === l ? { ...x, amount: (v === 'in' ? 1 : -1) * Math.abs(x.amount), sure: true } : x)))} />
                    {!l.sure && <Tag color="gold">check</Tag>}
                  </Space>
                ),
              },
              { title: '', key: 'x', width: 40, render: (_: any, l: ImportLine) => <Button size="small" icon={<DeleteOutlined />} onClick={() => setImporting(ls => ls!.filter(x => x !== l))} /> },
            ]} />
        </Modal>
      )}
      {adding && <AddLine onClose={() => setAdding(false)} currency={currency}
        onAdd={async l => { await bankService.add(companyId, accountId!, [l]); setAdding(false); load(); }} />}
      {bankModal}
      {matching && <MatchModal data={data} txn={matching} payments={payments} usedPayments={new Set(allTxns.filter(x => x.payment_id).map(x => x.payment_id!))}
        onClose={() => setMatching(null)} onDone={() => { setMatching(null); load(); data.reload(); }} />}
    </div>
  );
}

function AddLine({ onClose, onAdd, currency }: { onClose: () => void; onAdd: (l: BankLine) => Promise<void>; currency: string }) {
  const [form] = Form.useForm();
  return (
    <Modal open title="Add a statement line" onCancel={onClose} onOk={async () => {
      const v = await form.validateFields();
      await onAdd({ txn_date: v.date.format('YYYY-MM-DD'), description: v.description || '', amount: v.direction === 'in' ? v.amount : -v.amount });
    }}>
      <Form form={form} layout="vertical" initialValues={{ date: dayjs(), direction: 'in' }}>
        <Form.Item name="direction"><Segmented options={[{ value: 'in', label: 'Money in' }, { value: 'out', label: 'Money out' }]} /></Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="date" label="Date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}><InputNumber min={0.01} precision={2} prefix={currency} style={{ width: '100%' }} /></Form.Item>
        </div>
        <Form.Item name="description" label="Description"><Input /></Form.Item>
      </Form>
    </Modal>
  );
}

/** Decide what a statement line is: a payment already recorded, an invoice / bill being paid, or money for an account. */
function MatchModal({ data, txn, payments, usedPayments, onClose, onDone }: {
  data: FinanceData; txn: BankTxn; payments: Payment[]; usedPayments: Set<number>; onClose: () => void; onDone: () => void;
}) {
  const inbound = txn.amount > 0;
  const amt = Math.abs(Number(txn.amount));
  const [busy, setBusy] = useState(false);
  const [docId, setDocId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [memo, setMemo] = useState(txn.description || '');
  const near = (d: string) => Math.abs(dayjs(d).diff(dayjs(txn.txn_date), 'day')) <= 14;

  const suggestions = payments.filter(p => p.direction === (inbound ? 'in' : 'out') && !usedPayments.has(p.id)
    && Math.abs(Number(p.amount) - amt) < 0.005 && near(p.payment_date) && (!p.account_id || p.account_id === txn.account_id));
  const openDocs: FinDocument[] = data.docs.filter(d => (inbound ? d.doc_type === 'invoice' : ['bill', 'expense'].includes(d.doc_type))
    && !['draft', 'void', 'paid'].includes(d.status) && balanceDue(d) > 0)
    .sort((a, b) => Number(Math.abs(balanceDue(a) - amt) > 0.005) - Number(Math.abs(balanceDue(b) - amt) > 0.005));
  const contact = (id: number | null) => data.contacts.find(c => c.id === id)?.name || '';
  const bookable = data.accounts.filter((a: Account) => !a.archived && a.id !== txn.account_id);

  const run = async (f: () => Promise<void>) => { setBusy(true); try { await f(); message.success('Matched'); onDone(); } catch (e: any) { message.error(e.message); } setBusy(false); };
  const payDoc = () => run(async () => {
    const d = data.docs.find(x => x.id === docId)!;
    const portion = Math.min(amt, balanceDue(d));
    const pid = await paymentService.record(data.companyId, {
      direction: inbound ? 'in' : 'out', amount: amt, contact_id: d.contact_id, payment_date: txn.txn_date,
      method: 'Bank transfer', reference: txn.description || undefined, account_id: txn.account_id,
    }, [{ document_id: d.id, amount: portion }]);
    await bankService.matchPayment(txn.id, pid);
  });

  return (
    <Modal open width={780} onCancel={onClose} footer={null}
      title={<span>{inbound ? 'Money in' : 'Money out'} {money(amt, data.currency)} on {txn.txn_date}<div style={{ fontSize: 12, fontWeight: 400, color: '#999' }}>{txn.description}</div></span>}>
      <Tabs defaultActiveKey={suggestions.length ? 'existing' : openDocs.length ? 'doc' : 'account'} items={[
        {
          key: 'doc', label: inbound ? 'Payment for an invoice' : 'Payment of a bill / expense',
          children: (
            <div>
              {openDocs.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={inbound ? 'No unpaid invoices' : 'No unpaid bills or expenses'} /> : (
                <Table rowKey="id" size="small" pagination={{ pageSize: 8, hideOnSinglePage: true }} dataSource={openDocs}
                  rowSelection={{ type: 'radio', selectedRowKeys: docId ? [docId] : [], onChange: k => setDocId(Number(k[0])) }}
                  columns={[
                    { title: 'Number', dataIndex: 'number' }, { title: 'Date', dataIndex: 'issue_date' },
                    { title: inbound ? 'Customer' : 'Supplier', key: 'c', render: (_, d) => contact(d.contact_id) },
                    { title: 'Still owed', key: 'b', align: 'right' as const, render: (_, d) => <span style={{ fontWeight: Math.abs(balanceDue(d) - amt) < 0.005 ? 700 : 400 }}>{money(balanceDue(d), data.currency)}</span> },
                  ]} />
              )}
              <Button type="primary" disabled={!docId} loading={busy} onClick={payDoc} style={{ marginTop: 8 }}>Record payment and match</Button>
            </div>
          ),
        },
        {
          key: 'existing', label: `Payment already recorded (${suggestions.length})`,
          children: suggestions.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No recorded payment of this amount within two weeks" /> : (
            <Table rowKey="id" size="small" pagination={false} dataSource={suggestions}
              columns={[
                { title: 'Date', dataIndex: 'payment_date' }, { title: 'Number', dataIndex: 'number' },
                { title: inbound ? 'From' : 'To', key: 'c', render: (_, p) => contact(p.contact_id) },
                { title: 'Amount', key: 'a', align: 'right' as const, render: (_, p) => money(p.amount, data.currency) },
                { title: '', key: 'x', render: (_, p) => <Button size="small" type="primary" loading={busy} onClick={() => run(() => bankService.matchPayment(txn.id, p.id))}>Match</Button> },
              ]} />
          ),
        },
        {
          key: 'account', label: 'Something else',
          children: (
            <div>
              <Text type="secondary">For money that isn't an invoice or bill — bank charges, interest, CPF payment, owner's capital, a loan…</Text>
              <Form layout="vertical" style={{ marginTop: 8 }}>
                <Form.Item label="Account">
                  <Select showSearch optionFilterProp="label" value={accountId ?? undefined} onChange={setAccountId}
                    options={bookable.map(a => ({ value: a.id, label: `${a.code} ${a.name}` }))} placeholder={inbound ? 'e.g. 4100 Other income' : 'e.g. 6900 Bank charges'} />
                </Form.Item>
                <Form.Item label="Details"><Input value={memo} onChange={e => setMemo(e.target.value)} /></Form.Item>
              </Form>
              <Button type="primary" disabled={!accountId} loading={busy} onClick={() => run(() => bankService.categorise(data.companyId, txn, accountId!, memo))}>Book and match</Button>
            </div>
          ),
        },
      ]} />
    </Modal>
  );
}

/** Add or edit a bank account (an asset account of kind "bank" in the chart of accounts). */
function BankAccountModal({ data, account, onClose, onSaved }: { data: FinanceData; account: Partial<Account>; onClose: () => void; onSaved: (id: number) => void }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const nextCode = () => {
    const used = new Set(data.accounts.map(a => a.code));
    for (let c = 1001; c < 1100; c++) if (!used.has(String(c))) return String(c);
    return `1${Date.now() % 1000}`;
  };
  const submit = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      const id = await accountService.save(data.companyId, {
        ...account, code: account.code || nextCode(), name: v.name, type: 'asset', subtype: account.subtype || 'bank',
        bank_name: v.bank_name, bank_account_no: v.bank_account_no, opening_balance: v.opening_balance || 0,
        opening_date: v.opening_date ? v.opening_date.format('YYYY-MM-DD') : null, description: account.description,
      });
      message.success('Saved'); onSaved(id);
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };
  return (
    <Modal open onCancel={onClose} onOk={submit} confirmLoading={saving} title={account.id ? `Edit ${account.name}` : 'New bank account'}>
      <Form form={form} layout="vertical" initialValues={{ ...account, opening_date: account.opening_date ? dayjs(account.opening_date) : null }}>
        <Form.Item name="name" label="Name in Quantivra" rules={[{ required: true }]}><Input placeholder="e.g. DBS current account" /></Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="bank_name" label="Bank"><Input placeholder="e.g. DBS" /></Form.Item>
          <Form.Item name="bank_account_no" label="Account no."><Input /></Form.Item>
          <Form.Item name="opening_balance" label="Opening balance"
            tooltip="The balance on the day you started recording in Quantivra, e.g. the day before your first payroll or invoice here.">
            <InputNumber precision={2} style={{ width: '100%' }} prefix={data.currency} />
          </Form.Item>
          <Form.Item name="opening_date" label="As at"><DatePicker style={{ width: '100%' }} /></Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
