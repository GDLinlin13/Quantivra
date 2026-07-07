import React, { useEffect, useState } from 'react';
import { Card, Form, Switch, Button, Typography, Spin, Alert, message, Row, Col, Divider, InputNumber, Input, Select, Space } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { supabase } from '../../utils/supabase';
import { useCompanyId } from '../../utils/useCompany';

const { Title, Text } = Typography;

interface BracketRow {
  key: string;
  min_salary: number;
  max_salary: number | null;
  amount: number;
}

interface DeductionRow {
  key: string;
  deduction_name: string;
  deduction_type: 'percentage' | 'percentage_minmax' | 'fixed' | 'bracket';
  employee_rate: number;
  employer_rate: number;
  min_amount: number | null;
  max_amount: number | null;
  fixed_amount: number | null;
  paid_by_company: boolean;
  brackets: BracketRow[];
}

export default function HRSettingsPage() {
  const companyId = useCompanyId();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deductions, setDeductions] = useState<DeductionRow[]>([]);

  useEffect(() => {
    if (!companyId) return;
    loadSettings();
  }, [companyId]);

  async function loadSettings() {
    setLoading(true);
    try {
      const { data: company } = await supabase.from('companies').select('*').eq('id', companyId).single();
      if (company) {
        form.setFieldsValue({
          enable_attendance: company.enable_attendance ?? true,
          enable_training: company.enable_training ?? true,
          enable_recruitment: company.enable_recruitment ?? true,
          enable_performance: company.enable_performance ?? true,
          enable_documents: company.enable_documents ?? true,
        });
      }
      const [dedRes, bracketRes] = await Promise.all([
        supabase.from('company_statutory_deductions').select('*').eq('company_id', companyId),
        supabase.from('company_deduction_brackets').select('*').eq('company_id', companyId).order('min_salary'),
      ]);
      const bracketMap: Record<string, BracketRow[]> = {};
      for (const b of (bracketRes.data || [])) {
        if (!bracketMap[b.deduction_name]) bracketMap[b.deduction_name] = [];
        bracketMap[b.deduction_name].push({
          key: String(b.id),
          min_salary: b.min_salary,
          max_salary: b.max_salary,
          amount: b.amount,
        });
      }
      setDeductions((dedRes.data || []).map((d: any, i: number) => ({
        key: String(i),
        deduction_name: d.deduction_name,
        deduction_type: d.deduction_type || 'percentage',
        employee_rate: d.employee_rate ?? 0,
        employer_rate: d.employer_rate ?? 0,
        min_amount: d.min_amount ?? null,
        max_amount: d.max_amount ?? null,
        fixed_amount: d.fixed_amount ?? null,
        paid_by_company: d.paid_by_company === 1 || d.paid_by_company === true,
        brackets: bracketMap[d.deduction_name] || [],
      })));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function addRow() {
    setDeductions(prev => [...prev, {
      key: String(Date.now()),
      deduction_name: '',
      deduction_type: 'percentage',
      employee_rate: 0,
      employer_rate: 0,
      min_amount: null,
      max_amount: null,
      fixed_amount: null,
      paid_by_company: false,
      brackets: [],
    }]);
  }

  function updateRow(key: string, field: string, value: any) {
    setDeductions(prev => prev.map(d => d.key === key ? { ...d, [field]: value } : d));
  }

  function addBracket(dedKey: string) {
    setDeductions(prev => prev.map(d => d.key === dedKey ? {
      ...d,
      brackets: [...d.brackets, { key: String(Date.now()), min_salary: 0, max_salary: null, amount: 0 }],
    } : d));
  }

  function updateBracket(dedKey: string, bracketKey: string, field: string, value: any) {
    setDeductions(prev => prev.map(d => d.key === dedKey ? {
      ...d,
      brackets: d.brackets.map(b => b.key === bracketKey ? { ...b, [field]: value } : b),
    } : d));
  }

  function removeBracket(dedKey: string, bracketKey: string) {
    setDeductions(prev => prev.map(d => d.key === dedKey ? {
      ...d,
      brackets: d.brackets.filter(b => b.key !== bracketKey),
    } : d));
  }

  function removeRow(key: string) {
    setDeductions(prev => prev.filter(d => d.key !== key));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const values = form.getFieldsValue();
      const { error: updateErr } = await supabase.from('companies').update({
        enable_attendance: values.enable_attendance ?? true,
        enable_training: values.enable_training ?? true,
        enable_recruitment: values.enable_recruitment ?? true,
        enable_performance: values.enable_performance ?? true,
        enable_documents: values.enable_documents ?? true,
      }).eq('id', companyId);
      if (updateErr) throw updateErr;

      const validDeds = deductions.filter(d => d.deduction_name.trim());
      await supabase.from('company_statutory_deductions').delete().eq('company_id', companyId);
      await supabase.from('company_deduction_brackets').delete().eq('company_id', companyId);

      if (validDeds.length > 0) {
        const inserts = validDeds.map(d => ({
          company_id: companyId,
          deduction_name: d.deduction_name.trim(),
          deduction_type: d.deduction_type,
          employee_rate: d.employee_rate ?? 0,
          employer_rate: d.employer_rate ?? 0,
          min_amount: d.min_amount ?? null,
          max_amount: d.max_amount ?? null,
          fixed_amount: d.fixed_amount ?? null,
          paid_by_company: d.paid_by_company ? 1 : 0,
        }));
        const { error: insertErr } = await supabase.from('company_statutory_deductions').insert(inserts);
        if (insertErr) throw insertErr;

        const bracketInserts = validDeds.flatMap(d =>
          d.deduction_type === 'bracket'
            ? d.brackets.filter(b => b.amount > 0).map(b => ({
                company_id: companyId,
                deduction_name: d.deduction_name.trim(),
                min_salary: b.min_salary ?? 0,
                max_salary: b.max_salary ?? null,
                amount: b.amount ?? 0,
              }))
            : []
        );
        if (bracketInserts.length > 0) {
          const { error: bracketErr } = await supabase.from('company_deduction_brackets').insert(bracketInserts);
          if (bracketErr) throw bracketErr;
        }
      }
      message.success(`${validDeds.length} deduction(s) saved`);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 24 }}><Spin /></div>;
  if (error) return <Alert type="error" message={error} />;

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <Title level={3} style={{ color: '#fff', marginBottom: 24 }}>HR Settings</Title>

      <Card style={{ marginBottom: 24 }}>
        <Title level={5} style={{ color: '#fff' }}>Module Toggles</Title>
        <Form form={form} layout="vertical">
          <Row gutter={[24, 16]}>
            <Col span={8}><Form.Item name="enable_attendance" label="Attendance" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={8}><Form.Item name="enable_training" label="Training" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={8}><Form.Item name="enable_recruitment" label="Recruitment" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={8}><Form.Item name="enable_performance" label="Performance" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={8}><Form.Item name="enable_documents" label="Documents" valuePropName="checked"><Switch /></Form.Item></Col>
          </Row>
        </Form>
      </Card>

      <Card>
        <Title level={5} style={{ color: '#fff' }}>Statutory Deductions</Title>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 16 }}>
          Add statutory deductions for payroll. Supports percentage, percentage with min/max caps, fixed amount per employee, and salary bracket lookups.
        </p>

        <Button type="dashed" icon={<PlusOutlined />} onClick={addRow} style={{ marginBottom: 16 }}>Add Deduction</Button>

        {deductions.map(d => (
          <div key={d.key} style={{
            background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: 16, marginBottom: 12,
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <Input size="small" style={{ width: 200 }} value={d.deduction_name}
                onChange={e => updateRow(d.key, 'deduction_name', e.target.value)}
                placeholder="Deduction name" />
              <Select size="small" style={{ width: 200 }} value={d.deduction_type}
                onChange={v => updateRow(d.key, 'deduction_type', v)}>
                <Select.Option value="percentage">Percentage</Select.Option>
                <Select.Option value="percentage_minmax">Percentage w/ Min/Max</Select.Option>
                <Select.Option value="fixed">Fixed Amount</Select.Option>
                <Select.Option value="bracket">Salary Bracket</Select.Option>
              </Select>
              <Button type="text" size="small" danger icon={<DeleteOutlined />}
                onClick={() => removeRow(d.key)} />
            </div>

            {(d.deduction_type === 'percentage' || d.deduction_type === 'percentage_minmax') && (
              <Row gutter={12}>
                <Col span={6}>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Employee Rate (%)</Text>
                  <InputNumber size="small" style={{ width: '100%' }} min={0} max={100} step={0.1}
                    value={d.employee_rate != null ? d.employee_rate * 100 : 0}
                    onChange={v => updateRow(d.key, 'employee_rate', (v ?? 0) / 100)}
                    formatter={v => `${v}%`}
                    parser={v => parseFloat(v?.replace('%', '') ?? '0')} />
                </Col>
                <Col span={6}>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Employer Rate (%)</Text>
                  <InputNumber size="small" style={{ width: '100%' }} min={0} max={100} step={0.1}
                    value={d.employer_rate != null ? d.employer_rate * 100 : 0}
                    onChange={v => updateRow(d.key, 'employer_rate', (v ?? 0) / 100)}
                    formatter={v => `${v}%`}
                    parser={v => parseFloat(v?.replace('%', '') ?? '0')} />
                </Col>
                {d.deduction_type === 'percentage_minmax' && (
                  <>
                    <Col span={3}>
                      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Min Deduction $</Text>
                      <InputNumber size="small" style={{ width: '100%' }} min={0} step={0.01}
                        value={d.min_amount} onChange={v => updateRow(d.key, 'min_amount', v ?? null)}
                        placeholder="0" />
                    </Col>
                    <Col span={3}>
                      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Max Deduction $</Text>
                      <InputNumber size="small" style={{ width: '100%' }} min={0} step={0.01}
                        value={d.max_amount} onChange={v => updateRow(d.key, 'max_amount', v ?? null)}
                        placeholder="No max" />
                    </Col>
                  </>
                )}
                <Col span={3}>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Paid by Company</Text>
                  <Switch checked={d.paid_by_company} onChange={v => updateRow(d.key, 'paid_by_company', v)} size="small" />
                </Col>
              </Row>
            )}

            {d.deduction_type === 'fixed' && (
              <Row gutter={12}>
                <Col span={6}>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Amount per Employee ($)</Text>
                  <InputNumber size="small" style={{ width: '100%' }} min={0} step={0.01}
                    value={d.fixed_amount} onChange={v => updateRow(d.key, 'fixed_amount', v ?? 0)}
                    placeholder="0.00" />
                </Col>
                <Col span={3}>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Paid by Company</Text>
                  <Switch checked={d.paid_by_company} onChange={v => updateRow(d.key, 'paid_by_company', v)} size="small" />
                </Col>
              </Row>
            )}

            {d.deduction_type === 'bracket' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Salary Brackets</Text>
                  <Switch checked={d.paid_by_company} onChange={v => updateRow(d.key, 'paid_by_company', v)}
                    size="small" checkedChildren="Company Paid" unCheckedChildren="Employee Paid" />
                </div>
                {d.brackets.map(b => (
                  <div key={b.key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, width: 30 }}>$</span>
                    <InputNumber size="small" style={{ width: 110 }} min={0} step={100}
                      value={b.min_salary} onChange={v => updateBracket(d.key, b.key, 'min_salary', v ?? 0)}
                      placeholder="Min" />
                    <span style={{ color: 'rgba(255,255,255,0.3)' }}>to</span>
                    <InputNumber size="small" style={{ width: 110 }} min={0} step={100}
                      value={b.max_salary} onChange={v => updateBracket(d.key, b.key, 'max_salary', v ?? null)}
                      placeholder="Max (blank = above)" />
                    <span style={{ color: 'rgba(255,255,255,0.3)', width: 20 }}>$</span>
                    <InputNumber size="small" style={{ width: 100 }} min={0} step={0.01}
                      value={b.amount} onChange={v => updateBracket(d.key, b.key, 'amount', v ?? 0)}
                      placeholder="Amount" />
                    <Button type="text" size="small" danger icon={<DeleteOutlined />}
                      onClick={() => removeBracket(d.key, b.key)} />
                  </div>
                ))}
                <Button size="small" type="dashed" icon={<PlusOutlined />}
                  onClick={() => addBracket(d.key)}>Add Bracket</Button>
              </div>
            )}
          </div>
        ))}

        <div style={{ marginTop: 16 }}>
          <Button type="primary" onClick={handleSave} loading={saving}>Save HR Settings</Button>
        </div>
      </Card>
    </div>
  );
}
