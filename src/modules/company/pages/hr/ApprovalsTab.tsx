import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Tag, message, Modal, Input, Space, Segmented, Empty } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { leaveService, type LeaveRequest } from '../../../../services/hr';
import { workflowService, approverLabel, type RequestStatus } from '../../../../services/workflow';
import { useCompanyAccess } from '../../../../contexts/CompanyAccess';

const statusColor: Record<string, string> = { pending: 'gold', approved: 'green', rejected: 'red', cancelled: 'default' };

export function ApprovalsTab({ companyId }: { companyId: number }) {
  const access = useCompanyAccess();
  const [status, setStatus] = useState<Map<number, RequestStatus>>(new Map());
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await leaveService.requests(companyId, filter === 'pending' ? { status: 'pending' } : {});
      setRows(list);
      setStatus(await workflowService.status('leave', list.filter(r => r.status === 'pending').map(r => r.id)));
    } catch (e: any) { message.error(e.message); }
    setLoading(false);
  }, [companyId, filter]);

  useEffect(() => { load(); }, [load]);

  const decide = (r: LeaveRequest, decision: 'approved' | 'rejected') => {
    let note = '';
    Modal.confirm({
      title: `${decision === 'approved' ? 'Approve' : 'Reject'} leave — ${r.employees?.full_name}`,
      content: (
        <div>
          <div style={{ margin: '8px 0' }}>{r.leave_types?.name} · {r.start_date} → {r.end_date} · {r.days} {r.leave_types?.count_method === 'weeks' ? 'week(s)' : 'day(s)'}</div>
          <Input.TextArea placeholder="Note (optional)" rows={2} onChange={e => { note = e.target.value; }} />
        </div>
      ),
      okText: decision === 'approved' ? 'Approve' : 'Reject',
      okButtonProps: { danger: decision === 'rejected' },
      onOk: async () => {
        try {
          const res = await workflowService.decide('leave', r.id, decision, note);
          message.success(res === 'pending' ? 'Approved — passed on to the next step' : `Leave ${decision}`);
          load();
        } catch (e: any) { message.error(e.message); }
      },
    });
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Segmented value={filter} onChange={v => setFilter(v as any)}
          options={[{ label: 'Pending', value: 'pending' }, { label: 'All', value: 'all' }]} />
      </div>
      <Table
        dataSource={rows} rowKey="id" loading={loading} size="small" pagination={false} style={{ background: 'transparent' }}
        locale={{ emptyText: <Empty description={<span style={{ color: 'rgba(240,237,230,0.4)' }}>Nothing to approve</span>} /> }}
        columns={[
          { title: 'Employee', key: 'e', render: (_, r) => <span style={{ color: '#f0ede6' }}>{r.employees?.full_name} <span style={{ color: 'rgba(240,237,230,0.4)' }}>({r.employees?.employee_code})</span></span> },
          { title: 'Type', key: 't', render: (_, r) => r.leave_types?.name || '—' },
          { title: 'From', dataIndex: 'start_date', key: 'f' },
          { title: 'To', dataIndex: 'end_date', key: 'to' },
          { title: 'Days', dataIndex: 'days', key: 'd' },
          { title: 'Reason', dataIndex: 'reason', key: 'r', render: (v: string) => v || '—' },
          { title: 'Status', dataIndex: 'status', key: 's', render: (v: string, r) => {
            const st = status.get(r.id);
            return <Space size={4} wrap><Tag color={statusColor[v]}>{v}</Tag>{st?.mode === 'flow' && <Tag>Step {st.step_no} of {st.steps_total}</Tag>}</Space>;
          } },
          {
            title: '', key: 'act', render: (_, r) => {
              if (r.status !== 'pending') return r.decision_note || '—';
              const st = status.get(r.id);
              // before update 043 there is no status: the Approve tick decides
              const canAct = st ? st.can_act : access.can('leave', 'approve');
              return canAct ? (
                <Space>
                  <Button size="small" type="primary" ghost icon={<CheckOutlined />} onClick={() => decide(r, 'approved')}>Approve</Button>
                  <Button size="small" danger icon={<CloseOutlined />} onClick={() => decide(r, 'rejected')}>Reject</Button>
                </Space>
              ) : <span style={{ color: 'rgba(240,237,230,0.45)' }}>{st?.mode === 'flow' ? `Waiting for ${approverLabel(st.waiting_for || '')}` : '—'}</span>;
            },
          },
        ]}
      />
    </div>
  );
}
