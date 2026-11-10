import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Select, Space, Button, Table, Tag, Card, Statistic, Upload, Modal, Form, DatePicker, Input, InputNumber, Segmented, message, Empty,
  Typography, Popconfirm, Tabs, Alert, Checkbox,
} from 'antd';
import { UploadOutlined, PlusOutlined, LinkOutlined, DisconnectOutlined, DeleteOutlined, EditOutlined, PaperClipOutlined, StopOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { bankService, paymentService, marketRate, loadLedgerInput, accountService, pdfLayoutService, pictureStatementPref, companyFileService, type BankTxn, type Payment } from '../../../../services/finance';
import { statementPeriod, statementMonthFromText } from '../../../../data/documents';
import { rowsForCurrency, statementCurrencies, rateFromText } from '../../../../data/bankCurrency';
import { planImport, nothingNew } from '../../../../data/bankImport';
import { buildLedger, balances, payrollDue, systemAccount, type PayrollDue } from '../../../../data/ledger';
import { balanceDue, inBase, docRate, isForeignDoc, schemeLabel, type Account, type FinDocument } from '../../../../data/finance';
import { parseBankCsv, type BankLine } from '../../../../data/bankCsv';
import { parseStatementText, pdfToRows, rowsToLines, parseWithLayout, type PdfRow, type PdfLayout } from '../../../../data/bankPdf';
import { TeachPdf } from './TeachPdf';
import { MatchDetails, matchLabel, type MatchLookup } from './MatchDetails';
import { saveBankStatement } from './saveStatement';

type ImportLine = BankLine & { sure: boolean };
import { money } from '../../../../data/documentLayouts';
import { currencyOptions } from '../../../../utils/currencies';
import type { FinanceData } from './DocList';
import { AmountInput } from '../../../../components/AmountInput';
import { payrollService } from '../../../../services/payroll';

const { Text } = Typography;

/** Bank: statement lines (typed in or imported from CSV), matched to payments, invoices, bills or accounts. */
export function Bank({ data }: { data: FinanceData }) {
  const { companyId, currency, accounts } = data;
  // open accounts first; closed ones stay listed to look back at, but take nothing new
  const allBanks = accounts.filter(a => a.subtype === 'bank' || a.subtype === 'cash');
  const banks = allBanks.filter(a => !a.archived);
  const closedBanks = allBanks.filter(a => a.archived);
  const [accountId, setAccountId] = useState<number | null>(() => banks.find(b => b.subtype === 'bank')?.id ?? banks[0]?.id ?? closedBanks[0]?.id ?? null);
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
  // a statement with no transactions: the month it is saved under
  const [nothingMonth, setNothingMonth] = useState<dayjs.Dayjs | null>(null);
  const [layouts, setLayouts] = useState<Record<string, PdfLayout>>({});
  useEffect(() => { pdfLayoutService.get(companyId).then(setLayouts).catch(() => setLayouts({})); }, [companyId]);
  const [readPictures, setReadPictures] = useState(false);
  useEffect(() => { pictureStatementPref.get(companyId).then(setReadPictures).catch(() => null); }, [companyId]);
  const [adding, setAdding] = useState(false);
  const [amending, setAmending] = useState<BankTxn | null>(null);
  const [fxMatch, setFxMatch] = useState<BankTxn | null>(null);
  const [matching, setMatching] = useState<BankTxn | null>(null);
  const account = accounts.find(a => a.id === accountId);
  // a closed account: its history can be viewed, nothing new added or changed
  const closed = !!account?.archived;
  const bankLabel = (b: Account) => `${b.name}${b.bank_account_no ? ` (${b.bank_account_no})` : ''}${b.currency && b.currency !== currency ? ` · ${b.currency}` : ''}`;
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

  // opening balance plus the statement lines already matched (lines still to match, or ignored, don't count yet)
  // opening balance plus the lines that came from the bank's own statement (PDF / CSV); lines keyed in by hand don't count
  const statementBalance = useMemo(() => Math.round(((Number(foreign ? account?.opening_foreign : account?.opening_balance) || 0)
    + txns.filter(t => t.source === 'statement' && t.status !== 'ignored').reduce((s, t) => s + Number(t.amount), 0)) * 100) / 100, [txns, account, foreign]);
  // amounts without the currency (it's shown once, at the top)
  const num = (n: number) => Number(n).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const PURPLE = '#b37feb';
  // the exchange rate used last on this bank (company currency per unit), to start the next match with
  const lastRate = useMemo(() => {
    // newest line with a converted amount; a line of at least 1 unit gives a truer rate than a few cents
    const withRate = [...txns].filter(x => x.base_amount != null && Number(x.amount)).sort((a, b) => b.txn_date.localeCompare(a.txn_date) || b.id - a.id);
    const t = withRate.find(x => Math.abs(Number(x.amount)) >= 1) || withRate[0];
    return t ? Math.round(Math.abs(Number(t.base_amount) / Number(t.amount)) * 1e6) / 1e6 : null;
  }, [txns]);
  // for a bank in another currency: its own-currency balance from the opening balance and every matched line
  const foreignBooks = useMemo(() => Math.round(((Number(account?.opening_foreign) || 0)
    + txns.filter(t => t.status === 'matched').reduce((s, t) => s + Number(t.amount), 0)) * 100) / 100, [txns, account]);
  // Recorded in Quantivra for this bank but not on any statement line yet (e.g. a transfer booked from
  // another bank, a payment recorded by hand): shown so the statement line can be matched to it.
  const expected = useMemo(() => accountId ? recordedNotOnStatement(accountId, look, allTxns, data) : [], [accountId, look, allTxns, data]);
  // oldest first: by date, then the order lines came in (the running balance follows this; the list shows it newest first)
  const chrono = (a: BankTxn, b: BankTxn) => a.txn_date.localeCompare(b.txn_date) || Math.abs(a.id) - Math.abs(b.id);
  const shown: BankTxn[] = [
    ...(filter === 'all' || filter === 'unmatched' ? expected : []),
    ...txns.filter(t => filter === 'all' || t.status === filter),
  ].sort((a, b) => chrono(b, a));
  const unmatched = txns.filter(t => t.status === 'unmatched').length + expected.length;
  // running balance after each line, oldest first (ignored lines don't count)
  const running = useMemo(() => {
    const m = new Map<number, number>();
    let bal = Number(foreign ? account?.opening_foreign : account?.opening_balance) || 0;
    [...txns.filter(t => t.status !== 'ignored'), ...(foreign ? [] : expected)]
      .sort(chrono)
      .forEach(t => { bal = Math.round((bal + Number(t.amount)) * 100) / 100; m.set(t.id, bal); });
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txns, expected, account, foreign]);

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

  // the way this bank was taught, else read automatically; Teach only when neither finds anything
  const readRows = (rows: PdfRow[]) => {
    let taught = layouts[String(accountId)];
    if (taught) {
      // taught on a picture before positions were put on an A4-wide page
      const widest = Math.max(...rows.flat().map(p => p.x + (p.w || 0)));
      if (Math.max(...taught.columns.map(c => c.x)) > 700 && widest <= 700) taught = { columns: taught.columns.map(c => ({ ...c, x: c.x / 2.5 })) };
      const byLayout = parseWithLayout(rows, taught);
      if (byLayout.lines.length) return byLayout;
    }
    return parseStatementText(rowsToLines(rows));
  };

  // picture statements (scans, images, "Print to PDF"): read with OCR, then the same steps as a PDF
  const readPicture = async (file: File) => {
    const hide = message.loading('Reading the picture… (the first time also downloads the reader)', 0);
    try {
      const { ocrToRows } = await import('../../../../data/bankOcr');
      // a statement covering several currencies: only this account's currency
      const rows = rowsForCurrency(await ocrToRows(file), accCur);
      hide();
      if (!rows.length) { message.error('No text could be read from that picture'); return; }
      setPdfRows(rows);
      const parsed = readRows(rows);
      if (!parsed.lines.length) { setTeaching(true); return; }
      // OCR can misread: every line is marked to check
      showImport(parsed.lines.map(l => ({ ...l, sure: false })));
    } catch (e: any) { hide(); message.error(`Couldn’t read the picture: ${e.message}`); }
  };
  const onFile = async (file: File) => {
    setStmtFile(file);
    let r: { lines: ImportLine[]; error?: string };
    setPdfRows(null);
    if (/^image\//.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name)) { readPicture(file); return false; }
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      const hide = message.loading('Reading the PDF…', 0);
      try {
        const raw = await pdfToRows(file);
        hide();
        // a statement covering several currencies (one account, HKD / USD / CNY parts): only this account's currency
        const rows = raw.length ? rowsForCurrency(raw, accCur) : raw;
        if (raw.length && !rows.length) { message.info(`No ${accCur} part in that statement`); return false; }
        if (!rows.length) {
          // a picture of a statement (scan, or "Print to PDF"): offer to read it with OCR
          if (readPictures) { readPicture(file); return false; }
          let dontAsk = false;
          Modal.confirm({
            title: 'This statement is a picture', okText: 'Read it', cancelText: 'Cancel',
            content: <>
              <div>Quantivra can read the text from the picture. It takes a minute, and you check every line before importing.</div>
              <Checkbox style={{ marginTop: 12 }} onChange={e => { dontAsk = e.target.checked; }}>Don't ask again — always read picture statements</Checkbox>
            </>,
            onOk: () => {
              if (dontAsk) { setReadPictures(true); pictureStatementPref.set(companyId, true).catch(e => message.error(e.message)); }
              readPicture(file);
            },
          });
          return false;
        }
        setPdfRows(rows);
        const parsed = readRows(rows);
        if (!parsed.lines.length) {
          // a combined statement whose part for this currency has no transactions: just file it for its month
          if (statementCurrencies(raw).length > 1) {
            const m = statementMonthFromText(raw.slice(0, 40).map(r => r.map(p => p.s).join(' ')).join('\n'));
            setNothingMonth(m ? dayjs(`${m}-01`) : dayjs().subtract(1, 'month').startOf('month'));
            return false;
          }
          setTeaching(true); return false;
        }
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
  // the whole statement is kept, in its order: lines keyed in by hand are taken over (with their match)
  function showImport(lines: ImportLine[]) {
    if (!lines.length || nothingNew(planImport(lines, txns, foreign ? [] : expected))) { message.info(lines.length ? `Nothing new in that file: the ${lines.length} line${lines.length === 1 ? '' : 's'} it holds ${lines.length === 1 ? 'is' : 'are'} already in this account` : 'Nothing new in that file'); setImporting(null); return; }
    setStmtMonth(dayjs(`${statementPeriod(lines.map(l => l.txn_date)) || dayjs().format('YYYY-MM')}-01`));
    setImporting(lines);
  }
  const plan = importing ? planImport(importing, txns, foreign ? [] : expected) : [];

  // a matched line shows what it was for (click for the details and the invoices / bills it paid);
  // an unmatched one, the bank's own text
  // a payment's number, and the bills / invoices it paid ("BILL-2025-0004"), for the undo / delete questions
  const paidLabel = (pid: number) => look.payments.find(p => p.id === pid)?.number || 'the payment';
  const paidDocsText = (pid: number) => look.allocations.filter(a => a.payment_id === pid)
    .map(a => look.docs.find(d => d.id === a.document_id)?.number).filter(Boolean).join(', ');
  const describe = (t: BankTxn) => {
    const l = matchLabel(t, data, look);
    return l ? <a onClick={() => setDetails(t)} title={t.description || ''}>{l.title}{t.journal_id && withFiles.has(t.journal_id) && <PaperClipOutlined style={{ marginLeft: 6 }} />}</a> : t.description;
  };

  return (
    <div>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select style={{ width: 280 }} value={accountId ?? undefined} onChange={setAccountId}
          options={[
            ...banks.map(b => ({ value: b.id, label: bankLabel(b) })),
            ...(closedBanks.length ? [{ label: 'Closed', options: closedBanks.map(b => ({ value: b.id, label: `${bankLabel(b)} · closed` })) }] : []),
          ] as any} />
        {!closed && <Button icon={<EditOutlined />} onClick={() => account && setBankEdit(account)} title="Edit this bank account" />}
        {account && !closed && used && (
          <Popconfirm title={`Close ${account.name}?`} okText="Close account"
            description={<div style={{ maxWidth: 320 }}>Its lines and history stay and can still be viewed; no new lines, imports or matches.
              {Math.abs(statementBalance) > 0.004 && <div style={{ marginTop: 6, color: '#faad14' }}>The balance per statement is {num(statementBalance)}, not 0.</div>}</div>}
            onConfirm={async () => { try { await accountService.setClosed(account.id, true); message.success(`${account.name} closed`); data.reload(); } catch (e: any) { message.error(e.message); } }}>
            <Button icon={<StopOutlined />}>Close account</Button>
          </Popconfirm>
        )}
        {account && closed && (
          <>
            <Tag color="default" style={{ marginInlineEnd: 0 }}>Closed — view only</Tag>
            <Popconfirm title={`Reopen ${account.name}?`} okText="Reopen"
              onConfirm={async () => { try { await accountService.setClosed(account.id, false); message.success(`${account.name} reopened`); data.reload(); } catch (e: any) { message.error(e.message); } }}>
              <Button>Reopen</Button>
            </Popconfirm>
          </>
        )}
        {account && !closed && !used && !Number(account.opening_balance) && !Number(account.opening_foreign) && banks.length > 1 && (
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
        {!closed && <Upload accept=".csv,text/csv,.pdf,application/pdf,.png,.jpg,.jpeg,.webp" showUploadList={false} beforeUpload={onFile}><Button icon={<UploadOutlined />}>Import statement (PDF or CSV)</Button></Upload>}
        {!closed && <Button icon={<PlusOutlined />} onClick={() => setAdding(true)}>Add a line</Button>}
      </Space>
      {/* the summary cards share one row and are all the same height */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'stretch', marginBottom: 12 }}>
        <Card size="small" style={{ minWidth: 110 }}><Statistic title="Currency" value={accCur} /></Card>
        <Card size="small" style={{ minWidth: 200 }}><Statistic title="Balance per statement" value={num(statementBalance)} styles={{ content: { color: PURPLE } }} /></Card>
        {/* a bank in another currency: the balance in that currency (opening + matched lines); the books' amount below */}
        <Card size="small" style={{ minWidth: 200 }}>
          <Statistic title="System Balance" value={num(foreign ? foreignBooks : booksBalance)} />
          {foreign && <Text type="secondary" style={{ fontSize: 12 }}>= {money(booksBalance, currency)} in the books</Text>}
        </Card>
        <Card size="small" style={{ minWidth: 200 }}><Statistic title="Lines to match" value={unmatched} styles={{ content: { color: unmatched ? '#faad14' : undefined } }} /></Card>
      </div>
      {booksBalance < 0 && !Number(account?.opening_balance) && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          title="The System Balance is negative because this account has no opening balance yet."
          description={<>Payroll net pay, payments and other money out are taken from this account, but the money that was in it when you started isn't recorded. Click <EditOutlined /> next to the account and enter the opening balance and its date (e.g. your bank balance on the day before your first payroll in Quantivra).</>} />
      )}
      {!foreign && Math.abs(statementBalance - booksBalance) >= 0.01 && unmatched === 0 && txns.length > 0 && txns.every(t => t.source === 'statement') && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          title={`The statement and the System Balance differ by ${num(Math.abs(statementBalance - booksBalance))}. Check for payments recorded in Quantivra that aren't on the statement yet, or the account's opening balance.`} />
      )}
      <Segmented value={filter} onChange={v => setFilter(String(v))} style={{ marginBottom: 12 }}
        options={[{ value: 'all', label: 'All' }, { value: 'unmatched', label: `To match (${unmatched})` }, { value: 'matched', label: 'Matched' },
          { value: 'ignored', label: 'Ignored' }]} />
      <Table rowKey="id" size="small" loading={loading} dataSource={shown} pagination={{ pageSize: 100, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={filter === 'unmatched' ? 'All matched' : 'No lines'} /> }}
        columns={[
          // purple: the line came from the bank's statement (PDF / CSV)
          { title: 'Date', key: 'dt', width: 110, render: (_, t) => <span style={t.source === 'statement' ? { color: PURPLE, fontWeight: 600 } : undefined}>{t.txn_date}</span> },
          { title: 'Description', key: 'd', render: (_, t) => describe(t) },
          // as on the bank statement: debit = money out, credit = money in
          { title: 'Debit', key: 'out', align: 'right' as const, width: 140, render: (_, t) => t.amount < 0 ? <span style={{ color: '#ff7875' }}>{t.status === ('expected' as any) && foreign ? money(-t.amount, currency) : num(-t.amount)}</span> : '' },
          { title: 'Credit', key: 'in', align: 'right' as const, width: 140, render: (_, t) => t.amount > 0 ? <span style={{ color: '#73d13d' }}>{t.status === ('expected' as any) && foreign ? money(t.amount, currency) : num(t.amount)}</span> : '' },
          { title: 'Balance', key: 'bal', align: 'right' as const, width: 150, render: (_, t) => (running.has(t.id) ? num(running.get(t.id)!) : '') },
          { title: 'Matched to', key: 'm', width: 220, render: (_, t) => t.status === 'ignored' ? <Tag>ignored</Tag> : matchLabel(t, data, look)?.accounts || '' },
          {
            title: '', key: 'a', width: 210, render: (_, t) => closed ? null : t.status === ('expected' as any) ? (
              // recorded in Quantivra (e.g. a transfer from another bank): Match = it's on the statement
              <Space size={4}>
              {foreign ? <Button size="small" type="primary" icon={<LinkOutlined />} onClick={() => setFxMatch(t)}>Match</Button> : (
              <Popconfirm title="Is this on the bank statement?" okText="Yes, match"
                onConfirm={async () => { try { await bankService.confirmRecorded(companyId, accountId!, t); message.success('Matched'); load(); } catch (e: any) { message.error(e.message); } }}>
                <Button size="small" type="primary" icon={<LinkOutlined />}>Match</Button>
              </Popconfirm>
              )}
              {/* a payment recorded by mistake (e.g. against the wrong bill): delete it, the bill is unpaid again */}
              {t.payment_id && (
                <Popconfirm title={`Delete ${paidLabel(t.payment_id)}?`} okText="Delete" okButtonProps={{ danger: true }}
                  description={paidDocsText(t.payment_id) ? `${paidDocsText(t.payment_id)} becomes unpaid again.` : undefined}
                  onConfirm={async () => { try { await paymentService.remove(t.payment_id!); message.success('Payment deleted'); load(); data.reload(); } catch (e: any) { message.error(e.message); } }}>
                  <Button size="small" danger icon={<DeleteOutlined />} title="Delete this payment" />
                </Popconfirm>
              )}
              </Space>
            ) : (
              <Space size={4}>
                {t.status === 'unmatched'
                  ? <Button size="small" type="primary" icon={<LinkOutlined />} onClick={() => setMatching(t)}>Match</Button>
                  : (
                    <Popconfirm title="Undo this match?"
                      description={t.payment_id ? `${paidLabel(t.payment_id)} is removed${paidDocsText(t.payment_id) ? ` and ${paidDocsText(t.payment_id)} becomes unpaid again` : ''}.` : undefined}
                      onConfirm={async () => {
                        try {
                          // the payment goes with the match, so the bill / invoice is open again for the right one
                          const pid = t.payment_id;
                          await bankService.unmatch(t, allTxns);
                          if (pid) await paymentService.remove(pid);
                          load(); data.reload();
                        } catch (e: any) { message.error(e.message); }
                      }}>
                      <Button size="small" icon={<DisconnectOutlined />}>Undo</Button>
                    </Popconfirm>
                  )}
                {t.status !== 'matched' && <Button size="small" icon={<EditOutlined />} title="Amend" onClick={() => setAmending(t)} />}
                {t.status === 'unmatched' && <Button size="small" onClick={async () => { await bankService.update(t.id, { status: 'ignored' }); load(); }}>Ignore</Button>}
                <Popconfirm title="Delete this statement line?" onConfirm={async () => { await bankService.remove(t.id); load(); }}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]} />

      {importing && (
        <Modal open width={980} title={`Import ${importing.length} lines into ${account?.name}`} okText={`Import ${importing.length} lines`}
          onCancel={() => setImporting(null)}
          onOk={async () => {
            try {
              // statement order; keyed-in lines are replaced by the statement's line, keeping their match
              const rows = plan.map(p => {
                const base = { txn_date: p.line.txn_date, description: p.line.description, amount: p.line.amount, source: 'statement' as const };
                if (p.kind === 'keyed') {
                  const e = txns.find(t => t.id === p.existing.id)!;
                  return { ...base, status: e.status, payment_id: e.payment_id, journal_id: e.journal_id,
                    ...(e.journal_existing ? { journal_existing: true } : {}), ...(e.base_amount != null ? { base_amount: e.base_amount } : {}) };
                }
                if (p.kind === 'recorded') {
                  return { ...base, status: 'matched' as const, journal_id: p.recorded.journal_id, payment_id: p.recorded.payment_id, ...(p.recorded.journal_id ? { journal_existing: true } : {}) };
                }
                return { ...base, status: 'unmatched' as const };
              });
              await bankService.importInOrder(companyId, accountId!, rows, plan.flatMap(p => (p.kind === 'keyed' ? [p.existing.id] : [])));
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
          <Table size="small" tableLayout="fixed" rowKey={(_l: ImportLine) => importing.indexOf(_l)} pagination={{ pageSize: 12 }} dataSource={importing}
            columns={[
              { title: 'Date', dataIndex: 'txn_date', width: 110 },
              { title: 'Description', dataIndex: 'description' },
              { title: 'Amount', key: 'a', align: 'right' as const, width: 140, render: (_: any, l: ImportLine) => <span style={{ color: l.amount > 0 ? '#73d13d' : '#ff7875' }}>{money(l.amount, accCur)}</span> },
              {
                title: 'Matches', key: 'm', width: 170, render: (_: any, l: ImportLine) => {
                  const p = plan[importing.indexOf(l)];
                  // long texts wrap inside the column instead of stretching the table
                  const d = p?.kind === 'keyed' ? p.existing.description || '—' : '';
                  return p?.kind === 'keyed' ? <Tag color="blue" title={d} style={{ whiteSpace: 'normal', maxWidth: '100%' }}>Your line: {d.length > 60 ? `${d.slice(0, 60)}…` : d}</Tag>
                    : p?.kind === 'recorded' ? <Tag color="green">Recorded transfer</Tag> : '';
                },
              },
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
      {fxMatch && <FxMatch txn={fxMatch} currency={currency} accCur={accCur} onClose={() => setFxMatch(null)}
        onMatch={async (received, base) => {
          try { await bankService.confirmRecorded(companyId, accountId!, { ...fxMatch, amount: received, base_amount: base }); message.success('Matched'); setFxMatch(null); load(); }
          catch (e: any) { message.error(e.message); }
        }} />}
      {amending && <AddLine line={amending} onClose={() => setAmending(null)} currency={accCur}
        onAdd={async l => { try { await bankService.update(amending.id, { txn_date: l.txn_date, description: l.description, amount: l.amount }); setAmending(null); load(); } catch (e: any) { message.error(e.message); } }} />}
      {adding && <AddLine onClose={() => setAdding(false)} currency={accCur}
        onAdd={async l => { await bankService.add(companyId, accountId!, [l]); setAdding(false); load(); }} />}
      {bankModal}
      {nothingMonth && (
        <Modal open title={`No ${accCur} transactions this month`} okText="Save statement" onCancel={() => setNothingMonth(null)}
          onOk={async () => {
            try {
              if (stmtFile) await saveBankStatement(companyId, stmtFile, accountId!, nothingMonth.format('YYYY-MM'));
              message.success(`Saved as the ${nothingMonth.format('MMMM YYYY')} statement — no transactions`);
              setNothingMonth(null);
            } catch (e: any) { message.error(e.message); }
          }}>
          <Space>
            <Text>Save this statement in Documents as</Text>
            <DatePicker picker="month" format="MMMM YYYY" allowClear={false} value={nothingMonth} onChange={d => d && setNothingMonth(d)} />
          </Space>
        </Modal>
      )}
      {teaching && pdfRows && (
        <TeachPdf rows={pdfRows} bankName={account?.name || 'this bank'} onClose={() => setTeaching(false)}
          onNothing={() => {
            // a statement with no transactions: keep it in Documents for its month, nothing to import
            const m = statementMonthFromText(pdfRows.slice(0, 40).map(r => r.map(p => p.s).join(' ')).join('\n'));
            setTeaching(false);
            setNothingMonth(m ? dayjs(`${m}-01`) : dayjs().subtract(1, 'month').startOf('month'));
          }}
          onDone={async (layout, lines) => {
            try { await pdfLayoutService.save(companyId, accountId!, layout); setLayouts(l => ({ ...l, [String(accountId)]: layout })); } catch (e: any) { message.error(e.message); }
            setTeaching(false);
            message.success('Got it — statements for this bank will be read this way from now on');
            showImport(lines);
          }} />
      )}
      {details && <MatchDetails data={data} txn={details} look={look} accCur={accCur} onClose={() => setDetails(null)} onFilesChanged={loadWithFiles} readOnly={closed}
        onChanged={() => { setDetails(null); load(); data.reload(); }} />}
      {matching && <MatchModal data={data} txn={matching} accCur={accCur} dues={dues} payments={payments} usedPayments={new Set(allTxns.filter(x => x.payment_id).map(x => x.payment_id!))}
        recorded={expected} lastRate={lastRate}
        onClose={() => setMatching(null)} onDone={() => { setMatching(null); load(); data.reload(); }} />}
    </div>
  );
}

/**
 * A transfer recorded in the company's currency (e.g. SGD 1,419.88 from the SGD account) arriving in a bank in
 * another currency: enter what arrived (or the rate) and the line is stored in that currency, matched.
 */
function FxMatch({ txn, currency, accCur, onClose, onMatch }: {
  txn: BankTxn; currency: string; accCur: string; onClose: () => void; onMatch: (received: number, base: number) => Promise<void>;
}) {
  const base = Math.abs(Number(txn.amount)), sign = Math.sign(Number(txn.amount));
  const [received, setReceived] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const rate = received ? base / received : null;
  return (
    <Modal open title={`${sign > 0 ? 'Received' : 'Paid'} in ${accCur}`} okText="Match" confirmLoading={busy} okButtonProps={{ disabled: !received }} onCancel={onClose}
      onOk={async () => { setBusy(true); await onMatch(sign * received!, sign * base); setBusy(false); }}>
      <Space orientation="vertical" style={{ width: '100%' }}>
        <Text>{txn.description} · {txn.txn_date} · {money(base, currency)}</Text>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><Text type="secondary">Amount in {accCur}</Text>
            <AmountInput style={{ width: '100%' }} min={0.01} precision={2} prefix={accCur} value={received ?? undefined} onChange={v => setReceived(v == null ? null : Number(v))} /></div>
          <div><Text type="secondary">Rate (1 {accCur} = ? {currency})</Text>
            <InputNumber style={{ width: '100%' }} min={0} precision={6} value={rate ? Math.round(rate * 1e6) / 1e6 : undefined}
              onChange={r => setReceived(r ? Math.round((base / Number(r)) * 100) / 100 : null)} /></div>
        </div>
      </Space>
    </Modal>
  );
}

/** Add a statement line by hand, or amend one that isn't matched yet (`line`). */
function AddLine({ onClose, onAdd, currency, line }: { onClose: () => void; onAdd: (l: BankLine) => Promise<void>; currency: string; line?: BankTxn }) {
  const [form] = Form.useForm();
  return (
    <Modal open title={line ? 'Amend statement line' : 'Add a statement line'} onCancel={onClose} onOk={async () => {
      const v = await form.validateFields();
      await onAdd({ txn_date: v.date.format('YYYY-MM-DD'), description: v.description || '', amount: v.direction === 'in' ? v.amount : -v.amount });
    }}>
      <Form form={form} layout="vertical" initialValues={line
        ? { date: dayjs(line.txn_date), direction: line.amount < 0 ? 'out' : 'in', amount: Math.abs(Number(line.amount)), description: line.description || '' }
        : { date: dayjs(), direction: 'in' }}>
        {/* as on the bank statement: debit = money out (red), credit = money in (green) */}
        <Form.Item name="direction"><Segmented options={[
          { value: 'out', label: <span style={{ color: '#ff7875' }}>Debit</span> },
          { value: 'in', label: <span style={{ color: '#73d13d' }}>Credit</span> },
        ]} /></Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
          <Form.Item name="date" label="Date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}><AmountInput min={0.01} precision={2} prefix={currency} style={{ width: '100%' }} /></Form.Item>
        </div>
        <Form.Item name="description" label="Description"><Input /></Form.Item>
      </Form>
    </Modal>
  );
}

/** Decide what a statement line is: a payment already recorded, an invoice / bill being paid, or money for an account. */
function MatchModal({ data, txn, accCur, dues, payments, usedPayments, recorded, lastRate, onClose, onDone }: {
  data: FinanceData; txn: BankTxn; accCur: string; dues: PayrollDue[]; payments: Payment[]; usedPayments: Set<number>;
  /** journals on this bank not on a statement yet (e.g. the other side of a transfer) */
  recorded: BankTxn[]; lastRate?: number | null; onClose: () => void; onDone: () => void;
}) {
  const inbound = txn.amount > 0;
  const foreign = accCur !== data.currency;
  const lineAmt = Math.abs(Number(txn.amount));                 // in the bank account's currency
  // the rate has its own box (so typing 1.29 isn't undone by rounding a small amount); starts at the last rate used
  const r2 = (n: number) => Math.round(n * 100) / 100;
  // the bank's own rate when the line states it ("1 HKD=0.129016 USD"), else the last rate used on this bank
  const textRate = foreign ? rateFromText(txn.description, accCur, data.currency, lineAmt) : null;
  const [rate, setRate] = useState<number | null>(textRate?.rate ?? (foreign && lastRate ? lastRate : null));
  const [base, setBase] = useState<number | null>(textRate?.base ?? (foreign && lastRate ? r2(lastRate * lineAmt) : null));  // the same in the company's currency
  // no rate keyed: the last rate used on this bank is used (only the very first line needs one)
  const effBase = base ?? (foreign && lastRate ? r2(lastRate * lineAmt) : null);
  const [editRate, setEditRate] = useState(!lastRate && !textRate);
  // no rate used on this bank yet: the market rate on the line's date
  const [looking, setLooking] = useState(false);
  useEffect(() => {
    if (!foreign || lastRate || textRate) return;
    setLooking(true);
    marketRate(accCur, data.currency, txn.txn_date).then(r => {
      if (r) { setRate(x => x ?? r); setBase(x => x ?? r2(r * lineAmt)); }
    }).finally(() => setLooking(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txn.id]);
  const amt = foreign ? (effBase ?? 0) : lineAmt;               // what goes into the books
  const ready = !foreign || (effBase != null && effBase > 0);
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
  // a document in the bank's own currency is compared in that currency; anything else in the company's currency
  const inBankCur = (d: FinDocument) => isForeignDoc(d, data.currency) && d.currency === accCur;
  const sameAmount = (d: FinDocument) => inBankCur(d) ? Math.abs(balanceDue(d) - lineAmt) < 0.005 : Math.abs(inBase(d, balanceDue(d)) - amt) < 0.005;
  // a bill is known by the supplier's invoice number (its reference); an invoice by our own number
  const docNo = (d: FinDocument) => (!inbound && d.reference ? d.reference : d.number);
  const bankText = (txn.description || '').toUpperCase().replace(/\s+/g, '');
  const named = (d: FinDocument) => [d.reference, d.number].some(n => n && n.replace(/\s+/g, '').length >= 3 && bankText.includes(n.toUpperCase().replace(/\s+/g, '')));
  const openDocs: FinDocument[] = data.docs.filter(d => (inbound ? d.doc_type === 'invoice' : ['bill', 'expense'].includes(d.doc_type))
    && !['draft', 'void', 'paid'].includes(d.status) && balanceDue(d) > 0)
    // the bill / invoice the bank text names (e.g. "INV25-A03") first, then the same amount
    .sort((a, b) => Number(!named(a)) - Number(!named(b)) || Number(!sameAmount(a)) - Number(!sameAmount(b)));
  const contact = (id: number | null) => data.contacts.find(c => c.id === id)?.name || '';
  const bookable = data.accounts.filter((a: Account) => !a.archived && a.id !== txn.account_id);
  // money in: income first, never expenses; money out: expenses first, never income — then banks, loans, capital…
  const groupsFor = (): { label: string; types: string[] }[] => [
    inbound ? { label: 'Income', types: ['income'] } : { label: 'Expenses', types: ['expense'] },
    { label: 'Banks, cash and other things you own', types: ['asset'] },
    { label: 'Owed (loans, payables, tax)', types: ['liability'] },
    { label: 'Capital', types: ['equity'] },
  ];
  const accountGroups = groupsFor().map(g => ({
    label: g.label,
    options: bookable.filter(a => g.types.includes(a.type)).map(a => ({ value: a.id, label: `${a.code} ${a.name}` })),
  })).filter(g => g.options.length);
  const salId = systemAccount(data.accounts, 'payroll_payable')?.id;
  // salaries / CPF of exactly this amount: open the Payroll tab first
  const payrollHit = !inbound && dues.some(d => Math.abs(d.netDue - lineAmt) < 0.005 || Math.abs(d.statDue - lineAmt) < 0.005);

  const run = async (f: () => Promise<void>) => { setBusy(true); try { await f(); message.success('Matched'); onDone(); } catch (e: any) { message.error(e.message); } setBusy(false); };
  // the bank amount differs from the document (company currency): money out more than the bill, or money in less
  // than the invoice — say where the difference goes (bank charges, a prepayment…) or leave it with the contact
  const chosen = docId ? data.docs.find(x => x.id === docId) : undefined;
  // in the document's currency when it is the bank's (USD invoice, USD bank), else in the company's currency
  const diffInDocCur = !!chosen && inBankCur(chosen);
  const diff = !chosen ? 0
    : diffInDocCur ? Math.round((inbound ? balanceDue(chosen) - lineAmt : lineAmt - balanceDue(chosen)) * 100) / 100
      : !isForeignDoc(chosen, data.currency) ? Math.round((inbound ? balanceDue(chosen) - amt : amt - balanceDue(chosen)) * 100) / 100 : 0;
  // what the difference is in the company's currency (charges are booked in it), at this line's rate
  const diffBase = diffInDocCur ? Math.round(diff * (lineAmt ? amt / lineAmt : 0) * 100) / 100 : diff;
  const bankCharges = data.accounts.find(a => !a.archived && a.type === 'expense' && /bank charge/i.test(a.name));
  const [diffTo, setDiffTo] = useState<number | 'keep' | null>(null);
  const diffAccount = diffTo ?? (bankCharges?.id || 'keep');
  const diffOptions = [
    { value: 'keep', label: inbound ? 'Leave it owing on the invoice' : 'Leave it with the supplier (paid in advance to them)' } as any,
    ...data.accounts.length ? [
      { label: 'Expenses', options: bookable.filter(a => a.type === 'expense').map(a => ({ value: a.id, label: `${a.code} ${a.name}` })) },
      { label: 'Things you own (prepayments, deposits…)', options: bookable.filter(a => a.type === 'asset' && !['bank', 'cash', 'receivable'].includes(a.subtype || '')).map(a => ({ value: a.id, label: `${a.code} ${a.name}` })) },
      { label: 'Owed', options: bookable.filter(a => a.type === 'liability' && !['payable'].includes(a.subtype || '')).map(a => ({ value: a.id, label: `${a.code} ${a.name}` })) },
    ] : [],
  ];
  // how much of the document this pays off, in the document's currency: in the bank's currency, what came in;
  // in another currency, at the document's rate (close to the whole balance counts as all of it — the rest is
  // an exchange difference). It can be typed in instead (a partial payment of an exact amount).
  const autoPortion = (d: FinDocument) => {
    const due = balanceDue(d);
    if (diff > 0 && diffAccount !== 'keep') return due;
    const worth = inBankCur(d) ? lineAmt : isForeignDoc(d, data.currency) ? amt / docRate(d) : amt;
    return isForeignDoc(d, data.currency) && !inBankCur(d) && worth >= due * 0.95 ? due : Math.min(Math.round(worth * 100) / 100, due);
  };
  const [payOff, setPayOff] = useState<number | null>(null);
  useEffect(() => { setPayOff(null); }, [docId]);
  const payDoc = () => run(async () => {
    const d = data.docs.find(x => x.id === docId)!;
    const due = balanceDue(d);
    if (payOff != null && (payOff <= 0 || payOff > due + 0.005)) throw new Error(`Pays off must be between 0 and ${money(due, d.currency || data.currency)}`);
    // a typed-in amount: exactly that is paid off; the difference is booked only for the automatic full amount
    const booked = payOff == null && diff > 0 && diffAccount !== 'keep';
    const portion = payOff ?? autoPortion(d);
    const pid = await paymentService.record(data.companyId, {
      direction: inbound ? 'in' : 'out', amount: amt, contact_id: d.contact_id, payment_date: txn.txn_date,
      method: 'Bank transfer', reference: txn.description || undefined, account_id: txn.account_id,
      ...(foreign ? { currency: accCur, foreign_amount: lineAmt } : {}),
      ...(booked ? { charges: diffBase, charges_account_id: diffAccount as number } : {}),
    }, [{ document_id: d.id, amount: portion }]);
    await bankService.matchPayment(txn.id, pid, signedBase);
  });

  return (
    <Modal open width={780} onCancel={onClose} footer={null}
      title={<span>{inbound ? 'Money in' : 'Money out'} {money(lineAmt, accCur)} on {txn.txn_date}<div style={{ fontSize: 12, fontWeight: 400, color: '#999' }}>{txn.description}</div></span>}>
      {foreign && !editRate && (
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary">1 {accCur} = {rate ?? lastRate} {data.currency}{textRate ? ` = ${money(textRate.base, data.currency)} (the bank's rate)` : ''}</Text>{' '}
          <Button size="small" type="link" onClick={() => setEditRate(true)}>Change rate</Button>
        </div>
      )}
      {foreign && editRate && (
        <div style={{ marginBottom: 12, padding: 10, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}>
          <Text>In {data.currency}:</Text>{' '}
          <Space wrap>
            <AmountInput min={0} precision={6} style={{ width: 170 }} prefix={`1 ${accCur} =`} suffix={data.currency}
              value={rate ?? undefined}
              onChange={r => { const v = r == null ? null : Number(r); setRate(v); setBase(v ? r2(v * lineAmt) : null); }} />
            <Text type="secondary">or</Text>
            <AmountInput min={0} precision={2} style={{ width: 170 }} prefix={data.currency} value={base ?? undefined} onChange={v => { const b = v == null ? null : Number(v); setBase(b); setRate(b && lineAmt ? fx(b / lineAmt) : null); }} />
          </Space>
          {looking && <div style={{ marginTop: 6 }}><Text type="secondary">Looking up the rate on {txn.txn_date}…</Text></div>}
          {!ready && !looking && <div style={{ marginTop: 6 }}><Tag color="gold">Couldn't find the rate for {txn.txn_date} — enter the rate or the {data.currency} amount</Tag></div>}
          {ready && !lastRate && rate != null && <div style={{ marginTop: 6 }}><Text type="secondary">Market rate on {txn.txn_date}; change it if your bank used another.</Text></div>}
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
                    { title: inbound ? 'Number' : 'Invoice no.', key: 'no', render: (_, d) => <span style={{ fontWeight: named(d) ? 700 : 400 }}>{docNo(d)}</span> },
                    { title: 'Date', dataIndex: 'issue_date' },
                    { title: inbound ? 'Customer' : 'Supplier', key: 'c', render: (_, d) => contact(d.contact_id) },
                    { title: 'Still owed', key: 'b', align: 'right' as const, render: (_, d) => <span style={{ fontWeight: sameAmount(d) ? 700 : 400 }}>{money(balanceDue(d), d.currency || data.currency)}{isForeignDoc(d, data.currency) && !inBankCur(d) && <Text type="secondary"> ≈ {money(inBase(d, balanceDue(d)), data.currency)}</Text>}</span> },
                  ]} />
              )}
              {chosen && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Text>Pays off</Text>
                  <AmountInput min={0} precision={2} style={{ width: 200 }} prefix={chosen.currency || data.currency}
                    value={payOff ?? autoPortion(chosen)} onChange={v => setPayOff(v == null ? null : Number(v))} />
                  <Text type="secondary">of {money(balanceDue(chosen), chosen.currency || data.currency)} still owed</Text>
                </div>
              )}
              {diff > 0.004 && payOff == null && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Text>{inbound ? 'Short by' : 'Difference'} <b>{money(diff, diffInDocCur ? accCur : data.currency)}</b>{diffInDocCur && diffBase > 0 ? ` (${money(diffBase, data.currency)})` : ''}:</Text>
                  <Select style={{ minWidth: 340 }} showSearch optionFilterProp="label" value={diffAccount} onChange={v => setDiffTo(v)} options={diffOptions} />
                </div>
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
                      onClick={() => run(async () => {
                        await bankService.categorise(data.companyId, txn, salId!, `Salaries — ${dayjs(`${d.run.period_year}-${String(d.run.period_month).padStart(2, '0')}-01`).format('MMMM YYYY')}`, foreign ? amt : undefined);
                        // the payroll's pay date becomes the day the bank paid it out
                        await payrollService.setPayDate(d.run.id, txn.txn_date).catch(() => null);
                      })}>
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
                    options={accountGroups} />
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
          <Form.Item name="bank_name" label="Bank"><Input /></Form.Item>
          <Form.Item name="bank_account_no" label="Account no."><Input /></Form.Item>
          <Form.Item name="currency" label="Currency" style={{ gridColumn: '1 / -1' }}>
            <Select showSearch optionFilterProp="label" options={currencyOptions()} />
          </Form.Item>
          {foreign && (
            <Form.Item name="opening_foreign" label={`Opening balance (${cur})`}>
              <AmountInput precision={2} style={{ width: '100%' }} prefix={cur} />
            </Form.Item>
          )}
          <Form.Item name="opening_balance" label={foreign ? `Opening balance in ${data.currency}` : 'Opening balance'}>
            <AmountInput precision={2} style={{ width: '100%' }} prefix={data.currency} />
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
