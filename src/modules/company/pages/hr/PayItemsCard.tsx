import { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Drawer, Select, InputNumber, Input, Space, Tag, Tooltip, message, Popconfirm, Empty, Typography, Divider, Segmented } from 'antd';
import { EditOutlined, PlusOutlined, DeleteOutlined, InfoCircleOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { hrService, calendarService, type Employee } from '../../../../services/hr';
import { workDaysPerWeek } from '../../../../utils/workdays';
import { payItemService } from '../../../../services/payroll';
import {
  PAY_ITEM_TYPES, PAY_ITEM_BY_CODE, hourlyRate, DEFAULT_OT_MULTIPLIER, dailyRate, overtimeDaysAmount, isOvertime, overtimeAmount, unpaidLeaveAmount, workingDaysInMonth, payItemLabel, type PayItemRow,
} from '../../../../data/payItems';
import { AmountInput } from '../../../../components/AmountInput';

const { Text } = Typography;
const money = (n: number, c: string) => `${c} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// a contribution set by hand changes no pay item (it replaces the worked-out amount)
const signed = (it: PayItemRow) => { const k = PAY_ITEM_BY_CODE[it.item_code]?.kind; return k === 'override' ? 0 : (k === 'deduction' ? -1 : 1) * (Number(it.amount) || 0); };

type Draft = PayItemRow & { key: string; auto?: boolean };
let seq = 0;

/** Monthly pay items (overtime, allowances, bonuses, reimbursements, deductions) per employee. */
export function PayItemsCard({ companyId, year, month, currency }: { companyId: number; year: number; month: number; currency: string }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<PayItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Employee | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [emps, its] = await Promise.all([hrService.listEmployees(companyId), payItemService.listForPeriod(companyId, year, month)]);
      setEmployees(emps.filter(e => e.status === 'active'));
      setItems(its);
    } catch (e: any) {
      message.error(/payroll_pay_items/.test(e.message) ? 'Pay items need database update 022 — ask your administrator to run it.' : e.message);
    }
    setLoading(false);
  }, [companyId, year, month]);
  useEffect(() => { load(); }, [load]);

  const period = dayjs(`${year}-${String(month).padStart(2, '0')}-01`).format('MMMM YYYY');
  const itemsOf = (id: number) => items.filter(i => Number(i.employee_id) === Number(id));

  const summary = (list: PayItemRow[]) => list.length === 0
    ? <Text style={{ color: 'rgba(240,237,230,0.3)' }}>—</Text>
    : (
      <Space size={[4, 4]} wrap>
        {list.map(i => (
          <Tag key={i.id} color={PAY_ITEM_BY_CODE[i.item_code]?.kind === 'deduction' ? 'red' : PAY_ITEM_BY_CODE[i.item_code]?.kind === 'override' ? 'blue' : 'green'} style={{ margin: 0 }}>
            {payItemLabel(i)} {PAY_ITEM_BY_CODE[i.item_code]?.kind === 'deduction' ? '−' : PAY_ITEM_BY_CODE[i.item_code]?.kind === 'override' ? '= ' : '+'}{money(i.amount, '').trim()}
          </Tag>
        ))}
      </Space>
    );

  return (
    <Card size="small" style={{ marginBottom: 16, background: 'rgba(255,255,255,0.03)' }}
      title={<span style={{ color: '#f0ede6', fontSize: 13 }}>Pay items for {period} — overtime, allowances, bonuses, claims, deductions</span>}>
      <div style={{ color: 'rgba(240,237,230,0.45)', fontSize: 12, marginBottom: 10 }}>
        Add these <b>before</b> you click Run Payroll (or re-run a draft afterwards). <b>Every month</b> items (e.g. a fixed transport
        allowance) are added to every payroll automatically; <b>this month</b> items only to {period}.
      </div>
      <Table
        dataSource={employees} rowKey="id" size="small" loading={loading} pagination={false}
        locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No active employees</span> }}
        columns={[
          { title: 'Employee', key: 'n', render: (_, e) => <span>{e.full_name}{e.employee_code ? <Text style={{ color: 'rgba(240,237,230,0.4)' }}> · {e.employee_code}</Text> : null}</span> },
          { title: 'Basic salary', key: 'b', render: (_, e) => money(Number(e.base_salary) || 0, currency) },
          { title: 'Every month', key: 'r', render: (_, e) => summary(itemsOf(e.id).filter(i => i.recurring)) },
          { title: `Only ${dayjs(`${year}-${month}-01`).format('MMM YYYY')}`, key: 'm', render: (_, e) => summary(itemsOf(e.id).filter(i => !i.recurring)) },
          {
            title: 'Change', key: 'net', render: (_, e) => {
              const n = itemsOf(e.id).reduce((s, i) => s + signed(i), 0);
              return n === 0 ? <Text style={{ color: 'rgba(240,237,230,0.3)' }}>—</Text>
                : <Text style={{ color: n > 0 ? '#73d13d' : '#ff7875' }}>{n > 0 ? '+' : '−'}{money(Math.abs(n), currency)}</Text>;
            },
          },
          { title: '', key: 'act', render: (_, e) => <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(e)}>Edit</Button> },
        ]}
      />
      {editing && (
        <PayItemsDrawer companyId={companyId} employee={editing} year={year} month={month} currency={currency}
          items={itemsOf(editing.id)} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </Card>
  );
}

function PayItemsDrawer({ companyId, employee, year, month, currency, items, onClose, onSaved }: {
  companyId: number; employee: Employee; year: number; month: number; currency: string;
  items: PayItemRow[]; onClose: () => void; onSaved: () => void;
}) {
  const [rows, setRows] = useState<Draft[]>(() => items.map(i => ({ ...i, key: `i${i.id}` })));
  const [workDays, setWorkDays] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const basic = Number(employee.base_salary) || 0;
  const period = dayjs(`${year}-${String(month).padStart(2, '0')}-01`).format('MMMM YYYY');

  const [daysPerWeek, setDaysPerWeek] = useState(5);
  useEffect(() => {
    calendarService.effectivePattern(companyId, employee.id)
      .then(p => { setWorkDays(workingDaysInMonth(year, month, p)); setDaysPerWeek(workDaysPerWeek(p) || 5); })
      .catch(() => setWorkDays(null));
  }, [companyId, employee.id, year, month]);
  // working days this month; if the work week couldn't be read, an average month of that week
  const monthDays = workDays || Math.round((daysPerWeek * 52) / 12);
  const dayRate = dailyRate(basic, monthDays);

  const autoAmount = (code: string, qty?: number | null, mult?: number | null, rate?: number | null) => {
    const t = PAY_ITEM_BY_CODE[code];
    if (!t?.unit || qty == null) return null;
    if (t.code === 'OVERTIME') return overtimeAmount(basic, qty, mult, rate);
    if (t.code === 'OVERTIME_DAYS') return overtimeDaysAmount(basic, qty, mult, rate, monthDays);
    if (t.code === 'UNPAID_LEAVE' && workDays) return unpaidLeaveAmount(basic, qty, workDays);
    return null;
  };

  const update = (key: string, patch: Partial<Draft>) => setRows(rs => rs.map(r => {
    if (r.key !== key) return r;
    const next = { ...r, ...patch };
    if ('item_code' in patch || 'quantity' in patch || 'rate' in patch || 'multiplier' in patch) {
      const a = autoAmount(next.item_code, next.quantity, next.multiplier, next.rate);
      if (a != null) { next.amount = a; next.auto = true; }
      if ('item_code' in patch && !PAY_ITEM_BY_CODE[next.item_code]?.unit) next.quantity = null;
    }
    if ('amount' in patch) next.auto = false;
    return next;
  }));

  const add = (recurring: boolean) => setRows(rs => [...rs, {
    key: `n${++seq}`, company_id: companyId, employee_id: employee.id, item_code: recurring ? 'ALLOWANCE_TRANSPORT' : 'OVERTIME',
    amount: 0, quantity: null, note: null, recurring, period_year: recurring ? null : year, period_month: recurring ? null : month,
  }]);

  const save = async () => {
    setSaving(true);
    try {
      const keep = new Set(rows.filter(r => r.id).map(r => r.id));
      for (const old of items) if (old.id && !keep.has(old.id)) await payItemService.remove(old.id);
      for (const r of rows) {
        // empty items are dropped, but a contribution set by hand can be 0 (e.g. no employer MPF this month)
        if (!(Number(r.amount) > 0) && PAY_ITEM_BY_CODE[r.item_code]?.kind !== 'override') continue;
        const { key: _k, auto: _a, ...row } = r;
        await payItemService.save(row);
      }
      message.success('Pay items saved — run (or re-run) payroll to include them');
      onSaved();
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };

  const typeOptions = (recurring: boolean) => (['earning', 'deduction', 'override'] as const).filter(k => !recurring || k !== 'override').map(kind => ({
    label: kind === 'earning' ? 'Adds to pay' : kind === 'deduction' ? 'Takes off pay' : 'Set a contribution by hand',
    options: PAY_ITEM_TYPES.filter(t => t.kind === kind && !t.variantOf && (!recurring || t.canRecur)).map(t => ({ value: t.code, label: t.label })),
  }));

  const section = (recurring: boolean) => {
    const list = rows.filter(r => r.recurring === recurring);
    return (
      <div style={{ marginBottom: 8 }}>
        {list.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={recurring ? 'No fixed items' : `Nothing extra for ${period}`} style={{ margin: '8px 0' }} />}
        {list.map(r => {
          const t = PAY_ITEM_BY_CODE[r.item_code];
          const calc = t?.unit && r.quantity != null
            ? (t.code === 'OVERTIME'
              ? `${r.quantity} hrs × ${money(r.rate ?? hourlyRate(basic), currency)}/hr × ${r.multiplier ?? DEFAULT_OT_MULTIPLIER} = ${money(overtimeAmount(basic, r.quantity, r.multiplier, r.rate), currency)}`
              : t.code === 'OVERTIME_DAYS'
              ? `${r.quantity} days × ${money(r.rate ?? dayRate, currency)}/day × ${r.multiplier ?? DEFAULT_OT_MULTIPLIER} = ${money(overtimeDaysAmount(basic, r.quantity, r.multiplier, r.rate, monthDays), currency)}`
              : workDays ? `${money(basic, currency)} × ${r.quantity} ÷ ${workDays} working days = ${money(unpaidLeaveAmount(basic, r.quantity, workDays), currency)}` : null)
            : null;
          return (
            <div key={r.key} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 10, marginBottom: 8, background: 'rgba(255,255,255,0.02)' }}>
              <Space wrap align="start" style={{ width: '100%' }}>
                <Select style={{ width: 210 }} showSearch optionFilterProp="label" value={t?.variantOf || r.item_code} options={typeOptions(recurring)} onChange={v => update(r.key, { item_code: v, rate: null })} />
                {t && isOvertime(t.code) && (
                  <Segmented value={t.code === 'OVERTIME_DAYS' ? 'days' : 'hours'}
                    onChange={v => update(r.key, { item_code: v === 'days' ? 'OVERTIME_DAYS' : 'OVERTIME', rate: null })}
                    options={[{ value: 'hours', label: 'By hour' }, { value: 'days', label: 'By day' }]} />
                )}
                {t?.unit && (
                  <InputNumber style={{ width: 110 }} min={0} step={t.unit === 'hours' ? 0.5 : 0.5} value={r.quantity ?? undefined}
                    suffix={t.unit === 'hours' ? 'hrs' : 'days'} placeholder={t.unit}
                    onChange={v => update(r.key, { quantity: v == null ? null : Number(v) })} />
                )}
                {t && isOvertime(t.code) && (
                  <>
                    <Tooltip title={t.code === 'OVERTIME_DAYS'
                      ? `Daily rate. Leave empty to use ${money(dayRate, currency)} (basic salary ÷ ${monthDays} working days in ${period}).`
                      : `Hourly rate. Leave empty to use ${money(hourlyRate(basic), currency)} (from the basic salary, MOM formula).`}>
                      <AmountInput style={{ width: 160 }} min={0} precision={2} value={r.rate ?? undefined} prefix={currency}
                        suffix={t.code === 'OVERTIME_DAYS' ? '/day' : '/hr'}
                        placeholder={(t.code === 'OVERTIME_DAYS' ? dayRate : hourlyRate(basic)).toFixed(2)}
                        onChange={v => update(r.key, { rate: v == null ? null : Number(v) })} />
                    </Tooltip>
                    <Tooltip title="Rate multiplier: 1.5× normal overtime, 2× rest day / public holiday. Leave empty for 1.5×.">
                      <Select style={{ width: 92 }} value={r.multiplier ?? DEFAULT_OT_MULTIPLIER}
                        onChange={v => update(r.key, { multiplier: v === DEFAULT_OT_MULTIPLIER ? null : v })}
                        popupRender={menu => (
                          <>
                            {menu}
                            <div style={{ padding: 6 }}>
                              <InputNumber size="small" min={0} max={10} step={0.25} placeholder="Other ×" style={{ width: '100%' }}
                                onPressEnter={e => { const n = Number((e.target as HTMLInputElement).value); if (n >= 0 && n <= 10) update(r.key, { multiplier: n === DEFAULT_OT_MULTIPLIER ? null : n }); }} />
                            </div>
                          </>
                        )}
                        options={[...new Set([1, 1.5, 2, 3, r.multiplier ?? DEFAULT_OT_MULTIPLIER])].sort((a, b) => a - b).map(m => ({ value: m, label: `${m}×` }))} />
                    </Tooltip>
                  </>
                )}
                <AmountInput style={{ width: 160 }} min={0} precision={2} value={r.amount} prefix={currency}
                  onChange={v => update(r.key, { amount: Number(v) || 0 })} />
                <Input style={{ width: 200 }} placeholder="Note (optional)" value={r.note || ''} onChange={e => update(r.key, { note: e.target.value })} />
                <Popconfirm title="Remove this item?" onConfirm={() => setRows(rs => rs.filter(x => x.key !== r.key))}>
                  <Button danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
              {calc && (
                <div style={{ fontSize: 12, marginTop: 6, color: r.auto ? '#91caff' : 'rgba(240,237,230,0.45)' }}>Worked out: {calc}{!r.auto && ' (you changed the amount)'}</div>
              )}
            </div>
          );
        })}
        <Button size="small" icon={<PlusOutlined />} onClick={() => add(recurring)}>Add {recurring ? 'a fixed item' : `an item for ${period}`}</Button>
      </div>
    );
  };

  const net = rows.reduce((s, r) => s + signed(r), 0);
  return (
    <Drawer open onClose={onClose} size={760} title={`${employee.full_name} — pay items`}
      extra={<Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}>Save</Button>}>
      <div style={{ marginBottom: 12, color: 'rgba(240,237,230,0.6)', fontSize: 13 }}>
        Basic salary {money(basic, currency)} · hourly rate {money(hourlyRate(basic), currency)}
        <Tooltip title="Singapore Employment Act formula: (12 × monthly basic salary) ÷ (52 weeks × 44 hours)."><InfoCircleOutlined style={{ marginLeft: 6 }} /></Tooltip>
        {' '}· daily rate {money(dayRate, currency)}
        <Tooltip title={`Basic salary ÷ ${monthDays} working days in ${period} (from this person's work week). Used for overtime by day and unpaid leave.`}><InfoCircleOutlined style={{ marginLeft: 6 }} /></Tooltip>
        {workDays != null && <> · {workDays} working days in {period}</>}
      </div>
      <Divider titlePlacement="start" style={{ margin: '8px 0 12px' }}>Every month (fixed)</Divider>
      {section(true)}
      <Divider titlePlacement="start" style={{ margin: '20px 0 12px' }}>Only {period}</Divider>
      {section(false)}
      <Divider style={{ margin: '16px 0 8px' }} />
      <Text style={{ color: 'rgba(240,237,230,0.7)' }}>
        Change to {period} pay before CPF / tax: <b style={{ color: net >= 0 ? '#73d13d' : '#ff7875' }}>{net >= 0 ? '+' : '−'}{money(Math.abs(net), currency)}</b>
      </Text>
      <div style={{ fontSize: 12, color: 'rgba(240,237,230,0.4)', marginTop: 4 }}>Items with an amount of 0 are not saved.</div>
    </Drawer>
  );
}
