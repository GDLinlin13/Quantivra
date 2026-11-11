import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Typography, Tabs, Table, Button, Space, Input, Segmented, Tag, Drawer, Form, Select, InputNumber, Switch, message, Popconfirm,
  Modal, DatePicker, Empty, Alert, Spin, Card, Statistic,
  ConfigProvider,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, SwapOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { catalogService, accountService, financeSettingsService, loadLedgerInput, contactService } from '../../../services/finance';
import { stockMoves, onHand, classLabel, classOf, piecesInStock, piecesCost, kgText, type CatalogItem, type StockAdjustment, type StockMode, type WeightClass, type Piece } from '../../../data/catalog';
import { DEFAULT_FINANCE_SETTINGS, contactCurrencies, type Account, type Contact, type FinanceSettings } from '../../../data/finance';
import { currencyOptions } from '../../../utils/currencies';
import { money } from '../../../data/documentLayouts';
import { AmountInput } from '../../../components/AmountInput';
import { useCompanyAccess } from '../../../contexts/CompanyAccess';
import { fmtDate } from '../../../utils/dateFormat';

const { Title, Text } = Typography;

type Docs = Awaited<ReturnType<typeof loadLedgerInput>>['docs'];

/** Catalog: the products and services the company sells and buys, with stock for products. */
export function CompanyCatalogPage() {
  const { companyId } = useAuth();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [docs, setDocs] = useState<Docs>([]);
  const [classes, setClasses] = useState<WeightClass[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [settings, setSettings] = useState<FinanceSettings>(DEFAULT_FINANCE_SETTINGS);
  const [currency, setCurrency] = useState('SGD');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [it, adj, input, s, co, cls, pcs] = await Promise.all([
        catalogService.list(companyId), catalogService.adjustments(companyId), loadLedgerInput(companyId),
        financeSettingsService.get(companyId).catch(() => DEFAULT_FINANCE_SETTINGS),
        supabase.from('companies').select('currency').eq('id', companyId).maybeSingle(),
        catalogService.classes(companyId), catalogService.pieces(companyId),
      ]);
      setClasses(cls); setPieces(pcs);
      setItems(it); setAdjustments(adj); setDocs(input.docs); setAccounts(input.accounts); setSettings(s);
      setCurrency(co.data?.currency || 'SGD'); setError(null);
    } catch (e: any) {
      setError(/catalog_|does not exist|item_id/i.test(e.message) ? 'Catalog needs database update 025 — ask your administrator to run it in Supabase.' : e.message);
    }
    setLoading(false);
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  const stock = useMemo(() => new Map(items.filter(i => i.track_stock).map(i => [i.id, onHand(stockMoves(i, docs, adjustments, pieces))])), [items, docs, adjustments, pieces]);

  if (!companyId) return null;
  if (error) return <div><Title level={4} style={{ color: '#f0ede6' }}>Catalog</Title><Alert type="warning" showIcon title={error} /></div>;
  if (loading && !items.length) return <Spin />;
  return (
    <div>
      <Title level={4} style={{ color: '#f0ede6' }}>Catalog</Title>
      <Tabs items={[
        { key: 'items', label: 'Products & services', children: <ItemsTab companyId={companyId} items={items} stock={stock} accounts={accounts} settings={settings} currency={currency} reload={load} /> },
        { key: 'stock', label: 'Stock', children: <StockTab companyId={companyId} items={items} stock={stock} docs={docs} adjustments={adjustments} pieces={pieces} classes={classes} currency={currency} reload={load} /> },
      ]} />
    </div>
  );
}

function ItemsTab({ companyId, items, stock, accounts, settings, currency, reload }: {
  companyId: number; items: CatalogItem[]; stock: Map<number, number>; accounts: Account[]; settings: FinanceSettings; currency: string; reload: () => void;
}) {
  const access = useCompanyAccess();
  const canWrite = access.canWrite('inventory'), canRemove = access.canRemove('inventory');
  const [kind, setKind] = useState('all');
  const [use, setUse] = useState('all');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Partial<CatalogItem> | null>(null);
  const q = search.trim().toLowerCase();
  const shown = items.filter(i => (showArchived || !i.archived) && (kind === 'all' || i.kind === kind) && (use === 'all' || (i.used_for || 'both') === 'both' || i.used_for === use)
    && (!q || [i.name, i.code, i.category, i.description].some(v => (v || '').toLowerCase().includes(q))));
  const M = (n: number) => money(n, currency);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <Space wrap>
          <Segmented value={kind} onChange={v => setKind(String(v))} options={[{ value: 'all', label: 'All' }, { value: 'product', label: 'Products' }, { value: 'service', label: 'Services' }]} />
          <Segmented value={use} onChange={v => setUse(String(v))} options={[{ value: 'all', label: 'Sales & purchases' }, { value: 'sales', label: 'Sales' }, { value: 'purchases', label: 'Purchases' }]} />
          <Input allowClear prefix={<SearchOutlined />} placeholder="Search name, code, category" style={{ width: 260 }} value={search} onChange={e => setSearch(e.target.value)} />
          <Space size={6}><Switch size="small" checked={showArchived} onChange={setShowArchived} /><Text type="secondary">Show archived</Text></Space>
        </Space>
        {canWrite && <Space>
          <Button icon={<PlusOutlined />} onClick={() => setEditing({ kind: 'service' })}>Service</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ kind: 'product' })}>Product</Button>
        </Space>}
      </div>
      <Table rowKey="id" size="small" dataSource={shown} pagination={{ pageSize: 50, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing in the catalog yet" /> }}
        columns={[
          { title: 'Code', dataIndex: 'code', width: 110, render: (v: string | null) => v || '—' },
          { title: 'Name', key: 'n', render: (_, i) => <a onClick={() => setEditing(i)}>{i.name}</a>, sorter: (a, b) => a.name.localeCompare(b.name) },
          { title: 'Type', key: 'k', width: 100, render: (_, i) => <Tag color={i.kind === 'product' ? 'blue' : 'purple'}>{i.kind === 'product' ? 'Product' : 'Service'}</Tag> },
          { title: 'Used for', key: 'u', width: 110, render: (_, i) => ({ sales: 'Sales', purchases: 'Purchases', both: 'Both' } as Record<string, string>)[i.used_for || 'both'] },
          { title: 'Category', dataIndex: 'category', render: (v: string | null) => v || '—' },
          { title: 'Selling price', key: 's', align: 'right' as const, render: (_, i) => i.used_for === 'purchases' ? '—' : `${money(i.sale_price, i.currency || currency)}${i.unit ? ` / ${i.unit}` : ''}` },
          { title: 'Cost', key: 'c', align: 'right' as const, render: (_, i) => (Number(i.purchase_price) ? money(i.purchase_price, i.purchase_currency || i.currency || currency) : '—') },
          {
            title: 'In stock', key: 'st', align: 'right' as const, render: (_, i) => {
              if (!i.track_stock) return <Text type="secondary">—</Text>;
              const q2 = stock.get(i.id) ?? 0;
              const low = i.reorder_level != null && q2 <= Number(i.reorder_level);
              return <span style={{ color: q2 < 0 ? '#ff7875' : low ? '#faad14' : undefined }}>{q2}{i.unit ? ` ${i.unit}` : ''}{low ? ' · reorder' : ''}</span>;
            },
          },
          { title: '', key: 'x', width: 60, render: (_, i) => i.archived ? <Tag>archived</Tag> : null },
          {
            title: '', key: 'a', width: 90, render: (_, i) => canWrite && (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(i)} />
                {canRemove && <Popconfirm title={`Delete ${i.name}?`} description="Invoices and bills that used it keep their lines."
                  onConfirm={async () => { try { await catalogService.remove(i.id); message.success('Deleted'); reload(); } catch (e: any) { message.error(e.message); } }}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>}
              </Space>
            ),
          },
        ]} />
      {editing && <ItemDrawer companyId={companyId} item={editing} accounts={accounts} settings={settings} currency={currency}
        categories={[...new Set(items.map(i => i.category).filter(Boolean) as string[])]}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

export function ItemDrawer({ companyId, item, accounts, settings, currency, categories, onClose, onSaved }: {
  companyId: number; item: Partial<CatalogItem>; accounts: Account[]; settings: FinanceSettings; currency: string; categories: string[];
  onClose: () => void; onSaved: (id: number) => void;
}) {
  const canWrite = useCompanyAccess().canWrite('inventory');
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const kind = Form.useWatch('kind', form) ?? item.kind;
  const track = Form.useWatch('track_stock', form);
  // sold, bought, or both: only the matching prices and accounts are asked for
  const usedFor = Form.useWatch('used_for', form) ?? item.used_for ?? 'both';
  const sells = usedFor !== 'purchases', buys = usedFor !== 'sales';
  // prices in any currency: the ones your suppliers (or customers) use come first, then your own, then the rest
  const priceCur = Form.useWatch('currency', form) || item.currency || currency;
  const buyWatch = Form.useWatch('purchase_currency', form);
  const buyCur = (sells && buys ? buyWatch : null) || priceCur;
  // special prices for particular customers
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [custPrices, setCustPrices] = useState<{ contact_id: number | null; price: number | null }[]>([]);
  const mode: StockMode = Form.useWatch('stock_mode', form) ?? item.stock_mode ?? 'normal';
  const basis = Form.useWatch('price_basis', form) ?? item.price_basis ?? 'per_kg';
  const saleBasis = Form.useWatch('sale_basis', form) ?? item.sale_basis ?? basis;
  const [classes, setClasses] = useState<WeightClass[]>([]);
  useEffect(() => {
    if (item.id) catalogService.classes(companyId).then(cs => setClasses(cs.filter(c => c.item_id === item.id))).catch(() => null);
  }, [companyId, item.id]);
  const setClass = (i: number, patch: Partial<WeightClass>) => setClasses(cs => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  useEffect(() => {
    contactService.list(companyId).then(cs => { setCustomers(cs.filter(c => c.is_customer && !c.archived)); setContacts(cs.filter(c => !c.archived)); }).catch(() => { setCustomers([]); setContacts([]); });
    if (item.id) catalogService.prices(companyId, item.id).then(ps => setCustPrices(ps.map(p => ({ contact_id: p.contact_id, price: p.price })))).catch(() => null);
  }, [companyId, item.id]);
  const allCur = useMemo(() => currencyOptions(), []);
  const currencyGroups = (kind: 'suppliers' | 'customers', _for: string) => {
    const used = (flag: 'is_supplier' | 'is_customer') => [...new Set(contacts.filter(c => c[flag]).flatMap(c => contactCurrencies(c)))];
    const theirs = used(kind === 'suppliers' ? 'is_supplier' : 'is_customer');
    const mine = [...new Set([currency, ...accounts.filter(x => !x.archived && (x.subtype === 'bank' || x.subtype === 'cash') && x.currency).map(x => x.currency!), ...(item.currency ? [item.currency] : []), ...(item.purchase_currency ? [item.purchase_currency] : [])])].filter(c => !theirs.includes(c));
    const label = (c: string) => allCur.find(o => o.value === c)?.label || c;
    const rest = allCur.filter(o => !theirs.includes(o.value) && !mine.includes(o.value));
    return [
      ...(theirs.length ? [{ label: kind === 'suppliers' ? 'Your suppliers use' : 'Your customers use', options: theirs.map(c => ({ value: c, label: label(c) })) }] : []),
      { label: 'Your company and bank accounts', options: mine.map(c => ({ value: c, label: label(c) })) },
      { label: 'All currencies', options: rest },
    ];
  };
  const income = accounts.filter(a => a.type === 'income' && !a.archived);
  const costs = accounts.filter(a => (a.type === 'expense' || a.type === 'asset') && !a.archived && !['bank', 'cash', 'receivable'].includes(a.subtype || ''));
  const submit = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      const { purchase_currency: _pc, ...rest } = { ...item, ...v } as any;
      // stock by weight needs database update 046; items that don't use it never send it
      if (rest.stock_mode === 'normal' && !('stock_mode' in item)) { delete rest.stock_mode; delete rest.price_basis; delete rest.sale_basis; }
      if (rest.stock_mode === 'pieces') {
        if (!classes.length) throw new Error('Add at least one weight class');
        if (classes.some(c => c.min_kg == null || (c.max_kg != null && Number(c.max_kg) < Number(c.min_kg)))) throw new Error('Check the weight classes: “to” must not be below “from”');
      }
      if (rest.stock_mode === 'loose' && (!(rest.loose_unit || '').trim() || !(Number(rest.loose_factor) > 0))) throw new Error('Enter the small unit and how many make one ' + (rest.unit || 'unit'));
      // bought in another currency than it is sold in: only when it is both bought and sold
      const buyIn = sells && buys && v.purchase_currency && v.purchase_currency !== (v.currency || currency) ? v.purchase_currency : null;
      const id = await catalogService.save(companyId, { ...rest, tax_rate: v.tax_rate === 'default' ? null : v.tax_rate,
        currency: v.currency && v.currency !== currency ? v.currency : null,
        ...(buyIn || 'purchase_currency' in item ? { purchase_currency: buyIn } : {}) });
      if (rest.stock_mode === 'pieces') await catalogService.saveClasses(companyId, id, classes);
      await catalogService.setPrices(companyId, id, custPrices.filter(p => p.contact_id).map(p => ({ contact_id: p.contact_id!, price: Number(p.price) || 0 })));
      message.success('Saved'); onSaved(id);
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };
  // make sure the accounts exist before picking (first visit creates the standard chart)
  useEffect(() => { if (!accounts.length) accountService.list(companyId).catch(() => null); }, [accounts.length, companyId]);
  return (
    <Drawer open onClose={onClose} size={640} title={item.id ? item.name : kind === 'service' ? 'New service' : 'New product'}
      extra={canWrite && <Button type="primary" loading={saving} onClick={submit}>Save</Button>}>
      <ConfigProvider componentDisabled={!canWrite}>
      <Form form={form} layout="vertical" initialValues={{ kind: 'product', used_for: 'both', ...item, tax_rate: item.tax_rate == null ? 'default' : Number(item.tax_rate),
          // an empty selling basis means "the same as the buying basis"; show it as chosen
          price_basis: item.price_basis || 'per_kg', sale_basis: item.sale_basis || item.price_basis || 'per_kg',
          // stored empty when it is the company's own currency (or the same as the selling currency); show the real one
          currency: item.currency || currency, purchase_currency: item.purchase_currency || item.currency || currency }}>
        <Space size={16} wrap style={{ marginBottom: 16 }}>
          <Form.Item name="kind" noStyle><Segmented options={[{ value: 'product', label: 'Product' }, { value: 'service', label: 'Service' }]} /></Form.Item>
          <Form.Item name="used_for" noStyle><Segmented options={[{ value: 'sales', label: 'Sales' }, { value: 'purchases', label: 'Purchases' }, { value: 'both', label: 'Both' }]} /></Form.Item>
        </Space>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, alignItems: 'end' }}>
          <Form.Item name="code" label="Code / SKU"><Input placeholder="optional" /></Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
        </div>
        {/* the name is what goes on invoices; an older extra description can still be edited or cleared */}
        {item.description && <Form.Item name="description" label="Extra text after the name on invoices"><Input.TextArea autoSize={{ minRows: 1, maxRows: 6 }} /></Form.Item>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
          <Form.Item name="unit" label="Unit"><Input placeholder={kind === 'service' ? 'e.g. hour, project' : 'e.g. pc, box, kg'} /></Form.Item>
          <Form.Item name="currency" label={sells && buys ? 'Selling currency' : 'Currency'}>
            <Select showSearch optionFilterProp="label" options={currencyGroups(sells ? 'customers' : 'suppliers', 'item')} />
          </Form.Item>
          {sells && buys && (
            <Form.Item name="purchase_currency" label="Buying currency">
              <Select showSearch optionFilterProp="label" options={currencyGroups('suppliers', 'buy')} />
            </Form.Item>
          )}
          {sells && <Form.Item name="sale_price" label="Selling price"><AmountInput min={0} precision={2} prefix={priceCur} style={{ width: '100%' }} /></Form.Item>}
          {buys && <Form.Item name="purchase_price" label="Cost / buying price"><AmountInput min={0} precision={2} prefix={buyCur} style={{ width: '100%' }} /></Form.Item>}
        </div>
        {sells && <Card size="small" style={{ background: 'transparent', marginBottom: 16 }} title="Customer prices"
          extra={<Button size="small" icon={<PlusOutlined />} onClick={() => setCustPrices(ps => [...ps, { contact_id: null, price: Number(form.getFieldValue('sale_price')) || 0 }])}>Customer</Button>}>
          {!custPrices.length ? <Text type="secondary">Every customer pays the selling price.</Text> : custPrices.map((p, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, marginBottom: 8 }}>
              <Select showSearch optionFilterProp="label" placeholder="Customer" value={p.contact_id ?? undefined}
                onChange={v => setCustPrices(ps => ps.map((x, j) => (j === i ? { ...x, contact_id: v } : x)))}
                options={customers.filter(c => c.id === p.contact_id || !custPrices.some(x => x.contact_id === c.id)).map(c => ({ value: c.id, label: c.name }))} />
              <AmountInput min={0} precision={2} prefix={priceCur} style={{ width: '100%' }} value={p.price}
                onChange={v => setCustPrices(ps => ps.map((x, j) => (j === i ? { ...x, price: v } : x)))} />
              <Button icon={<DeleteOutlined />} onClick={() => setCustPrices(ps => ps.filter((_, j) => j !== i))} />
            </div>
          ))}
        </Card>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
          <Form.Item name="category" label="Category">
            <Select allowClear showSearch mode={undefined} options={categories.map(c => ({ value: c, label: c }))}
              placeholder="e.g. Design, Printing" onSearch={() => null}
              popupRender={menu => <>{menu}<div style={{ padding: 6 }}><Input size="small" placeholder="New category — press Enter"
                onPressEnter={e => form.setFieldValue('category', (e.target as HTMLInputElement).value)} /></div></>} />
          </Form.Item>
          {settings.gstRegistered && (
            <Form.Item name="tax_rate" label="GST">
              <Select options={[{ value: 'default', label: `Standard (${settings.gstRate}%)` }, { value: 0, label: '0% (zero-rated / exempt)' }]} />
            </Form.Item>
          )}
          {sells && <Form.Item name="income_account_id" label="Sales go to">
            <Select allowClear showSearch optionFilterProp="label" placeholder="4000 Sales" options={income.map(a => ({ value: a.id, label: `${a.code} ${a.name}` }))} />
          </Form.Item>}
          {buys && <Form.Item name="expense_account_id" label="Purchases go to">
            <Select allowClear showSearch optionFilterProp="label" placeholder={kind === 'product' ? '5000 Cost of sales' : '6990 General expenses'} options={costs.map(a => ({ value: a.id, label: `${a.code} ${a.name}` }))} />
          </Form.Item>}
        </div>
        {kind === 'product' && (
          <Card size="small" style={{ background: 'transparent' }}>
            <Form.Item name="track_stock" valuePropName="checked" style={{ marginBottom: track ? 12 : 0 }}>
              <Switch checkedChildren="Track stock" unCheckedChildren="Don't track stock" />
            </Form.Item>
            {track && (
              <>
              <Form.Item name="stock_mode" label="How is it stocked?" initialValue="normal">
                <Segmented options={[{ value: 'normal', label: 'Normal' }, { value: 'pieces', label: 'By weight class' }, { value: 'loose', label: 'Loose' }]} />
              </Form.Item>
              {mode === 'pieces' && (
                <div style={{ marginBottom: 12 }}>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                    Each piece has its own weight and is sold once. The weight decides the class and the price; buy them on a bill (one line per piece) or receive them in Stock → Pieces.
                  </Text>
                  <Space size={24} wrap align="start">
                    <Form.Item name="price_basis" label="Buying prices are">
                      <Segmented options={[{ value: 'per_kg', label: 'Per KG' }, { value: 'per_piece', label: 'Per piece' }]} />
                    </Form.Item>
                    <Form.Item name="sale_basis" label="Selling prices are">
                      <Segmented options={[{ value: 'per_kg', label: 'Per KG' }, { value: 'per_piece', label: 'Per piece' }]} />
                    </Form.Item>
                  </Space>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr 1.2fr auto', gap: 8, marginBottom: 4 }}>
                    <Text type="secondary">From (kg)</Text><Text type="secondary">To (kg)</Text>
                    <Text type="secondary">{saleBasis === 'per_kg' ? 'Selling / KG' : 'Selling / piece'}</Text><Text type="secondary">{basis === 'per_kg' ? 'Cost / KG' : 'Cost / piece'}</Text><span />
                  </div>
                  {classes.map((c, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr 1.2fr auto', gap: 8, marginBottom: 6 }}>
                      <InputNumber min={0} precision={3} style={{ width: '100%' }} value={c.min_kg} onChange={v => setClass(i, { min_kg: Number(v) || 0 })} />
                      <InputNumber min={0} precision={3} style={{ width: '100%' }} placeholder="no limit" value={c.max_kg ?? undefined} onChange={v => setClass(i, { max_kg: v == null ? null : Number(v) })} />
                      <AmountInput min={0} precision={2} style={{ width: '100%' }} value={c.sale_price} onChange={v => setClass(i, { sale_price: Number(v) || 0 })} />
                      <AmountInput min={0} precision={2} style={{ width: '100%' }} value={c.purchase_price} onChange={v => setClass(i, { purchase_price: Number(v) || 0 })} />
                      <Button icon={<DeleteOutlined />} onClick={() => setClasses(cs => cs.filter((_, j) => j !== i))} />
                    </div>
                  ))}
                  <Button size="small" icon={<PlusOutlined />} onClick={() => setClasses(cs => {
                    const last = [...cs].sort((a, b) => Number(a.min_kg) - Number(b.min_kg)).pop();
                    return [...cs, { min_kg: last ? (last.max_kg != null ? Math.floor(Number(last.max_kg)) + 1 : Number(last.min_kg) + 1) : 0, max_kg: null, sale_price: 0, purchase_price: 0 }];
                  })}>Add a weight class</Button>
                </div>
              )}
              {mode === 'loose' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
                  <Form.Item name="loose_unit" label="Sold in a smaller unit"><Input placeholder="e.g. g" /></Form.Item>
                  <Form.Item name="loose_factor" label={`How many make one ${form.getFieldValue('unit') || item.unit || 'unit'}`}><InputNumber min={0} style={{ width: '100%' }} placeholder="e.g. 1,000" /></Form.Item>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
                {mode !== 'pieces' && <Form.Item name="opening_qty" label="Stock when you started" tooltip="Bills add stock, invoices take it away, and you can adjust it on the Stock tab.">
                  <InputNumber style={{ width: '100%' }} />
                </Form.Item>}
                <Form.Item name="reorder_level" label="Remind me to reorder at"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
              </div>
              </>
            )}
          </Card>
        )}
        <Form.Item name="archived" valuePropName="checked" style={{ marginTop: 12 }}>
          <Switch checkedChildren="Archived" unCheckedChildren="In use" />
        </Form.Item>
      </Form>
      </ConfigProvider>
    </Drawer>
  );
}

function StockTab({ companyId, items, stock, docs, adjustments, pieces, classes, currency, reload }: {
  companyId: number; items: CatalogItem[]; stock: Map<number, number>; docs: Docs; adjustments: StockAdjustment[]; pieces: Piece[]; classes: WeightClass[]; currency: string; reload: () => void;
}) {
  const access = useCompanyAccess();
  const canWrite = access.canWrite('inventory'), canRemove = access.canRemove('inventory');
  const tracked = items.filter(i => i.track_stock && !i.archived);
  const [history, setHistory] = useState<CatalogItem | null>(null);
  const [adjusting, setAdjusting] = useState<CatalogItem | null>(null);
  const [piecesOf, setPiecesOf] = useState<CatalogItem | null>(null);
  const inStock = (i: CatalogItem) => piecesInStock(i.id, pieces, docs as any);
  const costOf = (i: CatalogItem) => (i.stock_mode === 'pieces' ? piecesCost(i, inStock(i), classes.filter(c => c.item_id === i.id)) : Math.max(0, stock.get(i.id) ?? 0) * Number(i.purchase_price || 0));
  const value = tracked.reduce((s, i) => s + costOf(i), 0);
  const low = tracked.filter(i => i.reorder_level != null && (stock.get(i.id) ?? 0) <= Number(i.reorder_level));
  if (!tracked.length) return <Empty description="No products are tracking stock. Turn on “Track stock” on a product." />;
  return (
    <div>
      <Space size={16} style={{ marginBottom: 12 }} wrap>
        <Card size="small" style={{ minWidth: 200 }}><Statistic title="Stock value (at cost)" value={money(value, currency)} /></Card>
        <Card size="small" style={{ minWidth: 200 }}><Statistic title="Need reordering" value={low.length} styles={{ content: { color: low.length ? '#faad14' : undefined } }} /></Card>
      </Space>
      <Table rowKey="id" size="small" dataSource={tracked} pagination={false}
        columns={[
          { title: 'Code', dataIndex: 'code', render: (v: string | null) => v || '—' },
          { title: 'Product', key: 'n', render: (_, i) => <a onClick={() => setHistory(i)}>{i.name}</a> },
          { title: 'In stock', key: 'q', align: 'right' as const, render: (_, i) => {
            if (i.stock_mode === 'pieces') { const ps = inStock(i); return <b>{ps.length} pcs · {kgText(ps.reduce((s, p) => s + p.weight, 0))} kg</b>; }
            const q = stock.get(i.id) ?? 0;
            return <b style={{ color: q < 0 ? '#ff7875' : undefined }}>{q}{i.unit ? ` ${i.unit}` : ''}{i.stock_mode === 'loose' && i.loose_unit && i.loose_factor ? ` (${Math.round(q * Number(i.loose_factor) * 100) / 100} ${i.loose_unit})` : ''}</b>;
          } },
          { title: 'Reorder at', dataIndex: 'reorder_level', align: 'right' as const, render: (v: number | null) => (v == null ? '—' : v) },
          { title: 'Value at cost', key: 'v', align: 'right' as const, render: (_, i) => money(costOf(i), currency) },
          { title: '', key: 'a', width: 120, render: (_, i) => canWrite && (i.stock_mode === 'pieces'
            ? <Button size="small" icon={<SwapOutlined />} onClick={() => setPiecesOf(i)}>Pieces</Button>
            : <Button size="small" icon={<SwapOutlined />} onClick={() => setAdjusting(i)}>Adjust</Button>) },
        ]} />
      {piecesOf && <PiecesDrawer companyId={companyId} item={piecesOf} pieces={inStock(piecesOf)} classes={classes.filter(c => c.item_id === piecesOf.id)} currency={currency} canWrite={canWrite} onClose={() => setPiecesOf(null)} onChanged={reload} />}
      {adjusting && <AdjustModal companyId={companyId} item={adjusting} current={stock.get(adjusting.id) ?? 0} onClose={() => setAdjusting(null)} onDone={() => { setAdjusting(null); reload(); }} />}
      {history && (
        <Drawer open onClose={() => setHistory(null)} size={720} title={`${history.name} — stock history`}>
          <Table rowKey={(_, i) => String(i)} size="small" pagination={false} dataSource={(() => {
            let run = 0;
            return stockMoves(history, docs, adjustments, pieces).map(m => ({ ...m, balance: (run = Math.round((run + m.quantity) * 10000) / 10000) }));
          })()}
            columns={[
              { title: 'Date', dataIndex: 'date', render: (v: string) => fmtDate(v) || '—' },
              { title: 'What', dataIndex: 'kind', render: (k: string) => ({ opening: 'Opening stock', sold: 'Sold', bought: 'Bought', returned: 'Returned', adjusted: 'Adjusted' } as Record<string, string>)[k] },
              { title: 'Ref', dataIndex: 'ref' }, { title: 'Note', dataIndex: 'note', render: (v?: string) => v || '' },
              { title: 'Change', dataIndex: 'quantity', align: 'right' as const, render: (v: number) => <span style={{ color: v < 0 ? '#ff7875' : '#73d13d' }}>{v > 0 ? `+${v}` : v}</span> },
              { title: 'In stock', dataIndex: 'balance', align: 'right' as const },
            ]} />
          {adjustments.filter(a => a.item_id === history.id).length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">Adjustments can be removed:</Text>
              {adjustments.filter(a => a.item_id === history.id).map(a => (
                <div key={a.id} style={{ marginTop: 4 }}>
                  {fmtDate(a.adj_date)} · {a.quantity > 0 ? '+' : ''}{a.quantity} {a.reason ? `· ${a.reason}` : ''}{' '}
                  {canRemove && <Popconfirm title="Remove this adjustment?" onConfirm={async () => { await catalogService.removeAdjustment(a.id); reload(); setHistory(null); }}>
                    <Button size="small" type="link" danger>remove</Button>
                  </Popconfirm>}
                </div>
              ))}
            </div>
          )}
        </Drawer>
      )}
    </div>
  );
}

function PiecesDrawer({ companyId, item, pieces, classes, currency, canWrite, onClose, onChanged }: {
  companyId: number; item: CatalogItem; pieces: Piece[]; classes: WeightClass[]; currency: string; canWrite: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [text, setText] = useState('');
  const [date, setDate] = useState(dayjs());
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const weights = text.split(/[\s,;]+/).map(x => Number(x)).filter(x => x > 0);
    if (!weights.length) { message.error('Type the weights in kg, e.g. 2.3, 2.6, 3.1'); return; }
    setBusy(true);
    try { await catalogService.addPieces(companyId, item.id, weights, date.format('YYYY-MM-DD'), classes.map(c => ({ ...c, item_id: item.id })), 'Received'); setText(''); message.success(`${weights.length} piece${weights.length > 1 ? 's' : ''} added`); onChanged(); }
    catch (e: any) { message.error(e.message); }
    setBusy(false);
  };
  return (
    <Drawer open onClose={onClose} size={640} title={`${item.name} — pieces in stock`}>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>Pieces bought on a bill appear here by themselves. Add pieces that did not come on a bill (opening stock, a delivery you have not billed yet).</Text>
      {canWrite && (
        <Space wrap style={{ marginBottom: 16 }}>
          <Input style={{ width: 280 }} placeholder="Weights in kg, e.g. 2.3, 2.6, 3.1" value={text} onChange={e => setText(e.target.value)} onPressEnter={add} />
          <DatePicker allowClear={false} value={date} onChange={d => d && setDate(d)} />
          <Button type="primary" loading={busy} onClick={add}>Add pieces</Button>
        </Space>
      )}
      <Table rowKey="id" size="small" pagination={false} dataSource={[...pieces].sort((a, b) => a.weight - b.weight)} locale={{ emptyText: 'No pieces in stock' }}
        columns={[
          { title: 'Weight', dataIndex: 'weight', render: (w: number) => `${kgText(w)} kg` },
          { title: 'Class', key: 'c', render: (_, p) => { const c = classes.find(x => x.id === p.class_id) || classOf(classes, p.weight); return c ? classLabel(c) : <Text type="warning">No class</Text>; } },
          { title: 'Cost', key: 'cost', align: 'right' as const, render: (_, p) => { const c = classes.find(x => x.id === p.class_id); return c ? money(piecesCost(item, [p], classes), currency) : '—'; } },
          { title: 'From', key: 'f', render: (_, p) => (p.document_id ? 'A bill' : `Received ${fmtDate(p.received_date)}`) },
          { title: '', key: 'x', width: 60, render: (_, p) => canWrite && !p.document_id && (
            <Popconfirm title="Remove this piece?" onConfirm={async () => { try { await catalogService.removePiece(p.id); onChanged(); } catch (e: any) { message.error(e.message); } }}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>) },
        ]} />
    </Drawer>
  );
}

function AdjustModal({ companyId, item, current, onClose, onDone }: { companyId: number; item: CatalogItem; current: number; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'count' | 'change'>('count');
  const [qty, setQty] = useState<number | null>(current);
  const [date, setDate] = useState(dayjs());
  const [reason, setReason] = useState('');
  const change = mode === 'count' ? (qty ?? current) - current : (qty ?? 0);
  return (
    <Modal open title={`Adjust stock — ${item.name}`} onCancel={onClose} okText="Save" okButtonProps={{ disabled: !change }}
      onOk={async () => { try { await catalogService.adjust(companyId, item.id, change, date.format('YYYY-MM-DD'), reason); message.success('Stock adjusted'); onDone(); } catch (e: any) { message.error(e.message); } }}>
      <Text type="secondary">In stock now: <b>{current}{item.unit ? ` ${item.unit}` : ''}</b></Text>
      <div style={{ margin: '12px 0' }}>
        <Segmented value={mode} onChange={v => { setMode(v as any); setQty(v === 'count' ? current : 0); }}
          options={[{ value: 'count', label: 'I counted the stock' }, { value: 'change', label: 'Add / remove an amount' }]} />
      </div>
      <Space wrap>
        <InputNumber value={qty} onChange={v => setQty(v)} placeholder={mode === 'count' ? 'Counted' : '+ or −'} />
        <DatePicker allowClear={false} value={date} onChange={d => d && setDate(d)} />
      </Space>
      <Input style={{ marginTop: 8 }} placeholder="Reason, e.g. stock take, damaged, sample" value={reason} onChange={e => setReason(e.target.value)} />
      <div style={{ marginTop: 8 }}>Change: <b style={{ color: change < 0 ? '#ff7875' : '#73d13d' }}>{change > 0 ? '+' : ''}{change}</b></div>
    </Modal>
  );
}
