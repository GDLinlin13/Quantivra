import { useCallback, useEffect, useMemo, useState } from 'react';
import { Table, Button, Drawer, Form, Input, InputNumber, DatePicker, Select, Space, Tag, Typography, Popconfirm, Modal, Segmented, message, Empty } from 'antd';
import { PlusOutlined, PrinterOutlined, DownloadOutlined, CheckOutlined, CloseOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { poService, PO_STATUS_LABEL, PO_STATUS_COLOR, type PurchaseOrder, type PoLine } from '../../../../services/purchaseOrders';
import { approverLabel, type RequestStatus } from '../../../../services/workflow';
import { docTotals, type DocLine } from '../../../../data/finance';
import { money } from '../../../../data/documentLayouts';
import { DocumentShell } from '../../../../components/DocumentShell';
import { AmountInput } from '../../../../components/AmountInput';
import { renderPdf, A4_PAGE } from '../../../../utils/renderPdf';
import { downloadBlob } from '../../../../utils/payslipFiles';
import { PRINT_CSS } from '../hr/PayslipView';
import { useCompanyAccess } from '../../../../contexts/CompanyAccess';
import { useAuth } from '../../../../contexts/AuthContext';
import { fmtDate } from '../../../../utils/dateFormat';
import type { FinanceData } from './DocList';

const { Text } = Typography;
const asDocLines = (ls: PoLine[]): DocLine[] => ls.map(l => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price, discount_pct: 0, tax_rate: l.tax_rate, item_id: l.item_id ?? null }));

/** Finance → Payables → Purchase orders: order from a supplier, get it approved, send it, then turn it into a bill. */
export function PurchaseOrders({ data }: { data: FinanceData }) {
  const access = useCompanyAccess();
  const { user } = useAuth();
  const canWrite = access.canWrite('finance');
  const [orders, setOrders] = useState<PurchaseOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chain, setChain] = useState<Map<number, RequestStatus>>(new Map());
  const [filter, setFilter] = useState<'approve' | 'all'>('all');
  const [editing, setEditing] = useState<{ po: Partial<PurchaseOrder>; lines: PoLine[] } | null>(null);
  const [viewing, setViewing] = useState<{ po: PurchaseOrder; lines: PoLine[] } | null>(null);
  const [rejecting, setRejecting] = useState<PurchaseOrder | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      const list = await poService.list(data.companyId);
      setOrders(list); setError(null);
      setChain(await poService.status(list.filter(o => o.status === 'pending').map(o => o.id)));
    } catch (e: any) { setError(e.message); setOrders([]); }
  }, [data.companyId]);
  useEffect(() => { load(); }, [load]);

  const supplier = (id: number | null) => data.contacts.find(c => c.id === id)?.name || '—';
  const waiting = (orders || []).filter(o => o.status === 'pending' && chain.get(o.id)?.can_act).length;
  const shown = useMemo(() => (orders || []).filter(o => filter === 'all' || (o.status === 'pending' && chain.get(o.id)?.can_act)), [orders, filter, chain]);
  const run = async (f: () => Promise<unknown>, ok?: string) => { try { await f(); if (ok) message.success(ok); await load(); } catch (e: any) { message.error(e.message); } };

  const open = async (o: PurchaseOrder) => setEditing({ po: o, lines: await poService.lines(o.id) });
  const view = async (o: PurchaseOrder) => setViewing({ po: o, lines: await poService.lines(o.id) });
  const decide = (o: PurchaseOrder, d: 'approved' | 'rejected', why?: string) => run(async () => {
    const res = await poService.decide(o.id, d, why);
    message.success(res === 'pending' ? 'Approved — passed on to the next step' : d === 'approved' ? 'Approved' : 'Rejected');
  });
  const toBill = (o: PurchaseOrder) => run(async () => { await poService.toBill(data.companyId, o, await poService.lines(o.id)); data.reload(); }, 'A draft bill was made — open it under Bills');

  if (error) return <Text type="secondary">{error}</Text>;
  return (
    <div>
      <Space style={{ marginBottom: 12 }} wrap>
        <Segmented value={filter} onChange={v => setFilter(v as 'approve' | 'all')} options={[{ value: 'all', label: 'All' }, { value: 'approve', label: `To approve (${waiting})` }]} />
        {canWrite && (
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => setEditing({ po: { issue_date: dayjs().format('YYYY-MM-DD'), currency: data.currency, status: 'draft' }, lines: [{ description: '', quantity: 1, unit_price: 0, tax_rate: data.settings.gstRegistered ? data.settings.gstRate : 0 }] })}>New purchase order</Button>
        )}
      </Space>
      <Table rowKey="id" size="small" loading={orders === null} dataSource={shown} pagination={{ pageSize: 50, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={filter === 'approve' ? 'Nothing to approve' : 'No purchase orders yet'} /> }}
        columns={[
          { title: 'Number', key: 'n', render: (_, o) => <a onClick={() => view(o)}>{o.number}</a> },
          { title: 'Supplier', key: 's', render: (_, o) => supplier(o.contact_id) },
          { title: 'Date', dataIndex: 'issue_date', width: 110, render: (v: string) => fmtDate(v) },
          { title: 'Expected', dataIndex: 'expected_date', width: 110, render: (v: string | null) => (v ? fmtDate(v) : '—') },
          { title: 'Total', key: 't', align: 'right' as const, render: (_, o) => money(o.total, o.currency) },
          { title: 'Status', key: 'st', render: (_, o) => (
            <Space size={4} wrap>
              <Tag color={PO_STATUS_COLOR[o.status]}>{PO_STATUS_LABEL[o.status]}</Tag>
              {chain.get(o.id)?.mode === 'flow' && <Tag>Step {chain.get(o.id)!.step_no} of {chain.get(o.id)!.steps_total}</Tag>}
              {o.document_id && <Tag color="blue">Billed</Tag>}
              {o.decision_note && <Text type="secondary" style={{ fontSize: 12 }}>{o.decision_note}</Text>}
            </Space>
          ) },
          { title: '', key: 'x', width: 360, render: (_, o) => {
            const st = chain.get(o.id);
            return (
              <Space size={4} wrap>
                {o.status === 'pending' && st?.can_act && <>
                  <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => decide(o, 'approved')}>Approve</Button>
                  <Button size="small" danger icon={<CloseOutlined />} onClick={() => { setRejecting(o); setNote(''); }}>Reject</Button>
                </>}
                {o.status === 'pending' && st && !st.can_act && st.mode === 'flow' && <Text type="secondary" style={{ fontSize: 12 }}>Waiting for {approverLabel(st.waiting_for || '')}</Text>}
                {canWrite && (o.status === 'draft' || o.status === 'rejected') && <>
                  <Button size="small" onClick={() => open(o)}>Edit</Button>
                  <Button size="small" type="primary" onClick={() => run(() => poService.setStatus(o.id, 'pending'), 'Sent for approval')}>Submit for approval</Button>
                </>}
                {canWrite && ['approved', 'sent', 'received'].includes(o.status) && <Button size="small" onClick={() => view(o)}>Print</Button>}
                {canWrite && o.status === 'approved' && <Button size="small" onClick={() => run(() => poService.setStatus(o.id, 'sent'), 'Marked as sent')}>Mark as sent</Button>}
                {canWrite && o.status === 'sent' && <Button size="small" onClick={() => run(() => poService.setStatus(o.id, 'received'), 'Marked as received')}>Mark as received</Button>}
                {canWrite && ['approved', 'sent', 'received'].includes(o.status) && !o.document_id && <Button size="small" onClick={() => toBill(o)}>Make bill</Button>}
                {canWrite && ['approved', 'sent', 'pending'].includes(o.status) && !o.document_id && (
                  <Popconfirm title="Cancel this order?" onConfirm={() => run(() => poService.setStatus(o.id, 'cancelled'))}><Button size="small">Cancel</Button></Popconfirm>
                )}
                {canWrite && ['draft', 'rejected', 'cancelled'].includes(o.status) && (
                  <Popconfirm title="Delete this order?" okButtonProps={{ danger: true }} onConfirm={() => run(() => poService.remove(o.id))}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
                )}
              </Space>
            );
          } },
        ]} />
      {editing && <PoDrawer data={data} po={editing.po} lines={editing.lines} createdBy={user?.id ?? null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {viewing && <PoView data={data} po={viewing.po} lines={viewing.lines} supplier={supplier(viewing.po.contact_id)} onClose={() => setViewing(null)} />}
      <Modal open={!!rejecting} title="Reject this order" okText="Reject" okButtonProps={{ danger: true }} onCancel={() => setRejecting(null)}
        onOk={async () => { const o = rejecting!; setRejecting(null); await decide(o, 'rejected', note); }}>
        <Input.TextArea autoSize={{ minRows: 2 }} placeholder="Reason" value={note} onChange={e => setNote(e.target.value)} />
      </Modal>
    </div>
  );
}

function PoDrawer({ data, po, lines: start, createdBy, onClose, onSaved }: {
  data: FinanceData; po: Partial<PurchaseOrder>; lines: PoLine[]; createdBy: number | null; onClose: () => void; onSaved: () => void;
}) {
  const [form] = Form.useForm();
  const [lines, setLines] = useState<PoLine[]>(start.length ? start : [{ description: '', quantity: 1, unit_price: 0, tax_rate: 0 }]);
  const [saving, setSaving] = useState(false);
  const suppliers = data.contacts.filter(c => c.is_supplier && !c.archived);
  const items = data.items.filter(i => !i.archived && (i.used_for || 'both') !== 'sales');
  const totals = docTotals(asDocLines(lines), [], false);
  const setLine = (i: number, patch: Partial<PoLine>) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pick = (i: number, id?: number) => {
    const it = data.items.find(x => x.id === id);
    setLine(i, it ? { item_id: it.id, description: it.name, unit_price: Number(it.purchase_price) || 0 } : { item_id: null });
  };
  const save = async () => {
    const v = await form.validateFields();
    if (!lines.some(l => (l.description || '').trim() || l.item_id)) { message.error('Add at least one line'); return; }
    setSaving(true);
    try {
      await poService.save(data.companyId, { ...po, contact_id: v.contact_id, issue_date: dayjs(v.issue_date).format('YYYY-MM-DD'), expected_date: v.expected_date ? dayjs(v.expected_date).format('YYYY-MM-DD') : null,
        reference: v.reference, deliver_to: v.deliver_to, notes: v.notes, terms: v.terms, currency: po.currency || data.currency }, lines, createdBy);
      message.success('Saved');
      onSaved();
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };
  return (
    <Drawer open onClose={onClose} size={860} title={po.number ? `Purchase order ${po.number}` : 'New purchase order'} extra={<Button type="primary" loading={saving} onClick={save}>Save</Button>}>
      <Form form={form} layout="vertical" initialValues={{
        contact_id: po.contact_id ?? undefined, issue_date: po.issue_date ? dayjs(po.issue_date) : dayjs(), expected_date: po.expected_date ? dayjs(po.expected_date) : undefined,
        reference: po.reference, deliver_to: po.deliver_to, notes: po.notes, terms: po.terms,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
          <Form.Item name="contact_id" label="Supplier" rules={[{ required: true, message: 'Choose the supplier' }]}>
            <Select showSearch optionFilterProp="label" options={suppliers.map(c => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="issue_date" label="Date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="expected_date" label="Needed by"><DatePicker style={{ width: '100%' }} /></Form.Item>
        </div>
        <Table size="small" rowKey={(_, i) => String(i)} pagination={false} dataSource={lines} style={{ marginBottom: 12 }}
          columns={[
            { title: 'Item', key: 'i', width: 220, render: (_, l, i) => (
              <Select style={{ width: '100%' }} allowClear showSearch optionFilterProp="label" value={l.item_id ?? undefined} onChange={v => pick(i, v)}
                options={items.map(it => ({ value: it.id, label: `${it.code ? `${it.code} · ` : ''}${it.name}` }))} />
            ) },
            { title: 'Description', key: 'd', render: (_, l, i) => <Input value={l.description} onChange={e => setLine(i, { description: e.target.value })} /> },
            { title: 'Qty', key: 'q', width: 90, render: (_, l, i) => <InputNumber min={0} style={{ width: '100%' }} value={l.quantity} onChange={v => setLine(i, { quantity: Number(v) || 0 })} /> },
            { title: 'Unit price', key: 'p', width: 120, render: (_, l, i) => <AmountInput min={0} style={{ width: '100%' }} value={l.unit_price} onChange={v => setLine(i, { unit_price: Number(v) || 0 })} /> },
            ...(data.settings.gstRegistered ? [{ title: 'Tax %', key: 't', width: 80, render: (_: any, l: PoLine, i: number) => <InputNumber min={0} max={100} style={{ width: '100%' }} value={l.tax_rate} onChange={v => setLine(i, { tax_rate: Number(v) || 0 })} /> }] : []),
            { title: 'Amount', key: 'a', width: 110, align: 'right' as const, render: (_, l) => money(Math.round(l.quantity * l.unit_price * 100) / 100, data.currency) },
            { title: '', key: 'x', width: 40, render: (_, __, i) => <Button size="small" icon={<DeleteOutlined />} disabled={lines.length === 1} onClick={() => setLines(ls => ls.filter((_x, j) => j !== i))} /> },
          ]} />
        <Space style={{ marginBottom: 12 }}>
          <Button size="small" icon={<PlusOutlined />} onClick={() => setLines(ls => [...ls, { description: '', quantity: 1, unit_price: 0, tax_rate: data.settings.gstRegistered ? data.settings.gstRate : 0 }])}>Add a line</Button>
          <Text>Total <b>{money(totals.total, data.currency)}</b></Text>
        </Space>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="reference" label="Our reference"><Input /></Form.Item>
          <Form.Item name="deliver_to" label="Deliver to"><Input /></Form.Item>
        </div>
        <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
        <Form.Item name="terms" label="Terms"><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </Drawer>
  );
}

/** The order as a document: look at it, print it or save a PDF. */
function PoView({ data, po, lines, supplier, onClose }: { data: FinanceData; po: PurchaseOrder; lines: PoLine[]; supplier: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const contact = data.contacts.find(c => c.id === po.contact_id);
  const t = docTotals(asDocLines(lines), [], false);
  const doc = (
    <div id="po-print" style={A4_PAGE}>
      <DocumentShell country={data.company?.country} branding={data.branding} companyName={data.company?.name || ''} forPrint title="PURCHASE ORDER"
        meta={<>{po.number}<br />{fmtDate(po.issue_date)}</>}>
        <div style={{ fontSize: 13, color: '#111', marginBottom: 12, whiteSpace: 'pre-line' }}>
          <div style={{ color: '#666', fontSize: 12 }}>Supplier</div>
          <b>{supplier}</b>{contact?.address ? `\n${contact.address}` : ''}
          {po.deliver_to && <div style={{ marginTop: 8 }}><div style={{ color: '#666', fontSize: 12 }}>Deliver to</div>{po.deliver_to}</div>}
          {(po.expected_date || po.reference) && <div style={{ marginTop: 8, fontSize: 12, color: '#444' }}>{po.expected_date ? `Needed by ${fmtDate(po.expected_date)}` : ''}{po.expected_date && po.reference ? ' · ' : ''}{po.reference ? `Ref ${po.reference}` : ''}</div>}
        </div>
        <table style={{ width: '100%', fontSize: 13, color: '#111', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#f2f2f2' }}>
            <th style={{ textAlign: 'left', padding: '4px 6px' }}>#</th><th style={{ textAlign: 'left', padding: '4px 6px' }}>Description</th>
            <th style={{ textAlign: 'right', padding: '4px 6px' }}>Qty</th><th style={{ textAlign: 'right', padding: '4px 6px' }}>Unit price</th><th style={{ textAlign: 'right', padding: '4px 6px' }}>Amount</th>
          </tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #e2e2e2' }}>
                <td style={{ padding: '4px 6px' }}>{i + 1}</td><td style={{ padding: '4px 6px' }}>{l.description}</td>
                <td style={{ padding: '4px 6px', textAlign: 'right' }}>{String(Number(l.quantity))}</td>
                <td style={{ padding: '4px 6px', textAlign: 'right' }}>{money(l.unit_price, po.currency, 'number', true)}</td>
                <td style={{ padding: '4px 6px', textAlign: 'right' }}>{money(Math.round(l.quantity * l.unit_price * 100) / 100, po.currency, 'number')}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {t.tax_total > 0 && <tr><td colSpan={4} style={{ textAlign: 'right', padding: '4px 6px' }}>Tax</td><td style={{ textAlign: 'right', padding: '4px 6px' }}>{money(t.tax_total, po.currency, 'number')}</td></tr>}
            <tr><td colSpan={4} style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 700 }}>Total ({po.currency})</td><td style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 700 }}>{money(t.total, po.currency, 'number')}</td></tr>
          </tfoot>
        </table>
        {po.notes && <div style={{ fontSize: 12, color: '#444', marginTop: 12, whiteSpace: 'pre-line' }}><b>Notes</b><br />{po.notes}</div>}
        {po.terms && <div style={{ fontSize: 12, color: '#444', marginTop: 8, whiteSpace: 'pre-line' }}><b>Terms</b><br />{po.terms}</div>}
      </DocumentShell>
    </div>
  );
  const print = () => {
    const el = document.getElementById('po-print');
    const w = el && window.open('', '_blank', 'width=820,height=1000');
    if (!el || !w) { message.error('Allow pop-ups to print'); return; }
    w.document.write(`<html><head><title>${po.number}</title><style>${PRINT_CSS}</style></head><body>${el.innerHTML}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };
  const download = async () => { setBusy(true); try { downloadBlob(await renderPdf(doc), `${po.number}.pdf`); } catch (e: any) { message.error(e.message); } setBusy(false); };
  return (
    <Modal open onCancel={onClose} width="min(842px, 96vw)" title={`Purchase order ${po.number}`}
      footer={<Space><Button icon={<PrinterOutlined />} onClick={print}>Print</Button><Button type="primary" icon={<DownloadOutlined />} loading={busy} onClick={download}>Download PDF</Button></Space>}>
      {doc}
    </Modal>
  );
}
