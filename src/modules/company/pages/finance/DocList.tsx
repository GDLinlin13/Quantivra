import { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Input, Segmented, Modal, Form, InputNumber, DatePicker, Select, message, Statistic, Card, Typography, Empty, Dropdown } from 'antd';
import { PlusOutlined, PrinterOutlined, DownloadOutlined, DollarOutlined, SearchOutlined, MoreOutlined, FileDoneOutlined, CopyOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { docService, paymentService } from '../../../../services/finance';
import {
  balanceDue, isOverdue, today, DOC_LABEL, STATUS_LABEL, STATUS_COLOR, PAYMENT_METHODS,
  type DocType, type FinDocument, type Contact, type ContactPerson, type FinanceSettings, type Account,
} from '../../../../data/finance';
import { money } from '../../../../data/documentLayouts';
import type { Branding } from '../../../../services/branding';
import { lineText, type CatalogItem } from '../../../../data/catalog';
import { DocEditor } from './DocEditor';
import { DocumentView } from './DocumentView';
import { PRINT_CSS } from '../hr/PayslipView';
import { elementsToPdf, downloadBlob } from '../../../../utils/payslipFiles';

const { Text } = Typography;

export interface FinanceData {
  companyId: number; company: any; currency: string; branding: Branding | null; settings: FinanceSettings;
  contacts: Contact[]; people: ContactPerson[]; accounts: Account[]; docs: FinDocument[];
  employees: { id: number; full_name: string }[];
  items: CatalogItem[];
  reload: () => void;
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-');

/** A list of documents of one kind (invoices, quotations, bills…) with everything you do to them. */
export function DocList({ data, docType }: { data: FinanceData; docType: DocType }) {
  const { companyId, currency, contacts, people, accounts, settings, branding, company, docs, reload } = data;
  const sales = docType === 'quote' || docType === 'invoice' || docType === 'credit_note';
  const payable = docType === 'invoice' || docType === 'bill' || docType === 'expense';
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ id: number | null } | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [paying, setPaying] = useState<FinDocument | null>(null);

  const mine = docs.filter(d => d.doc_type === docType);
  const contactName = (id: number | null) => contacts.find(c => c.id === id)?.name || '—';
  const q = search.trim().toLowerCase();
  const shown = mine.filter(d => {
    if (q && ![d.number, contactName(d.contact_id), d.reference].some(v => (v || '').toLowerCase().includes(q))) return false;
    if (filter === 'unpaid') return ['sent', 'partial', 'approved'].includes(d.status);
    if (filter === 'overdue') return isOverdue(d);
    if (filter === 'all') return true;
    return d.status === filter;
  });
  const live = mine.filter(d => !['void', 'draft'].includes(d.status));
  const outstanding = live.reduce((s, d) => s + balanceDue(d), 0);
  const overdue = live.filter(d => isOverdue(d)).reduce((s, d) => s + balanceDue(d), 0);

  const filters = payable
    ? [{ value: 'all', label: 'All' }, { value: 'draft', label: 'Draft' }, { value: 'unpaid', label: 'Unpaid' }, { value: 'overdue', label: 'Overdue' }, { value: 'paid', label: 'Paid' }, { value: 'void', label: 'Void' }]
    : docType === 'quote'
      ? [{ value: 'all', label: 'All' }, { value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' }, { value: 'accepted', label: 'Accepted' }, { value: 'declined', label: 'Declined' }]
      : [{ value: 'all', label: 'All' }, { value: 'draft', label: 'Draft' }, { value: 'approved', label: 'Approved' }, { value: 'paid', label: 'Paid' }, { value: 'void', label: 'Void' }];

  const toInvoice = async (d: FinDocument) => {
    try {
      const id = await docService.quoteToInvoice(companyId, d.id, branding?.templates.invoice.paymentTermsDays ?? 30);
      message.success('Invoice created from the quotation — find it under Invoices');
      reload();
      return id;
    } catch (e: any) { message.error(e.message); }
  };
  const duplicate = async (d: FinDocument) => {
    try {
      const { doc, lines } = await docService.get(d.id);
      const id = await docService.save(companyId, { ...doc, id: undefined, number: undefined, status: 'draft', issue_date: today(), amount_paid: 0, source_id: null } as any,
        lines.map(l => ({ ...l, id: undefined })));
      message.success('Copied as a new draft');
      reload();
      setEditing({ id });
    } catch (e: any) { message.error(e.message); }
  };

  return (
    <div>
      {payable && (
        <Space size={24} style={{ marginBottom: 12 }} wrap>
          <Card size="small" style={{ minWidth: 200 }}><Statistic title={sales ? 'Customers owe' : docType === 'expense' ? 'Expenses not yet paid' : 'We owe suppliers'} value={money(outstanding, currency)} /></Card>
          <Card size="small" style={{ minWidth: 200 }}><Statistic title="Overdue" value={money(overdue, currency)} styles={{ content: { color: overdue > 0 ? '#ff7875' : undefined } }} /></Card>
        </Space>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <Space wrap>
          <Segmented value={filter} onChange={v => setFilter(String(v))} options={filters} />
          <Input allowClear prefix={<SearchOutlined />} placeholder="Search number, name, reference" style={{ width: 260 }} value={search} onChange={e => setSearch(e.target.value)} />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ id: null })}>New {DOC_LABEL[docType].toLowerCase()}</Button>
      </div>

      <Table rowKey="id" size="small" dataSource={shown} pagination={{ pageSize: 50, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No ${DOC_LABEL[docType].toLowerCase()}s yet`} /> }}
        columns={[
          { title: 'Number', dataIndex: 'number', render: (v: string, d) => <a onClick={() => setEditing({ id: d.id })}>{v}</a> },
          { title: 'Date', dataIndex: 'issue_date', sorter: (a, b) => a.issue_date.localeCompare(b.issue_date) },
          { title: sales ? 'Customer' : docType === 'expense' ? 'Paid to' : 'Supplier', key: 'c', render: (_, d) => contactName(d.contact_id) },
          ...(docType === 'expense' ? [{ title: 'Claimed by', key: 'e', render: (_: any, d: FinDocument) => data.employees.find(e => e.id === d.employee_id)?.full_name || '—' }] : []),
          ...(docType !== 'expense' ? [{ title: docType === 'quote' ? 'Valid until' : 'Due', key: 'due', render: (_: any, d: FinDocument) => d.due_date ? <span style={{ color: isOverdue(d) ? '#ff7875' : undefined }}>{d.due_date}</span> : '—' }] : []),
          { title: 'Total', key: 't', align: 'right' as const, render: (_, d) => money(d.total, d.currency), sorter: (a, b) => a.total - b.total },
          ...(payable ? [{ title: 'Balance', key: 'b', align: 'right' as const, render: (_: any, d: FinDocument) => d.status === 'void' ? '—' : money(balanceDue(d), d.currency) }] : []),
          { title: 'Status', key: 's', render: (_, d) => <Space size={4}><Tag color={STATUS_COLOR[d.status]}>{STATUS_LABEL[d.status]}</Tag>{isOverdue(d) && <Tag color="red">Overdue</Tag>}</Space> },
          {
            title: '', key: 'a', width: 200, render: (_, d) => (
              <Space size={4}>
                <Button size="small" icon={<PrinterOutlined />} onClick={() => setViewing(d.id)} disabled={!sales} title={sales ? 'View / print / download' : undefined} />
                {payable && d.status !== 'void' && d.status !== 'draft' && balanceDue(d) > 0 && (
                  <Button size="small" icon={<DollarOutlined />} onClick={() => setPaying(d)}>{sales ? 'Receive' : 'Pay'}</Button>
                )}
                {docType === 'quote' && !['declined', 'void'].includes(d.status) && (
                  <Button size="small" icon={<FileDoneOutlined />} onClick={() => toInvoice(d)}>Invoice</Button>
                )}
                <Dropdown trigger={['click']} menu={{
                  items: [
                    { key: 'copy', icon: <CopyOutlined />, label: 'Copy as new draft' },
                    ...(docType === 'quote' ? [{ key: 'accepted', label: 'Mark accepted' }, { key: 'declined', label: 'Mark declined' }] : []),
                    ...(d.status === 'draft' ? [{ key: sales ? 'sent' : 'approved', label: sales ? 'Mark as sent' : 'Approve' }] : []),
                    { type: 'divider' as const },
                    { key: 'delete', danger: true, label: 'Delete' },
                  ],
                  onClick: async ({ key }) => {
                    try {
                      if (key === 'copy') return duplicate(d);
                      if (key === 'delete') {
                        Modal.confirm({ title: `Delete ${d.number}?`, content: 'This can’t be undone. Void it instead to keep a record.', okButtonProps: { danger: true }, okText: 'Delete',
                          onOk: async () => { try { await docService.remove(d.id); message.success('Deleted'); reload(); } catch (e: any) { message.error(e.message); } } });
                        return;
                      }
                      await docService.setStatus(d.id, key); reload();
                    } catch (e: any) { message.error(e.message); }
                  },
                }}>
                  <Button size="small" icon={<MoreOutlined />} />
                </Dropdown>
              </Space>
            ),
          },
        ]} />

      {editing && (
        <DocEditor companyId={companyId} docType={docType} docId={editing.id} contacts={contacts} people={people} accounts={accounts} employees={data.employees} items={data.items}
          settings={settings} branding={branding} currency={currency}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
      {viewing && <ViewModal id={viewing} data={data} onClose={() => setViewing(null)} />}
      {paying && <PaymentModal data={data} doc={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); reload(); }} />}
      <Text type="secondary" style={{ fontSize: 12 }}>{shown.length} shown</Text>
    </div>
  );
}

/** Look at a document in the company's template; print it or download a PDF. */
function ViewModal({ id, data, onClose }: { id: number; data: FinanceData; onClose: () => void }) {
  const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof docService.get>> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { docService.get(id).then(setLoaded).catch(e => message.error(e.message)); }, [id]);
  const doc = loaded?.doc;
  const contact = data.contacts.find(c => c.id === doc?.contact_id) || null;
  const person = data.people.find(p => p.id === doc?.contact_person_id) || null;
  const fileName = doc ? `${DOC_LABEL[doc.doc_type]} ${safeName(doc.number)}${contact ? ` - ${safeName(contact.name)}` : ''}` : '';

  const print = () => {
    const el = document.getElementById('fin-doc-print');
    if (!el) return;
    const w = window.open('', '_blank', 'width=820,height=1000');
    if (!w) { message.error('Allow pop-ups to print'); return; }
    w.document.write(`<html><head><title>${fileName}</title><style>${PRINT_CSS}</style></head><body>${el.innerHTML}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };
  const download = async () => {
    const el = document.getElementById('fin-doc-print');
    if (!el) return;
    setBusy(true);
    try { downloadBlob(await elementsToPdf([el]), `${fileName}.pdf`); } catch (e: any) { message.error(e.message); }
    setBusy(false);
  };
  return (
    <Modal open onCancel={onClose} width={820} title={doc ? `${DOC_LABEL[doc.doc_type]} ${doc.number}` : 'Loading…'}
      footer={<Space><Button icon={<PrinterOutlined />} onClick={print} disabled={!loaded}>Print</Button>
        <Button type="primary" icon={<DownloadOutlined />} loading={busy} onClick={download} disabled={!loaded}>Download PDF</Button></Space>}>
      {loaded && doc && (
        <div style={{ width: 760, maxWidth: '100%' }}>
          <DocumentView doc={doc} lines={loaded.lines.map(l => ({ ...l, description: lineText(l, data.items) }))} contact={contact} person={person} company={data.company} branding={data.branding} settings={data.settings} />
        </div>
      )}
    </Modal>
  );
}

/** Record money received for an invoice (or paid for a bill). */
export function PaymentModal({ data, doc, onClose, onDone }: { data: FinanceData; doc: FinDocument; onClose: () => void; onDone: () => void }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const due = balanceDue(doc);
  const inbound = doc.doc_type === 'invoice';
  const cashAccounts = data.accounts.filter(a => !a.archived && (a.subtype === 'bank' || a.subtype === 'cash'));
  const submit = async () => {
    const v = await form.validateFields();
    if (v.amount > due + 0.005) { message.error(`That's more than the ${money(due, doc.currency)} still owed`); return; }
    setSaving(true);
    try {
      await paymentService.record(data.companyId, {
        direction: inbound ? 'in' : 'out', amount: v.amount, contact_id: doc.contact_id, payment_date: v.date.format('YYYY-MM-DD'),
        method: v.method, reference: v.reference, account_id: v.account_id,
      }, [{ document_id: doc.id, amount: v.amount }]);
      message.success(inbound ? 'Payment received recorded' : 'Payment recorded');
      onDone();
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };
  return (
    <Modal open onCancel={onClose} onOk={submit} confirmLoading={saving} okText="Record payment"
      title={`${inbound ? 'Receive payment for' : 'Pay'} ${doc.number}`}>
      <Text type="secondary">Still owed: <b>{money(due, doc.currency)}</b></Text>
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}
        initialValues={{ amount: due, date: dayjs(), method: 'Bank transfer', account_id: cashAccounts.find(a => a.subtype === 'bank')?.id }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}><InputNumber min={0.01} precision={2} style={{ width: '100%' }} prefix={doc.currency} /></Form.Item>
          <Form.Item name="date" label="Date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} allowClear={false} /></Form.Item>
          <Form.Item name="method" label="How"><Select options={PAYMENT_METHODS.map(m => ({ value: m, label: m }))} /></Form.Item>
          <Form.Item name="account_id" label={inbound ? 'Into' : 'From'}><Select allowClear options={cashAccounts.map(a => ({ value: a.id, label: a.name }))} /></Form.Item>
          <Form.Item name="reference" label="Reference" style={{ gridColumn: '1 / -1' }}><Input placeholder="e.g. bank transaction ID, cheque no." /></Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
