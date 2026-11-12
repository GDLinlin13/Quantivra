import { useState, useEffect } from 'react';
import { Card, Form, Switch, InputNumber, Input, Button, message, Typography } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { financeSettingsService } from '../../../../services/finance';
import type { FinanceSettings } from '../../../../data/finance';
import { taxRegLabel } from '../../../../data/countries';
import { useCompanyAccess } from '../../../../contexts/CompanyAccess';

const { Text } = Typography;

/** GST and defaults for quotations and invoices. */
export function FinanceSettingsTab({ companyId, country, settings, onSaved }: { companyId: number; country?: string | null; settings: FinanceSettings; onSaved: () => void }) {
  const access = useCompanyAccess();
  const [s, setS] = useState<FinanceSettings>(settings);
  const [saving, setSaving] = useState(false);
  useEffect(() => setS(settings), [settings]);
  const save = async () => {
    setSaving(true);
    try { await financeSettingsService.save(companyId, s); message.success('Saved'); onSaved(); } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };
  return (
    <Card size="small" style={{ maxWidth: 640, background: '#151a1e', border: '1px solid rgba(255,255,255,0.08)' }}>
      <Form layout="vertical" disabled={!access.canWrite('finance')}>
        <Form.Item label="GST registered">
          <Switch checked={s.gstRegistered} onChange={v => setS({ ...s, gstRegistered: v })} />
          <Text type="secondary" style={{ marginLeft: 10 }}>{s.gstRegistered ? 'Invoices and bills add GST' : 'No GST on invoices'}</Text>
        </Form.Item>
        {s.gstRegistered && (
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, alignItems: 'end' }}>
            <Form.Item label="GST rate (%)"><InputNumber min={0} max={100} value={s.gstRate} onChange={v => setS({ ...s, gstRate: Number(v) || 0 })} style={{ width: '100%' }} /></Form.Item>
            <Form.Item label={taxRegLabel(country)}><Input value={s.gstNumber || ''} onChange={e => setS({ ...s, gstNumber: e.target.value })} /></Form.Item>
          </div>
        )}
        <Form.Item label="Quotations">
          <Switch checked={!!s.quotationsOn} onChange={v => setS({ ...s, quotationsOn: v })} checkedChildren="On" unCheckedChildren="Off" />
          <Text type="secondary" style={{ marginLeft: 12, fontSize: 12 }}>Off by default: price lists (Catalog) replace quotations. Existing quotations stay visible.</Text>
        </Form.Item>
        <Form.Item label="Quotations are valid for (days)">
          <InputNumber min={0} value={s.quoteValidityDays ?? 30} onChange={v => setS({ ...s, quoteValidityDays: Number(v) || 0 })} />
        </Form.Item>
        <Form.Item label="Default terms on quotations and invoices">
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} value={s.invoiceTerms || ''} onChange={e => setS({ ...s, invoiceTerms: e.target.value })} />
        </Form.Item>
        <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
          Payment terms, bank details and the look of invoices are in Document Templates → Invoice Template. Invoice and quotation numbers follow Settings → Document numbers.
        </Text>
        {access.canWrite('finance') && <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}>Save</Button>}
      </Form>
    </Card>
  );
}
