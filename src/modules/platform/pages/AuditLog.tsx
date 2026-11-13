import { useState, useEffect, useCallback } from 'react';
import { Table, Typography, Tag, Space, Select, Button, Popconfirm, message } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { supabase } from '../../../utils/supabase';

const { Title, Text } = Typography;

/** Plain words for what happened. */
const ACTIONS: Record<string, string> = {
  'company.provisioned': 'Company created', 'company.edited': 'Company edited', 'company.deactivated': 'Company deactivated',
  'company.reinstated': 'Company reinstated', 'company.deleted': 'Company deleted',
  'user.created': 'User created', 'user.edited': 'User edited', 'user.suspended': 'User suspended', 'user.reactivated': 'User reactivated',
  'user.deleted': 'User deleted', 'user.password_reset': 'Password reset', 'platform_admin.created': 'Administrator added', 'audit.cleared': 'Audit log cleared',
};
const what = (a: string) => ACTIONS[a] || a.replace(/[._]/g, ' ').replace(/^./, c => c.toUpperCase());
const COLOR: Record<string, string> = { deleted: 'red', deactivated: 'orange', suspended: 'orange', cleared: 'magenta', password_reset: 'gold' };
const tone = (a: string) => COLOR[a.split('.')[1]] || undefined;

/** Platform → Audit Log: who did what, and when. Platform administrators can clear it at any time. */
export function PlatformAuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [companies, setCompanies] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | undefined>();
  const [company, setCompany] = useState<number | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    const [l, c] = await Promise.all([
      supabase.from('platform_audit_log').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('companies').select('id, name'),
    ]);
    setLogs(l.data || []);
    setCompanies(Object.fromEntries((c.data || []).map((x: any) => [x.id, x.name])));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const clear = async () => {
    const r = await supabase.rpc('platform_audit_clear');
    if (r.error) { message.error(/platform_audit_clear|function/i.test(r.error.message) ? 'This needs database update 063 — ask your administrator to run it in Supabase.' : r.error.message); return; }
    message.success(`Cleared ${r.data} records`);
    load();
  };

  const details = (r: any) => {
    if (r.summary) return r.summary;
    const v = r.new_value || r.old_value;
    if (!v || typeof v !== 'object') return v ? String(v) : '';
    const bits = [v.name?.trim(), v.country, Array.isArray(v.modules) ? `${v.modules.length} modules` : null].filter(Boolean);
    return bits.length ? bits.join(' · ') : JSON.stringify(v).slice(0, 100);
  };
  const changed = (r: any) => {
    if (r.action !== 'company.edited' && r.action !== 'user.edited') return null;
    const o = r.old_value || {}, n = r.new_value || {};
    return Object.keys(n).map(k => `${k}: ${JSON.stringify(o[k] ?? '')} → ${JSON.stringify(n[k] ?? '')}`).join(' · ').slice(0, 200);
  };

  const shown = logs.filter(r => (!action || r.action === action) && (!company || r.company_id === company));
  const actionOptions = [...new Set(logs.map(r => r.action))].map(a => ({ value: a, label: what(a) }));
  const companyOptions = [...new Set(logs.map(r => r.company_id).filter(Boolean))].map((id: number) => ({ value: id, label: companies[id] || `Company ${id}` }));

  const columns = [
    { title: 'Time', dataIndex: 'created_at', key: 'time', render: (v: string) => new Date(v).toLocaleString(), width: 190 },
    { title: 'Who', dataIndex: 'actor_name', key: 'who', width: 180, render: (v: string | null) => v || <Text type="secondary">—</Text> },
    { title: 'Action', dataIndex: 'action', key: 'action', render: (v: string) => <Tag color={tone(v)}>{what(v)}</Tag>, width: 190 },
    { title: 'Company', key: 'co', width: 220, render: (_: any, r: any) => (r.company_id ? companies[r.company_id] || `Company ${r.company_id}` : '—') },
    { title: 'Details', key: 'details', render: (_: any, r: any) => <>{details(r)}{changed(r) && <div style={{ fontSize: 12, opacity: 0.6 }}>{changed(r)}</div>}</> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Title level={4} style={{ color: '#f0ede6', margin: 0 }}>Platform Audit Log</Title>
        <Space wrap>
          <Select allowClear style={{ width: 200 }} placeholder="Action" value={action} onChange={setAction} options={actionOptions} />
          <Select allowClear showSearch optionFilterProp="label" style={{ width: 220 }} placeholder="Company" value={company} onChange={setCompany} options={companyOptions} />
          <Popconfirm title="Clear the whole audit log?" description="Every record is deleted. One record is left to say it was cleared." okText="Clear" okButtonProps={{ danger: true }} onConfirm={clear}>
            <Button danger icon={<DeleteOutlined />}>Clear log</Button>
          </Popconfirm>
        </Space>
      </div>
      <Table dataSource={shown} columns={columns} loading={loading} rowKey="id"
        style={{ background: 'transparent' }} pagination={{ pageSize: 25 }}
        locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No audit records</span> }} />
    </div>
  );
}
