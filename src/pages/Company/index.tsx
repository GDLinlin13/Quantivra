import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Select, Typography, Spin, Alert, message, Row, Col, Divider, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { supabase } from '../../utils/supabase';
import { useCompanyId } from '../../utils/useCompany';

export default function CompanyPage() {
  const companyId = useCompanyId();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  useEffect(() => {
    loadCompany();
  }, []);

  async function loadCompany() {
    try {
      const { data } = await supabase.from('companies').select('*').eq('id', companyId).single();
      if (data) {
        form.setFieldsValue(data);
        setLogoUrl(data.logo_url || '');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(values: any) {
    setSaving(true);
    try {
      const existing = await supabase.from('companies').select('id').eq('id', companyId).single();
      if (existing.data) {
        await supabase.from('companies').update(values).eq('id', existing.data.id);
      } else {
        await supabase.from('companies').insert(values);
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
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Row gutter={24}>
            <Col span={12}>
              <Form.Item name="name" label="Company Name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="country" label="Country" rules={[{ required: true }]}>
                <Select showSearch>
                  <Select.Option value="US">United States</Select.Option>
                  <Select.Option value="UK">United Kingdom</Select.Option>
                  <Select.Option value="CA">Canada</Select.Option>
                  <Select.Option value="AU">Australia</Select.Option>
                  <Select.Option value="IN">India</Select.Option>
                  <Select.Option value="SG">Singapore</Select.Option>
                  <Select.Option value="MY">Malaysia</Select.Option>
                  <Select.Option value="PH">Philippines</Select.Option>
                  <Select.Option value="DE">Germany</Select.Option>
                  <Select.Option value="FR">France</Select.Option>
                  <Select.Option value="JP">Japan</Select.Option>
                  <Select.Option value="CN">China</Select.Option>
                  <Select.Option value="Other">Other</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
                <Select showSearch>
                  <Select.Option value="USD">USD ($)</Select.Option>
                  <Select.Option value="EUR">EUR (€)</Select.Option>
                  <Select.Option value="GBP">GBP (£)</Select.Option>
                  <Select.Option value="CAD">CAD (C$)</Select.Option>
                  <Select.Option value="AUD">AUD (A$)</Select.Option>
                  <Select.Option value="INR">INR (₹)</Select.Option>
                  <Select.Option value="SGD">SGD (S$)</Select.Option>
                  <Select.Option value="MYR">MYR (RM)</Select.Option>
                  <Select.Option value="PHP">PHP (₱)</Select.Option>
                  <Select.Option value="JPY">JPY (¥)</Select.Option>
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
            <Col span={8}><Form.Item name="registration_number" label="Registration Number"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="tax_id" label="Tax ID / VAT Number"><Input /></Form.Item></Col>
            <Col span={4}><Form.Item name="fiscal_year_start" label="FY Start"><Input placeholder="MM-DD" /></Form.Item></Col>
            <Col span={4}><Form.Item name="fiscal_year_end" label="FY End"><Input placeholder="MM-DD" /></Form.Item></Col>
          </Row>

          <Divider>Company Logo / Letterhead</Divider>
          <Form.Item name="logo_url" label="Logo">
            <Input placeholder="Logo URL" style={{ marginBottom: 8 }} />
            <Upload beforeUpload={handleLogoUpload} showUploadList={false} accept="image/*">
              <Button icon={<UploadOutlined />}>Upload Logo</Button>
            </Upload>
          </Form.Item>
          {logoUrl && (
            <div style={{ marginTop: 8 }}>
              <img src={logoUrl} alt="Logo" style={{ maxHeight: 80, border: '1px solid #d9d9d9', borderRadius: 4, padding: 4 }} />
            </div>
          )}

          <div style={{ marginTop: 24 }}>
            <Button type="primary" htmlType="submit" loading={saving}>Save Company</Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}
