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

  const columns = [
    { title: 'Time', dataIndex: 'created_at', key: 'time', render: (v: string) => new Date(v).toLocaleString(), width: 180 },
    { title: 'User', dataIndex: 'user_id', key: 'user', width: 80 },
    { title: 'Action', dataIndex: 'action', key: 'action', render: (v: string) => <Tag>{v}</Tag>, width: 120 },
    { title: 'Entity', key: 'entity', render: (_: any, r: any) => `${r.entity_type} #${r.entity_id || ''}`, width: 150 },
    { title: 'Details', key: 'details', render: (_: any, r: any) => JSON.stringify(r.new_value || r.old_value || '').slice(0, 100) },
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
