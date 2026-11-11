import { useState, useEffect, useMemo } from 'react';
import { Table, Button, Space, Modal, Select, DatePicker, Segmented, Tag, Empty, Typography, message, Input } from 'antd';
import { PrinterOutlined, DownloadOutlined, FileTextOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { paymentService } from '../../../../services/finance';
import { today, type Contact, type ContactPerson, type FinanceSettings } from '../../../../data/finance';
import { companyFields, money as fmtMoney, pickPaymentAccount } from '../../../../data/documentLayouts';
import { buildStatement, statementCurrencies, customersOwing, type Soa, type SoaPayment, type SoaAllocation } from '../../../../data/soa';
import type { Branding } from '../../../../services/branding';
import { DocumentShell } from '../../../../components/DocumentShell';
import { GridDocument, CellValue } from '../../../../components/GridDocument';
import type { FieldValues, ListValues } from '../../../../utils/gridTemplate';
import { A4_MODAL } from '../../../../utils/renderPdf';
import { elementsToPdf, downloadBlob, formatDocFileName } from '../../../../utils/payslipFiles';
import { PRINT_CSS } from '../hr/PayslipView';
import type { FinanceData } from './DocList';
import { fmtDate } from '../../../../utils/dateFormat';

const { Text } = Typography;
export const DEFAULT_STATEMENT_FILE_NAME = 'Statement of account - {customer} - {date}';
const KIND_LABEL = { invoice: 'Invoice', credit_note: 'Credit note', payment: 'Payment' } as const;

/** Fields and lists for the statement template, from a real statement. */
export function statementData(s: Soa, contact: Contact | null, person: ContactPerson | null, company: any, branding: Branding | null, settings: FinanceSettings) {
  const tpl = branding?.templates.soa;
  const inv = branding?.templates.invoice;
  const M = (n: number) => fmtMoney(n, s.currency, tpl?.amountFormat);
  const bank = pickPaymentAccount(inv, null);
  const payRows = (bank?.lines || []).filter(r => (r.value || '').trim());
  const longDate = (d: string) => fmtDate(d);
  const fields: FieldValues = {
    ...companyFields(company, branding, tpl?.footerNote),
    currency: s.currency,
    document_title: 'STATEMENT OF ACCOUNT', company_gst_no: settings.gstRegistered ? (settings.gstNumber || '') : '',
    statement_date: fmtDate(s.to), period_from: fmtDate(s.from), period_to: fmtDate(s.to),
    period: s.from ? `${longDate(s.from)} to ${longDate(s.to)}` : `All items up to ${longDate(s.to)}`,
    customer_name: contact?.name || '', customer_address: contact?.address || '',
    customer_contact: person?.name || '', customer_phone: person?.phone || contact?.phone || '', customer_email: person?.email || contact?.email || '',
    opening_balance: M(s.opening), total_charges: M(s.charges), total_credits: M(s.credits), closing_balance: M(s.closing), overdue_amount: M(s.overdue),
    age_current: M(s.ageing.current), age_1_30: M(s.ageing.d1_30), age_31_60: M(s.ageing.d31_60), age_61_90: M(s.ageing.d61_90), age_90_plus: M(s.ageing.d90plus),
    notes: '',
    bank_details: payRows.length ? payRows.map(r => `${r.label} ${r.value}`).join('\n') : (inv?.bankDetails || ''),
    payment_account: bank?.title || '',
  };
  const lists: ListValues = {
    rows: s.rows.map(r => ({
      date: fmtDate(r.date), type: KIND_LABEL[r.kind], number: r.number, reference: r.reference,
      description: [r.description || '', r.kind === 'invoice' && r.reference ? `Ref ${r.reference}` : ''].filter(Boolean).join(' · '),
      debit: r.debit ? M(r.debit) : '', credit: r.credit ? M(r.credit) : '', balance: M(r.balance),
    })),
    payment: payRows.map(r => ({ label: r.label, value: r.value })),
  };
  return { fields, lists, M, payRows };
}

/** One customer's statement in the company's Statement Template, ready to print or turn into a PDF. */
export function StatementView({ soa, contact, person, company, branding, settings, domId = 'fin-soa-print' }: {
  soa: Soa; contact: Contact | null; person: ContactPerson | null; company: any; branding: Branding | null; settings: FinanceSettings; domId?: string;
}) {
  const tpl = branding?.templates.soa;
  const { fields, lists, M, payRows } = statementData(soa, contact, person, company, branding, settings);

  if (tpl?.layout?.enabled) {
    return (
      <div id={domId} style={{ background: '#fff', borderRadius: 8, padding: 24 }}>
        <GridDocument template={tpl.layout} fields={fields} lists={lists} logo={branding?.logo_data_uri} />
      </div>
    );
  }
  const td = { padding: '4px 6px', borderBottom: '1px solid #eee' } as const;
  const right = { ...td, textAlign: 'right' as const, whiteSpace: 'nowrap' as const };
  const nowrap = { ...td, whiteSpace: 'nowrap' as const };
  const sum = (label: string, value: string, bold = false, color?: string) => (
    <tr><td colSpan={6} style={{ textAlign: 'right', padding: '3px 6px', fontWeight: bold ? 700 : 400, color }}>{label}</td>
      <td style={{ textAlign: 'right', padding: '3px 6px', fontWeight: bold ? 700 : 400, color, whiteSpace: 'nowrap' }}><CellValue text={value} /></td></tr>
  );
  const age = [['Not yet due', soa.ageing.current], ['1–30 days', soa.ageing.d1_30], ['31–60 days', soa.ageing.d31_60], ['61–90 days', soa.ageing.d61_90], ['Over 90 days', soa.ageing.d90plus]] as const;
  return (
    <div id={domId} style={{ background: '#fff', borderRadius: 8, padding: 24 }}>
      <DocumentShell country={company?.country} branding={branding} companyName={company?.name || ''} forPrint title="STATEMENT OF ACCOUNT"
        meta={<>As at {soa.to}<br />{fields.period}</>}
        showLogo={tpl?.showLogo ?? true} showCompanyBlock={tpl?.showCompanyBlock ?? true} footerNote={tpl?.footerNote}>
        <div style={{ fontSize: 13, color: '#111', marginBottom: 12, whiteSpace: 'pre-line' }}>
          <div style={{ color: '#666', fontSize: 12 }}>Statement for</div>
          <b>{fields.customer_name}</b>{fields.customer_address ? `\n${fields.customer_address}` : ''}
          {fields.customer_contact && <div style={{ fontSize: 12, marginTop: 2 }}>Attn: {fields.customer_contact}</div>}
        </div>
        <table style={{ width: '100%', fontSize: 12.5, color: '#111', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f2f2f2' }}>
              <th style={{ ...td, textAlign: 'left' }}>Date</th><th style={{ ...td, textAlign: 'left' }}>Type</th><th style={{ ...td, textAlign: 'left' }}>Number</th>
              <th style={{ ...td, textAlign: 'left' }}>Description</th><th style={right}>Charges</th><th style={right}>Credits</th><th style={right}>Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={6} style={{ ...td, fontStyle: 'italic' }}>Balance brought forward</td><td style={right}><CellValue text={M(soa.opening)} /></td></tr>
            {lists.rows.map((r, i) => (
              <tr key={i}>
                <td style={nowrap}>{fmtDate(r.date)}</td><td style={nowrap}>{r.type}</td><td style={nowrap}>{r.number}</td><td style={{ ...td, whiteSpace: 'pre-line', fontSize: 12 }}>{r.description}</td>
                <td style={right}>{r.debit ? <CellValue text={r.debit} /> : ''}</td><td style={right}>{r.credit ? <CellValue text={r.credit} /> : ''}</td>
                <td style={right}><CellValue text={r.balance} /></td>
              </tr>
            ))}
            {sum('Total charges', M(soa.charges))}
            {sum('Total credits', M(-soa.credits))}
            {sum('Amount due', M(soa.closing), true, branding?.accent_color || undefined)}
          </tbody>
        </table>
        <div style={{ marginTop: 16, fontSize: 12, color: '#111' }}>
          <b>Ageing</b>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
            <thead><tr>{age.map(([l]) => <th key={l} style={{ ...td, textAlign: 'left', color: '#666', fontWeight: 400, fontSize: 11 }}>{l}</th>)}<th style={{ ...right, color: '#666', fontWeight: 400, fontSize: 11 }}>Overdue</th></tr></thead>
            <tbody><tr>{age.map(([l, v]) => <td key={l} style={td}><CellValue text={M(v)} /></td>)}<td style={{ ...right, fontWeight: 700 }}><CellValue text={M(soa.overdue)} /></td></tr></tbody>
          </table>
        </div>
        {(payRows.length > 0 || branding?.templates.invoice.bankDetails) && (
          <div style={{ fontSize: 12, color: '#444', marginTop: 14 }}>
            <b>Payment details</b>
            {payRows.length ? (
              <table style={{ borderCollapse: 'collapse', marginTop: 4 }}><tbody>
                {payRows.map((r, i) => <tr key={i}><td style={{ paddingRight: 24, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{r.label}</td><td style={{ whiteSpace: 'pre-line' }}>{r.value}</td></tr>)}
              </tbody></table>
            ) : <div style={{ whiteSpace: 'pre-line' }}>{branding?.templates.invoice.bankDetails}</div>}
          </div>
        )}
      </DocumentShell>
    </div>
  );
}

/** Look at one customer's statement; choose the date, the period and the currency; print it or download a PDF. */
function StatementModal({ data, contactId, currency, payments, allocations, onClose }: {
  data: FinanceData; contactId: number; currency: string; payments: SoaPayment[]; allocations: SoaAllocation[]; onClose: () => void;
}) {
  const { docs, contacts, people, company, branding, settings } = data;
  const contact = contacts.find(c => c.id === contactId) || null;
  const person = people.filter(p => p.contact_id === contactId).sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary))[0] || null;
  const currencies = useMemo(() => statementCurrencies(contactId, docs, data.currency), [contactId, docs, data.currency]);
  const [cur, setCur] = useState(currency);
  const [to, setTo] = useState<Dayjs>(dayjs());
  const [from, setFrom] = useState<Dayjs | null>(null);
  const [busy, setBusy] = useState(false);
  const soa = useMemo(() => buildStatement({ contactId, currency: cur, from: from ? from.format('YYYY-MM-DD') : null, to: to.format('YYYY-MM-DD'), docs, payments, allocations }),
    [contactId, cur, from, to, docs, payments, allocations]);
  const fileName = formatDocFileName(branding?.templates.soa.fileName || DEFAULT_STATEMENT_FILE_NAME, {
    type: 'Statement of account', number: '', customer: contact?.name, reference: '', date: soa.to, company: branding?.legal_name || company?.name,
  }).replace(/\.pdf$/, '');

  const print = () => {
    const el = document.getElementById('fin-soa-print');
    if (!el) return;
    const w = window.open('', '_blank', 'width=820,height=1000');
    if (!w) { message.error('Allow pop-ups to print'); return; }
    w.document.write(`<html><head><title>${fileName}</title><style>${PRINT_CSS}</style></head><body>${el.innerHTML}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };
  const download = async () => {
    const el = document.getElementById('fin-soa-print');
    if (!el) return;
    setBusy(true);
    try { downloadBlob(await elementsToPdf([el]), `${fileName}.pdf`); } catch (e: any) { message.error(e.message); }
    setBusy(false);
  };
  const month = (m: number) => { const d = dayjs().subtract(m, 'month'); setFrom(d.startOf('month')); setTo(m === 0 ? dayjs() : d.endOf('month')); };

  return (
    <Modal open onCancel={onClose} width={A4_MODAL} title={`Statement of account — ${contact?.name || ''}`}
      footer={<Space><Button icon={<PrinterOutlined />} onClick={print}>Print</Button>
        <Button type="primary" icon={<DownloadOutlined />} loading={busy} onClick={download}>Download PDF</Button></Space>}>
      <Space wrap style={{ marginBottom: 12 }}>
        {currencies.length > 1 && <Select style={{ width: 90 }} value={cur} onChange={setCur} options={currencies.map(c => ({ value: c, label: c }))} />}
        <Segmented value={from ? 'period' : 'all'} onChange={v => (v === 'all' ? setFrom(null) : month(0))}
          options={[{ value: 'all', label: 'Everything' }, { value: 'period', label: 'A period' }]} />
        {from && <DatePicker value={from} allowClear={false} onChange={v => v && setFrom(v)} placeholder="From" />}
        <DatePicker value={to} allowClear={false} onChange={v => v && setTo(v)} placeholder="Statement date" />
        {from && <><Button size="small" onClick={() => month(0)}>This month</Button><Button size="small" onClick={() => month(1)}>Last month</Button></>}
      </Space>
      <div style={{ width: 760, maxWidth: '100%' }}>
        <StatementView soa={soa} contact={contact} person={person} company={company} branding={branding} settings={settings} />
      </div>
    </Modal>
  );
}

/** Finance → Receivables → Statements: who owes what, and a statement for each customer. */
export function Statements({ data }: { data: FinanceData }) {
  const { companyId, docs, contacts, currency } = data;
  const [payments, setPayments] = useState<SoaPayment[]>([]);
  const [allocations, setAllocations] = useState<SoaAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<{ contactId: number; currency: string } | null>(null);
  const [search, setSearch] = useState('');
  const [all, setAll] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [p, a] = await Promise.all([paymentService.list(companyId, 'in'), paymentService.allocations(companyId)]);
        if (live) { setPayments(p as any); setAllocations(a as any); }
      } catch (e: any) { message.error(e.message); }
      if (live) setLoading(false);
    })();
    return () => { live = false; };
  }, [companyId, docs]);

  const asAt = today();
  const owing = useMemo(() => customersOwing(docs, payments, allocations, asAt), [docs, payments, allocations, asAt]);
  const customers = contacts.filter(c => c.is_customer && !c.archived);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = all
      ? customers.flatMap(c => {
          const cs = statementCurrencies(c.id, docs, currency);
          return cs.map(cu => owing.find(o => o.contactId === c.id && o.currency === cu) || { contactId: c.id, currency: cu, closing: 0, overdue: 0 });
        })
      : owing;
    return list.filter(r => !q || (contacts.find(c => c.id === r.contactId)?.name || '').toLowerCase().includes(q))
      .sort((a, b) => b.overdue - a.overdue || b.closing - a.closing);
  }, [all, owing, customers, docs, currency, contacts, search]);

  return (
    <div>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input allowClear placeholder="Search customers" style={{ width: 240 }} value={search} onChange={e => setSearch(e.target.value)} />
        <Segmented value={all ? 'all' : 'owing'} onChange={v => setAll(v === 'all')} options={[{ value: 'owing', label: 'Owing now' }, { value: 'all', label: 'All customers' }]} />
      </Space>
      <Table rowKey={r => `${r.contactId}|${r.currency}`} size="small" loading={loading} dataSource={rows} pagination={{ pageSize: 50, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={all ? 'No customers yet' : 'Nobody owes anything'} /> }}
        columns={[
          { title: 'Customer', key: 'c', render: (_, r) => <a onClick={() => setOpen({ contactId: r.contactId, currency: r.currency })}>{contacts.find(c => c.id === r.contactId)?.name || '—'}</a> },
          { title: 'Currency', dataIndex: 'currency', width: 90 },
          { title: 'Amount due', key: 'd', align: 'right' as const, width: 160, render: (_, r) => fmtMoney(r.closing, r.currency, data.branding?.templates.soa.amountFormat) },
          { title: 'Overdue', key: 'o', align: 'right' as const, width: 160, render: (_, r) => (r.overdue > 0 ? <Text type="danger">{fmtMoney(r.overdue, r.currency, data.branding?.templates.soa.amountFormat)}</Text> : <Tag>None</Tag>) },
          { title: '', key: 'a', width: 130, render: (_, r) => <Button size="small" icon={<FileTextOutlined />} onClick={() => setOpen({ contactId: r.contactId, currency: r.currency })}>Statement</Button> },
        ]} />
      {open && <StatementModal data={data} contactId={open.contactId} currency={open.currency} payments={payments} allocations={allocations} onClose={() => setOpen(null)} />}
    </div>
  );
}
