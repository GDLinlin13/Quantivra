import { useState, useEffect, useMemo } from 'react';
import { Table, Input, Segmented, Tag, Typography, Empty } from 'antd';
import { contactService } from '../../../services/finance';
import { supplierPrices, classLabel, type CatalogItem, type Piece, type WeightClass, type SupplierPrice } from '../../../data/catalog';
import type { Contact } from '../../../data/finance';
import { fmtDate } from '../../../utils/dateFormat';

const { Text } = Typography;
const num = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 });

/**
 * Catalog → Supplier prices: what each supplier has charged, worked out from their bills — nothing to set up.
 * By supplier: the items bought from them with the latest price; by item: the same item across suppliers.
 */
export function SupplierPricesTab({ companyId, docs, items, classes, pieces, currency }: {
  companyId: number; docs: any[]; items: CatalogItem[]; classes: WeightClass[]; pieces: Piece[]; currency: string;
}) {
  const [suppliers, setSuppliers] = useState<Contact[]>([]);
  const [view, setView] = useState<'supplier' | 'item'>('supplier');
  const [search, setSearch] = useState('');
  useEffect(() => { contactService.list(companyId).then(setSuppliers).catch(() => setSuppliers([])); }, [companyId]);
  const prices = useMemo(() => supplierPrices(docs, items, classes, pieces, currency), [docs, items, classes, pieces, currency]);
  const name = (id: number) => suppliers.find(c => c.id === id)?.name || `Supplier ${id}`;
  const itemOf = (id: number) => items.find(i => i.id === id);
  const label = (p: SupplierPrice) => {
    const it = itemOf(p.item_id), c = classes.find(x => x.id === p.class_id);
    return <>{it?.name || `Item ${p.item_id}`}{c ? <Text type="secondary"> — {classLabel(c, it?.weight_decimals ?? 3)}</Text> : null}</>;
  };
  const per = (p: SupplierPrice) => { const it = itemOf(p.item_id); return it?.stock_mode === 'pieces' ? (it.price_basis === 'per_piece' ? ' / piece' : ' / kg') : it?.unit ? ` / ${it.unit}` : ''; };
  const change = (p: SupplierPrice) => {
    if (!p.prev) return <Text type="secondary">—</Text>;
    const d = ((p.price - p.prev.price) / p.prev.price) * 100;
    return <Tag color={d > 0 ? 'red' : 'green'}>{d > 0 ? '▲' : '▼'} {Math.abs(Math.round(d * 10) / 10)}%</Tag>;
  };
  const q = search.trim().toLowerCase();
  const match = (p: SupplierPrice) => !q || name(p.contact_id).toLowerCase().includes(q) || (itemOf(p.item_id)?.name || '').toLowerCase().includes(q);

  const itemCols = (showWho: boolean) => [
    ...(showWho ? [{ title: 'Supplier', key: 'w', render: (_: any, p: SupplierPrice) => name(p.contact_id) }] : [{ title: 'Item', key: 'i', render: (_: any, p: SupplierPrice) => label(p) }]),
    { title: 'Latest price', key: 'p', align: 'right' as const, render: (_: any, p: SupplierPrice) => <b>{p.currency} {num(p.price)}{per(p)}</b> },
    { title: 'Bill', key: 'b', render: (_: any, p: SupplierPrice) => <>{p.number} <Text type="secondary">· {fmtDate(p.date)}</Text></> },
    { title: 'Before', key: 'pv', align: 'right' as const, render: (_: any, p: SupplierPrice) => (p.prev ? <Text type="secondary">{num(p.prev.price)} <span style={{ fontSize: 12 }}>({fmtDate(p.prev.date)})</span></Text> : '—') },
    { title: 'Change', key: 'c', width: 100, render: (_: any, p: SupplierPrice) => change(p) },
    { title: 'Bills', key: 'n', width: 70, align: 'right' as const, render: (_: any, p: SupplierPrice) => p.bills },
  ];

  const supplierRows = [...new Set(prices.filter(match).map(p => p.contact_id))]
    .map(id => ({ id, name: name(id), list: prices.filter(p => p.contact_id === id && match(p)), last: prices.filter(p => p.contact_id === id).map(p => p.date).sort().pop() || '' }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const itemRows = [...new Set(prices.filter(match).map(p => `${p.item_id}:${p.class_id ?? 0}`))]
    .map(k => { const list = prices.filter(p => `${p.item_id}:${p.class_id ?? 0}` === k && match(p)).sort((a, b) => a.price - b.price); return { key: k, first: list[0], list }; })
    .sort((a, b) => (itemOf(a.first.item_id)?.name || '').localeCompare(itemOf(b.first.item_id)?.name || ''));

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <Segmented value={view} onChange={v => setView(v as any)} options={[{ value: 'supplier', label: 'By supplier' }, { value: 'item', label: 'By item (compare suppliers)' }]} />
        <Input allowClear placeholder="Find a supplier or item" style={{ width: 260 }} value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {!prices.length ? <Empty description="No bills with catalog items yet" /> : view === 'supplier' ? (
        <Table rowKey="id" size="small" pagination={false} dataSource={supplierRows}
          expandable={{ defaultExpandedRowKeys: supplierRows.length === 1 ? [supplierRows[0].id] : [], expandedRowRender: r => <Table rowKey={(p: SupplierPrice) => `${p.item_id}:${p.class_id ?? 0}`} size="small" pagination={false} dataSource={r.list.sort((a, b) => (itemOf(a.item_id)?.name || '').localeCompare(itemOf(b.item_id)?.name || ''))} columns={itemCols(false)} /> }}
          columns={[
            { title: 'Supplier', dataIndex: 'name' },
            { title: 'Items bought', key: 'n', width: 130, align: 'right' as const, render: (_, r) => r.list.length },
            { title: 'Last bill', key: 'l', width: 140, render: (_, r) => fmtDate(r.last) },
          ]} />
      ) : (
        <Table rowKey="key" size="small" pagination={false} dataSource={itemRows}
          expandable={{ expandedRowRender: r => <Table rowKey={(p: SupplierPrice) => `${p.contact_id}`} size="small" pagination={false} dataSource={r.list} columns={itemCols(true)} /> }}
          columns={[
            { title: 'Item', key: 'i', render: (_, r) => label(r.first) },
            { title: 'Suppliers', key: 's', width: 110, align: 'right' as const, render: (_, r) => r.list.length },
            { title: 'Cheapest', key: 'c', align: 'right' as const, render: (_, r) => <>{r.first.currency} {num(r.first.price)}{per(r.first)} <Text type="secondary">· {name(r.first.contact_id)}</Text></> },
            { title: 'Dearest', key: 'd', align: 'right' as const, render: (_, r) => { const l = r.list[r.list.length - 1]; return r.list.length > 1 ? <>{l.currency} {num(l.price)}{per(l)}</> : '—'; } },
          ]} />
      )}
    </div>
  );
}
