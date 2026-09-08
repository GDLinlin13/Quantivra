import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Tag, Tooltip, message, Modal, InputNumber, Space, Alert } from 'antd';
import { ReloadOutlined, WarningOutlined, EditOutlined } from '@ant-design/icons';
import { hrService, leaveService, type Employee, type LeaveType, type LeaveBalance } from '../../../../services/hr';
import { supabase } from '../../../../utils/supabase';

const YEAR = new Date().getFullYear();

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
  const [edit, setEdit] = useState<Row | null>(null);
  const [editVal, setEditVal] = useState<number>(0);

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
        const [deps, bals] = await Promise.all([hrService.dependents(e.id), leaveService.balances(e.id, YEAR)]);
        const explained = leaveService.explain(types, e, deps, cc, YEAR);
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
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const recomputeAll = async () => {
    setBusy(true);
    try {
      const emps = (await hrService.listEmployees(companyId)).filter(e => e.status === 'active');
      for (const e of emps) await leaveService.syncEntitlements(companyId, e, country, YEAR);
      message.success('Entitlements recomputed');
      load();
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Alert type="info" showIcon style={{ flex: 1, marginRight: 12 }}
          message={`Entitlements are computed from each employee's residency, service and dependents against the ${country} statutory rules. Manual overrides are kept; a red flag means the override is below the statutory minimum.`} />
        <Button icon={<ReloadOutlined />} loading={busy} onClick={recomputeAll}>Recompute all</Button>
      </div>
      <Table
        dataSource={rows} loading={loading} rowKey="key" size="small" pagination={{ pageSize: 20 }}
        style={{ background: 'transparent' }}
        columns={[
          { title: 'Employee', key: 'e', render: (_, r) => <span style={{ color: '#f0ede6' }}>{r.employee.full_name} <span style={{ color: 'rgba(240,237,230,0.4)' }}>{r.employee.employee_code}</span></span> },
          { title: 'Leave type', key: 't', render: (_, r) => r.leaveType.name },
          {
            title: 'Entitled', key: 'ent', render: (_, r) => {
              const b = r.balance;
              const val = b ? Number(b.entitled_days) : r.computed.days;
              return (
                <Space>
                  <b style={{ color: '#4fc3f7' }}>{val}</b>
                  {b?.entitlement_source === 'manual' && <Tag color="gold">manual</Tag>}
                  {b?.below_statutory && <Tag color="red" icon={<WarningOutlined />}>below min {r.computed.statutoryMin}</Tag>}
                </Space>
              );
            },
          },
          { title: 'Statutory min', key: 'min', render: (_, r) => r.computed.statutoryMin },
          {
            title: 'Basis', key: 'basis', render: (_, r) => (
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
              Statutory minimum: <b>{edit.computed.statutoryMin}</b> days
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
    </div>
  );
}
