import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Select, Typography, Spin, Alert, message, Row, Col, Divider, Upload, Table, DatePicker } from 'antd';
import dayjs from 'dayjs';
import { UploadOutlined, EyeOutlined } from '@ant-design/icons';
import { supabase } from '../../utils/supabase';
import { useCompanyId } from '../../utils/useCompany';
import { StatutoryDeduction } from '../../types';
import DepartmentsSection from './DepartmentsSection';

export default function CompanyPage() {
  const companyId = useCompanyId();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [countryDeductions, setCountryDeductions] = useState<StatutoryDeduction[]>([]);
  const [savedDeductions, setSavedDeductions] = useState<any[]>([]);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [companyDocs, setCompanyDocs] = useState<{ id: string; name: string; url: string }[]>([]);

  useEffect(() => {
    loadCompany();
  }, []);

  useEffect(() => {
    if (selectedCountry) {
      loadCountryDeductions(selectedCountry);
      loadSavedDeductions();
    }
  }, [selectedCountry]);

  async function loadCompany() {
    try {
      const { data } = await supabase.from('companies').select('*').eq('id', companyId).single();
      if (data) {
        form.setFieldsValue({
          ...data,
          incorporation_date: data.incorporation_date ? dayjs(data.incorporation_date) : null,
          fiscal_year_start: data.fiscal_year_start ? dayjs(`2000-${data.fiscal_year_start}`) : null,
          fiscal_year_end: data.fiscal_year_end ? dayjs(`2000-${data.fiscal_year_end}`) : null,
        });
        setLogoUrl(data.logo_url || '');
        setSelectedCountry(data.country || '');
        loadCompanyDocs();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadCountryDeductions(country: string) {
    const { data } = await supabase.from('statutory_deductions').select('*').eq('country', country);
    setCountryDeductions(data || []);
  }

  async function loadCompanyDocs() {
    const { data } = await supabase.from('company_documents').select('*').eq('company_id', companyId).order('created_at');
    setCompanyDocs(data?.map((d: any) => ({ id: String(d.id), name: d.document_name, url: d.file_url })) || []);
  }

  async function loadSavedDeductions() {
    const { data } = await supabase.from('company_statutory_deductions').select('*').eq('company_id', companyId);
    setSavedDeductions(data || []);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const values = form.getFieldsValue();
      // Only send fields that exist in the DB schema (skip id, created_at, etc.)
      const payload: any = {};
      const safeFields = ['name','address','country','currency','tax_system','fiscal_year_start','fiscal_year_end',
        'phone','email','website','registration_number','tax_id','logo_url','incorporation_date',
        'is_active'];
      for (const key of safeFields) {
        let val = values[key];
        if (key === 'incorporation_date' && val) val = val.format('YYYY-MM-DD');
        if ((key === 'fiscal_year_start' || key === 'fiscal_year_end') && val) val = val.format('MM-DD');
        if (val !== undefined) payload[key] = val;
      }
      const existing = await supabase.from('companies').select('id').eq('id', companyId).single();
      if (!existing.data) throw new Error('Company not found');
      const { error } = await supabase.from('companies').update(payload).eq('id', companyId);
      if (error) throw error;
      // Save country deductions as company defaults (best-effort)
      if (countryDeductions.length > 0) {
        try {
          await supabase.from('company_statutory_deductions').delete().eq('company_id', companyId);
          const deductionInserts = countryDeductions.map(d => ({
            company_id: companyId,
            deduction_name: d.name,
            employee_rate: d.employee_rate,
            employer_rate: d.employer_rate,
            cap_amount: d.cap_amount,
          }));
          await supabase.from('company_statutory_deductions').insert(deductionInserts);
        } catch { /* table may not exist yet */ }
      }
      message.success('Company saved');
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(file: File) {
    try {
      const ext = file.name.split('.').pop();
      const filePath = `company-logos/logo-${Date.now()}.${ext}`;
      const { data, error: uploadErr } = await supabase.storage.from('company-files').upload(filePath, file);
      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = supabase.storage.from('company-files').getPublicUrl(filePath);
      setLogoUrl(publicUrl);
      form.setFieldValue('logo_url', publicUrl);
      message.success('Logo uploaded');
    } catch (err: any) {
      message.error('Upload failed: ' + err.message);
    }
    return false;
  }

  if (loading) return <Spin size="large" />;
  if (error) return <Alert type="error" message={error} />;

  return (
    <div>
      <Typography.Title level={4}>Company Settings</Typography.Title>
      <Card>
        <Form form={form} layout="vertical" onFinish={handleSave} onFinishFailed={({ errorFields }) => message.error(errorFields[0]?.errors?.[0] || 'Validation failed')}>
          <Row gutter={24}>
            <Col span={12}>
              <Form.Item name="name" label="Company Name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="country" label="Country" rules={[{ required: true }]}>
                <Select showSearch onChange={(val) => setSelectedCountry(val)}>
                  <Select.Option value="Australia">Australia</Select.Option>
                  <Select.Option value="Canada">Canada</Select.Option>
                  <Select.Option value="China">China</Select.Option>
                  <Select.Option value="Dubai">Dubai</Select.Option>
                  <Select.Option value="France">France</Select.Option>
                  <Select.Option value="Germany">Germany</Select.Option>
                  <Select.Option value="Hong Kong">Hong Kong</Select.Option>
                  <Select.Option value="India">India</Select.Option>
                  <Select.Option value="Indonesia">Indonesia</Select.Option>
                  <Select.Option value="Japan">Japan</Select.Option>
                  <Select.Option value="Malaysia">Malaysia</Select.Option>
                  <Select.Option value="Netherlands">Netherlands</Select.Option>
                  <Select.Option value="New Zealand">New Zealand</Select.Option>
                  <Select.Option value="Philippines">Philippines</Select.Option>
                  <Select.Option value="Singapore">Singapore</Select.Option>
                  <Select.Option value="South Korea">South Korea</Select.Option>
                  <Select.Option value="Switzerland">Switzerland</Select.Option>
                  <Select.Option value="Thailand">Thailand</Select.Option>
                  <Select.Option value="United Kingdom">United Kingdom</Select.Option>
                  <Select.Option value="United States">United States</Select.Option>
                  <Select.Option value="Vietnam">Vietnam</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="address" label="Address">
            <Input.TextArea rows={3} />
          </Form.Item>

          <Row gutter={24}>
            <Col span={8}><Form.Item name="phone" label="Phone"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="email" label="Email"><Input type="email" /></Form.Item></Col>
            <Col span={8}><Form.Item name="website" label="Website"><Input /></Form.Item></Col>
          </Row>

          <Row gutter={24}>
            <Col span={6}><Form.Item name="registration_number" label="Registration Number"><Input /></Form.Item></Col>
            <Col span={6}><Form.Item name="tax_id" label="Tax ID / VAT Number"><Input /></Form.Item></Col>
            <Col span={4}><Form.Item name="incorporation_date" label="Incorporation Date">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item></Col>
            <Col span={4}><Form.Item name="fiscal_year_start" label="FY Start">
              <DatePicker format="MM-DD" style={{ width: '100%' }} />
            </Form.Item></Col>
            <Col span={4}><Form.Item name="fiscal_year_end" label="FY End">
              <DatePicker format="MM-DD" style={{ width: '100%' }} />
            </Form.Item></Col>
          </Row>

          <Divider>Company Documents</Divider>
          <div style={{ marginBottom: 12 }}>
            <Upload beforeUpload={async (file) => {
              try {
                const ext = file.name.split('.').pop();
                const filePath = `company-docs/${companyId}/${Date.now()}.${ext}`;
                const { error: uploadErr } = await supabase.storage.from('company-files').upload(filePath, file);
                if (uploadErr) throw uploadErr;
                const { data: { publicUrl } } = supabase.storage.from('company-files').getPublicUrl(filePath);
                const { error: insertErr } = await supabase.from('company_documents').insert({
                  company_id: companyId, document_name: file.name, file_url: publicUrl,
                });
                if (insertErr) throw insertErr;
                await loadCompanyDocs();
                message.success('Document uploaded');
              } catch (err: any) {
                message.error('Upload failed: ' + err.message);
              }
              return false;
            }} showUploadList={false} accept=".pdf,.jpg,.png,.doc,.docx">
              <Button icon={<UploadOutlined />}>Upload Document</Button>
            </Upload>
          </div>
          {companyDocs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {companyDocs.map((doc) => (
                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
                  <span style={{ flex: 1, color: 'rgba(255,255,255,0.8)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                  <a href={doc.url} target="_blank" rel="noopener noreferrer"><Button type="link" size="small" icon={<EyeOutlined />}>View</Button></a>
                  <a href={doc.url} download={doc.name}><Button type="link" size="small">Download</Button></a>
                  <Button size="small" onClick={async () => {
                    const newName = prompt('Rename document:', doc.name);
                    if (newName && newName.trim()) {
                      await supabase.from('company_documents').update({ document_name: newName.trim() }).eq('id', doc.id);
                      setCompanyDocs(prev => prev.map(d => d.id === doc.id ? { ...d, name: newName.trim() } : d));
                    }
                  }}>Rename</Button>
                  <Button size="small" danger onClick={async () => {
                    await supabase.from('company_documents').delete().eq('id', doc.id);
                    setCompanyDocs(prev => prev.filter(d => d.id !== doc.id));
                  }}>Remove</Button>
                </div>
              ))}
            </div>
          )}

          {countryDeductions.length > 0 && (
            <>
              <Divider>Statutory Deductions — {selectedCountry}</Divider>
              <Table dataSource={countryDeductions} rowKey="id" pagination={false} size="small"
                columns={[
                  { title: 'Deduction', dataIndex: 'name', key: 'name' },
                  { title: 'Description', dataIndex: 'description', key: 'desc' },
                  { title: 'Employee Rate', dataIndex: 'employee_rate', key: 'empRate', render: (v: number) => `${(v * 100).toFixed(1)}%` },
                  { title: 'Employer Rate', dataIndex: 'employer_rate', key: 'emprRate', render: (v: number) => `${(v * 100).toFixed(1)}%` },
                  { title: 'Cap', dataIndex: 'cap_amount', key: 'cap', render: (v: number | null) => v ? `$${v.toLocaleString()}` : '—' },
                ]}
              />
            </>
          )}

          <Divider>Company Logo / Letterhead</Divider>
          <Form.Item name="logo_url" label="Logo">
            <Input placeholder="Logo URL" style={{ marginBottom: 8 }} />
            <Upload beforeUpload={handleLogoUpload} showUploadList={false} accept="image/*">
              <Button icon={<UploadOutlined />}>Upload Logo</Button>
            </Upload>
          </Form.Item>
          {logoUrl && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <img src={logoUrl} alt="Logo" style={{ maxHeight: 80, border: '1px solid #d9d9d9', borderRadius: 4, padding: 4 }} />
              <Button size="small" onClick={() => { form.setFieldValue('logo_url', ''); setLogoUrl(''); }}>Remove</Button>
            </div>
          )}

          <div style={{ marginTop: 24 }}>
            <Button type="primary" htmlType="submit" loading={saving}>Save Company</Button>
          </div>
        </Form>
        <Divider>Departments</Divider>
        <DepartmentsSection companyId={companyId} />
      </Card>
    </div>
  );
}
