import { useState, useEffect, useMemo, useCallback } from 'react';
import { Table, Button, Space, Input, Select, Drawer, Modal, Popconfirm, Tag, Typography, Empty, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PrinterOutlined, DownloadOutlined } from '@ant-design/icons';
import { priceListService, contactService } from '../../../services/finance';
import { classLabel, type CatalogItem, type PriceList, type PriceListRow, type WeightClass } from '../../../data/catalog';
import { money } from '../../../data/documentLayouts';
import type { Contact } from '../../../data/finance';
import type { Branding } from '../../../services/branding';
import { DocumentShell } from '../../../components/DocumentShell';
import { AmountInput } from '../../../components/AmountInput';
import { A4_MODAL } from '../../../utils/renderPdf';
import { elementsToPdf, downloadBlob } from '../../../utils/payslipFiles';
import { PRINT_CSS } from './hr/PayslipView';
import { fmtDate } from '../../../utils/dateFormat';
import { useCompanyAccess } from '../../../contexts/CompanyAccess';

const { Text } = Typography;

/** One line of a price list: an item, or one weight class of an item. */
interface Line { key: string; item: CatalogItem; cls: WeightClass | null; normal: number }

/** The lines a list can price: everything sold, with one line per weight class for items stocked by weight. */
type Kind = 'sales' | 'purchase';
function linesFor(items: CatalogItem[], classes: WeightClass[], kind: Kind = 'sales'): Line[] {
  const out: Line[] = [];
  const buy = kind === 'purchase';
  for (const it of items.filter(i => !i.archived && (i.used_for || 'both') !== (buy ? 'sales' : 'purchases')).sort((a, b) => a.name.localeCompare(b.name))) {
    if (it.stock_mode === 'pieces' && classes.some(x => x.item_id === it.id)) {
      for (const c of classes.filter(x => x.item_id === it.id).sort((a, b) => a.min_kg - b.min_kg)) out.push({ key: `${it.id}:${c.id}`, item: it, cls: c, normal: buy ? c.purchase_price : c.sale_price });
    } else out.push({ key: `${it.id}:0`, item: it, cls: null, normal: Number(buy ? it.purchase_price : it.sale_price) || 0 });
  }
  return out;
}
/** the currency an item's list price is in */
const curOf = (it: CatalogItem, kind: Kind, company: string) => (kind === 'purchase' ? it.purchase_currency || it.currency : it.currency) || company;
const unitOf = (l: Line, perPiece: boolean) => (l.item.stock_mode === 'pieces' ? (perPiece ? 'per piece' : 'per kg') : l.item.stock_mode === 'loose' ? `per ${l.item.unit || 'unit'}` : l.item.unit ? `per ${l.item.unit}` : '');
const perPiece = (it: CatalogItem, kind: Kind = 'sales') => ((kind === 'purchase' ? it.price_basis : it.sale_basis || it.price_basis) === 'per_piece');

/** Catalog → Price lists: named lists of prices; customers assigned to a list buy at its prices. */
export function PriceListsTab({ companyId, items, classes, currency, company, branding }: {
  companyId: number; items: CatalogItem[]; classes: WeightClass[]; currency: string; company: any; branding: Branding | null;
}) {
  const access = useCompanyAccess();
  const canWrite = access.canWrite('inventory'), canRemove = access.canRemove('inventory');
  const [lists, setLists] = useState<PriceList[]>([]);
  const [standardId, setStandardId] = useState<number | null>(null);
  const [rows, setRows] = useState<PriceListRow[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const kind: Kind = 'sales';
  const [editing, setEditing] = useState<Partial<PriceList> | null>(null);
  const [printing, setPrinting] = useState<PriceList | null>(null);
  const [needs, setNeeds] = useState(false);

  const load = useCallback(async () => {
    try {
      const [l, r, c] = await Promise.all([priceListService.lists(companyId), priceListService.rows(companyId), contactService.list(companyId)]);
      setLists(l); setRows(r); setCustomers(c); setNeeds(false);
      priceListService.standardId(companyId).then(setStandardId).catch(() => setStandardId(null));
      // migration 048 not run: reading the table fails quietly, so ask for a probe
      if (!l.length && c.length && c[0].price_list_id === undefined) setNeeds(true);
    } catch (e: any) { message.error(e.message); }
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  const shownLists = lists.filter(l => (l.kind || 'sales') === kind);
  const usedBy = (id: number, k: Kind = kind) => customers.filter(c => (k === 'purchase' ? c.purchase_price_list_id : c.price_list_id) === id);
  return (
    <div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        A price list gives items their own selling prices. Assign a list to customers and their invoices pick those prices automatically; items not on the list use the Standard prices. Customers with no list of their own also buy at the Standard prices.
      </Text>
      {needs && <Text type="warning" style={{ display: 'block', marginBottom: 12 }}>Price lists need database update 048 — ask your administrator to run it in Supabase.</Text>}
      {canWrite && <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => setEditing({ name: '', kind })}>New price list</Button>}
      <Table rowKey="id" size="small" pagination={false} dataSource={shownLists} locale={{ emptyText: <Empty description="No price lists yet" /> }}
        columns={[
          { title: 'Price list', dataIndex: 'name', render: (v: string, l: PriceList) => <a onClick={() => setEditing(l)}>{v}{l.id === standardId ? <Tag color="blue" style={{ marginLeft: 8 }}>Standard</Tag> : null}{l.archived ? <Tag style={{ marginLeft: 8 }}>archived</Tag> : null}</a> },
          { title: 'Prices', key: 'n', width: 90, align: 'right' as const, render: (_, l) => rows.filter(r => r.price_list_id === l.id).length },
          { title: kind === 'sales' ? 'Customers' : 'Suppliers', key: 'c', render: (_, l) => { const u = usedBy(l.id); return u.length ? u.map(c => <Tag key={c.id}>{c.name}</Tag>) : <Text type="secondary">none yet</Text>; } },
          { title: '', key: 'a', width: 330, render: (_, l) => (
            <Space size={4}>
              {kind === 'sales' && <Button size="small" icon={<PrinterOutlined />} onClick={() => setPrinting(l)}>Print / PDF</Button>}
              {canWrite && l.id !== standardId && <Button size="small" onClick={async () => { try { await priceListService.setStandard(companyId, l.id); load(); message.success(`“${l.name}” is now the standard price list`); } catch (e: any) { message.error(e.message); } }}>Make standard</Button>}
              {canWrite && <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(l)} />}
              {canRemove && <Popconfirm title="Delete this price list? Its customers go back to the standard prices." onConfirm={async () => { try { await priceListService.remove(l.id); load(); } catch (e: any) { message.error(e.message); } }}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>}
            </Space>) },
        ]} />
      {editing && <PriceListDrawer companyId={companyId} list={editing} kind={(editing.kind as Kind) || kind} company={currency} items={items} classes={classes} rows={rows} customers={customers} canWrite={canWrite} standardId={standardId}
        onClose={() => setEditing(null)} onSaved={async id => { if (!standardId) await priceListService.setStandard(companyId, id).catch(() => null); setEditing(null); load(); }} />}
      {printing && <PriceListView list={printing} items={items} classes={classes} rows={rows.filter(r => r.price_list_id === printing.id)} customers={usedBy(printing.id, 'sales')}
        currency={currency} company={company} branding={branding} onClose={() => setPrinting(null)} />}
    </div>
  );
}

function PriceListDrawer({ companyId, list, kind, company, items, classes, rows, customers, canWrite, standardId, onClose, onSaved }: {
  companyId: number; list: Partial<PriceList>; kind: Kind; company: string; items: CatalogItem[]; classes: WeightClass[]; rows: PriceListRow[]; customers: Contact[]; canWrite: boolean;
  standardId: number | null; onClose: () => void; onSaved: (id: number) => void;
}) {
  const lines = useMemo(() => linesFor(items, classes, kind), [items, classes, kind]);
  const col = kind === 'purchase' ? 'purchase_price_list_id' : 'price_list_id';
  const isStandard = !!list.id && list.id === standardId;
  // what the Standard list says, shown beside each price (and used to fill the rest)
  const standard = (l: Line) => (isStandard ? undefined : rows.find(r => r.price_list_id === standardId && r.item_id === l.item.id && (r.class_id ?? 0) === (l.cls?.id ?? 0))?.price);
  const people = customers.filter(c => (kind === 'purchase' ? c.is_supplier : c.is_customer) || (c as any)[col] === list.id);
  const [name, setName] = useState(list.name || '');
  const [notes, setNotes] = useState(list.notes || '');
  const [who, setWho] = useState<number[]>(() => customers.filter(c => list.id && (c as any)[col] === list.id).map(c => c.id));
  const [prices, setPrices] = useState<Record<string, number | null>>(() => {
    const m: Record<string, number | null> = {};
    for (const r of rows.filter(x => x.price_list_id === list.id)) m[`${r.item_id}:${r.class_id ?? 0}`] = r.price;
    return m;
  });
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const shown = lines.filter(l => !search.trim() || l.item.name.toLowerCase().includes(search.trim().toLowerCase()) || (l.item.code || '').toLowerCase().includes(search.trim().toLowerCase()));
  const priced = Object.values(prices).filter(v => v != null).length;

  const save = async () => {
    setSaving(true);
    try {
      const out = lines.filter(l => prices[l.key] != null).map(l => ({ item_id: l.item.id, class_id: l.cls?.id ?? null, price: Number(prices[l.key]) || 0 }));
      const id = await priceListService.save(companyId, { ...list, name, notes, kind }, out, who);
      message.success('Price list saved'); onSaved(id);
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };
  return (
    <Drawer open onClose={onClose} size={820} title={list.id ? list.name : 'New price list'}
      extra={canWrite && <Button type="primary" loading={saving} onClick={save}>Save</Button>}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Input placeholder="Name" value={name} onChange={e => setName(e.target.value)} disabled={!canWrite} />
        <Select mode="multiple" style={{ width: '100%' }} placeholder={kind === 'purchase' ? 'Suppliers on this list' : 'Customers on this list'} optionFilterProp="label" disabled={!canWrite}
          value={who} onChange={setWho}
          options={people.filter(c => !c.archived || who.includes(c.id)).map(c => ({ value: c.id, label: (c as any)[col] && (c as any)[col] !== list.id && !who.includes(c.id) ? `${c.name} (on another list)` : c.name }))} />
        <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} placeholder={kind === 'purchase' ? 'Note' : 'Note shown on the printed list'} value={notes} onChange={e => setNotes(e.target.value)} disabled={!canWrite} />
        <Space wrap>
          <Input allowClear placeholder="Find an item" style={{ width: 240 }} value={search} onChange={e => setSearch(e.target.value)} />
          {canWrite && !isStandard && <Button size="small" onClick={() => setPrices(p => { const m = { ...p }; for (const l of lines) if (m[l.key] == null && standard(l) != null) m[l.key] = standard(l)!; return m; })}>{isStandard ? '' : 'Fill the rest with the Standard prices'}</Button>}
          {canWrite && <Button size="small" onClick={() => setPrices({})}>Clear all</Button>}
          <Text type="secondary">{priced} price{priced === 1 ? '' : 's'} on this list. {isStandard ? 'Items with no price here have none until you type it on the invoice.' : 'A blank price means the Standard price.'}</Text>
        </Space>
        <Table rowKey="key" size="small" pagination={false} dataSource={shown}
          columns={[
            { title: 'Item', key: 'i', render: (_, l: Line) => <>{l.item.code ? <Text type="secondary">{l.item.code} · </Text> : null}{l.item.name}{l.cls ? <Text type="secondary"> — {classLabel(l.cls)}</Text> : null}</> },
            ...(isStandard ? [] : [{ title: 'Standard price', key: 'n', align: 'right' as const, width: 170, render: (_: any, l: Line) => { const v = standard(l); return <Text type="secondary">{v == null ? '—' : `${curOf(l.item, kind, company)} ${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unitOf(l, perPiece(l.item, kind))}`}</Text>; } }]),
            { title: 'List price', key: 'p', width: 170, render: (_, l: Line) => (
              <AmountInput min={0} precision={2} style={{ width: '100%' }} placeholder={isStandard ? '' : 'standard'} disabled={!canWrite} value={prices[l.key] ?? undefined}
                onChange={v => setPrices(p => ({ ...p, [l.key]: v == null || (v as any) === '' ? null : Number(v) }))} />) },
          ]} />
      </Space>
    </Drawer>
  );
}

/** The list as a document for the customer: letterhead, the prices, a note. */
function PriceListView({ list, items, classes, rows, customers, currency, company, branding, onClose }: {
  list: PriceList; items: CatalogItem[]; classes: WeightClass[]; rows: PriceListRow[]; customers: Contact[]; currency: string; company: any; branding: Branding | null; onClose: () => void;
}) {
  const [forId, setForId] = useState<number | null>(customers.length === 1 ? customers[0].id : null);
  const [busy, setBusy] = useState(false);
  const lines = useMemo(() => linesFor(items, classes).filter(l => rows.some(r => r.item_id === l.item.id && (r.class_id ?? 0) === (l.cls?.id ?? 0))), [items, classes, rows]);
  const price = (l: Line) => Number(rows.find(r => r.item_id === l.item.id && (r.class_id ?? 0) === (l.cls?.id ?? 0))?.price) || 0;
  const forName = customers.find(c => c.id === forId)?.name;
  const fileName = `Price list - ${list.name}${forName ? ` - ${forName}` : ''}`.replace(/[\\/:*?"<>|]+/g, ' ');
  const td = { padding: '5px 6px', borderBottom: '1px solid #eee' } as const;

  const print = () => {
    const el = document.getElementById('price-list-print');
    if (!el) return;
    const w = window.open('', '_blank', 'width=820,height=1000');
    if (!w) { message.error('Allow pop-ups to print'); return; }
    w.document.write(`<html><head><title>${fileName}</title><style>${PRINT_CSS}</style></head><body>${el.innerHTML}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };
  const download = async () => {
    const el = document.getElementById('price-list-print');
    if (!el) return;
    setBusy(true);
    try { downloadBlob(await elementsToPdf([el]), `${fileName}.pdf`); } catch (e: any) { message.error(e.message); }
    setBusy(false);
  };
  return (
    <Modal open onCancel={onClose} width={A4_MODAL} title={`Price list — ${list.name}`}
      footer={<Space><Button icon={<PrinterOutlined />} onClick={print}>Print</Button>
        <Button type="primary" icon={<DownloadOutlined />} loading={busy} onClick={download}>Download PDF</Button></Space>}>
      {customers.length > 1 && (
        <Select allowClear style={{ width: 280, marginBottom: 12 }} placeholder="For (optional): choose a customer" value={forId ?? undefined} onChange={v => setForId(v ?? null)}
          options={customers.map(c => ({ value: c.id, label: c.name }))} />
      )}
      <div style={{ width: 760, maxWidth: '100%' }}>
        <div id="price-list-print" style={{ background: '#fff', borderRadius: 8, padding: 24 }}>
          <DocumentShell country={company?.country} branding={branding} companyName={company?.name || ''} forPrint title="PRICE LIST"
            meta={<>{list.name}<br />{fmtDate(new Date().toISOString().slice(0, 10))}</>} showLogo showCompanyBlock footerNote={undefined}>
            {forName && <div style={{ fontSize: 13, color: '#111', marginBottom: 12 }}><div style={{ color: '#666', fontSize: 12 }}>Prepared for</div><b>{forName}</b></div>}
            <table style={{ width: '100%', fontSize: 12.5, color: '#111', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#f2f2f2' }}>
                <th style={{ ...td, textAlign: 'left' }}>Item</th><th style={{ ...td, textAlign: 'left' }}>Weight class</th><th style={{ ...td, textAlign: 'right' }}>Price</th>
              </tr></thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l.key}>
                    <td style={td}>{l.item.name}</td>
                    <td style={td}>{l.cls ? classLabel(l.cls) : ''}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{money(price(l), l.item.currency || currency)} <span style={{ color: '#666', fontSize: 11 }}>{unitOf(l, perPiece(l.item))}</span></td>
                  </tr>
                ))}
                {!lines.length && <tr><td colSpan={3} style={{ ...td, color: '#666' }}>No prices on this list yet.</td></tr>}
              </tbody>
            </table>
            {list.notes && <div style={{ marginTop: 14, fontSize: 12, color: '#444', whiteSpace: 'pre-line' }}>{list.notes}</div>}
          </DocumentShell>
        </div>
      </div>
    </Modal>
  );
}
