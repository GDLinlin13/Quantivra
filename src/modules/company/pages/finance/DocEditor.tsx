import { useState, useEffect, useMemo } from 'react';
import { Drawer, Form, Select, DatePicker, Input, InputNumber, Button, Space, Table, Divider, Typography, message, Switch, Popconfirm, Alert, Tag, Segmented, Upload } from 'antd';
import { PlusOutlined, DeleteOutlined, HolderOutlined, PaperClipOutlined, UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { docService, paymentService, catalogService, attachmentService, ATTACH_TYPES, type Attachment } from '../../../../services/finance';
import {
  docTotals, addDays, today, DOC_LABEL, STATUS_LABEL, STATUS_COLOR,
  type DocType, type FinDocument, type DocLine, type DocDiscount, type Contact, type ContactPerson, type FinanceSettings, type Account,
} from '../../../../data/finance';
import { money, paymentAccounts } from '../../../../data/documentLayouts';
import type { Branding } from '../../../../services/branding';
import { priceFor, type CatalogItem, type CustomerPrice } from '../../../../data/catalog';

const { Text } = Typography;

const blankLine = (rate: number): DocLine => ({ description: '', quantity: 1, unit_price: 0, discount_pct: 0, tax_rate: rate });

/** Create or edit a quotation, invoice, credit note, bill or expense. */
export function DocEditor({ companyId, docType: startType, docId, contacts, people, accounts, settings, branding, currency, employees = [], items = [], onClose, onSaved }: {
  companyId: number; docType: DocType; docId?: number | null;
  contacts: Contact[]; people: ContactPerson[]; accounts: Account[]; settings: FinanceSettings; branding: Branding | null; currency: string;
  employees?: { id: number; full_name: string }[];
  items?: CatalogItem[];
  onClose: () => void; onSaved: (id: number) => void;
}) {
  // a purchase can switch between a bill (pay later) and an expense (already paid / staff claim) until it's saved
  const [docType, setDocType] = useState<DocType>(startType);
  const sales = docType === 'quote' || docType === 'invoice' || docType === 'credit_note';
  const gstRate = settings.gstRegistered ? Number(settings.gstRate) || 0 : 0;
  const [doc, setDoc] = useState<Partial<FinDocument>>({});
  const [lines, setLines] = useState<DocLine[]>([blankLine(gstRate)]);
  const [discounts, setDiscounts] = useState<DocDiscount[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!docId);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const loadFiles = () => { if (docId) attachmentService.list(docId).then(setFiles).catch(() => setFiles([])); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadFiles, [docId]);

  useEffect(() => {
    if (docId) {
      docService.get(docId).then(({ doc: d, lines: ls }) => {
        setDoc(d); setDocType(d.doc_type); setLines(ls.length ? ls.map(l => ({ ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price), discount_pct: Number(l.discount_pct), tax_rate: Number(l.tax_rate) })) : [blankLine(gstRate)]);
        setDiscounts(d.discounts || []); setLoading(false);
      }).catch(e => { message.error(e.message); onClose(); });
    } else {
      const issue = today();
      const days = docType === 'quote' ? (settings.quoteValidityDays ?? 30) : (branding?.templates.invoice.paymentTermsDays ?? 30);
      setDoc({ doc_type: docType, status: 'draft', issue_date: issue, due_date: docType === 'expense' ? null : addDays(issue, days), currency, tax_inclusive: false, terms: sales ? settings.invoiceTerms || '' : '' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const set = (patch: Partial<FinDocument>) => setDoc(d => ({ ...d, ...patch }));
  const setLine = (i: number, patch: Partial<DocLine>) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const t = useMemo(() => docTotals(lines, discounts, !!doc.tax_inclusive), [lines, discounts, doc.tax_inclusive]);
  const M = (n: number) => money(n, doc.currency || currency);

  const contactList = contacts.filter(c => !c.archived && (sales ? c.is_customer : c.is_supplier) || c.id === doc.contact_id);
  const contactPeople = people.filter(p => p.contact_id === doc.contact_id);
  // What a line can be booked to: income for sales; for purchases, expenses plus the few asset accounts you can
  // buy into (prepayments, equipment) — never bank / cash / receivables, and not the payroll accounts payroll books itself.
  const AUTO = ['bank', 'cash', 'receivable', 'payroll', 'payroll_director', 'payroll_employer', 'payroll_employer_other'];
  const lineAccounts = accounts.filter(a => !a.archived && !AUTO.includes(a.subtype || '')
    && (sales ? a.type === 'income' : a.type === 'expense' || a.type === 'asset'));
  const accountOptions = sales
    ? lineAccounts.map(a => ({ value: a.id, label: `${a.code} ${a.name}` }))
    : [
      { label: 'Expenses', options: lineAccounts.filter(a => a.type === 'expense').map(a => ({ value: a.id, label: `${a.code} ${a.name}` })) },
      { label: 'Things you own (assets)', options: lineAccounts.filter(a => a.type === 'asset').map(a => ({ value: a.id, label: `${a.code} ${a.name}` })) },
    ];
  // special prices for particular customers (Catalog → item → Customer prices)
  const [custPrices, setCustPrices] = useState<CustomerPrice[]>([]);
  useEffect(() => { if (sales) catalogService.prices(companyId).then(setCustPrices).catch(() => null); }, [companyId, sales]);
  // sales documents offer what we sell, purchases what we buy (plus anything already on the lines)
  const catalog = items.filter(it => lines.some(l => l.item_id === it.id)
    || (!it.archived && (it.used_for || 'both') !== (sales ? 'purchases' : 'sales')));
  const pickItem = (i: number, id: number | null) => {
    const it = items.find(x => x.id === id);
    if (!it) { setLine(i, { item_id: null }); return; }
    setLine(i, {
      item_id: it.id, description: it.description || '', // the name prints first; Description is anything extra
      unit_price: sales ? priceFor(it, doc.contact_id, custPrices) : Number(it.purchase_price) || 0,
      tax_rate: settings.gstRegistered ? (it.tax_rate == null ? gstRate : Number(it.tax_rate)) : 0,
      account_id: (sales ? it.income_account_id : it.expense_account_id) || null,
    });
  };
  const payFrom = accounts.filter(a => !a.archived && (a.subtype === 'bank' || a.subtype === 'cash'));
  const banks = paymentAccounts(branding?.templates.invoice);

  const pickContact = (id: number) => {
    const c = contacts.find(x => x.id === id);
    const main = people.filter(p => p.contact_id === id).sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary))[0];
    const patch: Partial<FinDocument> = { contact_id: id, contact_person_id: main?.id ?? null };
    if (c?.payment_terms_days != null && docType !== 'quote' && doc.issue_date) patch.due_date = addDays(doc.issue_date, c.payment_terms_days);
    set(patch);
    // catalog lines still at the previous customer's price move to this customer's price
    if (sales) {
      let changed = 0;
      setLines(ls => ls.map(l => {
        const it = l.item_id ? items.find(x => x.id === l.item_id) : undefined;
        if (!it || Math.abs(Number(l.unit_price) - priceFor(it, doc.contact_id, custPrices)) > 0.005) return l;
        const p = priceFor(it, id, custPrices);
        if (Math.abs(p - Number(l.unit_price)) > 0.005) changed++;
        return { ...l, unit_price: p };
      }));
      setTimeout(() => { if (changed) message.info(`Prices updated to ${c?.name || 'this customer'}'s prices`); });
    }
  };

  const save = async (status?: string) => {
    if (docType !== 'expense' && !doc.contact_id) { message.error(sales ? 'Choose a customer' : 'Choose a supplier'); return; }
    if (!lines.some(l => (l.description || '').trim() || l.item_id || Number(l.unit_price))) { message.error('Add at least one line'); return; }
    setSaving(true);
    try {
      const id = await docService.save(companyId, { ...doc, doc_type: docType, discounts, ...(status ? { status: status as any } : {}) } as any, lines);
      // An expense paid on the spot (from a bank / cash account) is recorded as paid straight away.
      if (docType === 'expense' && doc.paid_from_account_id && (status === 'approved' || doc.status === 'approved')) {
        const { doc: fresh } = await docService.get(id);
        const owed = Math.round(((Number(fresh.total) || 0) - (Number(fresh.amount_paid) || 0)) * 100) / 100;
        if (owed > 0) {
          await paymentService.record(companyId, {
            direction: 'out', amount: owed, contact_id: fresh.contact_id, payment_date: fresh.issue_date,
            method: 'Paid on the spot', account_id: doc.paid_from_account_id,
          }, [{ document_id: id, amount: owed }]);
        }
      }
      // files picked before the first save are uploaded now
      for (const f of pendingFiles) { try { await attachmentService.add(companyId, id, f); } catch (e: any) { message.error(e.message); } }
      message.success(`${DOC_LABEL[docType]} saved`);
      onSaved(id);
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };

  const dateLabel = docType === 'quote' ? 'Valid until' : docType === 'expense' ? 'Paid on' : 'Due date';
  const issued = doc.status && doc.status !== 'draft';
  return (
    <Drawer open onClose={onClose} size={1000} loading={loading}
      title={<Space>{docId ? `${DOC_LABEL[docType]} ${doc.number || ''}` : `New ${DOC_LABEL[docType].toLowerCase()}`}{doc.status && <Tag color={STATUS_COLOR[doc.status]}>{STATUS_LABEL[doc.status]}</Tag>}</Space>}
      extra={
        <Space>
          {(!issued || doc.status === 'void') && <Button loading={saving} onClick={() => save()}>Save draft</Button>}
          {!issued && (
            <Button type="primary" loading={saving} onClick={() => save(sales ? 'sent' : 'approved')}>
              {sales ? 'Save & mark as sent' : 'Save & approve'}
            </Button>
          )}
          {issued && doc.status !== 'void' && <Button type="primary" loading={saving} onClick={() => save()}>Save changes</Button>}
        </Space>
      }>
      {Number(doc.amount_paid) > 0 && <Alert type="info" showIcon style={{ marginBottom: 12 }} title={`${M(Number(doc.amount_paid))} has been paid on this ${DOC_LABEL[docType].toLowerCase()}.`} />}
      {!sales && !docId && (
        <Segmented style={{ marginBottom: 12 }} value={docType} onChange={v => {
          const t = v as DocType;
          setDocType(t);
          const c = contacts.find(x => x.id === doc.contact_id);
          const days = c?.payment_terms_days ?? (branding?.templates.invoice.paymentTermsDays ?? 30);
          set(t === 'expense' ? { due_date: null } : { due_date: doc.issue_date ? addDays(doc.issue_date, days) : null, paid_from_account_id: null, employee_id: null });
        }} options={[{ value: 'bill', label: 'To pay later' }, { value: 'expense', label: 'Already paid' }]} />
      )}
      <Form layout="vertical">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr', gap: 12 }}>
          <Form.Item label={sales ? 'Customer' : 'Supplier'} required={docType !== 'expense'}>
            <Select showSearch optionFilterProp="label" value={doc.contact_id ?? undefined} onChange={pickContact} allowClear={docType === 'expense'}
              options={contactList.map(c => ({ value: c.id, label: c.name }))} placeholder={sales ? 'Choose a customer' : 'Choose a supplier'}
              notFoundContent={`No ${sales ? 'customers' : 'suppliers'} yet — add them in CRM → Customers & Suppliers`} />
          </Form.Item>
          <Form.Item label="Person in charge">
            <Select allowClear value={doc.contact_person_id ?? undefined} onChange={v => set({ contact_person_id: v ?? null })}
              options={contactPeople.map(p => ({ value: p.id, label: p.name + (p.designation ? ` (${p.designation})` : '') }))} />
          </Form.Item>
          <Form.Item label={docType === 'bill' ? 'Bill date' : 'Date'}>
            <DatePicker style={{ width: '100%' }} allowClear={false} value={doc.issue_date ? dayjs(doc.issue_date) : null}
              onChange={d => {
                // the due date follows the date: customer's payment terms, else the default terms (quotations: validity)
                const issue = d ? d.format('YYYY-MM-DD') : today();
                const c = contacts.find(x => x.id === doc.contact_id);
                const days = docType === 'quote' ? (settings.quoteValidityDays ?? 30)
                  : c?.payment_terms_days != null ? c.payment_terms_days : (branding?.templates.invoice.paymentTermsDays ?? 30);
                set({ issue_date: issue, ...(docType === 'expense' ? {} : { due_date: addDays(issue, days) }) });
              }} />
          </Form.Item>
          {docType !== 'expense' ? (
            <Form.Item label={dateLabel}>
              <DatePicker style={{ width: '100%' }} value={doc.due_date ? dayjs(doc.due_date) : null} onChange={d => set({ due_date: d ? d.format('YYYY-MM-DD') : null })} />
            </Form.Item>
          ) : (
            <Form.Item label="Paid from">
              <Select allowClear value={doc.paid_from_account_id ?? undefined} onChange={v => set({ paid_from_account_id: v ?? null })}
                options={payFrom.map(a => ({ value: a.id, label: a.name }))} placeholder="Not paid yet" />
            </Form.Item>
          )}
          <Form.Item label={sales ? 'Reference / PO no.' : 'Invoice no.'}>
            <Input value={doc.reference || ''} onChange={e => set({ reference: e.target.value })} />
          </Form.Item>
        </div>
        {docId && doc.number && <Text type="secondary" style={{ display: 'block', marginTop: -8, marginBottom: 8 }}>Number {doc.number}</Text>}
      </Form>

      <Table rowKey="_row" size="small" pagination={false} dataSource={lines.map((l, i) => ({ ...l, _row: i }))}
        columns={[
          { title: '', width: 24, render: () => <HolderOutlined style={{ color: '#666' }} /> },
          ...(catalog.length ? [{ title: 'Item', width: 190, render: (_: any, l: DocLine, i: number) => (
            <Select style={{ width: '100%' }} allowClear showSearch optionFilterProp="label" value={l.item_id ?? undefined} placeholder="From the catalog"
              onChange={v => pickItem(i, v ?? null)}
              options={catalog.map(it => ({ value: it.id, label: `${it.code ? `${it.code} · ` : ''}${it.name}` }))} />
          ) }] : []),
          { title: 'Description', render: (_, l, i) => <Input.TextArea autoSize={{ minRows: 1, maxRows: 6 }} value={l.description} onChange={e => setLine(i, { description: e.target.value })} /> },
          ...(lineAccounts.length && !sales ? [{ title: 'Account', width: 180, render: (_: any, l: DocLine, i: number) => (
            <Select style={{ width: '100%' }} showSearch optionFilterProp="label" value={l.account_id ?? undefined} onChange={v => setLine(i, { account_id: v })}
              options={accountOptions as any} placeholder="General expenses" />
          ) }] : []),
          { title: 'Qty', width: 80, render: (_, l, i) => <InputNumber style={{ width: '100%' }} value={l.quantity} onChange={v => setLine(i, { quantity: Number(v) || 0 })} /> },
          { title: 'Unit price', width: 120, render: (_, l, i) => <InputNumber style={{ width: '100%' }} precision={2} value={l.unit_price} onChange={v => setLine(i, { unit_price: Number(v) || 0 })} /> },
          { title: 'Disc %', width: 80, render: (_, l, i) => <InputNumber style={{ width: '100%' }} min={0} max={100} value={l.discount_pct} onChange={v => setLine(i, { discount_pct: Number(v) || 0 })} /> },
          ...(settings.gstRegistered ? [{ title: 'GST %', width: 90, render: (_: any, l: DocLine, i: number) => (
            <Select style={{ width: '100%' }} value={Number(l.tax_rate)} onChange={v => setLine(i, { tax_rate: v })}
              options={[...new Set([0, gstRate, Number(l.tax_rate)])].map(r => ({ value: r, label: `${r}%` }))} />
          ) }] : []),
          { title: 'Amount', width: 120, align: 'right' as const, render: (_, __, i) => M(t.lines[i] || 0) },
          { title: '', width: 40, render: (_, __, i) => <Button size="small" icon={<DeleteOutlined />} onClick={() => setLines(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : [blankLine(gstRate)])} /> },
        ]} />
      <Button size="small" icon={<PlusOutlined />} style={{ marginTop: 8 }} onClick={() => setLines(ls => [...ls, blankLine(gstRate)])}>Add a line</Button>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 24, marginTop: 16 }}>
        <div>
          <Divider titlePlacement="start" style={{ marginTop: 0 }}>Discounts</Divider>
          {discounts.map((d, i) => (
            <Space key={i} style={{ marginBottom: 6 }} wrap>
              <Input style={{ width: 220 }} placeholder="e.g. Loyalty discount" value={d.name} onChange={e => setDiscounts(ds => ds.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Select style={{ width: 90 }} value={d.kind} onChange={v => setDiscounts(ds => ds.map((x, j) => (j === i ? { ...x, kind: v } : x)))}
                options={[{ value: 'percent', label: '%' }, { value: 'amount', label: doc.currency || currency }]} />
              <InputNumber style={{ width: 110 }} min={0} value={d.value} onChange={v => setDiscounts(ds => ds.map((x, j) => (j === i ? { ...x, value: Number(v) || 0 } : x)))} />
              <Button icon={<DeleteOutlined />} onClick={() => setDiscounts(ds => ds.filter((_, j) => j !== i))} />
            </Space>
          ))}
          <div><Button size="small" icon={<PlusOutlined />} onClick={() => setDiscounts(ds => [...ds, { name: '', kind: 'percent', value: 0 }])}>Add a discount</Button></div>

          <Form layout="vertical" style={{ marginTop: 16 }}>
            {sales && banks.length > 1 && docType !== 'quote' && (
              <Form.Item label="Payment details to show">
                <Select value={doc.payment_account_index ?? banks.findIndex(b => b.isDefault)} onChange={v => set({ payment_account_index: v })}
                  options={banks.map((b, i) => ({ value: i, label: b.title || `Bank ${i + 1}` }))} />
              </Form.Item>
            )}
            {docType === 'expense' && (
              <Form.Item label="Claimed by (staff member who paid)">
                <Select allowClear showSearch optionFilterProp="label" value={doc.employee_id ?? undefined} onChange={v => set({ employee_id: v ?? null })}
                  options={employees.map(e => ({ value: e.id, label: e.full_name }))} placeholder="Nobody — the company paid" />
              </Form.Item>
            )}
            <Form.Item label="Notes"><Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} value={doc.notes || ''} onChange={e => set({ notes: e.target.value })} /></Form.Item>
            <Form.Item label="Attachments">
              <Space orientation="vertical" size={4} style={{ width: "100%" }}>
                {files.map(f => (
                  <Space key={f.id} size={4}>
                    <PaperClipOutlined />
                    <a onClick={() => attachmentService.open(f).catch(e => message.error(e.message))}>{f.file_name}</a>
                    <Popconfirm title={`Remove ${f.file_name}?`} onConfirm={async () => { try { await attachmentService.remove(f); loadFiles(); } catch (e: any) { message.error(e.message); } }}>
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                ))}
                {pendingFiles.map((f, i) => (
                  <Space key={`p${i}`} size={4}>
                    <PaperClipOutlined /><span>{f.name}</span>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => setPendingFiles(ps => ps.filter((_, j) => j !== i))} />
                  </Space>
                ))}
                <Upload accept={ATTACH_TYPES} multiple showUploadList={false} beforeUpload={file => {
                  if (docId) {
                    attachmentService.add(companyId, docId, file).then(loadFiles).catch(e => message.error(e.message));
                  } else setPendingFiles(ps => [...ps, file]);
                  return false;
                }}>
                  <Button size="small" icon={<UploadOutlined />}>Attach file (PDF or picture)</Button>
                </Upload>
              </Space>
            </Form.Item>
            {sales && <Form.Item label="Terms"><Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} value={doc.terms || ''} onChange={e => set({ terms: e.target.value })} /></Form.Item>}
          </Form>
        </div>
        <div>
          <table style={{ width: '100%', fontSize: 14 }}>
            <tbody>
              <tr><td>Subtotal</td><td style={{ textAlign: 'right' }}>{M(t.subtotal)}</td></tr>
              {discounts.map((d, i) => t.discounts[i] > 0 && <tr key={i}><td style={{ color: '#73d13d' }}>{d.name || 'Discount'}{d.kind === 'percent' ? ` (${d.value}%)` : ''}</td><td style={{ textAlign: 'right', color: '#73d13d' }}>-{M(t.discounts[i])}</td></tr>)}
              {settings.gstRegistered && <tr><td>GST{doc.tax_inclusive ? ' (included)' : ''}</td><td style={{ textAlign: 'right' }}>{M(t.tax_total)}</td></tr>}
              <tr><td style={{ fontWeight: 700, fontSize: 16, borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 6 }}>Total</td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 16, borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 6 }}>{M(t.total)}</td></tr>
            </tbody>
          </table>
          {settings.gstRegistered && (
            <Space style={{ marginTop: 10 }}>
              <Switch size="small" checked={!!doc.tax_inclusive} onChange={v => set({ tax_inclusive: v })} />
              <Text type="secondary">Prices already include GST</Text>
            </Space>
          )}
        </div>
      </div>
      {docId && doc.status === 'void' && <Alert type="warning" showIcon style={{ marginTop: 16 }} title="This document is void. Saving it as a draft brings it back." />}
      {docId && !['void', 'paid'].includes(doc.status || '') && (
        <div style={{ marginTop: 24 }}>
          <Popconfirm title={`Void this ${DOC_LABEL[docType].toLowerCase()}?`} description="It stays on record but no longer counts."
            onConfirm={async () => { await docService.setStatus(docId, 'void'); message.success('Voided'); onSaved(docId); }}>
            <Button danger>Void</Button>
          </Popconfirm>
        </div>
      )}
    </Drawer>
  );
}
