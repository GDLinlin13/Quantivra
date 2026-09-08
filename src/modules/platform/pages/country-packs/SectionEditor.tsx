import { useState, useEffect } from 'react';
import { Table, Button, Input, InputNumber, Switch, Select, Space, Typography, Form } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';

const { Text } = Typography;

type FieldType = 'text' | 'number' | 'percent' | 'bool' | 'select';
interface Field {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  width?: number;
}
interface SectionDef {
  kind: 'array' | 'object' | 'nested-array';
  fields: Field[];
  /** for nested-array (payroll_components): the sub-lists */
  groups?: { key: string; label: string }[];
  newRow?: () => Record<string, unknown>;
}

const num = (v: unknown) => (v === '' || v === null || v === undefined ? undefined : Number(v));

export const SECTION_DEFS: Record<string, SectionDef> = {
  statutory_deductions: {
    kind: 'array',
    fields: [
      { key: 'scheme_code', label: 'Code', type: 'text', width: 90 },
      { key: 'scheme_name', label: 'Name', type: 'text' },
      { key: 'employee_rate', label: 'Employee %', type: 'percent', width: 110 },
      { key: 'employer_rate', label: 'Employer %', type: 'percent', width: 110 },
      { key: 'min_earnings_threshold', label: 'Min $', type: 'number', width: 100 },
      { key: 'max_earnings_ceiling', label: 'Ceiling $', type: 'number', width: 110 },
      { key: 'contribution_frequency', label: 'Freq', type: 'select', options: ['monthly', 'weekly', 'annual', 'fortnightly'], width: 110 },
    ],
    newRow: () => ({ scheme_code: '', scheme_name: '', employee_rate: 0, employer_rate: 0, contribution_frequency: 'monthly' }),
  },
  tax_brackets: {
    kind: 'array',
    fields: [
      { key: 'min', label: 'From', type: 'number' },
      { key: 'max', label: 'To (blank = ∞)', type: 'number' },
      { key: 'rate', label: 'Rate %', type: 'percent', width: 110 },
      { key: 'fixed', label: 'Cumulative tax at start', type: 'number', width: 170 },
    ],
    newRow: () => ({ min: 0, max: null, rate: 0, fixed: 0 }),
  },
  leave_minimums: {
    kind: 'array',
    fields: [
      { key: 'name', label: 'Leave type', type: 'text' },
      { key: 'min_days', label: 'Min days/yr', type: 'number', width: 120 },
      { key: 'carry_forward', label: 'Carry-forward', type: 'number', width: 130 },
      { key: 'encashable', label: 'Encashable', type: 'bool', width: 110 },
    ],
    newRow: () => ({ name: '', min_days: 0, carry_forward: 0, encashable: false }),
  },
  employment_types: {
    kind: 'array',
    fields: [
      { key: 'name', label: 'Type', type: 'text' },
      { key: 'enabled', label: 'Enabled', type: 'bool', width: 110 },
    ],
    newRow: () => ({ name: '', enabled: true }),
  },
  employee_categories: {
    kind: 'array',
    fields: [
      { key: 'name', label: 'Category', type: 'text' },
      { key: 'statutory_treatment', label: 'Statutory treatment', type: 'text' },
    ],
    newRow: () => ({ name: '', statutory_treatment: '' }),
  },
  document_numbering: {
    kind: 'array',
    fields: [
      { key: 'entity', label: 'Entity', type: 'text' },
      { key: 'format', label: 'Format', type: 'text' },
    ],
    newRow: () => ({ entity: '', format: '' }),
  },
  employment_rules: {
    kind: 'object',
    fields: [
      { key: 'max_weekly_hours', label: 'Max weekly hours', type: 'number' },
      { key: 'probation_months', label: 'Probation (months)', type: 'number' },
      { key: 'notice_period_days', label: 'Notice period (days)', type: 'number' },
      { key: 'retirement_age', label: 'Retirement age', type: 'number' },
      { key: 'rest_days', label: 'Rest days', type: 'text' },
      { key: 'termination_rules', label: 'Termination rules', type: 'text' },
    ],
  },
  payroll_components: {
    kind: 'nested-array',
    groups: [{ key: 'earnings', label: 'Earnings' }, { key: 'deductions', label: 'Deductions' }],
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'is_taxable', label: 'Taxable', type: 'bool', width: 100 },
      { key: 'is_mandatory', label: 'Mandatory', type: 'bool', width: 110 },
    ],
  },
};

function CellInput({ field, value, onChange }: { field: Field; value: unknown; onChange: (v: unknown) => void }) {
  if (field.type === 'bool') return <Switch checked={!!value} onChange={onChange} />;
  if (field.type === 'select') return (
    <Select size="small" style={{ width: field.width ?? 120 }} value={value as string} onChange={onChange}
      options={(field.options ?? []).map(o => ({ label: o, value: o }))} />
  );
  if (field.type === 'number' || field.type === 'percent') return (
    <InputNumber size="small" style={{ width: field.width ?? 120 }} value={value as number}
      onChange={v => onChange(v)} step={field.type === 'percent' ? 0.1 : 1}
      addonAfter={field.type === 'percent' ? '%' : undefined} />
  );
  return <Input size="small" value={value as string} onChange={e => onChange(e.target.value)} />;
}

function ArrayEditor({ def, rows, onChange }: { def: SectionDef; rows: any[]; onChange: (r: any[]) => void }) {
  const set = (i: number, key: string, v: unknown) => {
    const next = rows.map((r, ri) => (ri === i ? { ...r, [key]: v } : r));
    onChange(next);
  };
  return (
    <div>
      <Table
        dataSource={rows.map((r, i) => ({ ...r, __i: i }))} rowKey="__i" size="small" pagination={false}
        columns={[
          ...def.fields.map(f => ({
            title: f.label, key: f.key,
            render: (_: any, row: any) => <CellInput field={f} value={row[f.key]} onChange={v => set(row.__i, f.key, v)} />,
          })),
          {
            title: '', key: 'x', width: 40,
            render: (_: any, row: any) => (
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onChange(rows.filter((_, ri) => ri !== row.__i))} />
            ),
          },
        ]}
      />
      <Button size="small" type="dashed" icon={<PlusOutlined />} style={{ marginTop: 8 }}
        onClick={() => onChange([...rows, def.newRow ? def.newRow() : {}])}>Add row</Button>
    </div>
  );
}

function ObjectEditor({ def, value, onChange }: { def: SectionDef; value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  return (
    <Form layout="vertical" size="small">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {def.fields.map(f => (
          <Form.Item key={f.key} label={f.label} style={{ marginBottom: 8 }}>
            <CellInput field={{ ...f, width: undefined }} value={value?.[f.key]} onChange={v => onChange({ ...value, [f.key]: v })} />
          </Form.Item>
        ))}
      </div>
    </Form>
  );
}

/**
 * Structured editor for a country-pack config section. Returns null for sections
 * without a definition (the caller falls back to the raw JSON textarea).
 */
export function SectionEditor({ section, value, onChange }: { section: string; value: any; onChange: (v: any) => void }) {
  const def = SECTION_DEFS[section];
  const [draft, setDraft] = useState<any>(value);
  useEffect(() => { setDraft(value); }, [value, section]);
  if (!def) return null;

  const emit = (v: any) => { setDraft(v); onChange(v); };

  if (def.kind === 'array') {
    return <ArrayEditor def={def} rows={Array.isArray(draft) ? draft : []} onChange={emit} />;
  }
  if (def.kind === 'object') {
    return <ObjectEditor def={def} value={draft || {}} onChange={emit} />;
  }
  // nested-array (payroll_components)
  const obj = draft || {};
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {def.groups!.map(g => (
        <div key={g.key}>
          <Text style={{ color: 'rgba(240,237,230,0.7)', display: 'block', marginBottom: 6 }}>{g.label}</Text>
          <ArrayEditor
            def={{ ...def, kind: 'array', newRow: () => ({ name: '', is_taxable: true }) }}
            rows={Array.isArray(obj[g.key]) ? obj[g.key] : []}
            onChange={rows => emit({ ...obj, [g.key]: rows })}
          />
        </div>
      ))}
    </Space>
  );
}

/** Coerce numeric strings/blank max to the right JSON types on save. */
export function normalizeSection(section: string, value: any): any {
  const def = SECTION_DEFS[section];
  if (!def) return value;
  const fixRow = (row: any) => {
    const out = { ...row };
    delete out.__i;
    for (const f of def.fields) {
      if (f.type === 'number' || f.type === 'percent') {
        out[f.key] = f.key === 'max' && (out[f.key] === undefined || out[f.key] === null) ? null : num(out[f.key]) ?? (f.key === 'max' ? null : 0);
      }
    }
    return out;
  };
  if (def.kind === 'array') return (value || []).map(fixRow);
  if (def.kind === 'nested-array') {
    const o: any = {};
    for (const g of def.groups!) o[g.key] = (value?.[g.key] || []).map(fixRow);
    return o;
  }
  return fixRow(value || {});
}
