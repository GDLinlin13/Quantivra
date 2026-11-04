import { useEffect, useState } from 'react';
import { Card, Table, Input, InputNumber, Select, Button, Space, Typography, message, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, WarningOutlined } from '@ant-design/icons';
import { supabase } from '../../../../utils/supabase';
import { formatDocumentNumber, validateFormat, DOCUMENT_LABELS, type NumberingFormat } from '../../../../utils/numbering';

const { Text, Title } = Typography;

const DEFAULTS: NumberingFormat[] = [
  { entity: 'employee', format: 'EMP-{0000}', next: 1, reset: 'never' },
  { entity: 'invoice', format: 'INV-{YYYY}-{0000}', next: 1, reset: 'yearly' },
  { entity: 'leave', format: 'LEV-{YYYY}-{0000}', next: 1, reset: 'yearly' },
];

/** Each company's own document numbering (invoice, employee ID, …). */
export function DocumentNumbersCard({ companyId }: { companyId: number }) {
  const [rows, setRows] = useState<NumberingFormat[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('company_settings').select('value')
      .eq('company_id', companyId).eq('category', 'company').eq('key', 'numbering_formats').maybeSingle()
      .then(({ data }) => {
        const list = Array.isArray(data?.value) ? data!.value as NumberingFormat[] : DEFAULTS;
        setRows(list.map(r => ({ reset: /\{YY(YY)?\}/.test(r.format) ? 'yearly' : 'never', ...r })));
      });
  }, [companyId]);

  const update = (i: number, patch: Partial<NumberingFormat>) =>
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    const bad = rows.find(r => !r.entity.trim() || validateFormat(r.format).length);
    if (bad) { message.error(`Fix the format for "${DOCUMENT_LABELS[bad.entity] || bad.entity || 'new document'}" first`); return; }
    setSaving(true);
    const { error } = await supabase.from('company_settings').upsert(
      { company_id: companyId, category: 'company', key: 'numbering_formats', value: rows },
      { onConflict: 'company_id,category,key' },
    );
    setSaving(false);
    if (error) message.error(error.message); else message.success('Document numbers saved');
  };

  return (
    <Card style={{ background: '#151a1e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, maxWidth: 900, marginTop: 24 }}>
      <Title level={5} style={{ color: '#f0ede6', marginTop: 0 }}>Document numbers</Title>
      <Text style={{ color: 'rgba(240,237,230,0.6)', display: 'block', marginBottom: 12 }}>
        Codes: <code>{'{YYYY}'}</code> year, <code>{'{YY}'}</code> short year, <code>{'{MM}'}</code> month,
        {' '}<code>{'{0000}'}</code> running number (as many zeros as digits).
      </Text>
      <Table
        dataSource={rows} rowKey={(_, i) => String(i)} pagination={false} size="small" scroll={{ x: true }}
        style={{ background: 'transparent' }}
        columns={[
          {
            title: 'Document', key: 'entity', render: (_, r, i) => DOCUMENT_LABELS[r.entity] && rows.filter(x => x.entity === r.entity).length === 1
              ? <Text style={{ color: '#f0ede6' }}>{DOCUMENT_LABELS[r.entity]}</Text>
              : <Input value={r.entity} placeholder="e.g. quotation" onChange={e => update(i, { entity: e.target.value.trim().toLowerCase().replace(/\s+/g, '_') })} />,
          },
          {
            title: 'Format', key: 'format', render: (_, r, i) => {
              const issues = validateFormat(r.format);
              return (
                <Space>
                  <Input value={r.format} style={{ fontFamily: 'monospace', width: 200 }} status={issues.length ? 'error' : undefined}
                    onChange={e => update(i, { format: e.target.value })} />
                  {issues.length > 0 && <Tooltip title={issues.join('. ')}><WarningOutlined style={{ color: '#ff9aa2' }} /></Tooltip>}
                </Space>
              );
            },
          },
          { title: 'Next number', key: 'next', render: (_, r, i) => <InputNumber min={1} value={r.next} onChange={v => update(i, { next: Number(v) || 1 })} /> },
          {
            title: 'Start again from 1', key: 'reset', render: (_, r, i) => (
              <Select value={r.reset || 'never'} style={{ width: 140 }} onChange={v => update(i, { reset: v })}
                options={[{ value: 'never', label: 'Never' }, { value: 'yearly', label: 'Every year' }, { value: 'monthly', label: 'Every month' }]} />
            ),
          },
          { title: 'Next one will be', key: 'preview', render: (_, r) => <Text code>{validateFormat(r.format).length ? '—' : formatDocumentNumber(r.format, r.next)}</Text> },
          { title: '', key: 'del', render: (_, _r, i) => <Button size="small" icon={<DeleteOutlined />} onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} /> },
        ]}
      />
      <Space style={{ marginTop: 12 }}>
        <Button icon={<PlusOutlined />} onClick={() => setRows(rs => [...rs, { entity: '', format: 'DOC-{YYYY}-{0000}', next: 1, reset: 'yearly' }])}>Add document</Button>
        <Button type="primary" loading={saving} onClick={save} style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>Save document numbers</Button>
      </Space>
    </Card>
  );
}
