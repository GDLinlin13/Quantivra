import { useState, useEffect } from 'react';
import { Card, Form, Input, Select, Button, Typography, message, Divider, Space, Tag } from 'antd';
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
import { CompanyDetailsCard } from './settings/CompanyDetailsCard';
import { WorkWeekHolidaysCard } from './settings/WorkWeekHolidaysCard';
import { ChangePasswordCard } from '../../../components/ChangePasswordCard';

const { Title, Text } = Typography;

export function CompanySettingsPage() {
  const { companyId } = useAuth();
  const [company, setCompany] = useState<any>(null);
  const [form] = Form.useForm();
  const access = useCompanyAccess();
  const dateFmt = useDateFormat();

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
  }, [companyId]);

  const handleSave = async (values: any) => {
    await supabase.from('companies').update(values).eq('id', companyId);
    message.success('Settings saved');
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
      <Card style={{ background: '#151a1e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, maxWidth: 600, marginBottom: 24 }}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label={<Text style={{ color: '#f0ede6' }}>Company Name</Text>}>
            <Input />
          </Form.Item>
          <Form.Item name="currency" label={<Text style={{ color: '#f0ede6' }}>Currency</Text>}>
            <Select showSearch optionFilterProp="label" options={currencyOptions()} />
          </Form.Item>
          <Form.Item name="financial_year_start" label={<Text style={{ color: '#f0ede6' }}>Financial Year Start</Text>}>
            <Input placeholder="MM-DD" />
          </Form.Item>
          <Form.Item name="timezone" label={<Text style={{ color: '#f0ede6' }}>Timezone</Text>}>
            <Select showSearch optionFilterProp="label" options={timezoneOptions()} />
          </Form.Item>
          <Form.Item label={<Text style={{ color: '#f0ede6' }}>Date Format</Text>}>
            <Select value={dateFmt.format} options={DATE_FORMATS}
              onChange={async v => { try { await dateFmt.save(v); message.success('Date format saved'); } catch (e: any) { message.error(e.message); } }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>
            Save
          </Button>
        </Form>
      </Card>

      <Title level={5} style={{ color: '#f0ede6', marginBottom: 16 }}>Modules</Title>
      <Card style={{ background: '#151a1e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, maxWidth: 760, marginBottom: 24 }}>
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

      {companyId && <CompanyDetailsCard companyId={companyId} company={company} />}
      {companyId && <WorkWeekHolidaysCard companyId={companyId} country={company.country || 'SG'} />}
      {companyId && <DocumentNumbersCard companyId={companyId} />}
      <div style={{ marginTop: 24 }}><ChangePasswordCard /></div>
    </div>
  );
}
