import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Typography, Tabs, Table, Button, Space, Tag, Drawer, Form, Input, InputNumber, Select, DatePicker, Modal, Popconfirm, Segmented,
  Alert, Statistic, Empty, Checkbox, Progress, message, ConfigProvider,
} from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useAuth } from '../../../contexts/AuthContext';
import { useCompanyAccess } from '../../../contexts/CompanyAccess';
import { hrService, leaveService, type Employee } from '../../../services/hr';
import { contactService } from '../../../services/finance';
import {
  projectService, hoursLabel, PROJECT_STATUS_LABEL, PROJECT_STATUS_COLOR, TASK_STATUS_LABEL,
  type Project, type ProjectTask, type ProjectMilestone, type Timesheet, type ProjectStatus, type TaskStatus,
} from '../../../services/projects';

const { Title, Text } = Typography;
const D = 'YYYY-MM-DD';
const statusOptions = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));

interface Shared {
  companyId: number; projects: Project[]; employees: Employee[]; contacts: { id: number; name: string }[];
  tasks: ProjectTask[]; reload: () => void;
}

// ---- Projects list + one project -----------------------------------------------------------------

function ProjectDrawer({ shared, project, hours, onClose }: { shared: Shared; project: Partial<Project>; hours: Timesheet[]; onClose: () => void }) {
  const { companyId, employees, contacts, reload } = shared;
  const access = useCompanyAccess();
  const canWrite = access.canWrite('projects'), canRemove = access.canRemove('projects');
  const [form] = Form.useForm();
  const [id, setId] = useState<number | null>(project.id ?? null);
  const [saving, setSaving] = useState(false);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [newTask, setNewTask] = useState<{ title: string; assignee_id?: number; due_date?: Dayjs | null }>({ title: '' });
  const [newMs, setNewMs] = useState<{ title: string; due_date?: Dayjs | null }>({ title: '' });

  const loadParts = useCallback(async () => {
    if (!id) return;
    try {
      const [t, m] = await Promise.all([projectService.tasks(companyId, id), projectService.milestones(companyId, id)]);
      setTasks(t); setMilestones(m);
    } catch (e: any) { message.error(e.message); }
  }, [companyId, id]);
  useEffect(() => { loadParts(); }, [loadParts]);

  const save = async (v: any) => {
    setSaving(true);
    try {
      const saved = await projectService.save(companyId, {
        id: id ?? undefined, name: v.name, code: v.code, contact_id: v.contact_id, manager_id: v.manager_id, status: v.status,
        start_date: v.start_date ? dayjs(v.start_date).format(D) : null, end_date: v.end_date ? dayjs(v.end_date).format(D) : null,
        budget_hours: v.budget_hours, notes: v.notes,
      });
      message.success(id ? 'Project saved' : 'Project created — add its tasks and milestones below');
      setId(saved);
      reload();
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };
  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    try { await fn(); await loadParts(); reload(); after?.(); } catch (e: any) { message.error(e.message); }
  };

  const logged = hours.filter(h => h.project_id === id);
  const byPerson = [...logged.reduce((m, h) => m.set(h.employee_id, (m.get(h.employee_id) || 0) + h.hours), new Map<number, number>())];
  const total = logged.reduce((s, h) => s + h.hours, 0);
  const emp = (eid: number | null) => employees.find(e => Number(e.id) === eid)?.full_name || '—';
  const done = tasks.filter(t => t.status === 'done').length;

  return (
    <Drawer open onClose={onClose} size={760} title={id ? (form.getFieldValue('name') || project.name) : 'New project'}
      extra={canWrite && <Button type="primary" loading={saving} onClick={() => form.submit()}>Save</Button>}>
      <ConfigProvider componentDisabled={!canWrite}>
        <Form form={form} layout="vertical" onFinish={save}
          initialValues={{ status: 'active', ...project, start_date: project.start_date ? dayjs(project.start_date) : null, end_date: project.end_date ? dayjs(project.end_date) : null }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: 12 }}>
            <Form.Item name="code" label="Code"><Input placeholder="e.g. P-001" /></Form.Item>
            <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="contact_id" label="Customer">
              <Select allowClear showSearch optionFilterProp="label" options={contacts.map(c => ({ value: c.id, label: c.name }))} />
            </Form.Item>
            <Form.Item name="manager_id" label="Project manager">
              <Select allowClear showSearch optionFilterProp="label" options={employees.filter(e => e.status === 'active').map(e => ({ value: Number(e.id), label: e.full_name }))} />
            </Form.Item>
            <Form.Item name="status" label="Status"><Select options={statusOptions(PROJECT_STATUS_LABEL)} /></Form.Item>
            <Form.Item name="start_date" label="Start"><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="end_date" label="End"><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="budget_hours" label="Budget (hours)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          </div>
          <Form.Item name="notes" label="Notes"><Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} /></Form.Item>
        </Form>
      </ConfigProvider>

      {!id ? <Alert type="info" showIcon title="Save the project first, then add its tasks and milestones." /> : (
        <>
          <Title level={5} style={{ marginTop: 8 }}>Tasks {tasks.length > 0 && <Text type="secondary" style={{ fontSize: 13 }}>({done} of {tasks.length} done)</Text>}</Title>
          {canWrite && (
            <Space wrap style={{ marginBottom: 8 }}>
              <Input style={{ width: 240 }} placeholder="New task" value={newTask.title} onChange={e => setNewTask(t => ({ ...t, title: e.target.value }))} />
              <Select style={{ width: 180 }} allowClear showSearch optionFilterProp="label" placeholder="Assigned to" value={newTask.assignee_id}
                onChange={v => setNewTask(t => ({ ...t, assignee_id: v }))} options={employees.filter(e => e.status === 'active').map(e => ({ value: Number(e.id), label: e.full_name }))} />
              <DatePicker placeholder="Due" value={newTask.due_date ?? null} onChange={v => setNewTask(t => ({ ...t, due_date: v }))} />
              <Button icon={<PlusOutlined />} disabled={!newTask.title.trim()}
                onClick={() => run(() => projectService.saveTask(companyId, { project_id: id, title: newTask.title, assignee_id: newTask.assignee_id, due_date: newTask.due_date ? newTask.due_date.format(D) : null }), () => setNewTask({ title: '' }))}>Add</Button>
            </Space>
          )}
          <Table dataSource={tasks} rowKey="id" size="small" pagination={false}
            locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No tasks yet</span> }}
            columns={[
              { title: 'Task', dataIndex: 'title' },
              { title: 'Assigned to', key: 'a', width: 150, render: (_, t) => emp(t.assignee_id) },
              { title: 'Due', dataIndex: 'due_date', width: 110, render: (v: string | null) => v || '—' },
              { title: 'Status', key: 's', width: 140, render: (_, t) => (
                <Select size="small" style={{ width: '100%' }} disabled={!canWrite} value={t.status} options={statusOptions(TASK_STATUS_LABEL)}
                  onChange={(v: TaskStatus) => run(() => projectService.saveTask(companyId, { ...t, status: v }))} />
              ) },
              { title: '', key: 'x', width: 50, render: (_, t) => canRemove && (
                <Popconfirm title="Delete this task?" onConfirm={() => run(() => projectService.removeTask(t.id))}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
              ) },
            ]} />

          <Title level={5} style={{ marginTop: 20 }}>Milestones</Title>
          {canWrite && (
            <Space wrap style={{ marginBottom: 8 }}>
              <Input style={{ width: 240 }} placeholder="New milestone" value={newMs.title} onChange={e => setNewMs(m => ({ ...m, title: e.target.value }))} />
              <DatePicker placeholder="Date" value={newMs.due_date ?? null} onChange={v => setNewMs(m => ({ ...m, due_date: v }))} />
              <Button icon={<PlusOutlined />} disabled={!newMs.title.trim()}
                onClick={() => run(() => projectService.saveMilestone(companyId, { project_id: id, title: newMs.title, due_date: newMs.due_date ? newMs.due_date.format(D) : null }), () => setNewMs({ title: '' }))}>Add</Button>
            </Space>
          )}
          <Table dataSource={milestones} rowKey="id" size="small" pagination={false}
            locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No milestones yet</span> }}
            columns={[
              { title: '', key: 'd', width: 40, render: (_, m) => (
                <Checkbox checked={m.done} disabled={!canWrite} onChange={e => run(() => projectService.saveMilestone(companyId, { ...m, done: e.target.checked }))} />
              ) },
              { title: 'Milestone', key: 't', render: (_, m) => <span style={{ textDecoration: m.done ? 'line-through' : undefined, opacity: m.done ? 0.6 : 1 }}>{m.title}</span> },
              { title: 'Date', dataIndex: 'due_date', width: 120, render: (v: string | null, m) => (v ? <span style={{ color: !m.done && v < dayjs().format(D) ? '#ff7875' : undefined }}>{v}</span> : '—') },
              { title: '', key: 'x', width: 50, render: (_, m) => canRemove && (
                <Popconfirm title="Delete this milestone?" onConfirm={() => run(() => projectService.removeMilestone(m.id))}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
              ) },
            ]} />

          {canWrite && (
            <>
              <Title level={5} style={{ marginTop: 20 }}>Hours logged <Text type="secondary" style={{ fontSize: 13 }}>
                ({hoursLabel(total)}{form.getFieldValue('budget_hours') ? ` of ${hoursLabel(Number(form.getFieldValue('budget_hours')))} budget` : ''})</Text></Title>
              {byPerson.length === 0 ? <Text type="secondary">No hours yet</Text> : (
                <Table dataSource={byPerson.map(([eid, h]) => ({ eid, h }))} rowKey="eid" size="small" pagination={false}
                  columns={[{ title: 'Person', key: 'p', render: (_, r) => emp(r.eid) }, { title: 'Hours', key: 'h', align: 'right' as const, width: 120, render: (_, r) => hoursLabel(r.h) }]} />
              )}
            </>
          )}
        </>
      )}
    </Drawer>
  );
}

function ProjectsTab({ shared, hours }: { shared: Shared; hours: Timesheet[] }) {
  const { projects, employees, contacts, tasks, reload } = shared;
  const access = useCompanyAccess();
  const canWrite = access.canWrite('projects'), canRemove = access.canRemove('projects');
  const [filter, setFilter] = useState('open');
  const [editing, setEditing] = useState<Partial<Project> | null>(null);
  const shown = projects.filter(p => filter === 'all' || (filter === 'open' ? ['planned', 'active', 'on_hold'].includes(p.status) : p.status === filter));
  const hoursOf = (id: number) => hours.filter(h => h.project_id === id).reduce((s, h) => s + h.hours, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <Segmented value={filter} onChange={v => setFilter(String(v))}
          options={[{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'all', label: 'All' }]} />
        {canWrite && <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>New project</Button>}
      </div>
      <Table dataSource={shown} rowKey="id" size="small" pagination={{ pageSize: 50, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No projects" /> }}
        columns={[
          { title: 'Code', dataIndex: 'code', width: 100, render: (v: string | null) => v || '—' },
          { title: 'Project', key: 'n', render: (_, p) => <a onClick={() => setEditing(p)}>{p.name}</a> },
          { title: 'Customer', key: 'c', render: (_, p) => contacts.find(c => c.id === p.contact_id)?.name || '—' },
          { title: 'Manager', key: 'm', render: (_, p) => employees.find(e => Number(e.id) === p.manager_id)?.full_name || '—' },
          { title: 'Status', key: 's', width: 110, render: (_, p) => <Tag color={PROJECT_STATUS_COLOR[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</Tag> },
          { title: 'Tasks', key: 't', width: 160, render: (_, p) => {
            const mine = tasks.filter(t => t.project_id === p.id);
            const d = mine.filter(t => t.status === 'done').length;
            return mine.length ? <Progress size="small" percent={Math.round((d / mine.length) * 100)} format={() => `${d}/${mine.length}`} /> : '—';
          } },
          ...(canWrite ? [{ title: 'Hours', key: 'h', align: 'right' as const, width: 140, render: (_: any, p: Project) => {
            const h = hoursOf(p.id);
            return <span style={{ color: p.budget_hours && h > p.budget_hours ? '#ff7875' : undefined }}>{hoursLabel(h)}{p.budget_hours ? ` / ${hoursLabel(p.budget_hours)}` : ''}</span>;
          } }] : []),
          { title: 'Due', dataIndex: 'end_date', width: 110, render: (v: string | null) => v || '—' },
          { title: '', key: 'x', width: 50, render: (_, p) => canRemove && (
            <Popconfirm title={`Delete ${p.name}?`} description="Its tasks, milestones and logged hours go too."
              onConfirm={async () => { try { await projectService.remove(p.id); message.success('Deleted'); reload(); } catch (e: any) { message.error(e.message); } }}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          ) },
        ]} />
      {editing && <ProjectDrawer key={editing.id ?? 'new'} shared={shared} project={editing} hours={hours} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ---- Timesheets ---------------------------------------------------------------------------------------

function TimesheetModal({ shared, entry, forEmployee, onClose, onSaved }: {
  shared: Shared; entry: Partial<Timesheet>; forEmployee: number | null; onClose: () => void; onSaved: () => void;
}) {
  const { companyId, projects, employees, tasks } = shared;
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const projectId = Form.useWatch('project_id', form);
  const open = projects.filter(p => ['planned', 'active', 'on_hold'].includes(p.status) || p.id === entry.project_id);
  const submit = async (v: any) => {
    setSaving(true);
    try {
      await projectService.saveTimesheet(companyId, { id: entry.id, project_id: v.project_id, task_id: v.task_id, employee_id: v.employee_id ?? forEmployee!, work_date: dayjs(v.date).format(D), hours: v.hours, note: v.note });
      message.success('Saved');
      onSaved();
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };
  return (
    <Modal open title={entry.id ? 'Change hours' : 'Log hours'} onCancel={onClose} onOk={() => form.submit()} okText="Save" confirmLoading={saving} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={submit}
        initialValues={{ employee_id: entry.employee_id ?? forEmployee, project_id: entry.project_id, task_id: entry.task_id, date: dayjs(entry.work_date || undefined), hours: entry.hours, note: entry.note }}>
        {forEmployee == null && (
          <Form.Item name="employee_id" label="Employee" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" disabled={!!entry.id} options={employees.filter(e => e.status === 'active' || Number(e.id) === entry.employee_id).map(e => ({ value: Number(e.id), label: e.full_name }))} />
          </Form.Item>
        )}
        <Form.Item name="project_id" label="Project" rules={[{ required: true, message: 'Choose a project' }]}>
          <Select showSearch optionFilterProp="label" onChange={() => form.setFieldValue('task_id', undefined)} options={open.map(p => ({ value: p.id, label: `${p.code ? p.code + ' · ' : ''}${p.name}` }))} />
        </Form.Item>
        <Form.Item name="task_id" label="Task (optional)">
          <Select allowClear showSearch optionFilterProp="label" disabled={!projectId} options={tasks.filter(t => t.project_id === projectId).map(t => ({ value: t.id, label: t.title }))} />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="date" label="Date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="hours" label="Hours" rules={[{ required: true, message: 'Enter the hours' }, { type: 'number', min: 0.01, max: 24, message: 'Between 0 and 24' }]}>
            <InputNumber style={{ width: '100%' }} min={0} max={24} step={0.25} />
          </Form.Item>
        </div>
        <Form.Item name="note" label="What was done"><Input /></Form.Item>
      </Form>
    </Modal>
  );
}

/** My Timesheet: your own hours, by month. */
function MyTimesheetTab({ shared }: { shared: Shared }) {
  const { user } = useAuth();
  const { companyId, projects } = shared;
  const [me, setMe] = useState<Employee | null>(null);
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const [rows, setRows] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Timesheet> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rec = await leaveService.myEmployeeRecord(companyId, user!.id);
      setMe(rec);
      if (rec) setRows(await projectService.timesheets(companyId, { from: month.startOf('month').format(D), to: month.endOf('month').format(D), employeeId: rec.id }));
    } catch (e: any) { message.error(e.message); }
    setLoading(false);
  }, [companyId, user, month]);
  useEffect(() => { load(); }, [load]);

  if (!me && !loading) return (
    <Alert type="warning" showIcon title="No employee record linked to your login"
      description="Ask an admin to add you under HR → Employees and set your account as the Login Account." />
  );
  const total = rows.reduce((s, r) => s + r.hours, 0);
  const pname = (id: number) => projects.find(p => p.id === id)?.name || '—';
  const tname = (id: number | null) => shared.tasks.find(t => t.id === id)?.title || '—';
  return (
    <div>
      <Space size={16} wrap style={{ marginBottom: 12 }}>
        <DatePicker picker="month" allowClear={false} value={month} onChange={v => v && setMonth(v)} />
        <Statistic title="Hours this month" value={hoursLabel(total)} />
        {me && <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>Log hours</Button>}
      </Space>
      <Table dataSource={rows} rowKey="id" size="small" loading={loading} pagination={{ pageSize: 100, hideOnSinglePage: true }}
        locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No hours this month</span> }}
        columns={[
          { title: 'Date', dataIndex: 'work_date', width: 120 },
          { title: 'Project', key: 'p', render: (_, r) => pname(r.project_id) },
          { title: 'Task', key: 't', render: (_, r) => tname(r.task_id) },
          { title: 'Hours', key: 'h', align: 'right' as const, width: 100, render: (_, r) => hoursLabel(r.hours) },
          { title: 'Note', dataIndex: 'note', render: (v: string | null) => v || '—' },
          { title: '', key: 'x', width: 90, render: (_, r) => (
            <Space size={4}>
              <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)} />
              <Popconfirm title="Delete this entry?" onConfirm={async () => { try { await projectService.removeTimesheet(r.id); load(); shared.reload(); } catch (e: any) { message.error(e.message); } }}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          ) },
        ]} />
      {editing && me && <TimesheetModal shared={shared} entry={editing} forEmployee={me.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); shared.reload(); }} />}
    </div>
  );
}

/** Timesheets: everyone's hours, for people with Projects → create / edit / delete. */
function TimesheetsTab({ shared }: { shared: Shared }) {
  const { companyId, projects, employees } = shared;
  const access = useCompanyAccess();
  const canWrite = access.canWrite('projects'), canRemove = access.canRemove('projects');
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const [pid, setPid] = useState<number | null>(null);
  const [eid, setEid] = useState<number | null>(null);
  const [view, setView] = useState<'project' | 'person' | 'entries'>('project');
  const [rows, setRows] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Timesheet> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await projectService.timesheets(companyId, { from: month.startOf('month').format(D), to: month.endOf('month').format(D), projectId: pid || undefined, employeeId: eid || undefined }));
    } catch (e: any) { message.error(e.message); }
    setLoading(false);
  }, [companyId, month, pid, eid]);
  useEffect(() => { load(); }, [load]);

  const pname = (id: number) => projects.find(p => p.id === id)?.name || '—';
  const ename = (id: number) => employees.find(e => Number(e.id) === id)?.full_name || '—';
  const group = (key: (r: Timesheet) => number) => {
    const m = new Map<number, { hours: number; people: Set<number>; days: Set<string> }>();
    for (const r of rows) {
      const g = m.get(key(r)) || { hours: 0, people: new Set(), days: new Set() };
      g.hours += r.hours; g.people.add(r.employee_id); g.days.add(`${r.employee_id}|${r.work_date}`);
      m.set(key(r), g);
    }
    return [...m].map(([id, g]) => ({ id, hours: g.hours, people: g.people.size, days: g.days.size })).sort((a, b) => b.hours - a.hours);
  };
  const byProject = useMemo(() => group(r => r.project_id), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const byPerson = useMemo(() => group(r => r.employee_id), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = rows.reduce((s, r) => s + r.hours, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <Space wrap>
          <DatePicker picker="month" allowClear={false} value={month} onChange={v => v && setMonth(v)} />
          <Select style={{ width: 220 }} allowClear showSearch optionFilterProp="label" placeholder="All projects" value={pid ?? undefined} onChange={v => setPid(v ?? null)} options={projects.map(p => ({ value: p.id, label: p.name }))} />
          <Select style={{ width: 200 }} allowClear showSearch optionFilterProp="label" placeholder="Everyone" value={eid ?? undefined} onChange={v => setEid(v ?? null)} options={employees.map(e => ({ value: Number(e.id), label: e.full_name }))} />
          <Segmented value={view} onChange={v => setView(v as any)} options={[{ value: 'project', label: 'By project' }, { value: 'person', label: 'By person' }, { value: 'entries', label: 'All entries' }]} />
          <Text type="secondary">Total {hoursLabel(total)}</Text>
        </Space>
        {canWrite && <Button icon={<PlusOutlined />} onClick={() => setEditing({})}>Log hours for someone</Button>}
      </div>
      {view === 'entries' ? (
        <Table dataSource={rows} rowKey="id" size="small" loading={loading} pagination={{ pageSize: 100, hideOnSinglePage: true }}
          locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No hours</span> }}
          columns={[
            { title: 'Date', dataIndex: 'work_date', width: 120 },
            { title: 'Employee', key: 'e', render: (_, r) => ename(r.employee_id) },
            { title: 'Project', key: 'p', render: (_, r) => pname(r.project_id) },
            { title: 'Hours', key: 'h', align: 'right' as const, width: 100, render: (_, r) => hoursLabel(r.hours) },
            { title: 'Note', dataIndex: 'note', render: (v: string | null) => v || '—' },
            { title: '', key: 'x', width: 90, render: (_, r) => (
              <Space size={4}>
                {canWrite && <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)} />}
                {canRemove && (
                  <Popconfirm title="Delete this entry?" onConfirm={async () => { try { await projectService.removeTimesheet(r.id); load(); shared.reload(); } catch (e: any) { message.error(e.message); } }}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                )}
              </Space>
            ) },
          ]} />
      ) : (
        <Table dataSource={view === 'project' ? byProject : byPerson} rowKey="id" size="small" loading={loading} pagination={false}
          locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No hours</span> }}
          columns={[
            { title: view === 'project' ? 'Project' : 'Employee', key: 'n', render: (_, r) => (view === 'project' ? pname(r.id) : ename(r.id)) },
            ...(view === 'project' ? [{ title: 'People', dataIndex: 'people', align: 'right' as const, width: 100 }] : []),
            { title: 'Days', dataIndex: 'days', align: 'right' as const, width: 100 },
            { title: 'Hours', key: 'h', align: 'right' as const, width: 140, render: (_: any, r: any) => hoursLabel(r.hours) },
          ]} />
      )}
      {editing && <TimesheetModal shared={shared} entry={editing} forEmployee={null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); shared.reload(); }} />}
    </div>
  );
}

export function CompanyProjectsPage() {
  const { companyId } = useAuth();
  const access = useCompanyAccess();
  const manage = ['create', 'edit', 'delete'].some(a => access.can('projects', a));
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [hours, setHours] = useState<Timesheet[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [contacts, setContacts] = useState<{ id: number; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      const [p, t, emps, cts] = await Promise.all([
        projectService.list(companyId), projectService.tasks(companyId),
        hrService.listEmployees(companyId).catch(() => [] as Employee[]),
        contactService.list(companyId).catch(() => [] as any[]),
      ]);
      setProjects(p); setTasks(t); setEmployees(emps); setContacts(cts.map((c: any) => ({ id: c.id, name: c.name })));
      // hours per project are for people who see everyone's timesheets
      setHours(manage ? await projectService.timesheets(companyId, {}) : []);
      setError(null);
    } catch (e: any) { setError(e.message); }
    setReady(true);
  }, [companyId, manage]);
  useEffect(() => { load(); }, [load]);

  if (!companyId) return <Alert type="error" title="No company context" />;
  if (error) return <div><Title level={4} style={{ color: '#f0ede6' }}>Projects</Title><Alert type="warning" showIcon title={error} /></div>;
  if (!ready) return null;
  const shared: Shared = { companyId, projects, employees, contacts, tasks, reload: load };

  return (
    <div>
      <Title level={4} style={{ color: '#f0ede6', marginBottom: 16 }}>Projects</Title>
      <Tabs items={[
        { key: 'projects', label: 'Projects', children: <ProjectsTab shared={shared} hours={hours} /> },
        { key: 'mine', label: 'My Timesheet', children: <MyTimesheetTab shared={shared} /> },
        ...(manage ? [{ key: 'all', label: 'Timesheets', children: <TimesheetsTab shared={shared} /> }] : []),
      ]} />
    </div>
  );
}

