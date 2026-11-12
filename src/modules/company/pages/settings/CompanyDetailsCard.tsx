import { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Upload, message, Space, ColorPicker, Typography, Spin } from 'antd';
import { UploadOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import { brandingService, fileToLogoDataUri, type Branding } from '../../../../services/branding';
import { DocumentShell } from '../../../../components/DocumentShell';
import { companyRegLabel } from '../../../../data/countries';
import { useCompanyAccess } from '../../../../contexts/CompanyAccess';

const { Text } = Typography;
const panel = { background: '#151a1e', border: '1px solid rgba(255,255,255,0.08)' };

/** Settings → the logo and company details printed at the top of payslips, invoices and every other document. */
export function CompanyDetailsCard({ companyId, company }: { companyId: number; company: any }) {
  const canWrite = useCompanyAccess().canWrite('settings');
  const [branding, setBranding] = useState<Branding | null>(null);
  const [form] = Form.useForm();
  const [logo, setLogo] = useState<string | null>(null);
  const [accent, setAccent] = useState('#1677ff');
  const [vals, setVals] = useState<Record<string, any>>({});     // mirror of the form, for the preview
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    brandingService.get(companyId).then(b => {
      setBranding(b); setLogo(b.logo_data_uri); setAccent(b.accent_color);
      const initial = { legal_name: b.legal_name || company?.name, registration_no: b.registration_no, address: b.address, phone: b.phone, email: b.email, website: b.website, footer_note: b.footer_note };
      setVals(initial); form.setFieldsValue(initial);
    }).catch(() => null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const onLogo = async (file: File) => {
    try {
      if (file.size > 4_000_000) throw new Error('Image too large (max 4 MB)');
      setLogo(await fileToLogoDataUri(file));
      message.success('Logo ready — click Save to keep it');
    } catch (e: any) { message.error(e.message); }
    return false;
  };
  const save = async () => {
    setSaving(true);
    try {
      const v = { ...vals, ...form.getFieldsValue(true) };
      await brandingService.save(companyId, {
        legal_name: v.legal_name ?? null, registration_no: v.registration_no ?? null, address: v.address ?? null,
        phone: v.phone ?? null, email: v.email ?? null, website: v.website ?? null, footer_note: v.footer_note ?? null,
        logo_data_uri: logo, accent_color: accent,
      });
      message.success('Company details saved');
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };

  if (!branding) return <Spin />;
  const previewBranding: Branding = { ...branding, logo_data_uri: logo, accent_color: accent, legal_name: vals.legal_name, registration_no: vals.registration_no, address: vals.address,
    phone: vals.phone, email: vals.email, website: vals.website, footer_note: vals.footer_note };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 1.2fr)', gap: 24, alignItems: 'start', marginBottom: 24, maxWidth: 1300 }}>
      <Card size="small" style={panel} title={<span style={{ color: '#f0ede6' }}>Logo and company details</span>}>
        <Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12, display: 'block', marginBottom: 12 }}>Shown at the top of payslips, invoices and other documents.</Text>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ width: 120, height: 60, border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#fff' }}>
            {logo ? <img src={logo} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <Text style={{ color: '#999', fontSize: 12 }}>No logo</Text>}
          </div>
          {canWrite && (
            <Space orientation="vertical">
              <Upload beforeUpload={onLogo} showUploadList={false} accept="image/*"><Button size="small" icon={<UploadOutlined />}>Upload logo</Button></Upload>
              {logo && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setLogo(null)}>Remove</Button>}
            </Space>
          )}
        </div>
        <Form form={form} disabled={!canWrite} layout="vertical" size="small" onValuesChange={(_, all) => setVals(p => ({ ...p, ...all }))}>
          <Form.Item name="legal_name" label="Legal name (on documents)"><Input /></Form.Item>
          <Form.Item name="registration_no" label={companyRegLabel(company?.country)}><Input /></Form.Item>
          <Form.Item name="address" label="Address"><Input.TextArea rows={2} /></Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
            <Form.Item name="phone" label="Phone"><Input /></Form.Item>
            <Form.Item name="email" label="Email"><Input /></Form.Item>
          </div>
          <Form.Item name="website" label="Website"><Input /></Form.Item>
          <Form.Item label="Accent colour"><ColorPicker value={accent} onChange={c => setAccent(c.toHexString())} showText disabled={!canWrite} /></Form.Item>
          <Form.Item name="footer_note" label="Default document footer"><Input.TextArea rows={2} /></Form.Item>
        </Form>
        {canWrite && <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}>Save</Button>}
      </Card>
      <div style={{ position: 'sticky', top: 16 }}>
        <Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>Preview — how it looks at the top of your documents</Text>
        <div style={{ background: '#fff', borderRadius: 8, padding: 24, marginTop: 6 }}>
          <DocumentShell country={company?.country} branding={previewBranding} companyName={company?.name || ''} title="DOCUMENT" meta={<>Reference<br />Date</>} forPrint>
            <div style={{ color: '#999', fontSize: 12, padding: '12px 0' }}>Document content goes here.</div>
          </DocumentShell>
        </div>
      </div>
    </div>
  );
}
