import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Tag, Tooltip, message, Modal, InputNumber, Space, Alert, Select, Typography, Drawer, Form, DatePicker, Input, Popconfirm } from 'antd';
import { ReloadOutlined, WarningOutlined, EditOutlined, CalendarOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { hrService, leaveService, type Employee, type LeaveType, type LeaveBalance, type LeaveYearRow, type ToilCredit } from '../../../../services/hr';
import { useCompanyAccess } from '../../../../contexts/CompanyAccess';
import { supabase } from '../../../../utils/supabase';
import { unitLabel } from '../../../../utils/workdays';

const THIS_YEAR = new Date().getFullYear();

interface Row {
  key: string;
  employee: Employee;
  leaveType: LeaveType;
  balance?: LeaveBalance;
  computed: { days: number; statutoryMin: number; basis: string; warnings: string[]; computed: boolean };
}

interface EmployeeGroup { employee: Employee; rows: Row[] }

export function BalancesTab({ companyId }: { companyId: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [country, setCountry] = useState('SG');
  const [year, setYear] = useState(THIS_YEAR);
  const access = useCompanyAccess();
  const canGrant = access.canWrite('leave') || access.canWrite('employees');
  const [toilOpen, setToilOpen] = useState(false);
  const [toilList, setToilList] = useState<ToilCredit[]>([]);
  const [toilForm] = Form.useForm();
  const [edit, setEdit] = useState<Row | null>(null);
  const [editVal, setEditVal] = useState<number>(0);
  const [newYear, setNewYear] = useState<number | null>(null);
  const [preview, setPreview] = useState<LeaveYearRow[] | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: co } = await supabase.from('companies').select('country').eq('id', companyId).maybeSingle();
      const cc = co?.country || 'SG';
      setCountry(cc);
      const [emps, types] = await Promise.all([hrService.listEmployees(companyId), leaveService.types(companyId)]);
      const active = emps.filter(e => e.status === 'active');
      const out: Row[] = [];
      for (const e of active) {
        const [deps, found] = await Promise.all([hrService.dependents(e.id), leaveService.balances(e.id, year)]);
        let bals = found;
        // set up missing balances here (staff can't create their own)
        if (types.some(t => t.active && !bals.some(x => x.leave_type_id === t.id))) {
          await leaveService.syncEntitlements(companyId, e, cc, year).catch(() => null);
          bals = await leaveService.balances(e.id, year);
        }
        const explained = leaveService.explain(types, e, deps, cc, year);
        for (const x of explained) {
          out.push({
            key: `${e.id}-${x.leaveType.id}`,
            employee: e, leaveType: x.leaveType,
            balance: bals.find(b => b.leave_type_id === x.leaveType.id),
            computed: { days: x.days, statutoryMin: x.statutoryMin, basis: x.basis, warnings: x.warnings, computed: x.computed },
          });
        }
      }
      setRows(out);
    } catch (e: any) { message.error(e.message); }
    setLoading(false);
  }, [companyId, year]);

  useEffect(() => { load(); }, [load]);

  const recomputeAll = async () => {
    setBusy(true);
    try {
      const emps = (await hrService.listEmployees(companyId)).filter(e => e.status === 'active');
      for (const e of emps) await leaveService.syncEntitlements(companyId, e, country, year);
      message.success('Entitlements recomputed');
      load();
    } catch (e: any) { message.error(e.message); }
    setBusy(false);
  };

  const openNewYear = async (y: number) => {
    setNewYear(y);
    setPreview(null);
    try { setPreview(await leaveService.previewLeaveYear(companyId, country, y)); }
    catch (e: any) { message.error(e.message); setNewYear(null); }
  };

  const confirmNewYear = async () => {
    if (!newYear) return;
    setBusy(true);
    try {
      const r = await leaveService.startLeaveYear(companyId, country, newYear);
      message.success(`${newYear} leave year started for ${r.employees} employee(s)`);
      setNewYear(null);
      setYear(newYear);
    } catch (e: any) { message.error(e.message); }
    setBusy(false);
  };

  const saveOverride = async (source: 'auto' | 'manual') => {
    if (!edit?.balance) { message.info('Recompute first to create the balance row'); return; }
    try {
      await leaveService.setEntitlement(edit.balance.id, source === 'manual' ? editVal : edit.computed.days, source, edit.computed.statutoryMin);
      message.success('Saved'); setEdit(null); load();
    } catch (e: any) { message.error(e.message); }
  };

  // One row per employee; click to see and edit their entitlements.
  const employeeGroups: EmployeeGroup[] = [];
  for (const r of rows) {
    let g = employeeGroups.find(x => x.employee.id === r.employee.id);
    if (!g) { g = { employee: r.employee, rows: [] }; employeeGroups.push(g); }
    g.rows.push(r);
  }
  const selectedGroup = employeeGroups.find(g => g.employee.id === selectedEmployeeId) || null;
  const toilTypes = selectedGroup ? selectedGroup.rows.map(r => r.leaveType).filter(t => t.is_toil && t.active) : [];
  const loadToil = useCallback(async () => {
    setToilList(selectedEmployeeId ? await leaveService.toilCredits(companyId, Number(selectedEmployeeId)) : []);
  }, [companyId, selectedEmployeeId]);
  useEffect(() => { loadToil(); }, [loadToil]);
  const grantToil = async (v: any) => {
    if (!selectedGroup) return;
    try {
      await leaveService.grantToil(Number(selectedGroup.employee.id), v.leave_type_id, Number(v.amount), dayjs(v.worked_date).format('YYYY-MM-DD'), v.reason);
      message.success('Time off in lieu added'); setToilOpen(false); toilForm.resetFields(); loadToil(); load();
    } catch (e: any) { message.error(e.message); }
  };

  const noBalancesYet = !loading && rows.length > 0 && rows.every(r => !r.balance);

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Space wrap>
          <span style={{ color: 'rgba(240,237,230,0.6)' }}>Leave year</span>
          <Select value={year} onChange={setYear} style={{ width: 100 }}
            options={[THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1].map(y => ({ label: String(y), value: y }))} />
        </Space>
        <Space wrap>
          <Button icon={<ReloadOutlined />} loading={busy && !newYear} onClick={recomputeAll}>Recompute {year}</Button>
          <Button type="primary" icon={<CalendarOutlined />} onClick={() => openNewYear(year === THIS_YEAR ? THIS_YEAR + 1 : year)}
            style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>
            Start {year === THIS_YEAR ? THIS_YEAR + 1 : year} leave year…
          </Button>
        </Space>
      </div>
      <Alert type="info" showIcon style={{ marginBottom: 12 }}
        message={`Each employee's days follow your company's leave policy (HR → Leave Types), and never go below the ${country} legal minimum. In the first week of January, use "Start leave year" to set everyone's new days and carry over unused leave.`} />
      {noBalancesYet && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message={`No balances saved for ${year} yet. The numbers below are a preview — click "Start ${year} leave year" or "Recompute ${year}" to save them.`} />
      )}
      <Table
        dataSource={employeeGroups} loading={loading} rowKey={g => g.employee.id} size="small" pagination={{ pageSize: 20 }}
        style={{ background: 'transparent' }} scroll={{ x: true }}
        onRow={g => ({ onClick: () => setSelectedEmployeeId(g.employee.id), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'Employee', key: 'e', render: (_, g) => <span style={{ color: '#f0ede6' }}>{g.employee.full_name} <span style={{ color: 'rgba(240,237,230,0.4)' }}>{g.employee.employee_code}</span></span> },
          ...['annual', 'sick'].map(kind => ({
            title: kind === 'annual' ? 'Annual leave left' : 'Sick leave left', key: kind,
            render: (_: any, g: EmployeeGroup) => {
              const r = g.rows.find(x => x.leaveType.name.toLowerCase().includes(kind));
              if (!r) return '–';
              const b = r.balance;
              const total = b ? Number(b.entitled_days) + Number(b.carried_days || 0) : r.computed.days;
              const left = b ? total - Number(b.taken_days || 0) - Number(b.pending_days || 0) : total;
              return <span><b>{left}</b> <span style={{ color: 'rgba(240,237,230,0.5)' }}>of {total}</span></span>;
            },
          })),
          { title: 'Other leave', key: 'other', render: (_, g) => {
            const other = g.rows.filter(r => !/annual|sick/i.test(r.leaveType.name) && (r.balance ? Number(r.balance.entitled_days) : r.computed.days) > 0);
            return other.length ? other.map(r => <Tag key={r.key}>{r.leaveType.name}</Tag>) : <span style={{ color: 'rgba(240,237,230,0.4)' }}>–</span>;
          } },
          { title: '', key: 'flags', render: (_, g) => (
            <Space size={4}>
              {g.rows.some(r => r.balance?.entitlement_source === 'manual') && <Tag color="gold">manual</Tag>}
              {g.rows.some(r => r.balance?.below_statutory) && <Tag color="red" icon={<WarningOutlined />}>below minimum</Tag>}
              {g.rows.every(r => !r.balance) && <Tag>not saved yet</Tag>}
              <Button size="small" type="link">View / edit</Button>
            </Space>
          ) },
        ]}
      />

      <Drawer open={!!selectedGroup} onClose={() => setSelectedEmployeeId(null)} width={Math.min(980, window.innerWidth)}
        title={selectedGroup ? `${selectedGroup.employee.full_name} — ${year} leave` : ''}>
        {selectedGroup && canGrant && toilTypes.length > 0 && (
          <Button icon={<PlusOutlined />} style={{ marginBottom: 12 }}
            onClick={() => { toilForm.resetFields(); toilForm.setFieldsValue({ leave_type_id: toilTypes[0].id, worked_date: dayjs() }); setToilOpen(true); }}>Add time off in lieu</Button>
        )}
        {selectedGroup && (
          <Table
            dataSource={selectedGroup.rows} rowKey="key" size="small" pagination={false} scroll={{ x: true }}
            columns={[
          { title: 'Leave type', key: 't', render: (_, r) => r.leaveType.name },
          {
            title: 'Entitled', key: 'ent', render: (_, r) => {
              const b = r.balance;
              const val = b ? Number(b.entitled_days) : r.computed.days;
              return (
                <Space>
                  <b style={{ color: '#4fc3f7' }}>{val}</b>{r.leaveType.count_method === 'weeks' && <span style={{ color: 'rgba(240,237,230,0.5)' }}>{unitLabel('weeks', val)}</span>}
                  {b?.entitlement_source === 'manual' && <Tag color="gold">manual</Tag>}
                  {b?.below_statutory && <Tag color="red" icon={<WarningOutlined />}>below min {r.computed.statutoryMin}</Tag>}
                </Space>
              );
            },
          },
          { title: 'Carried over', key: 'cf', render: (_, r) => Number(r.balance?.carried_days || 0) || '–' },
          { title: 'Taken', key: 'tk', render: (_, r) => Number(r.balance?.taken_days || 0) },
          {
            title: 'Remaining', key: 'rem', render: (_, r) => {
              const b = r.balance;
              if (!b) return '–';
              return <b>{Number(b.entitled_days) + Number(b.carried_days || 0) - Number(b.taken_days || 0) - Number(b.pending_days || 0)}</b>;
            },
          },
          {
            title: 'How it was worked out', key: 'basis', render: (_, r) => (
              <span style={{ color: 'rgba(240,237,230,0.6)', fontSize: 12 }}>
                {r.balance?.entitlement_basis || r.computed.basis}
                {r.computed.warnings.length > 0 && (
                  <Tooltip title={r.computed.warnings.join(' ')}>
                    {' '}<WarningOutlined style={{ color: '#faad14' }} />
                  </Tooltip>
                )}
              </span>
            ),
          },
          {
            title: '', key: 'act', render: (_, r) => (
              <Button size="small" icon={<EditOutlined />} disabled={!r.balance}
                onClick={() => { setEdit(r); setEditVal(r.balance ? Number(r.balance.entitled_days) : r.computed.days); }} />
            ),
          },
        ]}
          />
        )}
        {selectedGroup && toilList.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <Typography.Title level={5}>Time off in lieu added</Typography.Title>
            <Table dataSource={toilList} rowKey="id" size="small" pagination={false}
              columns={[
                { title: 'Worked on', dataIndex: 'worked_date', width: 120 },
                { title: 'Leave type', key: 't', render: (_: any, c: ToilCredit) => selectedGroup.rows.find(r => r.leaveType.id === c.leave_type_id)?.leaveType.name || '—' },
                { title: 'Added', key: 'a', render: (_: any, c: ToilCredit) => { const lt = selectedGroup.rows.find(r => r.leaveType.id === c.leave_type_id)?.leaveType; return `${c.amount} ${unitLabel(lt?.count_method, c.amount)}`; } },
                { title: 'Reason', dataIndex: 'reason', render: (v: string | null) => v || '—' },
                { title: '', key: 'x', width: 50, render: (_: any, c: ToilCredit) => canGrant && (
                  <Popconfirm title="Take this time off in lieu back?" description="Only possible while it hasn't been used."
                    onConfirm={async () => { try { await leaveService.revokeToil(c.id); loadToil(); load(); } catch (e: any) { message.error(e.message); } }}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                ) },
              ]} />
          </div>
        )}
      </Drawer>

      <Modal open={toilOpen} title={selectedGroup ? `Time off in lieu — ${selectedGroup.employee.full_name}` : ''} okText="Add" onCancel={() => setToilOpen(false)} onOk={() => toilForm.submit()} destroyOnHidden>
        <Form form={toilForm} layout="vertical" onFinish={grantToil}>
          <Form.Item name="leave_type_id" label="Leave type" rules={[{ required: true }]}>
            <Select options={toilTypes.map(t => ({ value: t.id, label: `${t.name} (${unitLabel(t.count_method, 2)})` }))} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="amount" label="Amount earned" rules={[{ required: true, message: 'Enter how much' }]}><InputNumber style={{ width: '100%' }} min={0.25} max={365} step={0.25} /></Form.Item>
            <Form.Item name="worked_date" label="Worked on" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item name="reason" label="Reason"><Input placeholder="e.g. Worked on Saturday" /></Form.Item>
        </Form>
      </Modal>

      <Modal open={!!edit} onCancel={() => setEdit(null)} footer={null}
        title={edit ? `${edit.employee.full_name} — ${edit.leaveType.name}` : ''}>
        {edit && (
          <div>
            <p style={{ color: 'rgba(240,237,230,0.6)' }}>
              Auto entitlement: <b>{edit.computed.days}</b> days — {edit.computed.basis}<br />
              Legal minimum: <b>{edit.computed.statutoryMin}</b> days
            </p>
            {edit.computed.warnings.map((w, i) => <Alert key={i} type="warning" showIcon style={{ marginBottom: 6 }} message={w} />)}
            <Space style={{ marginTop: 8 }}>
              <InputNumber min={0} value={editVal} onChange={v => setEditVal(v ?? 0)} />
              <Button type="primary" danger={editVal < edit.computed.statutoryMin} onClick={() => saveOverride('manual')}>
                Set manual{editVal < edit.computed.statutoryMin ? ' (below min)' : ''}
              </Button>
              <Button onClick={() => saveOverride('auto')}>Reset to auto</Button>
            </Space>
          </div>
        )}
      </Modal>

      <Modal open={!!newYear} width={860} onCancel={() => setNewYear(null)}
        title={`Start the ${newYear} leave year`}
        okText={`Start ${newYear} for everyone`} onOk={confirmNewYear} okButtonProps={{ loading: busy, disabled: !preview }}>
        <Typography.Paragraph style={{ color: 'rgba(240,237,230,0.7)' }}>
          Sets every active employee's {newYear} days from your leave policy (counting service up to 1 January {newYear}),
          and carries over unused {newYear ? newYear - 1 : ''} days up to each leave type's carry-over limit.
          Manual overrides are kept. Safe to run again — it updates rather than duplicates.
        </Typography.Paragraph>
        <Table
          dataSource={preview || []} loading={!preview} size="small" pagination={{ pageSize: 10 }} scroll={{ x: true }}
          rowKey={r => `${r.employee.id}-${r.leaveType.id}`}
          columns={[
            { title: 'Employee', key: 'e', render: (_, r) => r.employee.full_name },
            { title: 'Leave type', key: 't', render: (_, r) => r.leaveType.name },
            { title: `${newYear} entitlement`, key: 'n', render: (_, r) => <b>{r.entitled} {unitLabel(r.leaveType.count_method, r.entitled)}</b> },
            { title: `Unused ${newYear ? newYear - 1 : ''}`, key: 'u', render: (_, r) => r.unusedLastYear || '–' },
            { title: 'Carried over', key: 'c', render: (_, r) => r.carried || '–' },
            { title: 'Basis', key: 'b', render: (_, r) => <span style={{ fontSize: 12, color: 'rgba(240,237,230,0.6)' }}>{r.basis}</span> },
          ]}
        />
      </Modal>
    </div>
  );
}
