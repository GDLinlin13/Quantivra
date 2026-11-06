import { useState, useEffect } from 'react';
import { Modal, Table, Typography, Space, Button, Tag, Empty, message, Descriptions, Upload, Popconfirm } from 'antd';
import { PaperClipOutlined, FilePdfOutlined, UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import { docService, attachmentService, companyFileService, ATTACH_TYPES, type CompanyFile, type Attachment, type BankTxn, type JournalRow, type Payment, type Allocation } from '../../../../services/finance';
import { DOC_LABEL, isSalesDoc, type FinDocument } from '../../../../data/finance';
import { lineText } from '../../../../data/catalog';
import { money } from '../../../../data/documentLayouts';
import { renderPdf } from '../../../../utils/renderPdf';
import { DocumentView } from './DocumentView';
import type { FinanceData } from './DocList';

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
    return { title: [p.number || 'Payment', who, docs.join(', ')].filter(Boolean).join(' · '), accounts: control };
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
export function MatchDetails({ data, txn, look, accCur, onClose, onFilesChanged }: { data: FinanceData; txn: BankTxn; look: MatchLookup; accCur: string; onClose: () => void; onFilesChanged?: () => void }) {
  const acc = (id: number) => data.accounts.find(a => a.id === id);
  const M = (n: number) => money(n, data.currency);
  const label = matchLabel(txn, data, look);
  const payment = txn.payment_id ? look.payments.find(p => p.id === txn.payment_id) : undefined;
  const journal = txn.journal_id ? look.journals.find(j => j.id === txn.journal_id) : undefined;
  const allocs = payment ? look.allocations.filter(a => a.payment_id === payment.id) : [];
  const paidDocs = allocs.map(a => ({ alloc: a, doc: look.docs.find(d => d.id === a.document_id) })).filter(x => x.doc) as { alloc: Allocation; doc: FinDocument }[];
  const [files, setFiles] = useState<Record<number, Attachment[]>>({});
  const [busy, setBusy] = useState<number | null>(null);
  // supporting documents of a journal entry (e.g. the share capital agreement)
  const [support, setSupport] = useState<CompanyFile[]>([]);
  const loadSupport = () => { if (journal) companyFileService.list(data.companyId).then(fs => setSupport(fs.filter(f => f.journal_id === journal.id))).catch(() => null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadSupport, [journal?.id]);
  useEffect(() => {
    Promise.all(paidDocs.map(x => attachmentService.list(x.doc.id).then(fs => [x.doc.id, fs] as const)))
      .then(all => setFiles(Object.fromEntries(all))).catch(() => null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txn.id]);

  const openDoc = async (d: FinDocument) => {
    const w = window.open('', '_blank');
    setBusy(d.id);
    try {
      const { doc, lines } = await docService.get(d.id);
      const blob = await renderPdf(<DocumentView doc={doc} lines={lines.map(l => ({ ...l, description: lineText(l, data.items) }))}
        contact={data.contacts.find(c => c.id === doc.contact_id) || null} person={data.people.find(p => p.id === doc.contact_person_id) || null}
        company={data.company} branding={data.branding} settings={data.settings} domId="match-doc" />);
      if (w) w.location.href = URL.createObjectURL(blob);
    } catch (e: any) { w?.close(); message.error(e.message); }
    setBusy(null);
  };

  return (
    <Modal open onCancel={onClose} footer={null} width={760} title={label?.title || 'Details'}>
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
              { title: 'Debit', key: 'dr', align: 'right' as const, render: (_, l) => (Number(l.debit) ? M(Number(l.debit)) : '') },
              { title: 'Credit', key: 'cr', align: 'right' as const, render: (_, l) => (Number(l.credit) ? M(Number(l.credit)) : '') },
            ]} />
          <div style={{ marginTop: 16 }}>
            <Text strong>Supporting documents</Text>
            <Space orientation="vertical" size={4} style={{ display: 'flex', marginTop: 6 }}>
              {support.map(f => (
                <Space key={f.id} size={4}>
                  <PaperClipOutlined />
                  <a onClick={() => companyFileService.open(f.path).catch(e => message.error(e.message))}>{f.file_name}</a>
                  <Popconfirm title={`Remove ${f.file_name}?`} onConfirm={async () => { try { await companyFileService.remove(f); loadSupport(); onFilesChanged?.(); } catch (e: any) { message.error(e.message); } }}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ))}
              <Upload accept={ATTACH_TYPES} multiple showUploadList={false} beforeUpload={file => {
                companyFileService.add(data.companyId, file, { folder: 'journal', journal_id: journal.id, period: journal.journal_date.slice(0, 7) })
                  .then(() => { loadSupport(); onFilesChanged?.(); })
                  .catch(e => message.error(/journal_id|folder_check/i.test(e.message) ? 'Supporting documents need database update 033 — ask your administrator to run it in Supabase.' : e.message));
                return false;
              }}>
                <Button size="small" icon={<UploadOutlined />}>Attach file</Button>
              </Upload>
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
                { title: 'Date', key: 'd', render: (_, x) => x.doc.issue_date },
                { title: 'Total', key: 't', align: 'right' as const, render: (_, x) => money(x.doc.total, x.doc.currency) },
                { title: 'Paid here', key: 'p', align: 'right' as const, render: (_, x) => M(Number(x.alloc.amount)) },
                {
                  title: 'Files', key: 'f', render: (_, x) => (
                    <Space orientation="vertical" size={2}>
                      {isSalesDoc(x.doc.doc_type) && (
                        <Button size="small" type="link" icon={<FilePdfOutlined />} loading={busy === x.doc.id} onClick={() => openDoc(x.doc)} style={{ padding: 0 }}>
                          {x.doc.number}.pdf
                        </Button>
                      )}
                      {(files[x.doc.id] || []).map(f => (
                        <Button key={f.id} size="small" type="link" icon={<PaperClipOutlined />} style={{ padding: 0 }}
                          onClick={() => attachmentService.open(f).catch(e => message.error(e.message))}>{f.file_name}</Button>
                      ))}
                      {!isSalesDoc(x.doc.doc_type) && !(files[x.doc.id] || []).length && <Text type="secondary">No files attached</Text>}
                    </Space>
                  ),
                },
              ]} />
          )}
        </>
      )}
    </Modal>
  );
}
