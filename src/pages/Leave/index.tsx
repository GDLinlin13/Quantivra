import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Select, DatePicker, InputNumber, Input, message, Space, Tag, Typography, Row, Col, Card, Statistic, Tabs, Divider, Calendar, Badge } from 'antd';
import { PlusOutlined, CheckOutlined, CloseOutlined, SettingOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { supabase } from '../../utils/supabase';
import { useCompanyId } from '../../utils/useCompany';
import { useAuth } from '../../contexts/AuthContext';
import { can, canApproveLeave } from '../../utils/permissions';

function countBusinessDays(start: dayjs.Dayjs, end: dayjs.Dayjs): number {
  let count = 0;
  let cur = start.startOf('day');
  const last = end.startOf('day');
  while (cur.isBefore(last) || cur.isSame(last, 'day')) {
    if (cur.day() !== 0 && cur.day() !== 6) count++;
    cur = cur.add(1, 'day');
  }
  return count || 1;
}

function calcDays(start: dayjs.Dayjs, end: dayjs.Dayjs, includeWeekends: boolean): number {
  if (includeWeekends) return end.diff(start, 'day') + 1;
  return countBusinessDays(start, end);
}

export default function LeavePage() {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const [tab, setTab] = useState('requests');
  const [requests, setRequests] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [myEmployeeId, setMyEmployeeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [form] = Form.useForm();

  // Leave type management
  const [ltModalOpen, setLtModalOpen] = useState(false);
  const [ltForm] = Form.useForm();
  const [ltSaving, setLtSaving] = useState(false);
  const [selectedLt, setSelectedLt] = useState<any>(null);

  // Per-employee entitlements
  const [entitlementEmpId, setEntitlementEmpId] = useState<number | null>(null);
  const [leaveBalances, setLeaveBalances] = useState<any[]>([]);
  const [balSaving, setBalSaving] = useState(false);

  // Calendar
  const [companyCountry, setCompanyCountry] = useState<string>('');
  const [holidays, setHolidays] = useState<any[]>([]);
  const [calendarLeaves, setCalendarLeaves] = useState<any[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);

  const [managedDeptIds, setManagedDeptIds] = useState<number[]>([]);
  const isManager = managedDeptIds.length > 0;
  const canApprove = canApproveLeave(user?.roles, isManager);
  const canViewAll = can('leave.view_all', user?.roles) || isManager;
  const canManage = canApprove;

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      let empId: number | null = null;
      if (!canViewAll && user) {
        const { data: emp } = await supabase.from('employees').select('id').eq('user_id', user.id).eq('company_id', companyId).maybeSingle();
        empId = emp?.id || null;
        setMyEmployeeId(empId);
      }

      // Check which departments this user manages
      if (user) {
        const { data: emp } = await supabase.from('employees').select('id').eq('user_id', user.id).eq('company_id', companyId).maybeSingle();
        if (emp) {
          const { data: depts } = await supabase.from('company_departments').select('department_id').eq('manager_id', emp.id);
          setManagedDeptIds((depts || []).map(d => d.department_id));
        }
      }

      let query = supabase.from('leave_requests').select('*, employees(full_name, department), leave_types(name)').eq('company_id', companyId);
      if (empId) query = query.eq('employee_id', empId);
      const { data } = await query.order('created_at', { ascending: false });
      setRequests(data || []);

      const [ltRes, empRes] = await Promise.all([
        supabase.from('leave_types').select('*').eq('company_id', companyId),
        supabase.from('employees').select('id, full_name').eq('company_id', companyId).eq('status', 'active'),
      ]);
      setLeaveTypes(ltRes.data || []);
      setEmployees(empRes.data || []);
      setStats({
        pending: (data || []).filter((r: any) => r.status === 'pending').length,
        approved: (data || []).filter((r: any) => r.status === 'approved').length,
        rejected: (data || []).filter((r: any) => r.status === 'rejected').length,
      });
    } catch {} finally { setLoading(false); }
  }

  async function handleSave(values: any) {
    setSaving(true);
    try {
      const start = values.start_date.format('YYYY-MM-DD');
      const end = values.end_date.format('YYYY-MM-DD');
      const days = values.days || dayjs(end).diff(dayjs(start), 'day') + 1;
      const employeeId = values.employee_id || myEmployeeId;
      await supabase.from('leave_requests').insert({
        employee_id: employeeId,
        leave_type_id: values.leave_type_id,
        start_date: start, end_date: end, days, reason: values.reason, status: 'pending',
      });
      message.success('Leave request submitted');
      setModalOpen(false);
      loadData();
    } catch (err: any) { message.error(err.message); } finally { setSaving(false); }
  }

  function recalcDays() {
    const { start_date, end_date, leave_type_id } = form.getFieldsValue();
    if (start_date && end_date && leave_type_id) {
      const lt = leaveTypes.find(l => l.id === leave_type_id);
      const days = calcDays(start_date, end_date, lt?.include_weekends === 1);
      form.setFieldsValue({ days });
    }
  }

  async function approveLeave(id: number) { await updateStatus(id, 'approved'); }
  async function rejectLeave(id: number) { await updateStatus(id, 'rejected'); }
  async function updateStatus(id: number, status: string) {
    try {
      if (status === 'approved') {
        const { data: lr } = await supabase.from('leave_requests').select('*').eq('id', id).single();
        if (lr) {
          // If not master/hr, verify manager has authority over this employee
          if (!user?.roles?.includes('master') && !user?.roles?.includes('hr') && managedDeptIds.length > 0) {
            const { data: emp } = await supabase.from('employees').select('department_id').eq('id', lr.employee_id).single();
            if (!emp?.department_id || !managedDeptIds.includes(emp.department_id)) {
              message.error('You can only approve leaves for your own department');
              return;
            }
          }
          const { data: balances } = await supabase
            .from('leave_balances')
            .select('*')
            .eq('employee_id', lr.employee_id)
            .eq('leave_type_id', lr.leave_type_id)
            .order('expiry_date', { ascending: true, nullsFirst: false });
          let remaining = lr.days;
          for (const bal of balances || []) {
            if (remaining <= 0) break;
            const avail = (bal.total_days || 0) - (bal.used_days || 0);
            if (avail <= 0) continue;
            const deduct = Math.min(remaining, avail);
            remaining -= deduct;
            await supabase.from('leave_balances').update({ used_days: (bal.used_days || 0) + deduct }).eq('id', bal.id);
          }
        }
      }
      await supabase.from('leave_requests').update({ status, approved_by: user?.id, approved_at: new Date().toISOString() }).eq('id', id);
      message.success(`Leave ${status}`);
      loadData();
    } catch (err: any) { message.error(err.message); }
  }

  async function handleSaveLeaveType(values: any) {
    setLtSaving(true);
    try {
      if (selectedLt) {
        await supabase.from('leave_types').update(values).eq('id', selectedLt.id);
      } else {
        await supabase.from('leave_types').insert({ ...values, company_id: companyId });
      }
      message.success('Leave type saved');
      setLtModalOpen(false);
      loadData();
    } catch (err: any) { message.error(err.message); } finally { setLtSaving(false); }
  }

  async function handleDeleteLeaveType(id: number) {
    await supabase.from('leave_types').delete().eq('id', id);
    message.success('Leave type deleted');
    loadData();
  }

  useEffect(() => {
    if (entitlementEmpId) loadBalances(entitlementEmpId);
  }, [entitlementEmpId]);

  async function loadBalances(empId: number) {
    const { data } = await supabase.from('leave_balances').select('*, leave_types(name)').eq('employee_id', empId).eq('year', new Date().getFullYear());
    setLeaveBalances(data || []);
  }

  async function handleSaveBalance(ltId: number, totalDays: number) {
    setBalSaving(true);
    try {
      const year = new Date().getFullYear();
      const existing = leaveBalances.find(b => b.leave_type_id === ltId && b.year === year && !b.is_carry_forward);
      if (existing) {
        await supabase.from('leave_balances').update({ total_days: totalDays }).eq('id', existing.id);
      } else {
        await supabase.from('leave_balances').insert({
          employee_id: entitlementEmpId,
          leave_type_id: ltId,
          total_days: totalDays,
          used_days: 0,
          year,
          is_carry_forward: 0,
        });
      }
      if (entitlementEmpId) loadBalances(entitlementEmpId);
    } catch (err: any) { message.error(err.message); } finally { setBalSaving(false); }
  }

  async function initDefaults() {
    try {
      await supabase.rpc('seed_default_leave_types', { p_company_id: companyId });
      message.success('Default leave types created');
      loadData();
    } catch (err: any) {
      message.error('Run the migration SQL first, or add types manually');
    }
  }

  async function handleRollOver() {
    if (!entitlementEmpId) { message.warning('Select an employee first'); return; }
    setBalSaving(true);
    try {
      const currentYear = new Date().getFullYear();
      const nextYear = currentYear + 1;
      const { data: currentBalances } = await supabase.from('leave_balances').select('*').eq('employee_id', entitlementEmpId).eq('year', currentYear);
      const { data: existingNext } = await supabase.from('leave_balances').select('*').eq('employee_id', entitlementEmpId).eq('year', nextYear);
      for (const lt of leaveTypes) {
        if (!lt.carry_forward) continue;
        const base = currentBalances?.find((b: any) => b.leave_type_id === lt.id && !b.is_carry_forward);
        const totalDays = base?.total_days ?? lt.days_per_year ?? 0;
        const usedDays = base?.used_days ?? 0;
        const remaining = totalDays - usedDays;
        if (remaining <= 0) continue;
        const carryOver = Math.min(remaining, lt.carry_forward_max_days ?? remaining);
        const nextBase = existingNext?.find((b: any) => b.leave_type_id === lt.id && !b.is_carry_forward);
        if (!nextBase) {
          await supabase.from('leave_balances').insert({
            employee_id: entitlementEmpId, leave_type_id: lt.id,
            total_days: lt.days_per_year || 0, used_days: 0, year: nextYear, is_carry_forward: 0,
          });
        }
        const nextCf = existingNext?.find((b: any) => b.leave_type_id === lt.id && b.is_carry_forward);
        if (carryOver > 0 && !nextCf) {
          const expiryMonths = lt.carry_forward_expiry_months || 0;
          const expiryDate = expiryMonths > 0
            ? dayjs(`${currentYear}-12-31`).add(expiryMonths, 'month').format('YYYY-MM-DD')
            : null;
          await supabase.from('leave_balances').insert({
            employee_id: entitlementEmpId, leave_type_id: lt.id,
            total_days: carryOver, used_days: 0, year: nextYear,
            is_carry_forward: 1, expiry_date: expiryDate,
          });
        }
      }
      message.success('Next year entitlements created');
      if (entitlementEmpId) loadBalances(entitlementEmpId);
    } catch (err: any) { message.error(err.message); } finally { setBalSaving(false); }
  }

  useEffect(() => {
    if (tab === 'calendar') loadCalendarData(dayjs());
  }, [tab]);

  async function loadCalendarData(month: dayjs.Dayjs) {
    setCalendarLoading(true);
    try {
      if (!companyCountry) {
        const { data: co } = await supabase.from('companies').select('country').eq('id', companyId).single();
        if (co?.country) setCompanyCountry(co.country);
      }
      const { data: h } = await supabase.from('public_holidays').select('*').eq('country', companyCountry || 'Singapore');
      setHolidays(h || []);
      const startOfMonth = month.startOf('month').format('YYYY-MM-DD');
      const endOfMonth = month.endOf('month').format('YYYY-MM-DD');
      const { data: l } = await supabase
        .from('leave_requests')
        .select('*, employees(full_name, department)')
        .eq('company_id', companyId)
        .eq('status', 'approved')
        .lte('start_date', endOfMonth)
        .gte('end_date', startOfMonth);
      setCalendarLeaves(l || []);
    } catch {} finally { setCalendarLoading(false); }
  }

  function buildCalendarData() {
    const map = new Map<string, { holidays: string[]; employees: { name: string; dept?: string }[] }>();
    const country = companyCountry || 'Singapore';
    for (const h of holidays) {
      if (h.country !== country) continue;
      const key = h.date;
      if (!map.has(key)) map.set(key, { holidays: [], employees: [] });
      if (!map.get(key)!.holidays.includes(h.name)) map.get(key)!.holidays.push(h.name);
    }
    for (const l of calendarLeaves) {
      const start = dayjs(l.start_date);
      const end = dayjs(l.end_date);
      let cur = start;
      while (cur.isBefore(end) || cur.isSame(end, 'day')) {
        const key = cur.format('YYYY-MM-DD');
        if (!map.has(key)) map.set(key, { holidays: [], employees: [] });
        const empName = l.employees?.full_name || `Emp #${l.employee_id}`;
        const already = map.get(key)!.employees.some((e: any) => e.name === empName);
        if (!already) map.get(key)!.employees.push({ name: empName, dept: l.employees?.department });
        cur = cur.add(1, 'day');
      }
    }
    return map;
  }

  function handlePanelChange(date: dayjs.Dayjs) {
    loadCalendarData(date);
  }

  const ltColumns = [
    { title: 'Leave Type', dataIndex: 'name', key: 'name' },
    { title: 'Days/Year', dataIndex: 'days_per_year', key: 'days', render: (v: number) => v || '—' },
    { title: 'Paid', dataIndex: 'is_paid', key: 'paid', render: (v: number) => v ? 'Yes' : 'No' },
    { title: 'Carry Forward', dataIndex: 'carry_forward', key: 'cf', render: (v: number) => v ? 'Yes' : 'No' },
    { title: 'CF Max Days', dataIndex: 'carry_forward_max_days', key: 'cfmax', render: (v: number | null) => v ?? '—' },
    { title: 'CF Expiry (mo)', dataIndex: 'carry_forward_expiry_months', key: 'cfexp', render: (v: number | null) => v ? `${v}mo` : '—' },
    { title: 'Includes Weekends', dataIndex: 'include_weekends', key: 'wknd', render: (v: number) => v ? 'Yes' : 'No' },
    {
      title: 'Actions', key: 'actions',
      render: (_: any, row: any) => (
        <Space>
          <Button size="small" onClick={() => { setSelectedLt(row); ltForm.setFieldsValue(row); setLtModalOpen(true); }}>Edit</Button>
          <Button size="small" danger onClick={() => handleDeleteLeaveType(row.id)}>Delete</Button>
        </Space>
      ),
    },
  ];

  const columns = [
    { title: 'Employee', dataIndex: ['employees', 'full_name'], key: 'emp' },
    { title: 'Department', dataIndex: ['employees', 'department'], key: 'dept' },
    { title: 'Type', dataIndex: ['leave_types', 'name'], key: 'type' },
    { title: 'From', dataIndex: 'start_date', key: 'start' },
    { title: 'To', dataIndex: 'end_date', key: 'end' },
    { title: 'Days', dataIndex: 'days', key: 'days' },
    { title: 'Reason', dataIndex: 'reason', key: 'reason', ellipsis: true },
    {
      title: 'Status', dataIndex: 'status', key: 'status',
      render: (s: string) => {
        const colors: Record<string, string> = { pending: 'gold', approved: 'green', rejected: 'red', cancelled: 'default' };
        return <Tag color={colors[s] || 'default'}>{s}</Tag>;
      },
    },
    ...(canApprove ? [{
      title: 'Actions', key: 'actions', width: 160,
      render: (_: any, row: any) => row.status === 'pending' ? (
        <Space>
          <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => approveLeave(row.id)}>Approve</Button>
          <Button size="small" danger icon={<CloseOutlined />} onClick={() => rejectLeave(row.id)}>Reject</Button>
        </Space>
      ) : null,
    }] : []),
  ];

  return (
    <div>
      <Typography.Title level={4}>Leave Management</Typography.Title>
      <Tabs activeKey={tab} onChange={setTab} items={[
        {
          key: 'requests', label: 'Requests',
          children: (
            <>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}><Card><Statistic title="Pending" value={stats.pending} valueStyle={{ color: '#faad14' }} /></Card></Col>
                <Col span={6}><Card><Statistic title="Approved" value={stats.approved} valueStyle={{ color: '#52c41a' }} /></Card></Col>
                <Col span={6}><Card><Statistic title="Rejected" value={stats.rejected} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
              </Row>
              <div style={{ marginBottom: 16 }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>New Leave Request</Button>
              </div>
              <Table dataSource={requests} columns={columns} rowKey="id" loading={loading} />

              <Modal title="New Leave Request" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
                <Form form={form} layout="vertical" onFinish={handleSave}>
                  {canViewAll && (
                    <Form.Item name="employee_id" label="Employee" rules={[{ required: true }]}>
                      <Select showSearch optionFilterProp="children">
                        {employees.map(e => <Select.Option key={e.id} value={e.id}>{e.full_name}</Select.Option>)}
                      </Select>
                    </Form.Item>
                  )}
                  <Form.Item name="leave_type_id" label="Leave Type" rules={[{ required: true }]}>
                    <Select onChange={() => recalcDays()}>
                      {leaveTypes.map(lt => <Select.Option key={lt.id} value={lt.id}>{lt.name}</Select.Option>)}
                    </Select>
                  </Form.Item>
                  <Form.Item name="start_date" label="Start Date" rules={[{ required: true }]}>
                    <DatePicker style={{ width: '100%' }} onChange={() => recalcDays()} />
                  </Form.Item>
                  <Form.Item name="end_date" label="End Date" rules={[{ required: true }]}>
                    <DatePicker style={{ width: '100%' }} onChange={() => recalcDays()} />
                  </Form.Item>
                  <Form.Item name="days" label="Number of Days">
                    <InputNumber style={{ width: '100%' }} min={0.5} />
                  </Form.Item>
                  <Form.Item name="reason" label="Reason">
                    <Input.TextArea rows={3} />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={saving} block>Submit Request</Button>
                </Form>
              </Modal>
            </>
          ),
        },
        {
          key: 'entitlements', label: 'Entitlements',
          children: (
            <>
              <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography.Title level={5} style={{ margin: 0 }}>Employee Leave Entitlements</Typography.Title>
              </div>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={8}>
                  <Select placeholder="Select employee" style={{ width: '100%' }} showSearch
                    value={entitlementEmpId} onChange={setEntitlementEmpId} optionFilterProp="children">
                    {employees.map(e => <Select.Option key={e.id} value={e.id}>{e.full_name}</Select.Option>)}
                  </Select>
                </Col>
                <Col>
                  <Button onClick={() => { if (entitlementEmpId) loadBalances(entitlementEmpId); }}>Refresh</Button>
                </Col>
                <Col>
                  <Button type="primary" onClick={handleRollOver} loading={balSaving}>Roll Over to {new Date().getFullYear() + 1}</Button>
                </Col>
              </Row>
              {entitlementEmpId && (
                <Table dataSource={leaveTypes} rowKey="id" pagination={false}
                  columns={[
                    { title: 'Leave Type', dataIndex: 'name', key: 'name' },
                    { title: 'Allocated', key: 'alloc', render: (_: any, row: any) => {
                      const base = leaveBalances.find((b: any) => b.leave_type_id === row.id && !b.is_carry_forward);
                      const cf = leaveBalances.find((b: any) => b.leave_type_id === row.id && b.is_carry_forward);
                      const baseDays = base?.total_days || 0;
                      const cfDays = cf?.total_days || 0;
                      const expiryStr = cf?.expiry_date ? ` (CF ${cfDays}d, expires ${dayjs(cf.expiry_date).format('DD/MM/YY')})` : '';
                      return <span>{baseDays + cfDays}{cfDays > 0 && <span style={{ fontSize: 11, color: '#888', marginLeft: 4 }}>{expiryStr}</span>}</span>;
                    }},
                    { title: 'Used', key: 'used', render: (_: any, row: any) => {
                      return leaveBalances.filter((b: any) => b.leave_type_id === row.id).reduce((s, b) => s + (b.used_days || 0), 0);
                    }},
                    { title: 'Remaining', key: 'rem', render: (_: any, row: any) => {
                      const alloc = leaveBalances.filter((b: any) => b.leave_type_id === row.id).reduce((s, b) => s + (b.total_days || 0), 0);
                      const used = leaveBalances.filter((b: any) => b.leave_type_id === row.id).reduce((s, b) => s + (b.used_days || 0), 0);
                      return alloc - used;
                    }},
                    {
                      title: 'Set Days', key: 'set', width: 140,
                      render: (_: any, row: any) => {
                        const base = leaveBalances.find((b: any) => b.leave_type_id === row.id && !b.is_carry_forward);
                        const current = base?.total_days || row.days_per_year || 0;
                        return (
                          <InputNumber size="small" min={0} defaultValue={current}
                            onPressEnter={e => handleSaveBalance(row.id, parseInt((e.target as any).value) || 0)}
                            onBlur={e => { const v = parseInt(e.target.value) || 0; if (v !== current) handleSaveBalance(row.id, v); }}
                            style={{ width: 80 }} />
                        );
                      }
                    },
                  ]}
                />
              )}
              <Divider />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography.Title level={5} style={{ margin: 0 }}>Leave Types</Typography.Title>
                <Space>
                  {leaveTypes.length === 0 && (
                    <Button onClick={initDefaults}>Initialize Defaults</Button>
                  )}
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => { setSelectedLt(null); ltForm.resetFields(); setLtModalOpen(true); }}>Add Leave Type</Button>
                </Space>
              </div>
              <Table dataSource={leaveTypes} columns={ltColumns} rowKey="id" pagination={false} style={{ marginTop: 16 }} />

              <Modal title={selectedLt ? 'Edit Leave Type' : 'Add Leave Type'} open={ltModalOpen} onCancel={() => setLtModalOpen(false)} footer={null}>
                <Form form={ltForm} layout="vertical" onFinish={handleSaveLeaveType}>
                  <Form.Item name="name" label="Leave Type Name" rules={[{ required: true }]}>
                    <Input placeholder="e.g. Annual Leave, Maternity Leave, Birthday Leave" />
                  </Form.Item>
                  <Form.Item name="days_per_year" label="Days Per Year (default)" rules={[{ required: true }]}>
                    <InputNumber style={{ width: '100%' }} min={0} />
                  </Form.Item>
                  <Form.Item name="is_paid" label="Paid Leave">
                    <Select>
                      <Select.Option value={1}>Yes</Select.Option>
                      <Select.Option value={0}>No</Select.Option>
                    </Select>
                  </Form.Item>
                  <Form.Item name="carry_forward" label="Carry Forward Allowed">
                    <Select>
                      <Select.Option value={1}>Yes</Select.Option>
                      <Select.Option value={0}>No</Select.Option>
                    </Select>
                  </Form.Item>
                  <Form.Item name="include_weekends" label="Includes Weekends (counts Sat/Sun)">
                    <Select>
                      <Select.Option value={1}>Yes</Select.Option>
                      <Select.Option value={0}>No</Select.Option>
                    </Select>
                  </Form.Item>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name="carry_forward_max_days" label="Max Carry Forward Days">
                        <InputNumber style={{ width: '100%' }} min={0} placeholder="Leave empty = no limit" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="carry_forward_expiry_months" label="Expire After (months)">
                        <InputNumber style={{ width: '100%' }} min={0} placeholder="Leave empty = no expiry" />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Button type="primary" htmlType="submit" loading={ltSaving} block>Save Leave Type</Button>
                </Form>
              </Modal>
            </>
          ),
        },
        {
          key: 'calendar', label: 'Calendar',
          children: (
            <div style={{ marginTop: 16 }}>
              <Calendar cellRender={(date: dayjs.Dayjs, info: { type: string }) => {
                if (info.type !== 'date') return null;
                const key = date.format('YYYY-MM-DD');
                const data = buildCalendarData().get(key);
                if (!data && !date.isSame(dayjs(), 'day')) return null;
                return (
                  <div style={{ fontSize: 10, lineHeight: 1.2, minHeight: 28 }}>
                    {data?.holidays.map(h => (
                      <div key={h} style={{ color: '#fa8c16', fontWeight: 600 }}>{h}</div>
                    ))}
                    {data?.employees.length ? (
                      <>
                        <Badge count={data.employees.length} style={{ backgroundColor: '#1677ff', fontSize: 10 }} overflowCount={99} />
                        {data.employees.slice(0, 2).map((e: any) => (
                          <div key={e.name} style={{ color: '#69b1ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                        ))}
                        {data.employees.length > 2 && <div style={{ color: '#888' }}>+{data.employees.length - 2}</div>}
                      </>
                    ) : null}
                  </div>
                );
              }} onPanelChange={handlePanelChange} />
            </div>
          ),
        },
      ]} />
    </div>
  );
}
