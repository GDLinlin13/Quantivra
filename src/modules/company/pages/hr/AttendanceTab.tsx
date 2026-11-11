import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Modal, Form, Select, DatePicker, Input, message, Table, Tag, Alert, Space, Popconfirm, Statistic, Typography } from 'antd';
import { LoginOutlined, LogoutOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { attendanceService, minutesOf, hoursText, type AttendanceLog } from '../../../../services/attendance';
import { leaveService, hrService, type Employee } from '../../../../services/hr';
import { useAuth } from '../../../../contexts/AuthContext';
import { useCompanyAccess } from '../../../../contexts/CompanyAccess';
import { fmtDate } from '../../../../utils/dateFormat';

const { Text } = Typography;
const timeOf = (iso: string | null) => (iso ? dayjs(iso).format('HH:mm') : '—');

/** Totals per day for one person's logs. */
function perDay(logs: AttendanceLog[], now: number) {
  const days = new Map<string, number>();
  for (const l of logs) days.set(l.work_date, (days.get(l.work_date) || 0) + minutesOf(l, now));
  return days;
}

/** HR → My Attendance: clock in and out, and see your own hours for the month. */
export function MyAttendanceTab({ companyId }: { companyId: number }) {
  const { user } = useAuth();
  const [me, setMe] = useState<Employee | null>(null);
  const [open, setOpen] = useState<AttendanceLog | null>(null);
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rec = await leaveService.myEmployeeRecord(companyId, user!.id);
      setMe(rec);
      if (rec) {
        const [o, l] = await Promise.all([
          attendanceService.open(rec.id),
          attendanceService.list(companyId, { from: month.startOf('month').format('YYYY-MM-DD'), to: month.endOf('month').format('YYYY-MM-DD'), employeeId: rec.id }),
        ]);
        setOpen(o); setLogs(l);
      }
    } catch (e: any) { message.error(e.message); }
    setLoading(false);
  }, [companyId, user, month]);
  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    if (!me) return;
    setBusy(true);
    try {
      if (open) { await attendanceService.clockOut(open.id, note); message.success('Clocked out'); }
      else { await attendanceService.clockIn(companyId, me.id, note); message.success('Clocked in'); }
      setNote('');
      await load();
    } catch (e: any) { message.error(e.message); }
    setBusy(false);
  };

  if (loading && !me) return <Card loading />;
  if (!me) return (
    <Alert type="warning" showIcon title="No employee record linked to your login"
      description="Ask an admin to add you under HR → Employees and set your account as the Login Account." />
  );
  const days = perDay(logs, now);
  const total = [...days.values()].reduce((a, b) => a + b, 0);

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16, maxWidth: 560 }}>
        <Space size={24} wrap align="center">
          <div>
            <div style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>{me.full_name} · {me.employee_code}</div>
            <div style={{ fontSize: 18, marginTop: 4 }}>
              {open ? <>Clocked in since <b>{timeOf(open.clock_in)}</b> <Text type="secondary">({hoursText(minutesOf(open, now))})</Text></> : 'Not clocked in'}
            </div>
          </div>
          <Input style={{ width: 220 }} placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} />
          <Button type="primary" size="large" icon={open ? <LogoutOutlined /> : <LoginOutlined />} loading={busy} danger={!!open} onClick={toggle}>
            {open ? 'Clock out' : 'Clock in'}
          </Button>
        </Space>
      </Card>
      <Space size={16} style={{ marginBottom: 12 }} wrap>
        <DatePicker picker="month" allowClear={false} value={month} onChange={v => v && setMonth(v)} />
        <Statistic title="Days worked" value={days.size} />
        <Statistic title="Total hours" value={hoursText(total)} />
      </Space>
      <Table dataSource={logs} rowKey="id" size="small" loading={loading} pagination={{ pageSize: 50, hideOnSinglePage: true }}
        locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No hours this month</span> }}
        columns={[
          { title: 'Date', dataIndex: 'work_date', render: (v: string) => fmtDate(v), width: 120 },
          { title: 'In', key: 'i', width: 90, render: (_, l) => timeOf(l.clock_in) },
          { title: 'Out', key: 'o', width: 90, render: (_, l) => (l.clock_out ? timeOf(l.clock_out) : <Tag color="green">Working</Tag>) },
          { title: 'Hours', key: 'h', width: 110, render: (_, l) => hoursText(minutesOf(l, now)) },
          { title: 'Note', dataIndex: 'note', render: (v: string | null, l) => <>{v || '—'}{l.source === 'manual' && <Tag style={{ marginLeft: 8 }}>Entered by HR</Tag>}</> },
        ]} />
    </div>
  );
}

function EntryModal({ companyId, employees, entry, onClose, onSaved }: {
  companyId: number; employees: Employee[]; entry: Partial<AttendanceLog>; onClose: () => void; onSaved: () => void;
}) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const day = entry.clock_in ? dayjs(entry.clock_in) : dayjs();
  const submit = async (v: any) => {
    const date = dayjs(v.date).format('YYYY-MM-DD');
    const at = (t: Dayjs) => dayjs(`${date} ${t.format('HH:mm')}`).toISOString();
    const out = v.out ? at(v.out) : null;
    if (out && out < at(v.in)) { message.error('Clock-out is before clock-in'); return; }
    setSaving(true);
    try {
      await attendanceService.save(companyId, { id: entry.id, employee_id: v.employee_id, clock_in: at(v.in), clock_out: out, note: v.note });
      message.success('Saved');
      onSaved();
    } catch (e: any) { message.error(/attendance_open|duplicate|unique/i.test(e.message) ? 'This person is still clocked in — enter a clock-out time or close that shift first' : e.message); }
    setSaving(false);
  };
  return (
    <Modal open title={entry.id ? 'Correct entry' : 'Add hours'} onCancel={onClose} onOk={() => form.submit()} okText="Save" confirmLoading={saving} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={submit}
        initialValues={{ employee_id: entry.employee_id, date: day, in: entry.clock_in ? dayjs(entry.clock_in) : dayjs().hour(9).minute(0), out: entry.clock_out ? dayjs(entry.clock_out) : entry.id ? null : dayjs().hour(18).minute(0), note: entry.note }}>
        <Form.Item name="employee_id" label="Employee" rules={[{ required: true }]}>
          <Select showSearch optionFilterProp="label" disabled={!!entry.id} options={employees.map(e => ({ value: Number(e.id), label: e.full_name }))} />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Form.Item name="date" label="Date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="in" label="Clock in" rules={[{ required: true }]}><DatePicker picker="time" format="HH:mm" needConfirm={false} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="out" label="Clock out"><DatePicker picker="time" format="HH:mm" needConfirm={false} style={{ width: '100%' }} /></Form.Item>
        </div>
        <Form.Item name="note" label="Note"><Input placeholder="e.g. Forgot to clock out" /></Form.Item>
      </Form>
    </Modal>
  );
}

/** HR → Attendance: everyone's hours for a month, for people with Attendance → create / edit / delete. */
export function AttendanceTab({ companyId }: { companyId: number }) {
  const access = useCompanyAccess();
  const canWrite = access.canWrite('attendance'), canRemove = access.canRemove('attendance');
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const [who, setWho] = useState<number | null>(null);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<AttendanceLog> | null>(null);
  const [view, setView] = useState<'people' | 'entries'>('people');
  const now = Date.now();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [emps, l] = await Promise.all([
        hrService.listEmployees(companyId).catch(() => [] as Employee[]),
        attendanceService.list(companyId, { from: month.startOf('month').format('YYYY-MM-DD'), to: month.endOf('month').format('YYYY-MM-DD'), employeeId: who || undefined }),
      ]);
      setEmployees(emps); setLogs(l);
    } catch (e: any) { message.error(e.message); }
    setLoading(false);
  }, [companyId, month, who]);
  useEffect(() => { load(); }, [load]);

  const name = (id: number) => employees.find(e => Number(e.id) === id)?.full_name || '—';
  const summary = employees.map(e => {
    const mine = logs.filter(l => l.employee_id === Number(e.id));
    const days = perDay(mine, now);
    return { id: Number(e.id), name: e.full_name, days: days.size, minutes: [...days.values()].reduce((a, b) => a + b, 0), working: mine.some(l => !l.clock_out) };
  }).filter(r => (!who || r.id === who) && (r.days || r.working));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <Space wrap>
          <DatePicker picker="month" allowClear={false} value={month} onChange={v => v && setMonth(v)} />
          <Select style={{ width: 220 }} allowClear showSearch optionFilterProp="label" placeholder="Everyone" value={who ?? undefined} onChange={v => setWho(v ?? null)}
            options={employees.map(e => ({ value: Number(e.id), label: e.full_name }))} />
          <Space.Compact>
            <Button type={view === 'people' ? 'primary' : 'default'} onClick={() => setView('people')}>By person</Button>
            <Button type={view === 'entries' ? 'primary' : 'default'} onClick={() => setView('entries')}>All entries</Button>
          </Space.Compact>
        </Space>
        {canWrite && <Button icon={<PlusOutlined />} onClick={() => setEditing({})}>Add hours</Button>}
      </div>
      {view === 'people' ? (
        <Table dataSource={summary} rowKey="id" size="small" loading={loading} pagination={false}
          locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No hours this month</span> }}
          columns={[
            { title: 'Employee', key: 'n', render: (_, r) => <a onClick={() => { setWho(r.id); setView('entries'); }}>{r.name}</a> },
            { title: 'Days worked', dataIndex: 'days', align: 'right' as const, width: 130 },
            { title: 'Total hours', key: 'h', align: 'right' as const, width: 140, render: (_, r) => hoursText(r.minutes) },
            { title: 'Average per day', key: 'a', align: 'right' as const, width: 160, render: (_, r) => (r.days ? hoursText(Math.round(r.minutes / r.days)) : '—') },
            { title: '', key: 'w', width: 120, render: (_, r) => r.working && <Tag color="green">Working now</Tag> },
          ]} />
      ) : (
        <Table dataSource={logs} rowKey="id" size="small" loading={loading} pagination={{ pageSize: 100, hideOnSinglePage: true }}
          locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No entries</span> }}
          columns={[
            { title: 'Employee', key: 'n', render: (_, l) => name(l.employee_id) },
            { title: 'Date', dataIndex: 'work_date', render: (v: string) => fmtDate(v), width: 120 },
            { title: 'In', key: 'i', width: 80, render: (_, l) => timeOf(l.clock_in) },
            { title: 'Out', key: 'o', width: 90, render: (_, l) => (l.clock_out ? timeOf(l.clock_out) : <Tag color="green">Working</Tag>) },
            { title: 'Hours', key: 'h', width: 100, render: (_, l) => hoursText(minutesOf(l, now)) },
            { title: 'Note', dataIndex: 'note', render: (v: string | null, l) => <>{v || '—'}{l.source === 'manual' && <Tag style={{ marginLeft: 8 }}>Entered by HR</Tag>}</> },
            { title: '', key: 'x', width: 100, render: (_, l) => (
              <Space size={4}>
                {canWrite && <Button size="small" icon={<EditOutlined />} title="Correct" onClick={() => setEditing(l)} />}
                {canRemove && (
                  <Popconfirm title="Delete this entry?" onConfirm={async () => { try { await attendanceService.remove(l.id); load(); } catch (e: any) { message.error(e.message); } }}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                )}
              </Space>
            ) },
          ]} />
      )}
      {editing && <EntryModal companyId={companyId} employees={employees.filter(e => e.status === 'active' || Number(e.id) === editing.employee_id)} entry={editing}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}
