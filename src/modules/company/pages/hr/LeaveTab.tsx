import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Modal, Form, Select, DatePicker, Input, InputNumber, Checkbox, message, Table, Tag, Empty, Row, Col, Progress, Alert } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { leaveService, calendarService, hrService, type LeaveType, type LeaveBalance, type LeaveRequest, type Employee } from '../../../../services/hr';
import { useCompanyAccess } from '../../../../contexts/CompanyAccess';
import { countLeave, describePattern, unitLabel, DEFAULT_WORK_PATTERN, type WorkPattern } from '../../../../utils/workdays';
import { useAuth } from '../../../../contexts/AuthContext';
import { supabase } from '../../../../utils/supabase';

const YEAR = new Date().getFullYear();
const statusColor: Record<string, string> = { pending: 'gold', approved: 'green', rejected: 'red', cancelled: 'default' };

export function LeaveTab({ companyId }: { companyId: number }) {
  const { user } = useAuth();
  const access = useCompanyAccess();
  // HR / Director apply for anyone, a manager for the people who report to them
  const [actable, setActable] = useState<Employee[]>([]);
  const [target, setTarget] = useState<Employee | null>(null);
  const [targetPattern, setTargetPattern] = useState<WorkPattern | null>(null);
  const [me, setMe] = useState<Employee | null>(null);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [pattern, setPattern] = useState<WorkPattern>(DEFAULT_WORK_PATTERN);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
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
        // staff without Leave / Employees edit rights can't write balances; HR's Leave Balances tab sets them up
        await leaveService.syncEntitlements(companyId, rec, co?.country || 'SG', YEAR).catch(() => null);
        const [b, r, pat, hol] = await Promise.all([
          leaveService.balances(rec.id, YEAR),
          leaveService.requests(companyId, { employeeId: rec.id }),
          calendarService.effectivePattern(companyId, rec.id),
          calendarService.holidaySet(companyId, `${YEAR - 1}-01-01`, `${YEAR + 1}-12-31`),
        ]);
        setBalances(b); setRequests(r); setPattern(pat); setHolidays(hol);
        const isHR = access.canViewPay || ['leave', 'employees'].some(m => access.can(m, 'create') || access.can(m, 'edit'));
        const all = await hrService.listEmployees(companyId).catch(() => [] as Employee[]);
        setActable(all.filter(e => e.status === 'active' && Number(e.id) !== Number(rec.id) && (isHR || Number(e.manager_id) === Number(rec.id))));
      }
    } catch (err: any) { message.error(err.message); }
    setLoading(false);
  }, [companyId, user, access]);

  useEffect(() => { load(); }, [load]);

  const countFor = (typeId: number | undefined, rangeIn: any, halfDay: boolean, hours?: number, day?: any) => {
    const lt = types.find(t => t.id === typeId);
    // time off by the hour is one day and a number of hours
    const range = lt?.count_method === 'hours' ? (day ? [day, day] : null) : rangeIn;
    if (!range || !range[0] || !range[1]) return null;
    return countLeave({
      start: dayjs(range[0]).format('YYYY-MM-DD'), end: dayjs(range[1]).format('YYYY-MM-DD'), halfDay,
      method: lt?.count_method || 'working_days', allowSingleDays: !!lt?.allow_single_days, hours,
      pattern: target && targetPattern ? targetPattern : pattern, holidays,
    });
  };
  const isHoursType = (typeId?: number) => types.find(t => t.id === typeId)?.count_method === 'hours';
  // HR (and Admin / Director) can apply around the leave rules, giving a reason
  const canOverride = access.canViewPay || ['leave', 'employees'].some(m => access.can(m, 'create') || access.can(m, 'edit'));
  const pickTarget = async (id: number) => {
    const e = id === me?.id ? null : actable.find(x => Number(x.id) === id) || null;
    setTarget(e);
    setTargetPattern(e ? await calendarService.effectivePattern(companyId, Number(e.id)).catch(() => null) : null);
  };
  const preview = countFor(watch?.leave_type_id, watch?.range, !!watch?.half_day, watch?.hours, watch?.day);

  const submit = async (v: any) => {
    if (!me) return;
    const c = countFor(v.leave_type_id, v.range, !!v.half_day, v.hours, v.day);
    if (!c || c.error || c.amount <= 0) { message.error(c?.error || 'Invalid date range'); return; }
    const hourly = isHoursType(v.leave_type_id);
    const range = hourly ? [v.day, v.day] : v.range;
    const payload = {
      company_id: companyId, employee_id: target ? Number(target.id) : me.id, leave_type_id: v.leave_type_id,
      start_date: dayjs(range[0]).format('YYYY-MM-DD'), end_date: dayjs(range[1]).format('YYYY-MM-DD'),
      half_day: hourly ? false : !!v.half_day, days: c.amount, reason: v.reason || '',
    };
    try {
      let newId: number;
      try { newId = await leaveService.apply(payload); }
      catch (err: any) {
        // a rule of the leave policy stopped it: HR can apply anyway, with a reason
        if (!/^POLICY:/.test(err.message)) throw err;
        const why = err.message.replace(/^POLICY:\s*/, '');
        if (!canOverride) { Modal.error({ title: 'This leave can’t be applied for', content: why }); return; }
        const reason = await new Promise<string | null>(resolve => {
          let text = '';
          Modal.confirm({
            title: 'This breaks a leave rule', okText: 'Apply anyway',
            content: (<div><div style={{ marginBottom: 8 }}>{why}</div><Input.TextArea rows={2} placeholder="Reason for applying anyway (kept with the request)" onChange={e => { text = e.target.value; }} /></div>),
            onOk: () => { if (!text.trim()) { message.error('Give a reason'); return Promise.reject(); } resolve(text.trim()); },
            onCancel: () => resolve(null),
          });
        });
        if (!reason) return;
        newId = await leaveService.apply({ ...payload, override_reason: reason });
      }
      if (target && v.approve_now && access.can('leave', 'approve')) {
        await leaveService.decide(newId, 'approved', `Entered by ${me.full_name}`, user!.id);
        message.success(`Leave approved for ${target.full_name}`);
      } else message.success(target ? `Leave applied for ${target.full_name} — pending approval` : 'Leave applied — pending approval');
      setOpen(false); setTarget(null); setTargetPattern(null); form.resetFields(); load();
    } catch (err: any) { message.error(err.message); }
  };

  if (loading) return <Card loading />;

  if (!me) return (
    <Alert type="warning" showIcon message="No employee record linked to your login"
      description="Ask an admin to add you under HR → Employees and set your account as the Login Account." />
  );

  const typeById = (id: number) => types.find(t => t.id === id);
  // Parental leave only shows once it applies (right parent + due date or newborn recorded).
  // leave that only applies to some people: hidden when this employee has no days for it
  const PARENTAL = /maternity|paternity|parental|childcare|study/i;
  const entitledFor = (typeId: number) => {
    const b = balances.find(x => x.leave_type_id === typeId);
    return b ? Number(b.entitled_days) + Number(b.carried_days || 0) : 0;
  };
  const shownType = (t: LeaveType) => !PARENTAL.test(t.name) || entitledFor(t.id) > 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ color: 'rgba(240,237,230,0.5)' }}>{me.full_name} · {me.employee_code} · {YEAR}</span>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}
          style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>Apply for Leave</Button>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        {balances.length === 0 && <Col span={24}><Empty description="No leave types configured" /></Col>}
        {balances.filter(b => { const t = typeById(b.leave_type_id); return !t || shownType(t); }).map(b => {
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
                  of {total} {unitLabel(typeById(b.leave_type_id)?.count_method, total)} · {b.taken_days} taken · {b.pending_days} pending
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

      <Modal title={target ? `Apply for Leave — ${target.full_name}` : 'Apply for Leave'} open={open} onCancel={() => { setOpen(false); setTarget(null); setTargetPattern(null); }} onOk={() => form.submit()} okText="Submit">
        <Form form={form} layout="vertical" onFinish={submit}>
          {actable.length > 0 && (
            <Form.Item label="For">
              <Select showSearch optionFilterProp="label" value={target ? Number(target.id) : me.id} onChange={pickTarget}
                options={[{ value: me.id, label: `Myself (${me.full_name})` }, ...actable.map(e => ({ value: Number(e.id), label: e.full_name }))]} />
            </Form.Item>
          )}
          <Form.Item name="leave_type_id" label="Leave Type" rules={[{ required: true }]}>
            <Select options={types.filter(t => t.active && shownType(t) && (!t.is_toil || entitledFor(t.id) > 0)).map(t => ({ label: t.name, value: t.id }))} />
          </Form.Item>
          {isHoursType(watch?.leave_type_id) ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Form.Item name="day" label="Day" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
              <Form.Item name="hours" label="Hours" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0.25} max={24} step={0.25} /></Form.Item>
            </div>
          ) : (
            <>
              <Form.Item name="range" label="Dates" rules={[{ required: true }]}>
                <DatePicker.RangePicker style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="half_day" valuePropName="checked"><Checkbox>Half day (last day)</Checkbox></Form.Item>
            </>
          )}
          <Form.Item name="reason" label="Reason"><Input.TextArea rows={2} /></Form.Item>
          {target && access.can('leave', 'approve') && <Form.Item name="approve_now" valuePropName="checked"><Checkbox>Approve straight away</Checkbox></Form.Item>}
          {preview && (preview.error
            ? <Alert type="warning" showIcon message={preview.error} />
            : (
              <div style={{ color: 'rgba(240,237,230,0.6)' }}>
                Counts as: <b style={{ color: '#4fc3f7' }}>{preview.amount} {unitLabel(preview.unit === 'weeks' ? 'weeks' : preview.unit === 'hours' ? 'hours' : 'working_days', preview.amount)}</b>
                {preview.unit === 'days' && (preview.skippedRestDays.length > 0 || preview.skippedHolidays.length > 0) && (
                  <div style={{ fontSize: 12 }}>
                    Not counted: {preview.skippedRestDays.length > 0 && `${preview.skippedRestDays.length} rest day(s)`}
                    {preview.skippedRestDays.length > 0 && preview.skippedHolidays.length > 0 && ', '}
                    {preview.skippedHolidays.length > 0 && `${preview.skippedHolidays.length} public holiday(s) (${preview.skippedHolidays.map(d => dayjs(d).format('D MMM')).join(', ')})`}
                  </div>
                )}
                <div style={{ fontSize: 12 }}>{target ? `${target.full_name}’s` : 'Your'} work week: {describePattern(target && targetPattern ? targetPattern : pattern)}</div>
              </div>
            ))}
        </Form>
      </Modal>
    </div>
  );
}
