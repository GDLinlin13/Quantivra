import { useState, useEffect } from 'react';
import { Modal, Table, Typography, Space, Button, Tag, Empty, message, Descriptions, Upload, Popconfirm, Select } from 'antd';
import { PaperClipOutlined, FilePdfOutlined, UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import { docService, paymentService, bankService, attachmentService, companyFileService, ATTACH_TYPES, type CompanyFile, type Attachment, type BankTxn, type JournalRow, type Payment, type Allocation } from '../../../../services/finance';
import { DOC_LABEL, isSalesDoc, balanceDue, isForeignDoc, type FinDocument } from '../../../../data/finance';
import { lineText } from '../../../../data/catalog';
import { money } from '../../../../data/documentLayouts';
import { renderPdf } from '../../../../utils/renderPdf';
import { FileViewer } from '../../../../components/FileViewer';
import { AmountInput } from '../../../../components/AmountInput';
import { DocumentView } from './DocumentView';
import type { FinanceData } from './DocList';
import { fmtDate } from '../../../../utils/dateFormat';

const { Text } = Typography;

export interface MatchLookup {
  journals: JournalRow[]; payments: Payment[]; allocations: Allocation[]; docs: FinDocument[];
}

/**
 * A matched bank line in words. `title`: what it was for — the details typed when matching (e.g. "Bank charges
 * June", "Salaries — May 2026") or, for a payment, "RCT-2026-0001 · Argos Solutions Limited · CCSG2605001".
 * `accounts`: the account names it went to, without codes ("Bank charges", "Net salaries payable").
 */
export function matchLabel(t: BankTxn, data: FinanceData, look: MatchLookup): { title: string; accounts: string } | null {
  const acc = (id: number | undefined) => data.accounts.find(a => a.id === id);
  const short = (n: string) => n.replace(/\s*\(.*\)\s*$/, '');
  if (t.payment_id) {
    const p = look.payments.find(x => x.id === t.payment_id);
    const sub = p?.direction === 'out' || (!p && t.amount < 0) ? 'payable' : 'receivable';
    const control = short(data.accounts.find(a => a.subtype === sub)?.name || '');
    if (!p) return { title: 'Payment', accounts: control };
    const docs = look.allocations.filter(a => a.payment_id === p.id).map(a => look.docs.find(d => d.id === a.document_id)?.number).filter(Boolean);
    const who = data.contacts.find(c => c.id === p.contact_id)?.name;
    const extra = Number(p.charges) > 0 ? short(acc(p.charges_account_id ?? undefined)?.name || '') : '';
    return { title: [p.number || 'Payment', who, docs.join(', ')].filter(Boolean).join(' · '), accounts: [control, extra].filter(Boolean).join(', ') };
  }
  if (t.journal_id) {
    const j = look.journals.find(x => x.id === t.journal_id);
    if (!j) return { title: t.description || '', accounts: '' };
    const names = j.lines.filter(l => l.account_id !== t.account_id).map(l => acc(l.account_id)?.name).filter(Boolean).map(n => short(n!));
    const accounts = [...new Set(names)].join(', ');
    return { title: (j.memo || '').trim() || t.description || accounts, accounts };
  }
  return null;
}

/** Click a matched bank line: what it was booked to, and the invoices / bills it paid with their files. */
export function MatchDetails({ data, txn, look, accCur, onClose, onFilesChanged, onChanged, readOnly }: { data: FinanceData; txn: BankTxn; look: MatchLookup; accCur: string; onClose: () => void; onFilesChanged?: () => void; onChanged?: () => void; /** a closed bank account: view only */ readOnly?: boolean }) {
  const acc = (id: number) => data.accounts.find(a => a.id === id);
  const M = (n: number) => money(n, data.currency);
  const label = matchLabel(txn, data, look);
  const payment = txn.payment_id ? look.payments.find(p => p.id === txn.payment_id) : undefined;
  const journal = txn.journal_id ? look.journals.find(j => j.id === txn.journal_id) : undefined;
  const allocs = payment ? look.allocations.filter(a => a.payment_id === payment.id) : [];
  const paidDocs = allocs.map(a => ({ alloc: a, doc: look.docs.find(d => d.id === a.document_id) })).filter(x => x.doc) as { alloc: Allocation; doc: FinDocument }[];
  // money out that was more than its bills, or money in that fell short of its invoice: where the difference goes
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const plain = paidDocs.every(x => !isForeignDoc(x.doc, data.currency));
  const shortDoc = payment?.direction === 'in' && paidDocs.length === 1 && balanceDue(paidDocs[0].doc) > 0 ? paidDocs[0].doc : null;
  const gap = !payment || !plain ? 0
    : payment.direction === 'out' ? r2(Number(payment.amount) - (Number(payment.charges) || 0) - allocs.reduce((t, a) => t + Number(a.amount), 0))
      : shortDoc ? r2(balanceDue(shortDoc)) : 0;
  const bankCharges = data.accounts.find(a => !a.archived && a.type === 'expense' && /bank charge/i.test(a.name));
  const [gapTo, setGapTo] = useState<number | undefined>(bankCharges?.id);
  const [booking, setBooking] = useState(false);
  const [newBase, setNewBase] = useState<number | null>(null);
  // the booking's other bank, when it is in another currency than the company's, and its line there (if any)
  const otherForeign = journal ? data.accounts.find(a => a.id !== txn.account_id && journal.lines.some(l => l.account_id === a.id)
    && (a.subtype === 'bank' || a.subtype === 'cash') && a.currency && a.currency !== data.currency) : undefined;
  const [arrivedLine, setArrivedLine] = useState<BankTxn | null>(null);
  const [arrives, setArrives] = useState<number | null>(null);
  useEffect(() => {
    if (journal && otherForeign) bankService.forJournal(journal.id).then(ls => setArrivedLine(ls.find(l => l.account_id === otherForeign.id) || null)).catch(() => null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journal?.id, otherForeign?.id]);
  const gapOptions = [
    { label: 'Expenses', options: data.accounts.filter(a => !a.archived && a.type === 'expense').map(a => ({ value: a.id, label: `${a.code} ${a.name}` })) },
    { label: 'Things you own (prepayments, deposits…)', options: data.accounts.filter(a => !a.archived && a.type === 'asset' && !['bank', 'cash', 'receivable'].includes(a.subtype || '')).map(a => ({ value: a.id, label: `${a.code} ${a.name}` })) },
    { label: 'Owed', options: data.accounts.filter(a => !a.archived && a.type === 'liability' && a.subtype !== 'payable').map(a => ({ value: a.id, label: `${a.code} ${a.name}` })) },
  ];
  const bookGap = async () => {
    if (!payment || !gapTo) return;
    setBooking(true);
    try { await paymentService.bookDifference(payment.id, gap, gapTo, shortDoc?.id); message.success('Booked'); onChanged?.(); } catch (e: any) { message.error(e.message); }
    setBooking(false);
  };
  // a bank in another currency: its amount in that currency next to the books' amount (e.g. HKD 100.00 · USD 12.80)
  const inOwn = (accountId: number) => {
    const a = acc(accountId);
    if (!a?.currency || a.currency === data.currency) return null;
    const own = accountId === txn.account_id ? Math.abs(Number(txn.amount)) : arrivedLine && accountId === arrivedLine.account_id ? Math.abs(Number(arrivedLine.amount)) : null;
    return own != null ? <Text type="secondary"> · {money(own, a.currency)}</Text> : null;
  };
  const [files, setFiles] = useState<Record<number, Attachment[]>>({});
  const [busy, setBusy] = useState<number | null>(null);
  // supporting documents of a journal entry (e.g. the share capital agreement)
  const [support, setSupport] = useState<CompanyFile[]>([]);
  const [viewFile, setViewFile] = useState<{ name: string; load: () => Promise<Blob> } | null>(null);
  const loadSupport = () => { if (journal) companyFileService.list(data.companyId).then(fs => setSupport(fs.filter(f => f.journal_id === journal.id))).catch(() => null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadSupport, [journal?.id]);
  useEffect(() => {
    Promise.all(paidDocs.map(x => attachmentService.list(x.doc.id).then(fs => [x.doc.id, fs] as const)))
      .then(all => setFiles(Object.fromEntries(all))).catch(() => null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txn.id]);

  const openDoc = (d: FinDocument) => setViewFile({
    name: `${d.number || DOC_LABEL[d.doc_type]}.pdf`,
    load: async () => {
      const { doc, lines } = await docService.get(d.id);
      return renderPdf(<DocumentView doc={doc} lines={lines.map(l => ({ ...l, description: lineText(l, data.items) }))}
        contact={data.contacts.find(c => c.id === doc.contact_id) || null} person={data.people.find(p => p.id === doc.contact_person_id) || null}
        company={data.company} branding={data.branding} settings={data.settings} domId="match-doc" />);
    },
  });

  return (
    <Modal open onCancel={onClose} footer={null} width={760} title={label?.title || 'Details'}>
      {/* a bank in another currency: what this line is in the company's currency, and changing its rate */}
      {accCur !== data.currency && txn.base_amount != null && (
        <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Text>In {data.currency}:</Text>
          <AmountInput min={0} precision={6} style={{ width: 190 }} prefix={`1 ${accCur} =`} suffix={data.currency} disabled={readOnly}
            value={newBase != null ? Math.round(newBase / Math.abs(Number(txn.amount)) * 1e6) / 1e6 : Math.round(Math.abs(Number(txn.base_amount)) / Math.abs(Number(txn.amount)) * 1e6) / 1e6}
            onChange={v => setNewBase(v == null ? null : Math.round(Number(v) * Math.abs(Number(txn.amount)) * 100) / 100)} />
          <Text type="secondary">or</Text>
          <AmountInput min={0} precision={2} style={{ width: 170 }} prefix={data.currency} disabled={readOnly}
            value={newBase ?? Math.abs(Number(txn.base_amount))} onChange={v => setNewBase(v == null ? null : Number(v))} />
          {!readOnly && newBase != null && Math.abs(newBase - Math.abs(Number(txn.base_amount))) > 0.004 && (
            <Button size="small" type="primary" loading={booking} onClick={async () => {
              setBooking(true);
              try { await bankService.changeBaseAmount(data.companyId, txn, newBase); message.success('Rate changed'); onChanged?.(); } catch (e: any) { message.error(e.message); }
              setBooking(false);
            }}>Save rate</Button>
          )}
        </div>
      )}
      <Descriptions size="small" column={2} style={{ marginBottom: 12 }} items={[
        { key: 'd', label: 'Date', children: txn.txn_date },
        { key: 'a', label: txn.amount > 0 ? 'Credit' : 'Debit', children: money(Math.abs(txn.amount), accCur) },
        { key: 's', label: 'Bank statement', span: 2, children: <Text type="secondary">{txn.description}</Text> },
      ]} />
      {journal && (
        <>
          <Text strong>Booked to</Text>
          <Table rowKey={(_, i) => String(i)} size="small" pagination={false} style={{ marginTop: 6 }} dataSource={journal.lines}
            columns={[
              { title: 'Account', key: 'a', render: (_, l) => { const a = acc(l.account_id); return a ? `${a.code} ${a.name}` : '—'; } },
              { title: 'Details', key: 'd', render: (_, l) => l.description || journal.memo || '' },
              { title: 'Debit', key: 'dr', align: 'right' as const, render: (_, l) => (Number(l.debit) ? <>{M(Number(l.debit))}{inOwn(l.account_id)}</> : '') },
              { title: 'Credit', key: 'cr', align: 'right' as const, render: (_, l) => (Number(l.credit) ? <>{M(Number(l.credit))}{inOwn(l.account_id)}</> : '') },
            ]} />
          {/* a transfer to one of our banks in another currency: what it arrived as there */}
          {otherForeign && (
            <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Text>Arrived in {otherForeign.name} as</Text>
              {arrivedLine
                ? <Text strong>{money(Math.abs(Number(arrivedLine.amount)), otherForeign.currency!)}</Text>
                : readOnly ? <Text type="secondary">—</Text> : (<>
                  <AmountInput min={0} precision={2} style={{ width: 200 }} prefix={otherForeign.currency!} value={arrives ?? undefined} onChange={v => setArrives(v == null ? null : Number(v))} />
                  <Button size="small" type="primary" disabled={!arrives} loading={booking} onClick={async () => {
                    setBooking(true);
                    try {
                      const l = journal.lines.find(x => x.account_id === otherForeign.id)!;
                      await bankService.recordArrival(data.companyId, journal, otherForeign.id, arrives!, Number(l.debit) ? Number(l.debit) : -Number(l.credit));
                      message.success(`Added to ${otherForeign.name}`); onChanged?.();
                    } catch (e: any) { message.error(e.message); }
                    setBooking(false);
                  }}>Save</Button>
                </>)}
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <Text strong>Supporting documents</Text>
            <Space orientation="vertical" size={4} style={{ display: 'flex', marginTop: 6 }}>
              {support.map(f => (
                <Space key={f.id} size={4}>
                  <PaperClipOutlined />
                  <a onClick={() => setViewFile({ name: f.file_name, load: () => companyFileService.blob(f.path) })}>{f.file_name}</a>
                  {!readOnly && <Popconfirm title={`Remove ${f.file_name}?`} onConfirm={async () => { try { await companyFileService.remove(f); loadSupport(); onFilesChanged?.(); } catch (e: any) { message.error(e.message); } }}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>}
                </Space>
              ))}
              {!readOnly && <Upload accept={ATTACH_TYPES} multiple showUploadList={false} beforeUpload={file => {
                companyFileService.add(data.companyId, file, { folder: 'journal', journal_id: journal.id, period: journal.journal_date.slice(0, 7) })
                  .then(() => { loadSupport(); onFilesChanged?.(); })
                  .catch(e => message.error(/journal_id|folder_check/i.test(e.message) ? 'Supporting documents need database update 033 — ask your administrator to run it in Supabase.' : e.message));
                return false;
              }}>
                <Button size="small" icon={<UploadOutlined />}>Attach file</Button>
              </Upload>}
            </Space>
          </div>
        </>
      )}
      {payment && (
        <>
          <Descriptions size="small" column={2} style={{ marginBottom: 12 }} items={[
            { key: 'p', label: 'Payment', children: payment.number || '—' },
            { key: 'c', label: payment.direction === 'in' ? 'From' : 'To', children: data.contacts.find(c => c.id === payment.contact_id)?.name || '—' },
            ...(payment.method ? [{ key: 'm', label: 'Method', children: payment.method }] : []),
            ...(payment.reference ? [{ key: 'r', label: 'Reference', children: payment.reference }] : []),
          ]} />
          <Text strong>{payment.direction === 'in' ? 'Invoices paid' : 'Bills paid'}</Text>
          {!paidDocs.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Not linked to an invoice or bill" /> : (
            <Table rowKey={x => x.doc.id} size="small" pagination={false} style={{ marginTop: 6 }} dataSource={paidDocs}
              columns={[
                { title: 'Document', key: 'n', render: (_, x) => <Space size={4}><Tag>{DOC_LABEL[x.doc.doc_type]}</Tag>{x.doc.number}</Space> },
                { title: 'Date', key: 'd', render: (_, x) => fmtDate(x.doc.issue_date) },
                { title: 'Total', key: 't', align: 'right' as const, render: (_, x) => money(x.doc.total, x.doc.currency) },
                { title: 'Paid here', key: 'p', align: 'right' as const, render: (_, x) => M(Number(x.alloc.amount)) },
                {
                  title: 'Files', key: 'f', render: (_, x) => (
                    <Space orientation="vertical" size={2}>
                      {isSalesDoc(x.doc.doc_type) && (
                        <Button size="small" type="link" icon={<FilePdfOutlined />} onClick={() => openDoc(x.doc)} style={{ padding: 0 }}>
                          {x.doc.number}.pdf
                        </Button>
                      )}
                      {(files[x.doc.id] || []).map(f => (
                        <Button key={f.id} size="small" type="link" icon={<PaperClipOutlined />} style={{ padding: 0 }}
                          onClick={() => setViewFile({ name: f.file_name, load: () => companyFileService.blob(f.path) })}>{f.file_name}</Button>
                      ))}
                      {!isSalesDoc(x.doc.doc_type) && !(files[x.doc.id] || []).length && <Text type="secondary">No files attached</Text>}
                    </Space>
                  ),
                },
              ]} />
          )}
          {Number(payment.charges) > 0 && (
            <div style={{ marginTop: 8 }}><Text type="secondary">{payment.direction === 'out' ? 'Also paid' : 'Kept by the bank'}: {M(Number(payment.charges))} → {(() => { const a = data.accounts.find(x => x.id === payment.charges_account_id); return a ? `${a.code} ${a.name}` : '—'; })()}</Text></div>
          )}
          {gap > 0.004 && !readOnly && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Text>{payment.direction === 'out' ? 'Not for the bills' : `Still owed on ${shortDoc?.number}`}: <b>{M(gap)}</b> — book it to</Text>
              <Select style={{ minWidth: 280 }} showSearch optionFilterProp="label" value={gapTo} onChange={setGapTo} options={gapOptions} placeholder="Choose an account" />
              <Button type="primary" disabled={!gapTo} loading={booking} onClick={bookGap}>Book</Button>
            </div>
          )}
        </>
      )}
      {viewFile && <FileViewer name={viewFile.name} load={viewFile.load} onClose={() => setViewFile(null)} />}
    </Modal>
  );
}
