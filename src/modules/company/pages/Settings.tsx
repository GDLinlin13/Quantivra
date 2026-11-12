import { useState, useEffect } from 'react';
import { Card, Form, Input, Select, Button, Typography, message, Space, Tag, Upload } from 'antd';
import { UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import { supabase } from '../../../utils/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { MODULES } from '../../../types';
import { MODULE_GUIDE, SWITCHABLE_MODULES } from '../../../data/permissionGuide';
import { useCompanyAccess } from '../../../contexts/CompanyAccess';
import { timezoneOptions } from '../../../utils/timezones';
import { currencyOptions } from '../../../utils/currencies';
import { DocumentNumbersCard } from './settings/DocumentNumbersCard';
import { DATE_FORMATS } from '../../../utils/dateFormat';
import { useDateFormat } from '../../../contexts/DateFormat';
import { brandingService, fileToLogoDataUri, type Templates } from '../../../services/branding';
import { AMOUNT_FORMATS, money, type AmountFormat } from '../../../data/documentLayouts';
import { companyRegLabel } from '../../../data/countries';
import { WorkWeekHolidaysCard } from './settings/WorkWeekHolidaysCard';

const { Title, Text } = Typography;

export function CompanySettingsPage() {
  const { companyId } = useAuth();
  const [company, setCompany] = useState<any>(null);
  const [form] = Form.useForm();
  const access = useCompanyAccess();
  const dateFmt = useDateFormat();
  const [logo, setLogo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    supabase.from('companies').select('*').eq('id', companyId).single().then(({ data }) => {
      setCompany(data);
      if (data) {
        form.setFieldsValue({
          name: data.name, currency: data.currency,
          financial_year_start: data.financial_year_start, timezone: data.timezone,
        });
      }
    });
    // the logo and the details printed on documents, and the one amount format all documents use
    brandingService.get(companyId).then(b => {
      setLogo(b.logo_data_uri);
      form.setFieldsValue({
        legal_name: b.legal_name, registration_no: b.registration_no, address: b.address, phone: b.phone, email: b.email, website: b.website,
        amount_format: b.templates.invoice.amountFormat || b.templates.payslip.amountFormat || b.templates.soa.amountFormat || 'code',
      });
    }).catch(() => null);
  }, [companyId]);

  const onLogo = async (file: File) => {
    try {
      if (file.size > 4_000_000) throw new Error('Image too large (max 4 MB)');
      setLogo(await fileToLogoDataUri(file));
      message.success('Logo ready — click Save to keep it');
    } catch (e: any) { message.error(e.message); }
    return false;
  };

  const handleSave = async (values: any) => {
    const { legal_name, registration_no, address, phone, email, website, amount_format, ...companyValues } = values;
    setSaving(true);
    try {
      const { error } = await supabase.from('companies').update(companyValues).eq('id', companyId);
      if (error) throw new Error(error.message);
      // one amount format for payslips, invoices and statements; the latest templates are read first so nothing else in them is overwritten
      const fresh: Templates = (await brandingService.get(companyId!)).templates;
      const af = (amount_format || 'code') as AmountFormat;
      await brandingService.save(companyId!, {
        legal_name: legal_name ?? null, registration_no: registration_no ?? null, address: address ?? null,
        phone: phone ?? null, email: email ?? null, website: website ?? null, logo_data_uri: logo,
        templates: { ...fresh, payslip: { ...fresh.payslip, amountFormat: af }, invoice: { ...fresh.invoice, amountFormat: af }, soa: { ...fresh.soa, amountFormat: af } },
      });
      message.success('Settings saved');
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };

  const toggleModule = async (mod: string) => {
    if (!company) return;
    const on = access.isOn(mod);
    const off = SWITCHABLE_MODULES.filter(m => (m === mod ? on : !access.isOn(m)));
    const { error } = await supabase.from('company_settings').upsert(
      { company_id: companyId, category: 'company', key: 'modules_off', value: { modules: off } }, { onConflict: 'company_id,category,key' });
    if (error) { message.error(error.message); return; }
    access.reload();
    message.success(`${(MODULES as any)[mod]?.label || mod} switched ${on ? 'off — hidden for everyone' : 'on'}`);
  };

  if (!company) return null;

  return (
    <div>
      <Title level={4} style={{ color: '#f0ede6', marginBottom: 24 }}>Company Settings</Title>
      <Card style={{ background: '#151a1e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, maxWidth: 900, marginBottom: 24 }}>
        <Form form={form} layout="vertical" onFinish={handleSave} disabled={!access.canWrite('settings')}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
              <div style={{ width: 120, height: 60, border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#fff' }}>
                {logo ? <img src={logo} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <Text style={{ color: '#999', fontSize: 12 }}>No logo</Text>}
              </div>
              {access.canWrite('settings') && (
                <Space orientation="vertical">
                  <Upload beforeUpload={onLogo} showUploadList={false} accept="image/*"><Button size="small" icon={<UploadOutlined />}>Upload logo</Button></Upload>
                  {logo && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setLogo(null)}>Remove</Button>}
                </Space>
              )}
            </div>
            <Form.Item name="registration_no" label={<Text style={{ color: '#f0ede6' }}>{companyRegLabel(company.country)}</Text>} style={{ alignSelf: 'end' }}><Input /></Form.Item>
            <Form.Item name="name" label={<Text style={{ color: '#f0ede6' }}>Company Name</Text>}><Input /></Form.Item>
            <Form.Item name="legal_name" label={<Text style={{ color: '#f0ede6' }}>Legal name (on documents)</Text>}><Input /></Form.Item>
            <Form.Item name="address" label={<Text style={{ color: '#f0ede6' }}>Address</Text>} style={{ gridColumn: '1 / -1' }}><Input.TextArea rows={2} /></Form.Item>
            <Form.Item name="phone" label={<Text style={{ color: '#f0ede6' }}>Phone</Text>}><Input /></Form.Item>
            <Form.Item name="email" label={<Text style={{ color: '#f0ede6' }}>Email</Text>}><Input /></Form.Item>
            <Form.Item name="website" label={<Text style={{ color: '#f0ede6' }}>Website</Text>}><Input /></Form.Item>
            <Form.Item name="currency" label={<Text style={{ color: '#f0ede6' }}>Currency</Text>}>
              <Select showSearch optionFilterProp="label" options={currencyOptions()} />
            </Form.Item>
            <Form.Item name="financial_year_start" label={<Text style={{ color: '#f0ede6' }}>Financial Year Start</Text>}><Input placeholder="MM-DD" /></Form.Item>
            <Form.Item name="timezone" label={<Text style={{ color: '#f0ede6' }}>Timezone</Text>}>
              <Select showSearch optionFilterProp="label" options={timezoneOptions()} />
            </Form.Item>
            <Form.Item label={<Text style={{ color: '#f0ede6' }}>Date Format</Text>}>
              <Select value={dateFmt.format} options={DATE_FORMATS}
                onChange={async v => { try { await dateFmt.save(v); message.success('Date format saved'); } catch (e: any) { message.error(e.message); } }} />
            </Form.Item>
            <Form.Item name="amount_format" label={<Text style={{ color: '#f0ede6' }}>Amount Format</Text>}>
              <Select popupMatchSelectWidth={false}
                options={AMOUNT_FORMATS.map(f => ({ value: f.value, label: f.value.startsWith('accounting') ? f.label.replace('$', f.value === 'accounting_code' ? (company.currency || 'SGD') : money(0, company.currency || 'SGD', 'symbol').replace(/[0-9.,]/g, '')) : f.label.replace(/ — .*$/, '') + ' — ' + money(1234.5, company.currency || 'SGD', f.value) }))} />
            </Form.Item>
          </div>
          <Button type="primary" htmlType="submit" loading={saving} style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>
            Save
          </Button>
        </Form>
      </Card>

      <Title level={5} style={{ color: '#f0ede6', marginBottom: 16 }}>Modules</Title>
      <Card style={{ background: '#151a1e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, maxWidth: 900, marginBottom: 24 }}>
        <Text style={{ color: 'rgba(240,237,230,0.6)', display: 'block', marginBottom: 12 }}>
          Click a module to switch it on or off for your company. A module that is off is hidden for everyone.
        </Text>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {Object.entries(MODULES).filter(([key]) => SWITCHABLE_MODULES.includes(key)).map(([key, mod]) => {
            const enabled = access.isOn(key);
            const guide = MODULE_GUIDE[key];
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <Tag
                  color={enabled ? 'green' : 'default'}
                  style={{ cursor: 'pointer', padding: '4px 12px', fontSize: 13, minWidth: 120, textAlign: 'center', margin: 0 }}
                  onClick={() => toggleModule(key)}
                >
                  {mod.label} {enabled ? '✓' : '○'}
                </Tag>
                <Text style={{ color: 'rgba(240,237,230,0.75)', paddingTop: 3 }}>
                  {guide?.covers}
                  {guide && !guide.built && <Text style={{ color: 'rgba(240,237,230,0.4)' }}> (not built yet)</Text>}
                </Text>
              </div>
            );
          })}
        </Space>
      </Card>

      {companyId && <WorkWeekHolidaysCard companyId={companyId} country={company.country || 'SG'} />}
      {companyId && <DocumentNumbersCard companyId={companyId} companyName={company.name} />}
    </div>
  );
}
