import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Modal, Form, Select, DatePicker, Input, message, Table, Tag, Alert, Space, Upload, Popconfirm, Segmented, AutoComplete, Typography } from 'antd';
import { PlusOutlined, PaperClipOutlined, UploadOutlined, DeleteOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { claimService, claimAccountService, claimAccountOf, CLAIM_CATEGORIES, type Claim, type ClaimReceipt } from '../../../../services/claims';
import { leaveService, hrService, type Employee } from '../../../../services/hr';
import { ATTACH_TYPES, accountService } from '../../../../services/finance';
import type { Account } from '../../../../data/finance';
import { workflowService, approverLabel, type RequestStatus } from '../../../../services/workflow';
import { useAuth } from '../../../../contexts/AuthContext';
import { useCompanyAccess } from '../../../../contexts/CompanyAccess';
import { supabase } from '../../../../utils/supabase';
import { money } from '../../../../data/documentLayouts';
import { AmountInput } from '../../../../components/AmountInput';
import { FileViewer } from '../../../../components/FileViewer';
import { fmtDate } from '../../../../utils/dateFormat';

const { Text } = Typography;
export const CLAIM_STATUS_COLOR: Record<string, string> = { pending: 'gold', approved: 'green', rejected: 'red', cancelled: 'default' };
const COMMON_CURRENCIES = ['SGD', 'HKD', 'MYR', 'USD', 'EUR', 'GBP', 'AUD', 'CNY', 'JPY', 'THB', 'IDR', 'PHP', 'VND', 'INR', 'AED'];

async function companyCurrency(companyId: number): Promise<string> {
  const { data } = await supabase.from('companies').select('currency').eq('id', companyId).maybeSingle();
  return data?.currency || 'SGD';
}

/** Paid / waiting for payment, from the staff-claim expense Finance made. */
function usePaidState(claims: Claim[], companyCurrency = '') {
  const [paid, setPaid] = useState<Map<number, number>>(new Map());
  useEffect(() => {
    const ids = [...new Set(claims.map(c => c.document_id).filter(Boolean))] as number[];
    if (!ids.length) { setPaid(new Map()); return; }
    supabase.from('fin_documents').select('id, total, amount_paid').in('id', ids)
      .then(({ data }) => setPaid(new Map((data || []).map((d: any) => [d.id, Number(d.total) - Number(d.amount_paid)]))));
  }, [claims]);
  return (c: Claim) => {
    if (c.status !== 'approved') return null;
    if (c.payroll_run_id) return <Tag color="green">In payroll</Tag>;
    if (!c.document_id) return <Tag>{'payroll_run_id' in c && c.currency === companyCurrency ? 'Next payroll run' : 'Waiting for Finance'}</Tag>;
    const due = paid.get(c.document_id);
    return due != null && due <= 0.004 ? <Tag color="green">Paid</Tag> : <Tag color="blue">To be paid</Tag>;
  };
}

function Receipts({ files, canRemove, onRemove, onView }: { files: ClaimReceipt[]; canRemove: boolean; onRemove: (f: ClaimReceipt) => void; onView: (f: ClaimReceipt) => void }) {
  if (!files.length) return <Text type="secondary">—</Text>;
  return (
    <Space orientation="vertical" size={0}>
      {files.map(f => (
        <Space key={f.id} size={4}>
          <PaperClipOutlined /><a onClick={() => onView(f)}>{f.file_name}</a>
          {canRemove && (
            <Popconfirm title={`Remove ${f.file_name}?`} onConfirm={() => onRemove(f)}>
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ))}
    </Space>
  );
}

/** Add or change a claim, with its receipts. */
function ClaimModal({ companyId, employeeId, currency, claim, onClose, onSaved }: {
  companyId: number; employeeId: number; currency: string; claim: Partial<Claim> | null; onClose: () => void; onSaved: () => void;
}) {
  const [form] = Form.useForm();
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const submit = async (v: any) => {
    setSaving(true);
    try {
      const id = await claimService.save(companyId, {
        id: claim?.id, employee_id: claim?.employee_id || employeeId, claim_date: dayjs(v.claim_date).format('YYYY-MM-DD'),
        category: v.category, description: v.description, amount: Number(v.amount), currency: v.currency,
      });
      for (const f of files) await claimService.addReceipt(companyId, id, f);
      message.success(claim?.id ? 'Claim updated' : 'Claim submitted — pending approval');
      onSaved();
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };
  return (
    <Modal open title={claim?.id ? 'Change claim' : 'New claim'} onCancel={onClose} onOk={() => form.submit()} okText={claim?.id ? 'Save' : 'Submit'} confirmLoading={saving} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={submit}
        initialValues={{ claim_date: dayjs(claim?.claim_date || undefined), currency: claim?.currency || currency, category: claim?.category, description: claim?.description, amount: claim?.amount }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="claim_date" label="Date of expense" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="category" label="Category" rules={[{ required: true, message: 'Choose or type a category' }]}>
            <AutoComplete options={CLAIM_CATEGORIES.map(c => ({ value: c }))} filterOption={(i, o) => String(o?.value).toLowerCase().includes(i.toLowerCase())} />
          </Form.Item>
          <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
            <Select showSearch options={[...new Set([currency, ...COMMON_CURRENCIES])].map(c => ({ value: c, label: c }))} />
          </Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }, { validator: (_, v) => (Number(v) > 0 ? Promise.resolve() : Promise.reject(new Error('Enter the amount'))) }]}>
            <AmountInput style={{ width: '100%' }} precision={2} min={0} />
          </Form.Item>
        </div>
        <Form.Item name="description" label="What was it for"><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} /></Form.Item>
        <Form.Item label="Receipts">
          <Space orientation="vertical" size={4}>
            {files.map((f, i) => (
              <Space key={i} size={4}><PaperClipOutlined /><span>{f.name}</span>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))} /></Space>
            ))}
            <Upload accept={ATTACH_TYPES} multiple showUploadList={false} beforeUpload={f => { setFiles(fs => [...fs, f]); return false; }}>
              <Button size="small" icon={<UploadOutlined />}>Attach receipt</Button>
            </Upload>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}

/** HR → My Claims: the signed-in person's own claims. */
export function MyClaimsTab({ companyId }: { companyId: number }) {
  const { user } = useAuth();
  const [me, setMe] = useState<Employee | null>(null);
  const [currency, setCurrency] = useState('SGD');
  const [claims, setClaims] = useState<Claim[]>([]);
  const [files, setFiles] = useState<ClaimReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Claim> | null>(null);
  const [viewing, setViewing] = useState<ClaimReceipt | null>(null);
  const paidState = usePaidState(claims, currency);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rec = await leaveService.myEmployeeRecord(companyId, user!.id);
      setMe(rec);
      setCurrency(await companyCurrency(companyId));
      if (rec) {
        const list = await claimService.list(companyId, { employeeId: rec.id });
        setClaims(list);
        setFiles(await claimService.receipts(list.map(c => c.id)));
      }
    } catch (e: any) { message.error(e.message); }
    setLoading(false);
  }, [companyId, user]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Card loading />;
  if (!me) return (
    <Alert type="warning" showIcon title="No employee record linked to your login"
      description="Ask an admin to add you under HR → Employees and set your account as the Login Account." />
  );
  const pendingTotal = claims.filter(c => c.status === 'pending' && c.currency === currency).reduce((s, c) => s + c.amount, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ color: 'rgba(240,237,230,0.5)' }}>{me.full_name} · {me.employee_code}{pendingTotal ? ` · ${money(pendingTotal, currency)} pending` : ''}</span>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}
          style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>New Claim</Button>
      </div>
      <Table dataSource={claims} rowKey="id" size="small" pagination={{ pageSize: 50, hideOnSinglePage: true }}
        locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No claims yet</span> }}
        columns={[
          { title: 'Date', dataIndex: 'claim_date', render: (v: string) => fmtDate(v), width: 110 },
          { title: 'Category', dataIndex: 'category' },
          { title: 'Description', dataIndex: 'description', render: (v: string | null) => v || '—' },
          { title: 'Amount', key: 'a', align: 'right' as const, render: (_, c) => money(c.amount, c.currency) },
          { title: 'Receipts', key: 'r', render: (_, c) => (
            <Receipts files={files.filter(f => f.claim_id === c.id)} canRemove={c.status === 'pending'} onView={setViewing}
              onRemove={async f => { try { await claimService.removeReceipt(f); load(); } catch (e: any) { message.error(e.message); } }} />
          ) },
          { title: 'Status', key: 's', render: (_, c) => (
            <Space size={4} wrap>
              <Tag color={CLAIM_STATUS_COLOR[c.status]}>{c.status[0].toUpperCase() + c.status.slice(1)}</Tag>
              {paidState(c)}
              {c.decision_note && <Text type="secondary" style={{ fontSize: 12 }}>{c.decision_note}</Text>}
            </Space>
          ) },
          { title: '', key: 'x', width: 150, render: (_, c) => c.status === 'pending' && (
            <Space size={4}>
              <Button size="small" onClick={() => setEditing(c)}>Change</Button>
              <Popconfirm title="Cancel this claim?" onConfirm={async () => { try { await claimService.cancel(c.id); load(); } catch (e: any) { message.error(e.message); } }}>
                <Button size="small" danger>Cancel</Button>
              </Popconfirm>
            </Space>
          ) },
        ]} />
      {editing && <ClaimModal companyId={companyId} employeeId={me.id} currency={currency} claim={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {viewing && <FileViewer name={viewing.file_name} load={() => claimService.receiptBlob(viewing.path)} onClose={() => setViewing(null)} />}
    </div>
  );
}

/** HR → Claims: everyone's claims, for people with Claims → view / approve / edit. */
export function ClaimsTab({ companyId }: { companyId: number }) {
  const access = useCompanyAccess();
  const canApprove = access.can('claims', 'approve');
  const canWrite = access.canWrite('claims'), canRemove = access.canRemove('claims');
  const [claims, setClaims] = useState<Claim[]>([]);
  const [files, setFiles] = useState<ClaimReceipt[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [currency, setCurrency] = useState('SGD');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [editing, setEditing] = useState<Partial<Claim> | null>(null);
  const [newFor, setNewFor] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<Claim | null>(null);
  const [note, setNote] = useState('');
  const [viewing, setViewing] = useState<ClaimReceipt | null>(null);
  const [chain, setChain] = useState<Map<number, RequestStatus>>(new Map());
  const paidState = usePaidState(claims, currency);
  // which expense account each claim goes to: set per category (Category accounts), and by hand for the others
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [byCategory, setByCategory] = useState<Record<string, number>>({});
  const [catOpen, setCatOpen] = useState(false);
  const expenseOptions = accounts.filter(a => a.type === 'expense' && !a.archived).map(a => ({ value: a.id, label: `${a.code} ${a.name}` }));
  const loadAccounts = useCallback(async () => {
    setAccounts(await accountService.list(companyId).catch(() => []));
    setByCategory(await claimAccountService.get(companyId).catch(() => ({})));
  }, [companyId]);
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, emps, cur] = await Promise.all([claimService.list(companyId), hrService.listEmployees(companyId).catch(() => []), companyCurrency(companyId)]);
      setClaims(list); setEmployees(emps); setCurrency(cur);
      setFiles(await claimService.receipts(list.map(c => c.id)));
      setChain(await workflowService.status('claim', list.filter(c => c.status === 'pending').map(c => c.id)));
    } catch (e: any) { message.error(e.message); }
    setLoading(false);
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  const name = (id: number) => employees.find(e => Number(e.id) === id)?.full_name || '—';
  const shown = claims.filter(c => filter === 'all' || c.status === filter);
  const count = (s: string) => claims.filter(c => c.status === s).length;
  const decide = async (c: Claim, status: 'approved' | 'rejected', why?: string) => {
    try {
      const res = await claimService.decide(c.id, status, why);
      message.success(res === 'pending' ? 'Approved — passed on to the next step' : status === 'approved' ? 'Approved' : 'Rejected');
      load();
    }
    catch (e: any) { message.error(e.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <Segmented value={filter} onChange={v => setFilter(String(v))}
          options={[{ value: 'pending', label: `To approve (${count('pending')})` }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }, { value: 'all', label: 'All' }]} />
        {canWrite && (
          <Space>
            <Button onClick={() => setCatOpen(true)}>Category accounts</Button>
            <Select style={{ width: 220 }} showSearch optionFilterProp="label" placeholder="Claim for…" value={newFor ?? undefined} onChange={setNewFor}
              options={employees.filter(e => e.status === 'active').map(e => ({ value: Number(e.id), label: e.full_name }))} />
            <Button icon={<PlusOutlined />} disabled={!newFor} onClick={() => setEditing({ employee_id: newFor! })}>New claim</Button>
          </Space>
        )}
      </div>
      <Table dataSource={shown} rowKey="id" size="small" loading={loading} pagination={{ pageSize: 50, hideOnSinglePage: true }}
        locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>{filter === 'pending' ? 'Nothing to approve' : 'No claims'}</span> }}
        columns={[
          { title: 'Employee', key: 'e', render: (_, c) => name(c.employee_id) },
          { title: 'Date', dataIndex: 'claim_date', render: (v: string) => fmtDate(v), width: 110 },
          { title: 'Category', dataIndex: 'category' },
          { title: 'Description', dataIndex: 'description', render: (v: string | null) => v || '—' },
          { title: 'Amount', key: 'a', align: 'right' as const, render: (_, c) => money(c.amount, c.currency) },
          { title: 'Account', key: 'ac', width: 220, render: (_, c) => {
            if (c.status === 'rejected' || c.status === 'cancelled') return '—';
            const chosen = claimAccountOf(c, byCategory);
            return (
              <Select size="small" style={{ width: '100%' }} showSearch optionFilterProp="label" allowClear disabled={!canWrite} placeholder="Choose account"
                status={chosen ? undefined : 'warning'} value={chosen ?? undefined} options={expenseOptions}
                onChange={async v => { try { await claimService.setAccount(c.id, v ?? null); setClaims(cs => cs.map(x => (x.id === c.id ? { ...x, account_id: v ?? null } : x))); } catch (e: any) { message.error(e.message); } }} />
            );
          } },
          { title: 'Receipts', key: 'r', render: (_, c) => (
            <Receipts files={files.filter(f => f.claim_id === c.id)} canRemove={canRemove && c.status === 'pending'} onView={setViewing}
              onRemove={async f => { try { await claimService.removeReceipt(f); load(); } catch (e: any) { message.error(e.message); } }} />
          ) },
          { title: 'Status', key: 's', render: (_, c) => (
            <Space size={4} wrap>
              <Tag color={CLAIM_STATUS_COLOR[c.status]}>{c.status[0].toUpperCase() + c.status.slice(1)}</Tag>
              {chain.get(c.id)?.mode === 'flow' && <Tag>Step {chain.get(c.id)!.step_no} of {chain.get(c.id)!.steps_total}</Tag>}
              {paidState(c)}
              {c.decision_note && <Text type="secondary" style={{ fontSize: 12 }}>{c.decision_note}</Text>}
            </Space>
          ) },
          { title: '', key: 'x', width: 220, render: (_, c) => (
            <Space size={4}>
              {c.status === 'pending' && (chain.get(c.id) ? chain.get(c.id)!.can_act : canApprove) && <>
                <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => decide(c, 'approved')}>Approve</Button>
                <Button size="small" danger icon={<CloseOutlined />} onClick={() => { setRejecting(c); setNote(''); }}>Reject</Button>
              </>}
              {c.status === 'pending' && chain.get(c.id)?.mode === 'flow' && !chain.get(c.id)!.can_act && (
                <Text type="secondary" style={{ fontSize: 12 }}>Waiting for {approverLabel(chain.get(c.id)!.waiting_for || '')}</Text>
              )}
              {canWrite && c.status === 'pending' && <Button size="small" onClick={() => setEditing(c)}>Change</Button>}
              {canRemove && !c.document_id && (
                <Popconfirm title="Delete this claim?" onConfirm={async () => { try { await claimService.remove(c.id); load(); } catch (e: any) { message.error(e.message); } }}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              )}
            </Space>
          ) },
        ]} />
      <Modal open={!!rejecting} title="Reject claim" okText="Reject" okButtonProps={{ danger: true }} onCancel={() => setRejecting(null)}
        onOk={async () => { if (rejecting) await decide(rejecting, 'rejected', note.trim()); setRejecting(null); }}>
        <Input.TextArea autoSize={{ minRows: 2 }} placeholder="Reason (shown to the employee)" value={note} onChange={e => setNote(e.target.value)} />
      </Modal>
      {editing && <ClaimModal companyId={companyId} employeeId={editing.employee_id!} currency={currency} claim={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setNewFor(null); load(); }} />}
      {catOpen && <CategoryAccountsModal companyId={companyId} accounts={expenseOptions} map={byCategory} onClose={() => setCatOpen(false)} onSaved={m => { setByCategory(m); setCatOpen(false); }} />}
      {viewing && <FileViewer name={viewing.file_name} load={() => claimService.receiptBlob(viewing.path)} onClose={() => setViewing(null)} />}
    </div>
  );
}

/** Claims → Category accounts: the expense account each category of claim goes to. "Others" is picked claim by claim. */
function CategoryAccountsModal({ companyId, accounts, map, onClose, onSaved }: {
  companyId: number; accounts: { value: number; label: string }[]; map: Record<string, number>; onClose: () => void; onSaved: (m: Record<string, number>) => void;
}) {
  const [draft, setDraft] = useState<Record<string, number | undefined>>(map);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const clean = Object.fromEntries(Object.entries(draft).filter(([, v]) => v)) as Record<string, number>;
      await claimAccountService.save(companyId, clean);
      message.success('Category accounts saved');
      onSaved(clean);
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };
  return (
    <Modal open onCancel={onClose} title="Category accounts" okText="Save" confirmLoading={saving} onOk={save} width={520} destroyOnHidden>
      <Space orientation="vertical" size={8} style={{ width: '100%' }}>
        {CLAIM_CATEGORIES.filter(c => c !== 'Others').map(c => (
          <div key={c} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, alignItems: 'center' }}>
            <Text>{c}</Text>
            <Select allowClear showSearch optionFilterProp="label" style={{ width: '100%' }} value={draft[c]} options={accounts}
              onChange={v => setDraft(d => ({ ...d, [c]: v }))} />
          </div>
        ))}
      </Space>
    </Modal>
  );
}
