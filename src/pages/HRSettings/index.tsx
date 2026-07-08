import React, { useEffect, useState } from 'react';
import { Card, Form, Switch, Button, Typography, Spin, Alert, message, Row, Col, Divider, InputNumber, Input, Select, Space, Table, Tag } from 'antd';
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

interface DeductionItem {
  sourceId?: number;
  deduction_name: string;
  deduction_type: string;
  employee_rate: number;
  employer_rate: number;
  min_amount: number | null;
  max_amount: number | null;
  fixed_amount: number | null;
  paid_by_company: boolean;
  enabled: boolean;
  brackets: BracketRow[];
  bothRates: boolean; // true when both employee and employer rates > 0 → hide paid_by_company toggle
  employerOnly: boolean; // true when only employer rate > 0 → hide toggle, auto company-paid
}

const typeLabels: Record<string, string> = {
  percentage: 'Percentage',
  percentage_minmax: 'Percentage w/ Min/Max',
  fixed: 'Fixed Amount',
  bracket: 'Salary Bracket',
};

export default function HRSettingsPage() {
  const companyId = useCompanyId();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deductions, setDeductions] = useState<DeductionItem[]>([]);
  const [companyCountry, setCompanyCountry] = useState('Singapore');

  useEffect(() => {
    if (!companyId) return;
    loadSettings();
  }, [companyId]);

  async function loadSettings() {
    setLoading(true);
    try {
      const { data: co } = await supabase.from('companies').select('*').eq('id', companyId).single();
      if (!co) { setLoading(false); return; }
      const country = co.country || 'Singapore';
      setCompanyCountry(country);
      form.setFieldsValue({
        enable_attendance: co.enable_attendance ?? true,
        enable_training: co.enable_training ?? true,
        enable_recruitment: co.enable_recruitment ?? true,
        enable_performance: co.enable_performance ?? true,
        enable_documents: co.enable_documents ?? true,
      });

      const [defaultsRes, overridesRes, bracketRes] = await Promise.all([
        supabase.from('statutory_deductions').select('*').eq('country', country).order('name'),
        supabase.from('company_statutory_deductions').select('*').eq('company_id', companyId),
        supabase.from('company_deduction_brackets').select('*').eq('company_id', companyId).order('min_salary'),
      ]);

      const bracketMap: Record<string, BracketRow[]> = {};
      for (const b of (bracketRes.data || [])) {
        if (!bracketMap[b.deduction_name]) bracketMap[b.deduction_name] = [];
        bracketMap[b.deduction_name].push({
          key: String(b.id), min_salary: b.min_salary, max_salary: b.max_salary, amount: b.amount,
        });
      }

      const overrideMap: Record<string, any> = {};
      for (const o of (overridesRes.data || [])) {
        overrideMap[o.deduction_name] = o;
      }

      const merged: DeductionItem[] = (defaultsRes.data || []).map((d: any) => {
        const existing = overrideMap[d.name];
        const brackets = bracketMap[d.name] || [];
        const emplRate = d.employee_rate ?? 0;
        const emprRate = d.employer_rate ?? 0;
        const isEmployerOnly = emplRate === 0 && emprRate > 0;
        return {
          sourceId: existing?.id,
          deduction_name: d.name,
          deduction_type: existing?.deduction_type || 'percentage',
          employee_rate: existing?.employee_rate ?? emplRate,
          employer_rate: existing?.employer_rate ?? emprRate,
          min_amount: existing?.min_amount ?? null,
          max_amount: existing?.max_amount ?? null,
          fixed_amount: existing?.fixed_amount ?? null,
          paid_by_company: isEmployerOnly ? true : (existing?.paid_by_company === 1 || existing?.paid_by_company === true),
          enabled: !!(existing || isEmployerOnly),
          brackets,
          bothRates: emplRate > 0 && emprRate > 0,
          employerOnly: isEmployerOnly,
        };
      });

      setDeductions(merged);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleDeduction(name: string, enabled: boolean) {
    setDeductions(prev => prev.map(d => d.deduction_name === name ? { ...d, enabled } : d));
  }

  function updateDeduction(name: string, field: string, value: any) {
    setDeductions(prev => prev.map(d => d.deduction_name === name ? { ...d, [field]: value } : d));
  }

  function addBracket(name: string) {
    setDeductions(prev => prev.map(d => d.deduction_name === name ? {
      ...d, brackets: [...d.brackets, { key: String(Date.now()), min_salary: 0, max_salary: null, amount: 0 }],
    } : d));
  }

  function updateBracket(name: string, bracketKey: string, field: string, value: any) {
    setDeductions(prev => prev.map(d => d.deduction_name === name ? {
      ...d, brackets: d.brackets.map(b => b.key === bracketKey ? { ...b, [field]: value } : b),
    } : d));
  }

  function removeBracket(name: string, bracketKey: string) {
    setDeductions(prev => prev.map(d => d.deduction_name === name ? {
      ...d, brackets: d.brackets.filter(b => b.key !== bracketKey),
    } : d));
  }

  function addCustomDeduction() {
    const name = prompt('Enter deduction name:');
    if (!name || name.trim() === '') return;
    if (deductions.find(d => d.deduction_name === name.trim())) {
      message.warning('Deduction already exists');
      return;
    }
    setDeductions(prev => [...prev, {
      deduction_name: name.trim(),
      deduction_type: 'percentage',
      employee_rate: 0,
      employer_rate: 0,
      min_amount: null,
      max_amount: null,
      fixed_amount: null,
      paid_by_company: false,
      enabled: true,
      brackets: [],
      bothRates: false,
      employerOnly: false,
    }]);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const values = form.getFieldsValue();
      await supabase.from('companies').update({
        enable_attendance: values.enable_attendance ?? true,
        enable_training: values.enable_training ?? true,
        enable_recruitment: values.enable_recruitment ?? true,
        enable_performance: values.enable_performance ?? true,
        enable_documents: values.enable_documents ?? true,
      }).eq('id', companyId);

      const enabled = deductions.filter(d => d.enabled && d.deduction_name.trim());
      const disabledNames = deductions.filter(d => !d.enabled).map(d => d.deduction_name);

      // Remove disabled deductions and their brackets
      if (disabledNames.length > 0) {
        await supabase.from('company_statutory_deductions').delete().eq('company_id', companyId).in('deduction_name', disabledNames);
        await supabase.from('company_deduction_brackets').delete().eq('company_id', companyId).in('deduction_name', disabledNames);
      }

      // Upsert enabled deductions
      for (const d of enabled) {
        const payload: any = {
          company_id: companyId,
          deduction_name: d.deduction_name.trim(),
          deduction_type: d.deduction_type,
          employee_rate: d.employee_rate ?? 0,
          employer_rate: d.employer_rate ?? 0,
          min_amount: d.min_amount ?? null,
          max_amount: d.max_amount ?? null,
          fixed_amount: d.fixed_amount ?? null,
          paid_by_company: d.paid_by_company ? 1 : 0,
        };

        if (d.sourceId) {
          await supabase.from('company_statutory_deductions').update(payload).eq('id', d.sourceId);
        } else {
          const { data: inserted } = await supabase.from('company_statutory_deductions').insert(payload).select().single();
          if (inserted) d.sourceId = inserted.id;
        }

        // Handle brackets
        if (d.deduction_type === 'bracket') {
          await supabase.from('company_deduction_brackets').delete().eq('company_id', companyId).eq('deduction_name', d.deduction_name.trim());
          const validBrackets = d.brackets.filter(b => b.amount > 0);
          if (validBrackets.length > 0) {
            await supabase.from('company_deduction_brackets').insert(
              validBrackets.map(b => ({
                company_id: companyId,
                deduction_name: d.deduction_name.trim(),
                min_salary: b.min_salary ?? 0,
                max_salary: b.max_salary ?? null,
                amount: b.amount ?? 0,
              }))
            );
          }
        }
      }

      // Clean up orphaned overrides not matching current country defaults
      const { data: currentDefaults } = await supabase.from('statutory_deductions').select('name').eq('country', companyCountry);
      const defaultNames = new Set((currentDefaults || []).map(d => d.name));
      const enabledNames = new Set(enabled.map(d => d.deduction_name));
      const { data: allOverrides } = await supabase.from('company_statutory_deductions').select('deduction_name').eq('company_id', companyId);
      for (const o of (allOverrides || [])) {
        if (!defaultNames.has(o.deduction_name) && !enabledNames.has(o.deduction_name)) {
          await supabase.from('company_statutory_deductions').delete().eq('company_id', companyId).eq('deduction_name', o.deduction_name);
          await supabase.from('company_deduction_brackets').delete().eq('company_id', companyId).eq('deduction_name', o.deduction_name);
        }
      }

      message.success(`${enabled.length} deduction(s) saved`);
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
            <Col span={8}>
              <Form.Item label="Country">
                <Select value={companyCountry} onChange={async v => {
                  setCompanyCountry(v);
                  await supabase.from('companies').update({ country: v }).eq('id', companyId);
                  loadSettings();
                }}>
                  <Select.Option value="Australia">Australia</Select.Option>
                  <Select.Option value="Canada">Canada</Select.Option>
                  <Select.Option value="China">China</Select.Option>
                  <Select.Option value="Dubai">Dubai</Select.Option>
                  <Select.Option value="Hong Kong">Hong Kong</Select.Option>
                  <Select.Option value="India">India</Select.Option>
                  <Select.Option value="Indonesia">Indonesia</Select.Option>
                  <Select.Option value="Japan">Japan</Select.Option>
                  <Select.Option value="Malaysia">Malaysia</Select.Option>
                  <Select.Option value="New Zealand">New Zealand</Select.Option>
                  <Select.Option value="Philippines">Philippines</Select.Option>
                  <Select.Option value="Singapore">Singapore</Select.Option>
                  <Select.Option value="South Korea">South Korea</Select.Option>
                  <Select.Option value="Thailand">Thailand</Select.Option>
                  <Select.Option value="United Kingdom">United Kingdom</Select.Option>
                  <Select.Option value="United States">United States</Select.Option>
                  <Select.Option value="Vietnam">Vietnam</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <Title level={5} style={{ color: '#fff', margin: 0 }}>Statutory Deductions</Title>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
              {companyCountry} defaults pre-loaded. Toggle on to enable, adjust rates as needed.
            </Text>
          </div>
          <Button icon={<PlusOutlined />} onClick={addCustomDeduction}>Add Custom</Button>
        </div>

        {deductions.map(d => (
          <div key={d.deduction_name} style={{
            background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '12px 16px', marginBottom: 8,
            border: `1px solid ${d.enabled ? 'rgba(120,200,255,0.2)' : 'rgba(255,255,255,0.04)'}`,
            opacity: d.enabled ? 1 : 0.5,
          }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: d.enabled ? 12 : 0 }}>
              <Switch checked={d.enabled} onChange={v => toggleDeduction(d.deduction_name, v)} size="small" />
              <Tag color={d.enabled ? 'blue' : 'default'} style={{ margin: 0 }}>{typeLabels[d.deduction_type]}</Tag>
              <Text style={{ color: '#fff', fontWeight: 500, flex: 1 }}>{d.deduction_name}</Text>
              {d.enabled && (
                <Select size="small" style={{ width: 180 }} value={d.deduction_type}
                  onChange={v => updateDeduction(d.deduction_name, 'deduction_type', v)}>
                  <Select.Option value="percentage">Percentage</Select.Option>
                  <Select.Option value="percentage_minmax">Percentage w/ Min/Max</Select.Option>
                  <Select.Option value="fixed">Fixed Amount</Select.Option>
                  <Select.Option value="bracket">Salary Bracket</Select.Option>
                </Select>
              )}
            </div>

            {d.enabled && (
              <div>
                {(d.deduction_type === 'percentage' || d.deduction_type === 'percentage_minmax') && (
                  <Row gutter={12}>
                    <Col span={5}>
                      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Employee Rate</Text>
                      <InputNumber size="small" style={{ width: '100%' }} min={0} max={100} step={0.1}
                        value={d.employee_rate != null ? d.employee_rate * 100 : 0}
                        onChange={v => updateDeduction(d.deduction_name, 'employee_rate', (v ?? 0) / 100)}
                        formatter={v => `${v}%`} parser={v => parseFloat(v?.replace('%', '') ?? '0')} />
                    </Col>
                    <Col span={5}>
                      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Employer Rate</Text>
                      <InputNumber size="small" style={{ width: '100%' }} min={0} max={100} step={0.1}
                        value={d.employer_rate != null ? d.employer_rate * 100 : 0}
                        onChange={v => updateDeduction(d.deduction_name, 'employer_rate', (v ?? 0) / 100)}
                        formatter={v => `${v}%`} parser={v => parseFloat(v?.replace('%', '') ?? '0')} />
                    </Col>
                    {d.deduction_type === 'percentage_minmax' && (
                      <>
                        <Col span={4}>
                          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Min Deduction $</Text>
                          <InputNumber size="small" style={{ width: '100%' }} min={0} step={0.01}
                            value={d.min_amount} onChange={v => updateDeduction(d.deduction_name, 'min_amount', v ?? null)} />
                        </Col>
                        <Col span={4}>
                          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Max Deduction $</Text>
                          <InputNumber size="small" style={{ width: '100%' }} min={0} step={0.01}
                            value={d.max_amount} onChange={v => updateDeduction(d.deduction_name, 'max_amount', v ?? null)} />
                        </Col>
                      </>
                    )}
                    <Col span={3} style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                      {!d.bothRates && !d.employerOnly && (
                        <Switch checked={d.paid_by_company} onChange={v => updateDeduction(d.deduction_name, 'paid_by_company', v)}
                          size="small" checkedChildren="Company" unCheckedChildren="Employee" />
                      )}
                    </Col>
                  </Row>
                )}

                {d.deduction_type === 'fixed' && (
                  <Row gutter={12}>
                    <Col span={5}>
                      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Amount per Employee ($)</Text>
                      <InputNumber size="small" style={{ width: '100%' }} min={0} step={0.01}
                        value={d.fixed_amount} onChange={v => updateDeduction(d.deduction_name, 'fixed_amount', v ?? 0)} />
                    </Col>
                    <Col span={3} style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                      {!d.bothRates && !d.employerOnly && (
                        <Switch checked={d.paid_by_company} onChange={v => updateDeduction(d.deduction_name, 'paid_by_company', v)}
                          size="small" checkedChildren="Company" unCheckedChildren="Employee" />
                      )}
                    </Col>
                  </Row>
                )}

                {d.deduction_type === 'bracket' && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Brackets</Text>
                      {!d.bothRates && !d.employerOnly && (
                        <Switch checked={d.paid_by_company} onChange={v => updateDeduction(d.deduction_name, 'paid_by_company', v)}
                          size="small" checkedChildren="Company" unCheckedChildren="Employee" />
                      )}
                    </div>
                    {d.brackets.map(b => (
                      <div key={b.key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, width: 24 }}>$</span>
                        <InputNumber size="small" style={{ width: 110 }} min={0} step={100}
                          value={b.min_salary} onChange={v => updateBracket(d.deduction_name, b.key, 'min_salary', v ?? 0)}
                          placeholder="Min salary" />
                        <span style={{ color: 'rgba(255,255,255,0.3)' }}>to</span>
                        <InputNumber size="small" style={{ width: 110 }} min={0} step={100}
                          value={b.max_salary} onChange={v => updateBracket(d.deduction_name, b.key, 'max_salary', v ?? null)}
                          placeholder="Max (blank = above)" />
                        <span style={{ color: 'rgba(255,255,255,0.3)', width: 16 }}>$</span>
                        <InputNumber size="small" style={{ width: 100 }} min={0} step={0.01}
                          value={b.amount} onChange={v => updateBracket(d.deduction_name, b.key, 'amount', v ?? 0)}
                          placeholder="Deduction" />
                        <Button type="text" size="small" danger icon={<DeleteOutlined />}
                          onClick={() => removeBracket(d.deduction_name, b.key)} />
                      </div>
                    ))}
                    <Button size="small" type="dashed" icon={<PlusOutlined />}
                      onClick={() => addBracket(d.deduction_name)}>Add Bracket</Button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {deductions.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.3)' }}>
            No statutory deductions found for {companyCountry}. Add a custom one or change the company country.
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <Button type="primary" onClick={handleSave} loading={saving}>Save HR Settings</Button>
        </div>
      </Card>
    </div>
  );
}