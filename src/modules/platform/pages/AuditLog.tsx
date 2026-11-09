import { useState, useEffect } from 'react';
import { Table, Typography, Tag } from 'antd';
import { supabase } from '../../../utils/supabase';

const { Title } = Typography;

export function PlatformAuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('platform_audit_log').select('*').order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => { setLogs(data || []); setLoading(false); });
  }, []);

  // plain words for what happened, and the useful details (no user / record numbers)
  const ACTIONS: Record<string, string> = { 'company.provisioned': 'Company created' };
  const what = (a: string) => ACTIONS[a] || a.replace(/[._]/g, ' ').replace(/^./, c => c.toUpperCase());
  const details = (r: any) => {
    const v = r.new_value || r.old_value;
    if (!v || typeof v !== 'object') return v ? String(v) : '';
    const bits = [v.name?.trim(), v.country, Array.isArray(v.modules) ? `${v.modules.length} modules` : null].filter(Boolean);
    return bits.length ? bits.join(' · ') : JSON.stringify(v).slice(0, 100);
  };

  const columns = [
    { title: 'Time', dataIndex: 'created_at', key: 'time', render: (v: string) => new Date(v).toLocaleString(), width: 200 },
    { title: 'Action', dataIndex: 'action', key: 'action', render: (v: string) => <Tag>{what(v)}</Tag>, width: 180 },
    { title: 'Details', key: 'details', render: (_: any, r: any) => details(r) },
  ];

  return (
    <div>
      <Title level={4} style={{ color: '#f0ede6', marginBottom: 24 }}>Platform Audit Log</Title>
      <Table dataSource={logs} columns={columns} loading={loading} rowKey="id"
        style={{ background: 'transparent' }} pagination={{ pageSize: 25 }}
        locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No audit records</span> }} />
    </div>
  );
}
