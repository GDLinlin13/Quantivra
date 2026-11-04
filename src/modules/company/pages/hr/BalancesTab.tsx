import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Tag, Tooltip, message, Modal, InputNumber, Space, Alert, Select, Typography } from 'antd';
import { ReloadOutlined, WarningOutlined, EditOutlined, CalendarOutlined } from '@ant-design/icons';
import { hrService, leaveService, type Employee, type LeaveType, type LeaveBalance, type LeaveYearRow } from '../../../../services/hr';
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

export function BalancesTab({ companyId }: { companyId: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [country, setCountry] = useState('SG');
  const [year, setYear] = useState(THIS_YEAR);
  const [edit, setEdit] = useState<Row | null>(null);
  const [editVal, setEditVal] = useState<number>(0);
  const [newYear, setNewYear] = useState<number | null>(null);
  const [preview, setPreview] = useState<LeaveYearRow[] | null>(null);

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
        const [deps, bals] = await Promise.all([hrService.dependents(e.id), leaveService.balances(e.id, year)]);
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
        dataSource={rows} loading={loading} rowKey="key" size="small" pagination={{ pageSize: 20 }}
        style={{ background: 'transparent' }} scroll={{ x: true }}
        columns={[
          { title: 'Employee', key: 'e', render: (_, r) => <span style={{ color: '#f0ede6' }}>{r.employee.full_name} <span style={{ color: 'rgba(240,237,230,0.4)' }}>{r.employee.employee_code}</span></span> },
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
