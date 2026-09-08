import { useState, useEffect, useCallback } from 'react';
import { Card, Descriptions, Typography, Spin, Tabs, Form, Input, InputNumber, Button, Upload, message, Switch, Space, ColorPicker, Divider } from 'antd';
import { UploadOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import { supabase } from '../../../utils/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { brandingService, fileToLogoDataUri, DEFAULT_TEMPLATES, type Branding } from '../../../services/branding';
import { DocumentShell } from '../../../components/DocumentShell';

const { Title, Text } = Typography;

export function CompanyProfilePage() {
  const { companyId } = useAuth();
  const [company, setCompany] = useState<any>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [form] = Form.useForm();
  const [tpl, setTpl] = useState(DEFAULT_TEMPLATES);
  const [logo, setLogo] = useState<string | null>(null);
  const [accent, setAccent] = useState('#1677ff');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    const [{ data: co }, b] = await Promise.all([
      supabase.from('companies').select('*').eq('id', companyId).maybeSingle(),
      brandingService.get(companyId),
    ]);
    setCompany(co); setBranding(b);
    setLogo(b.logo_data_uri); setAccent(b.accent_color); setTpl(b.templates);
    form.setFieldsValue({
      legal_name: b.legal_name || co?.name, registration_no: b.registration_no,
      address: b.address, phone: b.phone, email: b.email, website: b.website, footer_note: b.footer_note,
    });
  }, [companyId, form]);

  useEffect(() => { load(); }, [load]);

  if (!company) return <Spin />;

  const save = async () => {
    setSaving(true);
    try {
      const v = form.getFieldsValue();
      await brandingService.save(companyId!, { ...v, logo_data_uri: logo, accent_color: accent, templates: tpl });
      message.success('Branding saved');
      load();
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };

  const onLogo = async (file: File) => {
    try {
      if (file.size > 4_000_000) throw new Error('Image too large (max 4 MB)');
      setLogo(await fileToLogoDataUri(file));
      message.success('Logo ready — click Save to keep it');
    } catch (e: any) { message.error(e.message); }
    return false;
  };

  const setTplField = (doc: keyof typeof tpl, key: string, val: any) =>
    setTpl(p => ({ ...p, [doc]: { ...p[doc], [key]: val } }));

  const previewBranding: Branding = {
    ...(branding as Branding), logo_data_uri: logo, accent_color: accent,
    legal_name: form.getFieldValue('legal_name'), registration_no: form.getFieldValue('registration_no'),
    address: form.getFieldValue('address'), phone: form.getFieldValue('phone'),
    email: form.getFieldValue('email'), website: form.getFieldValue('website'),
    footer_note: form.getFieldValue('footer_note'), templates: tpl,
  };

  return (
    <div>
      <Title level={4} style={{ color: '#f0ede6', marginBottom: 16 }}>Company Profile</Title>
      <Tabs
        items={[
          {
            key: 'profile', label: 'Profile',
            children: (
              <Card style={{ background: '#151a1e', border: '1px solid rgba(255,255,255,0.08)', maxWidth: 700 }}>
                <Descriptions column={2} size="large"
                  styles={{ label: { color: 'rgba(240,237,230,0.6)' }, content: { color: '#f0ede6' } }}>
                  <Descriptions.Item label="Name">{company.name}</Descriptions.Item>
                  <Descriptions.Item label="Code">{company.company_code}</Descriptions.Item>
                  <Descriptions.Item label="Country">{company.country}</Descriptions.Item>
                  <Descriptions.Item label="Industry">{company.industry}</Descriptions.Item>
                  <Descriptions.Item label="Currency">{company.currency}</Descriptions.Item>
                  <Descriptions.Item label="Financial Year">{company.financial_year_start}</Descriptions.Item>
                  <Descriptions.Item label="Timezone">{company.timezone}</Descriptions.Item>
                  <Descriptions.Item label="Modules">{(company.modules || []).join(', ') || 'None'}</Descriptions.Item>
                </Descriptions>
              </Card>
            ),
          },
          {
            key: 'branding', label: 'Branding & Templates',
            children: (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
                <div>
                  <Card size="small" title={<span style={{ color: '#f0ede6' }}>Letterhead</span>} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ width: 120, height: 60, border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#fff' }}>
                        {logo ? <img src={logo} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <Text style={{ color: '#999', fontSize: 12 }}>No logo</Text>}
                      </div>
                      <Space direction="vertical">
                        <Upload beforeUpload={onLogo} showUploadList={false} accept="image/*">
                          <Button size="small" icon={<UploadOutlined />}>Upload logo</Button>
                        </Upload>
                        {logo && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setLogo(null)}>Remove</Button>}
                      </Space>
                    </div>
                    <Form form={form} layout="vertical" size="small">
                      <Form.Item name="legal_name" label="Legal name (on documents)"><Input /></Form.Item>
                      <Form.Item name="registration_no" label="Registration / UEN"><Input /></Form.Item>
                      <Form.Item name="address" label="Address"><Input.TextArea rows={2} /></Form.Item>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Form.Item name="phone" label="Phone"><Input /></Form.Item>
                        <Form.Item name="email" label="Email"><Input /></Form.Item>
                      </div>
                      <Form.Item name="website" label="Website"><Input /></Form.Item>
                      <Form.Item label="Accent colour">
                        <ColorPicker value={accent} onChange={c => setAccent(c.toHexString())} showText />
                      </Form.Item>
                      <Form.Item name="footer_note" label="Default document footer"><Input.TextArea rows={2} placeholder="e.g. This is a computer-generated document." /></Form.Item>
                    </Form>
                  </Card>

                  <Card size="small" title={<span style={{ color: '#f0ede6' }}>Payslip template</span>} style={{ marginBottom: 16 }}>
                    <TplToggle label="Show logo" v={tpl.payslip.showLogo} on={x => setTplField('payslip', 'showLogo', x)} />
                    <TplToggle label="Show company address block" v={tpl.payslip.showCompanyBlock} on={x => setTplField('payslip', 'showCompanyBlock', x)} />
                    <TplToggle label="Show employee code" v={tpl.payslip.showEmployeeId} on={x => setTplField('payslip', 'showEmployeeId', x)} />
                    <TplToggle label="Show bank account (masked)" v={tpl.payslip.showBankAccount} on={x => setTplField('payslip', 'showBankAccount', x)} />
                    <Form.Item label="Payslip footer note" style={{ marginTop: 8 }}>
                      <Input.TextArea rows={2} value={tpl.payslip.footerNote} onChange={e => setTplField('payslip', 'footerNote', e.target.value)} placeholder="Overrides the default footer for payslips" />
                    </Form.Item>
                  </Card>

                  <Card size="small" title={<span style={{ color: '#f0ede6' }}>Invoice template</span>}>
                    <TplToggle label="Show logo" v={tpl.invoice.showLogo} on={x => setTplField('invoice', 'showLogo', x)} />
                    <TplToggle label="Show company address block" v={tpl.invoice.showCompanyBlock} on={x => setTplField('invoice', 'showCompanyBlock', x)} />
                    <Form.Item label="Default payment terms (days)" style={{ marginTop: 8 }}>
                      <InputNumber min={0} value={tpl.invoice.paymentTermsDays} onChange={x => setTplField('invoice', 'paymentTermsDays', x ?? 30)} />
                    </Form.Item>
                    <Form.Item label="Bank / payment details">
                      <Input.TextArea rows={2} value={tpl.invoice.bankDetails} onChange={e => setTplField('invoice', 'bankDetails', e.target.value)} />
                    </Form.Item>
                    <Form.Item label="Invoice footer note">
                      <Input.TextArea rows={2} value={tpl.invoice.footerNote} onChange={e => setTplField('invoice', 'footerNote', e.target.value)} />
                    </Form.Item>
                  </Card>

                  <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save} style={{ marginTop: 16 }}>Save branding</Button>
                </div>

                <div style={{ position: 'sticky', top: 16 }}>
                  <Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>Live preview — payslip header</Text>
                  <div style={{ background: '#fff', borderRadius: 8, padding: 24, marginTop: 8 }}>
                    <DocumentShell
                      branding={previewBranding} companyName={company.name}
                      title="PAYSLIP" meta={<>August 2026<br />Pay date 2026-08-31</>}
                      showLogo={tpl.payslip.showLogo} showCompanyBlock={tpl.payslip.showCompanyBlock}
                      footerNote={tpl.payslip.footerNote} forPrint>
                      <table style={{ width: '100%', fontSize: 13, color: '#111' }}>
                        <tbody>
                          {tpl.payslip.showEmployeeId && <tr><td style={{ color: '#666' }}>Employee</td><td style={{ textAlign: 'right' }}>Alice Tan · EMP-001</td></tr>}
                          {tpl.payslip.showBankAccount && <tr><td style={{ color: '#666' }}>Bank account</td><td style={{ textAlign: 'right' }}>DBS ••••8-9</td></tr>}
                          <tr><td>Basic Salary</td><td style={{ textAlign: 'right' }}>SGD 9,000.00</td></tr>
                          <tr><td>CPF (Employee)</td><td style={{ textAlign: 'right' }}>-SGD 1,600.00</td></tr>
                          <tr><td style={{ fontWeight: 700, borderTop: '1px solid #e2e2e2' }}>Net Pay</td><td style={{ textAlign: 'right', fontWeight: 700, borderTop: '1px solid #e2e2e2' }}>SGD 7,400.00</td></tr>
                        </tbody>
                      </table>
                    </DocumentShell>
                  </div>
                </div>
                <Divider />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function TplToggle({ label, v, on }: { label: string; v: boolean; on: (x: boolean) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
      <span style={{ color: 'rgba(240,237,230,0.8)', fontSize: 13 }}>{label}</span>
      <Switch size="small" checked={v} onChange={on} />
    </div>
  );
}
