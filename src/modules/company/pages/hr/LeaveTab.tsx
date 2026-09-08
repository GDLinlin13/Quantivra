import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Modal, Form, Select, DatePicker, Input, Checkbox, message, Table, Tag, Empty, Row, Col, Progress, Alert } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { leaveService, businessDays, type LeaveType, type LeaveBalance, type LeaveRequest, type Employee } from '../../../../services/hr';
import { useAuth } from '../../../../contexts/AuthContext';
import { supabase } from '../../../../utils/supabase';

const YEAR = new Date().getFullYear();
const statusColor: Record<string, string> = { pending: 'gold', approved: 'green', rejected: 'red', cancelled: 'default' };

export function LeaveTab({ companyId }: { companyId: number }) {
  const { user } = useAuth();
  const [me, setMe] = useState<Employee | null>(null);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const watch = Form.useWatch([], form);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await leaveService.types(companyId);
      setTypes(t);
      const rec = await leaveService.myEmployeeRecord(companyId, user!.id);
      setMe(rec);
      if (rec) {
        const { data: co } = await supabase.from('companies').select('country').eq('id', companyId).maybeSingle();
        // (re)compute entitlements from this employee's facts + dependents
        await leaveService.syncEntitlements(companyId, rec, co?.country || 'SG', YEAR);
        const [b, r] = await Promise.all([
          leaveService.balances(rec.id, YEAR),
          leaveService.requests(companyId, { employeeId: rec.id }),
        ]);
        setBalances(b); setRequests(r);
      }
    } catch (err: any) { message.error(err.message); }
    setLoading(false);
  }, [companyId, user]);

  useEffect(() => { load(); }, [load]);

  const computedDays = watch?.range && watch.range[0] && watch.range[1]
    ? businessDays(dayjs(watch.range[0]).format('YYYY-MM-DD'), dayjs(watch.range[1]).format('YYYY-MM-DD'), !!watch.half_day)
    : 0;

  const submit = async (v: any) => {
    if (!me) return;
    const start = dayjs(v.range[0]).format('YYYY-MM-DD');
    const end = dayjs(v.range[1]).format('YYYY-MM-DD');
    const days = businessDays(start, end, !!v.half_day);
    if (days <= 0) { message.error('Invalid date range'); return; }
    try {
      await leaveService.apply({
        company_id: companyId, employee_id: me.id, leave_type_id: v.leave_type_id,
        start_date: start, end_date: end, half_day: !!v.half_day, days, reason: v.reason || '',
      });
      message.success('Leave applied — pending approval');
      setOpen(false); form.resetFields(); load();
    } catch (err: any) { message.error(err.message); }
  };

  if (loading) return <Card loading />;

  if (!me) return (
    <Alert type="warning" showIcon message="No employee record linked to your login"
      description="Ask an admin to add you under HR → Employees and set your account as the Login Account." />
  );

  const typeById = (id: number) => types.find(t => t.id === id);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ color: 'rgba(240,237,230,0.5)' }}>{me.full_name} · {me.employee_code} · {YEAR}</span>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}
          style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>Apply for Leave</Button>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        {balances.length === 0 && <Col span={24}><Empty description="No leave types configured" /></Col>}
        {balances.map(b => {
          const lt = typeById(b.leave_type_id);
          const total = Number(b.entitled_days) + Number(b.carried_days);
          const used = Number(b.taken_days) + Number(b.pending_days);
          const avail = total - used;
          return (
            <Col xs={12} md={8} lg={6} key={b.id}>
              <Card size="small" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ color: '#f0ede6', fontWeight: 600, marginBottom: 4 }}>{lt?.name || 'Leave'}</div>
                <div style={{ fontSize: 26, color: '#4fc3f7', fontWeight: 700 }}>{avail}</div>
                <div style={{ fontSize: 12, color: 'rgba(240,237,230,0.45)' }}>
                  of {total} days · {b.taken_days} taken · {b.pending_days} pending
                </div>
                <Progress percent={total ? Math.round((used / total) * 100) : 0} showInfo={false} size="small"
                  strokeColor={lt?.color || '#4fc3f7'} />
                {b.entitlement_basis && (
                  <div style={{ fontSize: 11, color: 'rgba(240,237,230,0.35)', marginTop: 2 }}>
                    {b.entitlement_source === 'manual' ? '✎ ' : ''}{b.entitlement_basis}
                  </div>
                )}
                {b.below_statutory && (
                  <div style={{ fontSize: 11, color: '#ff7875', marginTop: 2 }}>Below statutory minimum</div>
                )}
              </Card>
            </Col>
          );
        })}
      </Row>

      <Table
        dataSource={requests} rowKey="id" size="small" pagination={false} style={{ background: 'transparent' }}
        locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No leave requests</span> }}
        columns={[
          { title: 'Type', key: 't', render: (_, r) => typeById(r.leave_type_id)?.name || '—' },
          { title: 'From', dataIndex: 'start_date', key: 'f' },
          { title: 'To', dataIndex: 'end_date', key: 'to' },
          { title: 'Days', dataIndex: 'days', key: 'd' },
          { title: 'Reason', dataIndex: 'reason', key: 'r', render: (v: string) => v || '—' },
          { title: 'Status', dataIndex: 'status', key: 's', render: (v: string) => <Tag color={statusColor[v]}>{v}</Tag> },
          { title: 'Note', dataIndex: 'decision_note', key: 'n', render: (v: string) => v || '—' },
        ]}
      />

      <Modal title="Apply for Leave" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Submit">
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="leave_type_id" label="Leave Type" rules={[{ required: true }]}>
            <Select options={types.filter(t => t.active).map(t => ({ label: t.name, value: t.id }))} />
          </Form.Item>
          <Form.Item name="range" label="Dates" rules={[{ required: true }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="half_day" valuePropName="checked"><Checkbox>Half day (last day)</Checkbox></Form.Item>
          <Form.Item name="reason" label="Reason"><Input.TextArea rows={2} /></Form.Item>
          <div style={{ color: 'rgba(240,237,230,0.6)' }}>Working days requested: <b style={{ color: '#4fc3f7' }}>{computedDays}</b></div>
        </Form>
      </Modal>
    </div>
  );
}
