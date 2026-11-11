import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Drawer, Form, Input, InputNumber, Checkbox, Space, Tag, message, Popconfirm, Switch, Typography, Divider, Empty, Select, ConfigProvider } from 'antd';
import { currencyOptions } from '../../../../utils/currencies';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { contactService, docService, priceListService } from '../../../../services/finance';
import type { PriceList } from '../../../../data/catalog';
import { balanceDue, inBase, isSalesDoc, contactCurrencies, type Contact, type ContactPerson, type FinDocument } from '../../../../data/finance';
import { money } from '../../../../data/documentLayouts';
import { useCompanyAccess } from '../../../../contexts/CompanyAccess';
import { fmtDate } from '../../../../utils/dateFormat';

const { Text } = Typography;

/**
 * Customers and suppliers with their people (person in charge, phone, email…).
 * Used by CRM (customers) and Finance (suppliers).
 */
export function ContactsManager({ companyId, kind, currency, onChanged }: { companyId: number; kind: 'customer' | 'supplier' | 'all'; currency: string; onChanged?: () => void }) {
  const access = useCompanyAccess();
  const canWrite = access.canWrite('crm'), canRemove = access.canRemove('crm');
  const [rows, setRows] = useState<Contact[]>([]);
  const [people, setPeople] = useState<ContactPerson[]>([]);
  const [docs, setDocs] = useState<FinDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Partial<Contact> | null>(null);

  const word = kind === 'all' ? 'contact' : kind;
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, p, d] = await Promise.all([
        contactService.list(companyId), contactService.peopleOf(companyId),
        docService.list(companyId, kind === 'customer' ? ['invoice'] : kind === 'supplier' ? ['bill', 'expense'] : ['invoice', 'bill', 'expense']),
      ]);
      setRows(c); setPeople(p); setDocs(d);
    } catch (e: any) {
      message.error(/contacts|does not exist/i.test(e.message) ? 'Finance and CRM need database update 024 — ask your administrator to run it.' : e.message);
    }
    setLoading(false);
  }, [companyId, kind]);
  useEffect(() => { load(); }, [load]);

  const owedBy = (id: number, types: string[]) => docs.filter(d => d.contact_id === id && types.includes(d.doc_type) && !['void', 'draft'].includes(d.status)).reduce((s, d) => s + inBase(d, balanceDue(d)), 0);
  const owesUs = (id: number) => owedBy(id, ['invoice']);
  const weOwe = (id: number) => owedBy(id, ['bill', 'expense']);
  const q = search.trim().toLowerCase();
  const list = rows
    .filter(c => (kind === 'customer' ? c.is_customer : kind === 'supplier' ? c.is_supplier : c.is_customer || c.is_supplier))
    .filter(c => showArchived || !c.archived)
    .filter(c => !q || [c.name, c.email, c.phone, ...people.filter(p => p.contact_id === c.id).map(p => p.name)].some(v => (v || '').toLowerCase().includes(q)));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <Space wrap>
          <Input allowClear prefix={<SearchOutlined />} placeholder={`Search ${word}s or people`} style={{ width: 260 }} value={search} onChange={e => setSearch(e.target.value)} />
          <Space size={6}><Switch size="small" checked={showArchived} onChange={setShowArchived} /><Text style={{ color: 'rgba(240,237,230,0.7)' }}>Show archived</Text></Space>
        </Space>
        {canWrite && <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ is_customer: kind !== 'supplier', is_supplier: kind === 'supplier' })}>{kind === 'all' ? 'Contact' : `Add ${word}`}</Button>}
      </div>
      <Table rowKey="id" size="small" loading={loading} dataSource={list} pagination={{ pageSize: 50, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No ${word}s yet`} /> }}
        columns={[
          { title: 'Name', key: 'n', render: (_, c) => <a onClick={() => setEditing(c)}>{c.name}</a>, sorter: (a, b) => a.name.localeCompare(b.name) },
          {
            title: 'Person in charge', key: 'p', render: (_, c) => {
              const ps = people.filter(p => p.contact_id === c.id);
              const main = ps.find(p => p.is_primary) || ps[0];
              return main ? <span>{main.name}{main.designation ? <Text type="secondary"> · {main.designation}</Text> : null}{ps.length > 1 ? <Text type="secondary"> +{ps.length - 1}</Text> : null}</span> : '—';
            },
          },
          { title: 'Email', dataIndex: 'email', render: (v: string) => v ? <a href={`mailto:${v}`}>{v}</a> : '—' },
          { title: 'Phone', dataIndex: 'phone', render: (v: string) => v || '—' },
          ...(kind === 'all' ? [{
            title: 'Type', key: 'type', render: (_: any, c: Contact) => <Space size={4}>{c.is_customer && <Tag color="blue">Customer</Tag>}{c.is_supplier && <Tag color="purple">Supplier</Tag>}{c.archived && <Tag>archived</Tag>}</Space>,
            filters: [{ value: 'c', text: 'Customers' }, { value: 's', text: 'Suppliers' }], onFilter: (v: any, c: Contact) => (v === 'c' ? c.is_customer : c.is_supplier),
          }] : []),
          ...(kind !== 'supplier' ? [{
            title: 'Owes us', key: 'o', align: 'right' as const, sorter: (a: Contact, b: Contact) => owesUs(a.id) - owesUs(b.id),
            render: (_: any, c: Contact) => { const v = owesUs(c.id); return v > 0 ? <b>{money(v, currency)}</b> : <Text type="secondary">—</Text>; },
          }] : []),
          ...(kind !== 'customer' ? [{
            title: 'We owe', key: 'w', align: 'right' as const, sorter: (a: Contact, b: Contact) => weOwe(a.id) - weOwe(b.id),
            render: (_: any, c: Contact) => { const v = weOwe(c.id); return v > 0 ? <b>{money(v, currency)}</b> : <Text type="secondary">—</Text>; },
          }] : []),
          ...(kind !== 'all' ? [{ title: '', key: 't', render: (_: any, c: Contact) => <Space size={4}>{c.is_customer && c.is_supplier && <Tag>{kind === 'customer' ? 'also supplier' : 'also customer'}</Tag>}{c.archived && <Tag>archived</Tag>}</Space> }] : []),
          {
            title: '', key: 'a', width: 90, render: (_, c) => canWrite && (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(c)} />
                {canRemove && <Popconfirm title={`Delete ${c.name}?`} description="Contacts with invoices or bills can't be deleted — archive them instead."
                  onConfirm={async () => { try { await contactService.remove(c.id); message.success('Deleted'); load(); } catch (e: any) { message.error(e.message); } }}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>}
              </Space>
            ),
          },
        ]} />
      {editing && (
        <ContactDrawer companyId={companyId} contact={editing} word={word} currency={currency}
          docs={editing.id ? docs.filter(d => d.contact_id === editing.id) : []}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); onChanged?.(); }} />
      )}
    </div>
  );
}

export function ContactDrawer({ companyId, contact, word, currency, docs, onClose, onSaved }: {
  companyId: number; contact: Partial<Contact>; word: string; currency: string; docs: FinDocument[];
  onClose: () => void; onSaved: (id: number) => void;
}) {
  const canWrite = useCompanyAccess().canWrite('crm');
  const [form] = Form.useForm();
  const [people, setPeople] = useState<ContactPerson[]>([]);
  const [saving, setSaving] = useState(false);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  useEffect(() => { priceListService.lists(companyId).then(l => setPriceLists(l.filter(x => !x.archived || x.id === contact.price_list_id || x.id === contact.purchase_price_list_id))).catch(() => setPriceLists([])); }, [companyId, contact.price_list_id, contact.purchase_price_list_id]);
  const isCustomer = Form.useWatch('is_customer', form);

  useEffect(() => {
    form.setFieldsValue({ is_customer: true, ...contact, currency: contactCurrencies(contact) });
    if (contact.id) contactService.people(contact.id).then(setPeople).catch(() => setPeople([]));
    else setPeople([{ name: '', is_primary: true }]);
  }, [contact, form]);

  const setPerson = (i: number, patch: Partial<ContactPerson>) => setPeople(ps => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const save = async () => {
    const v = await form.validateFields();
    if (!v.is_customer && !v.is_supplier) { message.error('Tick customer, supplier or both'); return; }
    setSaving(true);
    try {
      const savedId = await contactService.save(companyId, { ...contact, ...v, currency: (v.currency || []).join(',') || null }, people);
      message.success('Saved');
      onSaved(savedId);
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };

  const outstanding = docs.filter(d => !['void', 'draft'].includes(d.status)).reduce((s, d) => s + inBase(d, balanceDue(d)), 0);
  return (
    <Drawer open onClose={onClose} size={720} title={contact.id ? contact.name : `New ${word}`}
      extra={canWrite && <Button type="primary" loading={saving} onClick={save}>Save</Button>}>
      <ConfigProvider componentDisabled={!canWrite}>
      <Form form={form} layout="vertical">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
          <Form.Item name="name" label="Company / name" rules={[{ required: true }]} style={{ gridColumn: '1 / -1' }}><Input /></Form.Item>
          <Form.Item name="reg_no" label="Company registration no."><Input /></Form.Item>
          <Form.Item name="tax_no" label="Tax registration no."><Input /></Form.Item>
          <Form.Item name="email" label="Email"><Input /></Form.Item>
          <Form.Item name="phone" label="Phone"><Input /></Form.Item>
          <Form.Item name="website" label="Website"><Input /></Form.Item>
          <Form.Item name="payment_terms_days" label="Payment terms (days)"><InputNumber min={0} style={{ width: '100%' }} placeholder="Company default" /></Form.Item>
          <Form.Item name="currency" label="Currencies they bill / pay in">
            <Select mode="multiple" showSearch allowClear optionFilterProp="label" placeholder={currency} options={currencyOptions()} />
          </Form.Item>
          {isCustomer !== false && priceLists.some(l => (l.kind || 'sales') === 'sales') && (
            <Form.Item name="price_list_id" label="Price list (selling prices)" style={{ gridColumn: '1 / -1' }}>
              <Select allowClear placeholder="Normal selling prices" options={priceLists.filter(l => (l.kind || 'sales') === 'sales').map(l => ({ value: l.id, label: l.name }))} />
            </Form.Item>
          )}
          <Form.Item name="address" label="Address" style={{ gridColumn: '1 / -1' }}><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} /></Form.Item>
          <Form.Item name="notes" label="Notes" style={{ gridColumn: '1 / -1' }}><Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} /></Form.Item>
        </div>
        <Space size={24}>
          <Form.Item name="is_customer" valuePropName="checked" style={{ marginBottom: 0 }}><Checkbox>Customer</Checkbox></Form.Item>
          <Form.Item name="is_supplier" valuePropName="checked" style={{ marginBottom: 0 }}><Checkbox>Supplier</Checkbox></Form.Item>
          <Form.Item name="archived" valuePropName="checked" style={{ marginBottom: 0 }}><Checkbox>Archived</Checkbox></Form.Item>
        </Space>
      </Form>

      <Divider titlePlacement="start">People</Divider>
      {people.map((p, i) => (
        <div key={p.id ?? `n${i}`} style={{ display: 'grid', gridTemplateColumns: '32px 1.3fr 1fr 1.3fr 1fr 32px', gap: 6, marginBottom: 6 }}>
          <Button type="text" title="Main person in charge" icon={p.is_primary ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
            onClick={() => setPeople(ps => ps.map((x, j) => ({ ...x, is_primary: j === i })))} />
          <Input placeholder="Name" value={p.name} onChange={e => setPerson(i, { name: e.target.value })} />
          <Input placeholder="Designation" value={p.designation || ''} onChange={e => setPerson(i, { designation: e.target.value })} />
          <Input placeholder="Email" value={p.email || ''} onChange={e => setPerson(i, { email: e.target.value })} />
          <Input placeholder="Phone" value={p.phone || ''} onChange={e => setPerson(i, { phone: e.target.value })} />
          <Button icon={<DeleteOutlined />} onClick={() => setPeople(ps => ps.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button size="small" icon={<PlusOutlined />} onClick={() => setPeople(ps => [...ps, { name: '', is_primary: ps.length === 0 }])}>Add a person</Button>

      {contact.id && (
        <>
          <Divider titlePlacement="start">{word === 'customer' ? 'Invoices' : word === 'supplier' ? 'Bills' : 'Invoices and bills'}</Divider>
          {docs.length === 0 ? <Text type="secondary">None yet</Text> : (
            <>
              <Text>Outstanding: <b>{money(outstanding, currency)}</b></Text>
              <Table rowKey="id" size="small" style={{ marginTop: 8 }} pagination={false} dataSource={docs}
                columns={[
                  { title: 'Number', dataIndex: 'number' },
                  { title: 'Date', dataIndex: 'issue_date', render: (v: string) => fmtDate(v) },
                  { title: 'Total', key: 't', align: 'right' as const, render: (_, d) => money(d.total, d.currency) },
                  { title: 'Balance', key: 'b', align: 'right' as const, render: (_, d) => (isSalesDoc(d.doc_type) || d.doc_type === 'bill') && d.status !== 'void' ? money(balanceDue(d), d.currency) : '—' },
                  { title: 'Status', dataIndex: 'status' },
                ]} />
            </>
          )}
        </>
      )}
      </ConfigProvider>
    </Drawer>
  );
}
