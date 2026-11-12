import { useEffect, useState } from 'react';
import { Card, Table, Input, InputNumber, Select, Button, Space, Typography, message, Tooltip, Tag, Divider } from 'antd';
import { PlusOutlined, DeleteOutlined, WarningOutlined } from '@ant-design/icons';
import { supabase } from '../../../../utils/supabase';
import { formatDocumentNumber, validateFormat, DOCUMENT_LABELS, type NumberingFormat } from '../../../../utils/numbering';
import { brandingService, DEFAULT_TEMPLATES, type Templates } from '../../../../services/branding';
import {
  formatFileName, formatDocFileName, FILE_NAME_TOKENS, DOC_FILE_NAME_TOKENS, DEFAULT_FILE_NAME, DEFAULT_COMBINED_FILE_NAME, DEFAULT_DOC_FILE_NAME,
} from '../../../../utils/payslipFiles';
import { DEFAULT_STATEMENT_FILE_NAME } from '../finance/Statements';

const { Text, Title } = Typography;
/** documents whose number can be typed in on each one: write Manual as the format (the editor then has a box for it) */
const CAN_TYPE = ['invoice', 'quotation', 'credit_note'];
const isManualText = (v: string) => v.trim().toLowerCase() === 'manual';

const DEFAULTS: NumberingFormat[] = [
  { entity: 'employee', format: 'EMP-{0000}', next: 1, reset: 'never' },
  { entity: 'invoice', format: 'INV-{YYYY}-{0000}', next: 1, reset: 'yearly' },
  { entity: 'leave', format: 'LEV-{YYYY}-{0000}', next: 1, reset: 'yearly' },
];

/** Each company's own document numbering (invoice, employee ID, …) and the names of the files it downloads. */
export function DocumentNumbersCard({ companyId, companyName }: { companyId: number; companyName?: string }) {
  const [rows, setRows] = useState<NumberingFormat[]>([]);
  const [templates, setTemplates] = useState<Templates>(DEFAULT_TEMPLATES);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('company_settings').select('value')
      .eq('company_id', companyId).eq('category', 'company').eq('key', 'numbering_formats').maybeSingle()
      .then(({ data }) => {
        const saved = Array.isArray(data?.value) ? data!.value as NumberingFormat[] : DEFAULTS;
        // statements are numbered too: the row is there to set up even before the first one is printed
        const list = saved.some(r => r.entity === 'soa') ? saved : [...saved, { entity: 'soa', format: 'SOA-{YYYY}-{0000}', next: 1, reset: 'yearly' as const }];
        // a number typed in on each document shows as "Manual"
        setRows(list.map(r => ({ reset: /\{YY(YY)?\}/.test(r.format) ? 'yearly' : 'never', ...r, ...(r.manual ? { format: 'Manual' } : {}) })));
      });
    brandingService.get(companyId).then(b => setTemplates(b.templates)).catch(() => null);
  }, [companyId]);

  const update = (i: number, patch: Partial<NumberingFormat>) =>
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setFormat = (i: number, text: string) => {
    if (isManualText(text) && CAN_TYPE.includes(rows[i].entity)) update(i, { manual: true, format: 'Manual' });
    else update(i, { manual: false, format: text });
  };
  const setName = (key: 'payslip' | 'invoice' | 'soa', field: string, value: string) =>
    setTemplates(t => ({ ...t, [key]: { ...t[key], [field]: value } }));

  const save = async () => {
    const bad = rows.find(r => !r.entity.trim() || (!r.manual && validateFormat(r.format).length));
    if (bad) { message.error(`Fix the format for "${DOCUMENT_LABELS[bad.entity] || bad.entity || 'new document'}" first`); return; }
    if (rows.some(r => !r.manual && isManualText(r.format))) { message.error('Only invoices, quotations and credit notes can be typed in by hand'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('company_settings').upsert(
        { company_id: companyId, category: 'company', key: 'numbering_formats', value: rows },
        { onConflict: 'company_id,category,key' },
      );
      if (error) throw new Error(error.message);
      // the file names live with the templates; the latest copy is read first so nothing else in them is overwritten
      const fresh = (await brandingService.get(companyId)).templates;
      await brandingService.save(companyId, { templates: {
        ...fresh,
        payslip: { ...fresh.payslip, fileName: templates.payslip.fileName, combinedFileName: templates.payslip.combinedFileName },
        invoice: { ...fresh.invoice, fileName: templates.invoice.fileName },
        soa: { ...fresh.soa, fileName: templates.soa.fileName },
      } });
      message.success('Saved');
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };

  const co = companyName || 'Company';
  const slipCtx = { name: 'Alice Tan', id: 'EMP-001', designation: 'Senior Designer', year: 2026, month: 5, company: co };
  const docCtx = { type: 'Invoice', number: 'INV-0001', customer: 'Sample Customer Limited', reference: 'PO-123', date: '2026-06-01', company: co };
  const chips = (tokens: { token: string; label: string }[], current: string | undefined, fallback: string, onPick: (v: string) => void) => (
    <div style={{ marginTop: 4 }}>
      {tokens.map(tk => (
        <Tooltip key={tk.token} title={tk.label}>
          <Tag style={{ cursor: 'pointer', marginBottom: 4 }} onClick={() => onPick(`${current ?? fallback}${tk.token}`)}>{tk.token}</Tag>
        </Tooltip>
      ))}
    </div>
  );

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
              const issues = r.manual ? [] : validateFormat(r.format);
              return (
                <Space>
                  <Input value={r.format} style={{ fontFamily: 'monospace', width: 200 }} status={issues.length ? 'error' : undefined}
                    onChange={e => setFormat(i, e.target.value)} />
                  {issues.length > 0 && <Tooltip title={issues.join('. ')}><WarningOutlined style={{ color: '#ff9aa2' }} /></Tooltip>}
                </Space>
              );
            },
          },
          { title: 'Next number', key: 'next', render: (_, r, i) => <InputNumber min={1} value={r.next} disabled={r.manual} onChange={v => update(i, { next: Number(v) || 1 })} /> },
          {
            title: 'Start again from 1', key: 'reset', render: (_, r, i) => (
              <Select value={r.reset || 'never'} disabled={r.manual} style={{ width: 140 }} onChange={v => update(i, { reset: v })}
                options={[{ value: 'never', label: 'Never' }, { value: 'yearly', label: 'Every year' }, { value: 'monthly', label: 'Every month' }]} />
            ),
          },
          { title: 'Next one will be', key: 'preview', render: (_, r) => r.manual ? <Text type="secondary">Typed in on each one</Text> : <Text code>{validateFormat(r.format).length ? '—' : formatDocumentNumber(r.format, r.next)}</Text> },
          { title: '', key: 'del', render: (_, _r, i) => <Button size="small" icon={<DeleteOutlined />} onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} /> },
        ]}
      />
      <Button icon={<PlusOutlined />} style={{ marginTop: 12 }} onClick={() => setRows(rs => [...rs, { entity: '', format: 'DOC-{YYYY}-{0000}', next: 1, reset: 'yearly' }])}>Add document</Button>

      <Divider style={{ borderColor: 'rgba(255,255,255,0.08)' }} />
      <Title level={5} style={{ color: '#f0ede6', marginTop: 0 }}>Download file names</Title>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <div>
          <Text style={{ color: 'rgba(240,237,230,0.8)' }}>Each payslip</Text>
          <Input value={templates.payslip.fileName ?? ''} placeholder={DEFAULT_FILE_NAME} style={{ marginTop: 4 }} onChange={e => setName('payslip', 'fileName', e.target.value)} />
          <Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>e.g. {formatFileName(templates.payslip.fileName, slipCtx)}</Text>
          {chips(FILE_NAME_TOKENS, templates.payslip.fileName, DEFAULT_FILE_NAME, v => setName('payslip', 'fileName', v))}
        </div>
        <div>
          <Text style={{ color: 'rgba(240,237,230,0.8)' }}>All payslips in one file (or the .zip)</Text>
          <Input value={templates.payslip.combinedFileName ?? ''} placeholder={DEFAULT_COMBINED_FILE_NAME} style={{ marginTop: 4 }} onChange={e => setName('payslip', 'combinedFileName', e.target.value)} />
          <Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>e.g. {formatFileName(templates.payslip.combinedFileName, slipCtx, DEFAULT_COMBINED_FILE_NAME)}</Text>
          {chips(FILE_NAME_TOKENS, templates.payslip.combinedFileName, DEFAULT_COMBINED_FILE_NAME, v => setName('payslip', 'combinedFileName', v))}
        </div>
        <div>
          <Text style={{ color: 'rgba(240,237,230,0.8)' }}>Invoices, quotations and credit notes</Text>
          <Input value={templates.invoice.fileName ?? ''} placeholder={DEFAULT_DOC_FILE_NAME} style={{ marginTop: 4 }} onChange={e => setName('invoice', 'fileName', e.target.value)} />
          <Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>e.g. {formatDocFileName(templates.invoice.fileName, docCtx)}</Text>
          {chips(DOC_FILE_NAME_TOKENS, templates.invoice.fileName, DEFAULT_DOC_FILE_NAME, v => setName('invoice', 'fileName', v))}
        </div>
        <div>
          <Text style={{ color: 'rgba(240,237,230,0.8)' }}>Statements of account</Text>
          <Input value={templates.soa.fileName ?? ''} placeholder={DEFAULT_STATEMENT_FILE_NAME} style={{ marginTop: 4 }} onChange={e => setName('soa', 'fileName', e.target.value)} />
          <Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>e.g. {formatDocFileName(templates.soa.fileName || DEFAULT_STATEMENT_FILE_NAME, { ...docCtx, type: 'Statement of account', number: 'SOA-2026-0001', reference: '' })}</Text>
          {chips(DOC_FILE_NAME_TOKENS, templates.soa.fileName, DEFAULT_STATEMENT_FILE_NAME, v => setName('soa', 'fileName', v))}
        </div>
      </div>

      <Button type="primary" loading={saving} onClick={save} style={{ marginTop: 16, background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>Save document numbers and file names</Button>
    </Card>
  );
}
