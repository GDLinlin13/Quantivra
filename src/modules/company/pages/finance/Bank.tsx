import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Select, Space, Button, Table, Tag, Card, Statistic, Upload, Modal, Form, DatePicker, Input, InputNumber, Segmented, message, Empty,
  Typography, Popconfirm, Tabs, Alert, Checkbox,
} from 'antd';
import { UploadOutlined, PlusOutlined, LinkOutlined, DisconnectOutlined, DeleteOutlined, EditOutlined , PaperClipOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { bankService, paymentService, loadLedgerInput, accountService, pdfLayoutService, companyFileService, type BankTxn, type Payment } from '../../../../services/finance';
import { statementPeriod } from '../../../../data/documents';
import { buildLedger, balances, payrollDue, systemAccount, type PayrollDue } from '../../../../data/ledger';
import { balanceDue, schemeLabel, type Account, type FinDocument } from '../../../../data/finance';
import { parseBankCsv, type BankLine } from '../../../../data/bankCsv';
import { parseStatementText, pdfToRows, rowsToLines, parseWithLayout, type PdfRow, type PdfLayout } from '../../../../data/bankPdf';
import { TeachPdf } from './TeachPdf';
import { MatchDetails, matchLabel, type MatchLookup } from './MatchDetails';
import { saveBankStatement } from './saveStatement';

type ImportLine = BankLine & { sure: boolean };
import { money } from '../../../../data/documentLayouts';
import { currencyOptions } from '../../../../utils/currencies';
import type { FinanceData } from './DocList';

const { Text } = Typography;

/** Bank: statement lines (typed in or imported from CSV), matched to payments, invoices, bills or accounts. */
export function Bank({ data }: { data: FinanceData }) {
  const { companyId, currency, accounts } = data;
  const banks = accounts.filter(a => !a.archived && (a.subtype === 'bank' || a.subtype === 'cash'));
  const [accountId, setAccountId] = useState<number | null>(() => banks.find(b => b.subtype === 'bank')?.id ?? banks[0]?.id ?? null);
  const [txns, setTxns] = useState<BankTxn[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [look, setLook] = useState<MatchLookup>({ journals: [], payments: [], allocations: [], docs: [] });
  const [details, setDetails] = useState<BankTxn | null>(null);
  // journals that have supporting documents attached (shown with a paperclip)
  const [withFiles, setWithFiles] = useState<Set<number>>(new Set());
  const loadWithFiles = useCallback(() => {
    companyFileService.list(companyId).then(fs => setWithFiles(new Set(fs.filter(f => f.journal_id).map(f => f.journal_id!)))).catch(() => null);
  }, [companyId]);
  useEffect(() => { loadWithFiles(); }, [loadWithFiles]);
  const [allTxns, setAllTxns] = useState<BankTxn[]>([]);
  const [booksBalance, setBooksBalance] = useState(0);
  const [dues, setDues] = useState<PayrollDue[]>([]);
  const [used, setUsed] = useState(true); // has this account any activity (ledger lines or statement lines)?
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [importing, setImporting] = useState<ImportLine[] | null>(null);
  // the statement file itself is kept in Documents → Bank statements, filed under a month
  const [stmtFile, setStmtFile] = useState<File | null>(null);
  const [stmtMonth, setStmtMonth] = useState<dayjs.Dayjs | null>(null);
  const [keepStmt, setKeepStmt] = useState(true);
  const [bankEdit, setBankEdit] = useState<Partial<Account> | null>(null);
  const [pdfRows, setPdfRows] = useState<PdfRow[] | null>(null);
  const [teaching, setTeaching] = useState(false);
  const [layouts, setLayouts] = useState<Record<string, PdfLayout>>({});
  useEffect(() => { pdfLayoutService.get(companyId).then(setLayouts).catch(() => setLayouts({})); }, [companyId]);
  const [adding, setAdding] = useState(false);
  const [matching, setMatching] = useState<BankTxn | null>(null);
  const account = accounts.find(a => a.id === accountId);
  // a bank account can be in another currency; the books stay in the company's currency
  const accCur = account?.currency || currency;
  const foreign = accCur !== currency;

  const load = useCallback(async () => {
    if (!accountId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [t, all, pin, pout, input] = await Promise.all([
        bankService.list(companyId, accountId), bankService.listAll(companyId),
        paymentService.list(companyId, 'in'), paymentService.list(companyId, 'out'), loadLedgerInput(companyId),
      ]);
      setTxns(t); setAllTxns(all); setPayments([...pin, ...pout]);
      setLook({ journals: input.journals, payments: [...pin, ...pout], allocations: input.allocations as any, docs: input.docs as any });
      const b = balances(input.accounts, buildLedger(input as any)).find(x => x.account.id === accountId);
      setBooksBalance(b?.balance || 0);
      const ledger = buildLedger(input as any);
      setDues(payrollDue(input as any, ledger).filter(d => d.netDue > 0 || d.statDue > 0));
      setUsed(t.length > 0 || ledger.some(e => e.lines.some(l => l.account_id === accountId)));
    } catch (e: any) { message.error(e.message); }
    setLoading(false);
  }, [companyId, accountId]);
  useEffect(() => { load(); }, [load, data.docs]);

  const statementBalance = useMemo(() => Math.round(((Number(foreign ? account?.opening_foreign : account?.opening_balance) || 0) + txns.reduce((s, t) => s + Number(t.amount), 0)) * 100) / 100, [txns, account, foreign]);
  // Recorded in Quantivra for this bank but not on any statement line yet (e.g. a transfer booked from
  // another bank, a payment recorded by hand): shown so the statement line can be matched to it.
  const expected = useMemo(() => accountId ? recordedNotOnStatement(accountId, look, allTxns, data) : [], [accountId, look, allTxns, data]);
  const shown: BankTxn[] = [
    ...(filter === 'all' || filter === 'expected' ? expected : []),
    ...txns.filter(t => filter === 'all' || t.status === filter),
  ].sort((a, b) => b.txn_date.localeCompare(a.txn_date));
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
    setStmtFile(file);
    let r: { lines: ImportLine[]; error?: string };
    setPdfRows(null);
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      const hide = message.loading('Reading the PDF…', 0);
      try {
        const rows = await pdfToRows(file);
        hide();
        if (!rows.length) { message.error('No text in that PDF. Scanned (photo) statements can’t be read — download the statement from internet banking as PDF or CSV.'); return false; }
        setPdfRows(rows);
        const taught = layouts[String(accountId)];
        const parsed = taught ? parseWithLayout(rows, taught) : parseStatementText(rowsToLines(rows));
        if (!parsed.lines.length) { setTeaching(true); return false; }
        r = { lines: parsed.lines };
      } catch (e: any) { hide(); r = { lines: [], error: `Couldn’t read the PDF: ${e.message}` }; }
    } else {
      const c = parseBankCsv(await file.text());
      r = { lines: c.lines.map(l => ({ ...l, sure: true })), error: c.error };
    }
    if (r.error) { message.error(r.error); return false; }
    showImport(r.lines);
    return false;
  };
  // leave out lines already imported (same date, amount and description)
  function showImport(lines: ImportLine[]) {
    const seen = new Set(txns.map(t => `${t.txn_date}|${Number(t.amount).toFixed(2)}|${t.description || ''}`));
    const fresh = lines.filter(l => !seen.has(`${l.txn_date}|${l.amount.toFixed(2)}|${l.description}`));
    if (!fresh.length) { message.info('Nothing new in that file'); setImporting(null); return; }
    setStmtMonth(dayjs(`${statementPeriod(fresh.map(l => l.txn_date)) || dayjs().format('YYYY-MM')}-01`));
    setImporting(fresh);
  }

  // a matched line shows what it was for (click for the details and the invoices / bills it paid);
  // an unmatched one, the bank's own text
  const describe = (t: BankTxn) => {
    const l = matchLabel(t, data, look);
    return l ? <a onClick={() => setDetails(t)} title={t.description || ''}>{l.title}{t.journal_id && withFiles.has(t.journal_id) && <PaperClipOutlined style={{ marginLeft: 6 }} />}</a> : t.description;
  };

  return (
    <div>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select style={{ width: 280 }} value={accountId ?? undefined} onChange={setAccountId}
          options={banks.map(b => ({ value: b.id, label: `${b.name}${b.bank_account_no ? ` (${b.bank_account_no})` : ''}${b.currency && b.currency !== currency ? ` · ${b.currency}` : ''}` }))} />
        <Button icon={<EditOutlined />} onClick={() => account && setBankEdit(account)} title="Edit this bank account" />
        {account && !used && !Number(account.opening_balance) && !Number(account.opening_foreign) && banks.length > 1 && (
          <Popconfirm title={`Delete ${account.name}?`} description="It has no activity, so nothing else changes."
            onConfirm={async () => {
              try {
                await accountService.remove(account.id);
                message.success('Bank account deleted');
                setAccountId(banks.find(b => b.id !== account.id)?.id ?? null);
                data.reload();
              } catch (e: any) { message.error(e.message); }
            }}>
            <Button danger icon={<DeleteOutlined />} title="Delete this bank account" />
          </Popconfirm>
        )}
        <Button icon={<PlusOutlined />} onClick={() => setBankEdit({})}>Bank account</Button>
        <Upload accept=".csv,text/csv,.pdf,application/pdf" showUploadList={false} beforeUpload={onFile}><Button icon={<UploadOutlined />}>Import statement (PDF or CSV)</Button></Upload>
        <Button icon={<PlusOutlined />} onClick={() => setAdding(true)}>Add a line</Button>
      </Space>
      <Space size={16} wrap style={{ marginBottom: 12 }}>
        <Card size="small" style={{ minWidth: 200 }}><Statistic title="Balance per statement" value={money(statementBalance, accCur)} /></Card>
        <Card size="small" style={{ minWidth: 200 }}><Statistic title={foreign ? `System Balance (in ${currency})` : 'System Balance'} value={money(booksBalance, currency)} /></Card>
        <Card size="small" style={{ minWidth: 200 }}><Statistic title="Lines to match" value={unmatched} styles={{ content: { color: unmatched ? '#faad14' : undefined } }} /></Card>
      </Space>
      {booksBalance < 0 && !Number(account?.opening_balance) && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          title="The System Balance is negative because this account has no opening balance yet."
          description={<>Payroll net pay, payments and other money out are taken from this account, but the money that was in it when you started isn't recorded. Click <EditOutlined /> next to the account and enter the opening balance and its date (e.g. your bank balance on the day before your first payroll in Quantivra).</>} />
      )}
      {!foreign && Math.abs(statementBalance - booksBalance) >= 0.01 && unmatched === 0 && txns.length > 0 && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          title={`The statement and the System Balance differ by ${money(Math.abs(statementBalance - booksBalance), currency)}. Check for payments recorded in Quantivra that aren't on the statement yet, or the account's opening balance.`} />
      )}
      <Segmented value={filter} onChange={v => setFilter(String(v))} style={{ marginBottom: 12 }}
        options={[{ value: 'all', label: 'All' }, { value: 'unmatched', label: `To match (${unmatched})` }, { value: 'matched', label: 'Matched' },
          ...(expected.length ? [{ value: 'expected', label: `Not on a statement yet (${expected.length})` }] : []), { value: 'ignored', label: 'Ignored' }]} />
      <Table rowKey="id" size="small" loading={loading} dataSource={shown} pagination={{ pageSize: 100, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={filter === 'unmatched' ? 'All matched' : 'No lines'} /> }}
        columns={[
          { title: 'Date', dataIndex: 'txn_date', width: 110 },
          { title: 'Description', key: 'd', render: (_, t) => describe(t) },
          // as on the bank statement: debit = money out, credit = money in
          { title: 'Debit', key: 'out', align: 'right' as const, width: 140, render: (_, t) => t.amount < 0 ? <span style={{ color: '#ff7875' }}>{money(-t.amount, accCur)}{foreign && t.base_amount != null ? <div style={{ fontSize: 11, color: '#999' }}>= {money(Math.abs(t.base_amount), currency)}</div> : null}</span> : '' },
          { title: 'Credit', key: 'in', align: 'right' as const, width: 140, render: (_, t) => t.amount > 0 ? <span style={{ color: '#73d13d' }}>{money(t.amount, accCur)}{foreign && t.base_amount != null ? <div style={{ fontSize: 11, color: '#999' }}>= {money(Math.abs(t.base_amount), currency)}</div> : null}</span> : '' },
          { title: 'Matched to', key: 'm', width: 220, render: (_, t) => t.status === 'ignored' ? <Tag>ignored</Tag> : matchLabel(t, data, look)?.accounts || '' },
          {
            title: '', key: 'a', width: 170, render: (_, t) => t.status === ('expected' as any) ? <Tag color="gold">Not on a statement yet</Tag> : (
              <Space size={4}>
                {t.status === 'unmatched'
                  ? <Button size="small" type="primary" icon={<LinkOutlined />} onClick={() => setMatching(t)}>Match</Button>
                  : (
                    <Popconfirm title="Undo this match?"
                      onConfirm={async () => { try { await bankService.unmatch(t, allTxns); load(); data.reload(); } catch (e: any) { message.error(e.message); } }}>
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
          onOk={async () => {
            try {
              await bankService.add(companyId, accountId!, importing.map(({ sure: _s, ...l }) => l));
              if (keepStmt && stmtFile) {
                try { await saveBankStatement(companyId, stmtFile, accountId!, (stmtMonth || dayjs()).format('YYYY-MM')); }
                catch (e: any) { message.warning(`Imported, but the statement file wasn't saved in Documents: ${e.message}`); }
              }
              message.success('Imported'); setImporting(null); load();
            } catch (e: any) { message.error(e.message); }
          }}>
          {stmtFile && (
            <Space style={{ marginBottom: 8 }} wrap>
              <Checkbox checked={keepStmt} onChange={e => setKeepStmt(e.target.checked)}>Save this statement in Documents as</Checkbox>
              <DatePicker picker="month" format="MMMM YYYY" allowClear={false} disabled={!keepStmt} value={stmtMonth} onChange={d => d && setStmtMonth(d)} />
            </Space>
          )}
          {pdfRows && (
            <Space style={{ marginBottom: 8 }} wrap>
              <Text type="secondary">{layouts[String(accountId)] ? 'Read the way you taught Quantivra for this bank.' : 'Read automatically.'} Not right?</Text>
              <Button size="small" onClick={() => setTeaching(true)}>Teach Quantivra how to read this PDF</Button>
              {layouts[String(accountId)] && (
                <Button size="small" type="link" onClick={async () => {
                  await pdfLayoutService.save(companyId, accountId!, null);
                  setLayouts(l => { const n = { ...l }; delete n[String(accountId)]; return n; });
                  showImport(parseStatementText(rowsToLines(pdfRows)).lines);
                }}>Forget what was taught</Button>
              )}
            </Space>
          )}
          {importing.some(l => !l.sure) && (
            <Alert type="warning" showIcon style={{ marginBottom: 8 }}
              title={`${importing.filter(l => !l.sure).length} lines are marked “check”: the statement didn't show a running balance for them, so money in / out was guessed. Flip any that are wrong.`} />
          )}
          <Table size="small" rowKey={(_l: ImportLine) => importing.indexOf(_l)} pagination={{ pageSize: 12 }} dataSource={importing}
            columns={[
              { title: 'Date', dataIndex: 'txn_date', width: 110 },
              { title: 'Description', dataIndex: 'description' },
              { title: 'Amount', key: 'a', align: 'right' as const, width: 140, render: (_: any, l: ImportLine) => <span style={{ color: l.amount > 0 ? '#73d13d' : '#ff7875' }}>{money(l.amount, accCur)}</span> },
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
      {adding && <AddLine onClose={() => setAdding(false)} currency={accCur}
        onAdd={async l => { await bankService.add(companyId, accountId!, [l]); setAdding(false); load(); }} />}
      {bankModal}
      {teaching && pdfRows && (
        <TeachPdf rows={pdfRows} bankName={account?.name || 'this bank'} onClose={() => setTeaching(false)}
          onDone={async (layout, lines) => {
            try { await pdfLayoutService.save(companyId, accountId!, layout); setLayouts(l => ({ ...l, [String(accountId)]: layout })); } catch (e: any) { message.error(e.message); }
            setTeaching(false);
            message.success('Got it — statements for this bank will be read this way from now on');
            showImport(lines);
          }} />
      )}
      {details && <MatchDetails data={data} txn={details} look={look} accCur={accCur} onClose={() => setDetails(null)} onFilesChanged={loadWithFiles} />}
      {matching && <MatchModal data={data} txn={matching} accCur={accCur} dues={dues} payments={payments} usedPayments={new Set(allTxns.filter(x => x.payment_id).map(x => x.payment_id!))}
        recorded={expected}
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
function MatchModal({ data, txn, accCur, dues, payments, usedPayments, recorded, onClose, onDone }: {
  data: FinanceData; txn: BankTxn; accCur: string; dues: PayrollDue[]; payments: Payment[]; usedPayments: Set<number>;
  /** journals on this bank not on a statement yet (e.g. the other side of a transfer) */
  recorded: BankTxn[]; onClose: () => void; onDone: () => void;
}) {
  const inbound = txn.amount > 0;
  const foreign = accCur !== data.currency;
  const lineAmt = Math.abs(Number(txn.amount));                 // in the bank account's currency
  const [base, setBase] = useState<number | null>(null);        // the same in the company's currency
  const amt = foreign ? (base ?? 0) : lineAmt;                  // what goes into the books
  const ready = !foreign || (base != null && base > 0);
  const signedBase = foreign ? Math.sign(Number(txn.amount)) * amt : undefined;
  const fx = (n: number) => Math.round(n * 1e6) / 1e6;
  const [busy, setBusy] = useState(false);
  const [docId, setDocId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [memo, setMemo] = useState(txn.description || '');
  const near = (d: string) => Math.abs(dayjs(d).diff(dayjs(txn.txn_date), 'day')) <= 14;

  const suggestions = !ready ? [] : payments.filter(p => p.direction === (inbound ? 'in' : 'out') && !usedPayments.has(p.id)
    && Math.abs(Number(p.amount) - amt) < 0.005 && near(p.payment_date) && (!p.account_id || p.account_id === txn.account_id));
  const journalHits = !ready ? [] : recorded.filter(r => r.journal_id && Math.sign(r.amount) === Math.sign(Number(txn.amount))
    && Math.abs(Math.abs(r.amount) - amt) < 0.005 && near(r.txn_date));
  const openDocs: FinDocument[] = data.docs.filter(d => (inbound ? d.doc_type === 'invoice' : ['bill', 'expense'].includes(d.doc_type))
    && !['draft', 'void', 'paid'].includes(d.status) && balanceDue(d) > 0)
    .sort((a, b) => Number(Math.abs(balanceDue(a) - amt) > 0.005) - Number(Math.abs(balanceDue(b) - amt) > 0.005));
  const contact = (id: number | null) => data.contacts.find(c => c.id === id)?.name || '';
  const bookable = data.accounts.filter((a: Account) => !a.archived && a.id !== txn.account_id);
  const salId = systemAccount(data.accounts, 'payroll_payable')?.id;
  // salaries / CPF of exactly this amount: open the Payroll tab first
  const payrollHit = !inbound && dues.some(d => Math.abs(d.netDue - lineAmt) < 0.005 || Math.abs(d.statDue - lineAmt) < 0.005);

  const run = async (f: () => Promise<void>) => { setBusy(true); try { await f(); message.success('Matched'); onDone(); } catch (e: any) { message.error(e.message); } setBusy(false); };
  const payDoc = () => run(async () => {
    const d = data.docs.find(x => x.id === docId)!;
    const portion = Math.min(amt, balanceDue(d));
    const pid = await paymentService.record(data.companyId, {
      direction: inbound ? 'in' : 'out', amount: amt, contact_id: d.contact_id, payment_date: txn.txn_date,
      method: 'Bank transfer', reference: txn.description || undefined, account_id: txn.account_id,
      ...(foreign ? { currency: accCur, foreign_amount: lineAmt } : {}),
    }, [{ document_id: d.id, amount: portion }]);
    await bankService.matchPayment(txn.id, pid, signedBase);
  });

  return (
    <Modal open width={780} onCancel={onClose} footer={null}
      title={<span>{inbound ? 'Money in' : 'Money out'} {money(lineAmt, accCur)} on {txn.txn_date}<div style={{ fontSize: 12, fontWeight: 400, color: '#999' }}>{txn.description}</div></span>}>
      {foreign && (
        <div style={{ marginBottom: 12, padding: 10, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}>
          <Text>In {data.currency}:</Text>{' '}
          <Space wrap>
            <InputNumber min={0} precision={6} style={{ width: 170 }} prefix={`1 ${accCur} =`} suffix={data.currency}
              value={base != null && lineAmt ? fx(base / lineAmt) : undefined}
              onChange={r => setBase(r ? Math.round(Number(r) * lineAmt * 100) / 100 : null)} />
            <Text type="secondary">or</Text>
            <InputNumber min={0} precision={2} style={{ width: 170 }} prefix={data.currency} value={base ?? undefined} onChange={v => setBase(v == null ? null : Number(v))} />
          </Space>
          {!ready && <div style={{ marginTop: 6 }}><Tag color="gold">Enter the exchange rate or the {data.currency} amount first</Tag></div>}
        </div>
      )}
      <Tabs defaultActiveKey={suggestions.length || journalHits.length ? 'existing' : payrollHit ? 'payroll' : openDocs.length ? 'doc' : 'account'} items={[
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
              <Button type="primary" disabled={!docId || !ready} loading={busy} onClick={payDoc} style={{ marginTop: 8 }}>Record payment and match</Button>
            </div>
          ),
        },
        {
          key: 'existing', label: `Already recorded (${suggestions.length + journalHits.length})`,
          children: suggestions.length + journalHits.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing of this amount recorded within two weeks" /> : (<>
            {journalHits.length > 0 && (
              <Table rowKey="id" size="small" pagination={false} dataSource={journalHits} style={{ marginBottom: suggestions.length ? 12 : 0 }}
                columns={[
                  { title: 'Date', dataIndex: 'txn_date' },
                  { title: 'Recorded as', key: 'd', render: (_, r) => r.description },
                  { title: 'Amount', key: 'a', align: 'right' as const, render: (_, r) => money(Math.abs(r.amount), data.currency) },
                  { title: '', key: 'x', render: (_, r) => <Button size="small" type="primary" loading={busy} onClick={() => run(() => bankService.matchJournal(txn.id, r.journal_id!, signedBase))}>Match</Button> },
                ]} />
            )}
            {suggestions.length > 0 && <Table rowKey="id" size="small" pagination={false} dataSource={suggestions}
              columns={[
                { title: 'Date', dataIndex: 'payment_date' }, { title: 'Number', dataIndex: 'number' },
                { title: inbound ? 'From' : 'To', key: 'c', render: (_, p) => contact(p.contact_id) },
                { title: 'Amount', key: 'a', align: 'right' as const, render: (_, p) => money(p.amount, data.currency) },
                { title: '', key: 'x', render: (_, p) => <Button size="small" type="primary" loading={busy} onClick={() => run(() => bankService.matchPayment(txn.id, p.id, signedBase))}>Match</Button> },
              ]} />}
          </>),
        },
        ...(!inbound ? [{
          key: 'payroll', label: `Payroll (${dues.length})`,
          children: dues.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No salaries or ${schemeLabel(data.company?.country)} waiting to be paid`} /> : (
            <Table rowKey={(d: PayrollDue) => d.run.id} size="small" pagination={false} dataSource={dues}
              columns={[
                { title: 'Payroll', key: 'p', render: (_: any, d: PayrollDue) => dayjs(`${d.run.period_year}-${String(d.run.period_month).padStart(2, '0')}-01`).format('MMM YYYY') },
                {
                  title: 'Salaries to pay', key: 'n', align: 'right' as const, render: (_: any, d: PayrollDue) => d.netDue > 0 ? (
                    <Button size="small" type={ready && Math.abs(d.netDue - amt) < 0.005 ? 'primary' : 'default'} disabled={!ready || !salId} loading={busy}
                      onClick={() => run(() => bankService.categorise(data.companyId, txn, salId!, `Salaries — ${dayjs(`${d.run.period_year}-${String(d.run.period_month).padStart(2, '0')}-01`).format('MMMM YYYY')}`, foreign ? amt : undefined))}>
                      {money(d.netDue, data.currency)}
                    </Button>) : <Tag color="green">Paid</Tag>,
                },
                {
                  title: `${schemeLabel(data.company?.country)} to pay`, key: 's', align: 'right' as const, render: (_: any, d: PayrollDue) => d.statDue > 0 ? (
                    <Button size="small" type={ready && Math.abs(d.statDue - amt) < 0.005 ? 'primary' : 'default'} disabled={!ready || !d.statParts.length} loading={busy}
                      onClick={() => run(() => bankService.categorise(data.companyId, txn, d.statParts, `${schemeLabel(data.company?.country)} — ${dayjs(`${d.run.period_year}-${String(d.run.period_month).padStart(2, '0')}-01`).format('MMMM YYYY')}`, foreign ? amt : undefined))}>
                      {money(d.statDue, data.currency)}
                    </Button>) : <Tag color="green">Paid</Tag>,
                },
              ]} />
          ),
        }] : []),
        {
          key: 'account', label: 'Something else',
          children: (
            <div>
              <Form layout="vertical">
                <Form.Item label="Account">
                  <Select showSearch optionFilterProp="label" value={accountId ?? undefined} onChange={setAccountId}
                    options={bookable.map(a => ({ value: a.id, label: `${a.code} ${a.name}` }))} />
                </Form.Item>
                <Form.Item label="Details"><Input value={memo} onChange={e => setMemo(e.target.value)} /></Form.Item>
              </Form>
              <Button type="primary" disabled={!accountId || !ready} loading={busy} onClick={() => run(() => bankService.categorise(data.companyId, txn, accountId!, memo, foreign ? amt : undefined))}>Book and match</Button>
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
  const cur = Form.useWatch('currency', form) || data.currency;
  const foreign = cur !== data.currency;
  const nextCode = () => {
    const used = new Set(data.accounts.map(a => a.code));
    for (let c = 1000; c < 1100; c++) if (!used.has(String(c))) return String(c);
    return `1${Date.now() % 1000}`;
  };
  const submit = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      const id = await accountService.save(data.companyId, {
        ...account, code: account.code || nextCode(), name: v.name, type: 'asset', subtype: account.subtype || 'bank',
        bank_name: v.bank_name, bank_account_no: v.bank_account_no, opening_balance: v.opening_balance || 0,
        currency: v.currency && v.currency !== data.currency ? v.currency : null, opening_foreign: v.opening_foreign ?? null,
        opening_date: v.opening_date ? v.opening_date.format('YYYY-MM-DD') : null, description: account.description,
      });
      message.success('Saved'); onSaved(id);
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };
  return (
    <Modal open onCancel={onClose} onOk={submit} confirmLoading={saving} title={account.id ? `Edit ${account.name}` : 'New bank account'}>
      <Form form={form} layout="vertical" initialValues={{ ...account, currency: account.currency || data.currency, opening_date: account.opening_date ? dayjs(account.opening_date) : null }}>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="bank_name" label="Bank"><Input /></Form.Item>
          <Form.Item name="bank_account_no" label="Account no."><Input /></Form.Item>
          <Form.Item name="currency" label="Currency" style={{ gridColumn: '1 / -1' }}>
            <Select showSearch optionFilterProp="label" options={currencyOptions()} />
          </Form.Item>
          {foreign && (
            <Form.Item name="opening_foreign" label={`Opening balance (${cur})`}>
              <InputNumber precision={2} style={{ width: '100%' }} prefix={cur} />
            </Form.Item>
          )}
          <Form.Item name="opening_balance" label={foreign ? `Opening balance in ${data.currency}` : 'Opening balance'}>
            <InputNumber precision={2} style={{ width: '100%' }} prefix={data.currency} />
          </Form.Item>
          <Form.Item name="opening_date" label="As at"><DatePicker style={{ width: '100%' }} /></Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

/**
 * Entries in the books for this bank account that no statement line is matched to yet: journals (a transfer
 * from another bank, a payment booked in Accounting…) and payments recorded against this bank. Shown as
 * pseudo statement lines (status 'expected', negative ids) so the real line can be matched to them.
 */
function recordedNotOnStatement(accountId: number, look: MatchLookup, allTxns: BankTxn[], data: FinanceData): BankTxn[] {
  const usedJ = new Set(allTxns.filter(t => t.account_id === accountId && t.journal_id).map(t => t.journal_id));
  const usedP = new Set(allTxns.filter(t => t.payment_id).map(t => t.payment_id));
  const out: BankTxn[] = [];
  for (const j of look.journals) {
    if (usedJ.has(j.id)) continue;
    const amount = Math.round(j.lines.filter(l => l.account_id === accountId).reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0) * 100) / 100;
    if (!amount) continue;
    out.push({ id: -j.id, company_id: data.companyId, account_id: accountId, txn_date: j.journal_date, description: j.memo || j.number || 'Journal',
      amount, payment_id: null, journal_id: j.id, status: 'expected' as any });
  }
  for (const p of look.payments) {
    if (p.account_id !== accountId || usedP.has(p.id)) continue;
    out.push({ id: -1e9 - p.id, company_id: data.companyId, account_id: accountId, txn_date: p.payment_date,
      description: [p.number, data.contacts.find(c => c.id === p.contact_id)?.name].filter(Boolean).join(' · ') || 'Payment',
      amount: (p.direction === 'in' ? 1 : -1) * Number(p.amount), payment_id: p.id, journal_id: null, status: 'expected' as any });
  }
  return out;
}
