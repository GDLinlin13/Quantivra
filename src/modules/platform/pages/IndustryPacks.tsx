import { useState, useEffect } from 'react';
import {
  Row, Col, Tabs, Table, Button, Modal, Input, InputNumber,
  Select, Tag, Space, Typography, message, Checkbox, Form,
} from 'antd';
import { PlusOutlined, SaveOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { supabase } from '../../../utils/supabase';
import { MODULES } from '../../../types';

const { Title, Text } = Typography;

const EMPTY_CONFIG = {
  departments: [],
  job_positions: [],
  chart_of_accounts: [],
  expense_categories: [],
  revenue_categories: [],
  inventory_categories: [],
  payroll_components: [],
  leave_types: [],
  workflows: [],
  dashboard_widgets: [],
  default_reports: [],
  documents: [],
  integrations: [],
  default_modules: [],
};

import { DEFAULT_INDUSTRIES, INDUSTRY_CATEGORIES } from '../../../data/industries';

const moduleOptions = Object.entries(MODULES).map(([key, val]) => ({
  value: key,
  label: val.label,
}));

const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
const PAYROLL_TYPES = ['Allowance', 'Deduction'];

export function IndustryPacksPage() {
  const [industries, setIndustries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [config, setConfig] = useState<any>(EMPTY_CONFIG);
  const [industryName, setIndustryName] = useState('');
  const [dirty, setDirty] = useState(false);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newIndustryName, setNewIndustryName] = useState('');
  const [coaModalOpen, setCoaModalOpen] = useState(false);
  const [editingCoaIdx, setEditingCoaIdx] = useState<number | null>(null);
  const [coaForm] = Form.useForm();
  const [payrollModalOpen, setPayrollModalOpen] = useState(false);
  const [editingPayrollIdx, setEditingPayrollIdx] = useState<number | null>(null);
  const [payrollForm] = Form.useForm();

  const selected = industries.find(i => i.id === selectedId);

  const load = async () => {
    setLoading(true);
    const timer = setTimeout(() => {
      setIndustries(DEFAULT_INDUSTRIES);
      setLoading(false);
    }, 2000);
    const { data } = await supabase.from('industry_profiles').select('*').order('industry');
    clearTimeout(timer);
    setIndustries(data && data.length > 0 ? data : DEFAULT_INDUSTRIES);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (selected) {
      setConfig({ ...EMPTY_CONFIG, ...(selected.config || {}) });
      setIndustryName(selected.industry || '');
      setDirty(false);
    } else {
      setConfig(EMPTY_CONFIG);
      setIndustryName('');
    }
  }, [selectedId, industries]);

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    const updateData: any = { config };
    if (industryName !== selected?.industry) {
      updateData.industry = industryName;
    }
    const { error } = await supabase.from('industry_profiles')
      .update(updateData)
      .eq('id', selectedId);
    if (error) {
      message.error(error.message);
    } else {
      message.success('Industry pack saved');
      setDirty(false);
      load();
    }
    setSaving(false);
  };

  const updateConfig = (key: string, value: any) => {
    setConfig((prev: any) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleCreate = async () => {
    if (!newIndustryName) return;
    const { error } = await supabase.from('industry_profiles').insert({
      industry: newIndustryName,
      config: { ...EMPTY_CONFIG },
    });
    if (error) {
      message.error(error.message);
    } else {
      message.success('Industry template created');
      setNewIndustryName('');
      setCreateModalOpen(false);
      load();
    }
  };

  const addTagItem = (key: string) => {
    const val = prompt(`Enter ${key.replace(/_/g, ' ')} item:`);
    if (val && val.trim()) {
      updateConfig(key, [...(config[key] || []), val.trim()]);
    }
  };

  const removeTagItem = (key: string, item: string) => {
    updateConfig(key, (config[key] || []).filter((i: string) => i !== item));
  };

  const openCoaModal = (idx: number | null = null) => {
    setEditingCoaIdx(idx);
    if (idx !== null) {
      coaForm.setFieldsValue(config.chart_of_accounts[idx]);
    } else {
      coaForm.resetFields();
    }
    setCoaModalOpen(true);
  };

  const saveCoa = () => {
    const values = coaForm.getFieldsValue();
    if (!values.code || !values.name || !values.type) {
      message.warning('Fill all fields');
      return;
    }
    const list = [...(config.chart_of_accounts || [])];
    if (editingCoaIdx !== null) {
      list[editingCoaIdx] = values;
    } else {
      list.push(values);
    }
    updateConfig('chart_of_accounts', list);
    setCoaModalOpen(false);
  };

  const deleteCoa = (idx: number) => {
    const list = [...(config.chart_of_accounts || [])];
    list.splice(idx, 1);
    updateConfig('chart_of_accounts', list);
  };

  const openPayrollModal = (idx: number | null = null) => {
    setEditingPayrollIdx(idx);
    if (idx !== null) {
      payrollForm.setFieldsValue(config.payroll_components[idx]);
    } else {
      payrollForm.resetFields();
    }
    setPayrollModalOpen(true);
  };

  const savePayroll = () => {
    const values = payrollForm.getFieldsValue();
    if (!values.name) {
      message.warning('Enter component name');
      return;
    }
    const list = [...(config.payroll_components || [])];
    if (editingPayrollIdx !== null) {
      list[editingPayrollIdx] = values;
    } else {
      list.push(values);
    }
    updateConfig('payroll_components', list);
    setPayrollModalOpen(false);
  };

  const deletePayroll = (idx: number) => {
    const list = [...(config.payroll_components || [])];
    list.splice(idx, 1);
    updateConfig('payroll_components', list);
  };

  const coaColumns = [
    { title: 'Code', dataIndex: 'code', key: 'code', render: (v: string) => <Text style={{ color: '#f0ede6' }}>{v}</Text> },
    { title: 'Name', dataIndex: 'name', key: 'name', render: (v: string) => <Text style={{ color: '#f0ede6' }}>{v}</Text> },
    { title: 'Type', dataIndex: 'type', key: 'type', render: (v: string) => <Tag>{v}</Tag> },
    {
      title: '', key: 'actions', width: 100,
      render: (_: any, _record: any, idx: number) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openCoaModal(idx)} />
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => deleteCoa(idx)} />
        </Space>
      ),
    },
  ];

  const payrollColumns = [
    { title: 'Name', dataIndex: 'name', key: 'name', render: (v: string) => <Text style={{ color: '#f0ede6' }}>{v}</Text> },
    { title: 'Type', dataIndex: 'type', key: 'type', render: (v: string) => <Tag>{v}</Tag> },
    {
      title: 'Default Amount', dataIndex: 'default_amount', key: 'default_amount',
      render: (v: number) => v ?? 0,
    },
    {
      title: 'Taxable', dataIndex: 'is_taxable', key: 'is_taxable',
      render: (v: boolean) => v ? <Tag color="green">Yes</Tag> : <Tag color="red">No</Tag>,
    },
    {
      title: '', key: 'actions', width: 100,
      render: (_: any, _record: any, idx: number) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openPayrollModal(idx)} />
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => deletePayroll(idx)} />
        </Space>
      ),
    },
  ];

  const subTabItems = selected ? [
    {
      key: 'general', label: '1 General',
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <div>
            <Text style={{ color: 'rgba(240,237,230,0.6)', display: 'block', marginBottom: 6 }}>Industry Name</Text>
            <Input value={industryName} onChange={e => { setIndustryName(e.target.value); setDirty(true); }}
              style={{ background: '#0b0f12', color: '#f0ede6', borderColor: 'rgba(255,255,255,0.1)', maxWidth: 400 }} />
          </div>
          <div>
            <Text style={{ color: 'rgba(240,237,230,0.6)', display: 'block', marginBottom: 6 }}>Description</Text>
            <Input.TextArea rows={3} value={config.description || ''} onChange={e => updateConfig('description', e.target.value)}
              style={{ background: '#0b0f12', color: '#f0ede6', borderColor: 'rgba(255,255,255,0.1)', maxWidth: 400 }} />
          </div>
          <div>
            <Text style={{ color: 'rgba(240,237,230,0.6)', display: 'block', marginBottom: 6 }}>Default Modules</Text>
            <Select mode="multiple" value={config.default_modules || []}
              onChange={v => updateConfig('default_modules', v)} options={moduleOptions}
              style={{ width: '100%', maxWidth: 600 }} placeholder="Select modules" />
          </div>
          <div>
            <Text style={{ color: 'rgba(240,237,230,0.6)', display: 'block', marginBottom: 6 }}>Dashboard Widgets</Text>
            <Select mode="tags" value={config.dashboard_widgets || []}
              onChange={v => updateConfig('dashboard_widgets', v)}
              style={{ width: '100%', maxWidth: 600 }} placeholder="Type widget names" />
          </div>
        </Space>
      ),
    },
    {
      key: 'departments', label: '2 Departments',
      children: (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(config.departments || []).map((d: string) => (
              <Tag key={d} closable onClose={() => removeTagItem('departments', d)}
                style={{ padding: '2px 8px', fontSize: 13 }}>{d}</Tag>
            ))}
          </div>
          <Button size="small" icon={<PlusOutlined />} onClick={() => addTagItem('departments')}>Add Department</Button>
        </div>
      ),
    },
    {
      key: 'positions', label: '3 Positions',
      children: (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(config.job_positions || []).map((p: string) => (
              <Tag key={p} closable onClose={() => removeTagItem('job_positions', p)}
                style={{ padding: '2px 8px', fontSize: 13 }}>{p}</Tag>
            ))}
          </div>
          <Button size="small" icon={<PlusOutlined />} onClick={() => addTagItem('job_positions')}>Add Position</Button>
        </div>
      ),
    },
    {
      key: 'coa', label: '4 Chart of Accounts',
      children: (
        <div>
          <div style={{ marginBottom: 12 }}>
            <Button size="small" icon={<PlusOutlined />} onClick={() => openCoaModal()}>Add Account</Button>
          </div>
          <Table dataSource={config.chart_of_accounts || []} columns={coaColumns}
            rowKey={(_, i) => String(i)} pagination={false} size="small" style={{ background: 'transparent' }} />
        </div>
      ),
    },
    {
      key: 'expenses', label: '5 Expense Categories',
      children: (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(config.expense_categories || []).map((e: string) => (
              <Tag key={e} closable onClose={() => removeTagItem('expense_categories', e)}
                style={{ padding: '2px 8px', fontSize: 13 }}>{e}</Tag>
            ))}
          </div>
          <Button size="small" icon={<PlusOutlined />} onClick={() => addTagItem('expense_categories')}>Add Category</Button>
        </div>
      ),
    },
    {
      key: 'revenue', label: '6 Revenue Categories',
      children: (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(config.revenue_categories || []).map((e: string) => (
              <Tag key={e} closable onClose={() => removeTagItem('revenue_categories', e)}
                style={{ padding: '2px 8px', fontSize: 13 }}>{e}</Tag>
            ))}
          </div>
          <Button size="small" icon={<PlusOutlined />} onClick={() => addTagItem('revenue_categories')}>Add Category</Button>
        </div>
      ),
    },
    {
      key: 'inventory', label: '7 Inventory',
      children: (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(config.inventory_categories || []).map((e: string) => (
              <Tag key={e} closable onClose={() => removeTagItem('inventory_categories', e)}
                style={{ padding: '2px 8px', fontSize: 13 }}>{e}</Tag>
            ))}
          </div>
          <Button size="small" icon={<PlusOutlined />} onClick={() => addTagItem('inventory_categories')}>Add Category</Button>
        </div>
      ),
    },
    {
      key: 'payroll', label: '8 Payroll',
      children: (
        <div>
          <div style={{ marginBottom: 12 }}>
            <Button size="small" icon={<PlusOutlined />} onClick={() => openPayrollModal()}>Add Component</Button>
          </div>
          <Table dataSource={config.payroll_components || []} columns={payrollColumns}
            rowKey={(_, i) => String(i)} pagination={false} size="small" style={{ background: 'transparent' }} />
        </div>
      ),
    },
    {
      key: 'leave', label: '9 Leave',
      children: (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(config.leave_types || []).map((e: any) => (
              <Tag key={e.name || e} closable onClose={() => removeTagItem('leave_types', e)}
                style={{ padding: '2px 8px', fontSize: 13 }}>{e.name || e} ({e.days || '-'}d)</Tag>
            ))}
          </div>
          <Button size="small" icon={<PlusOutlined />} onClick={() => addTagItem('leave_types')}>Add Leave Type</Button>
        </div>
      ),
    },
    {
      key: 'workflows', label: '10 Workflows',
      children: (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(config.workflows || []).map((e: string) => (
              <Tag key={e} closable onClose={() => removeTagItem('workflows', e)}
                style={{ padding: '2px 8px', fontSize: 13 }}>{e}</Tag>
            ))}
          </div>
          <Button size="small" icon={<PlusOutlined />} onClick={() => addTagItem('workflows')}>Add Workflow</Button>
        </div>
      ),
    },
    {
      key: 'dashboard', label: '11 Dashboard',
      children: (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(config.dashboard_widgets || []).map((e: string) => (
              <Tag key={e} closable onClose={() => removeTagItem('dashboard_widgets', e)}
                style={{ padding: '2px 8px', fontSize: 13 }}>{e}</Tag>
            ))}
          </div>
          <Button size="small" icon={<PlusOutlined />} onClick={() => addTagItem('dashboard_widgets')}>Add Widget</Button>
        </div>
      ),
    },
    {
      key: 'reports', label: '12 Reports',
      children: (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(config.default_reports || []).map((e: string) => (
              <Tag key={e} closable onClose={() => removeTagItem('default_reports', e)}
                style={{ padding: '2px 8px', fontSize: 13 }}>{e}</Tag>
            ))}
          </div>
          <Button size="small" icon={<PlusOutlined />} onClick={() => addTagItem('default_reports')}>Add Report</Button>
        </div>
      ),
    },
    {
      key: 'documents', label: '13 Documents',
      children: (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(config.documents || []).map((e: string) => (
              <Tag key={e} closable onClose={() => removeTagItem('documents', e)}
                style={{ padding: '2px 8px', fontSize: 13 }}>{e}</Tag>
            ))}
          </div>
          <Button size="small" icon={<PlusOutlined />} onClick={() => addTagItem('documents')}>Add Document Type</Button>
        </div>
      ),
    },
    {
      key: 'integrations', label: '14 Integrations',
      children: (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(config.integrations || []).map((e: string) => (
              <Tag key={e} closable onClose={() => removeTagItem('integrations', e)}
                style={{ padding: '2px 8px', fontSize: 13 }}>{e}</Tag>
            ))}
          </div>
          <Button size="small" icon={<PlusOutlined />} onClick={() => addTagItem('integrations')}>Add Integration</Button>
        </div>
      ),
    },
    {
      key: 'version', label: '15 Version History',
      children: (
        <div>
          <Text style={{ color: 'rgba(240,237,230,0.5)', display: 'block', marginBottom: 8 }}>
            Version tracking will be implemented with the workflow engine.
          </Text>
          <Text style={{ color: 'rgba(240,237,230,0.3)', fontSize: 12 }}>
            Current version: 1.0.0 (draft)
          </Text>
        </div>
      ),
    },
  ] : [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ color: '#f0ede6', margin: 0 }}>Industry Packs</Title>
        <Space>
          {dirty && selectedId && (
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}
              style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>
              Save Changes
            </Button>
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}
            style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>
            Add Industry
          </Button>
        </Space>
      </div>

      <Row gutter={16}>
        <Col span={8} style={{ minHeight: 500 }}>
          <div style={{ borderRight: '1px solid rgba(255,255,255,0.08)', paddingRight: 16, height: '100%', overflow: 'auto' }}>
            <Title level={5} style={{ color: '#f0ede6', marginBottom: 12 }}>Industries</Title>
            {[...INDUSTRY_CATEGORIES, { category: 'Uncategorized', industries: [] }].map((cat) => {
              const catIndustries = cat.category === 'Uncategorized'
                ? industries.filter(i => !INDUSTRY_CATEGORIES.some(c => c.category === i.category))
                : industries.filter(i => i.category === cat.category);
              if (catIndustries.length === 0) return null;
              return (
                <div key={cat.category} style={{ marginBottom: 8 }}>
                  <Text style={{ color: 'rgba(240,237,230,0.35)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, display: 'block', padding: '4px 8px' }}>
                    {cat.category}
                  </Text>
                  {catIndustries.map((ind: any) => (
                    <div
                      key={ind.id}
                      onClick={() => setSelectedId(ind.id)}
                      style={{
                        cursor: 'pointer', padding: '6px 12px 6px 20px', borderRadius: 6,
                        background: selectedId === ind.id ? 'rgba(199,206,234,0.12)' : 'transparent',
                        marginBottom: 1, transition: 'background 0.15s',
                      }}
                    >
                      <Text style={{ color: selectedId === ind.id ? '#f0ede6' : 'rgba(240,237,230,0.75)', fontSize: 13 }}>{ind.industry}</Text>
                    </div>
                  ))}
                </div>
              );
            })}
            {industries.length === 0 && !loading && (
              <Text style={{ color: 'rgba(240,237,230,0.4)' }}>No industries configured</Text>
            )}
          </div>
        </Col>
        <Col span={16}>
          {!selected ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
              <Text style={{ color: 'rgba(240,237,230,0.4)', fontSize: 15 }}>
                Select an industry from the list
              </Text>
            </div>
          ) : (
            <div>
              <Title level={5} style={{ color: '#f0ede6', marginBottom: 16 }}>
                {industryName}
              </Title>
              <Tabs items={subTabItems} tabBarStyle={{ marginBottom: 16 }} />
            </div>
          )}
        </Col>
      </Row>

      <Modal title="Add Industry" open={createModalOpen} onCancel={() => setCreateModalOpen(false)} footer={null}
        styles={{ header: { background: '#151a1e', color: '#f0ede6' }, body: { background: '#151a1e' } }}>
        <Input placeholder="e.g. Healthcare" value={newIndustryName} onChange={e => setNewIndustryName(e.target.value)}
          onPressEnter={handleCreate}
          style={{ background: '#0b0f12', color: '#f0ede6', borderColor: 'rgba(255,255,255,0.1)' }} />
        <Button type="primary" onClick={handleCreate} block style={{ marginTop: 16, background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>
          Create
        </Button>
      </Modal>

      <Modal title={editingCoaIdx !== null ? 'Edit Account' : 'Add Account'} open={coaModalOpen}
        onCancel={() => setCoaModalOpen(false)} onOk={saveCoa} okText="Save"
        styles={{ header: { background: '#151a1e', color: '#f0ede6' }, body: { background: '#151a1e' } }}>
        <Form form={coaForm} layout="vertical" preserve={false}>
          <Form.Item label={<Text style={{ color: '#f0ede6' }}>Code</Text>} name="code">
            <Input style={{ background: '#0b0f12', color: '#f0ede6', borderColor: 'rgba(255,255,255,0.1)' }} />
          </Form.Item>
          <Form.Item label={<Text style={{ color: '#f0ede6' }}>Name</Text>} name="name">
            <Input style={{ background: '#0b0f12', color: '#f0ede6', borderColor: 'rgba(255,255,255,0.1)' }} />
          </Form.Item>
          <Form.Item label={<Text style={{ color: '#f0ede6' }}>Type</Text>} name="type">
            <Select options={ACCOUNT_TYPES.map(t => ({ value: t, label: t }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={editingPayrollIdx !== null ? 'Edit Component' : 'Add Component'} open={payrollModalOpen}
        onCancel={() => setPayrollModalOpen(false)} onOk={savePayroll} okText="Save"
        styles={{ header: { background: '#151a1e', color: '#f0ede6' }, body: { background: '#151a1e' } }}>
        <Form form={payrollForm} layout="vertical" preserve={false}>
          <Form.Item label={<Text style={{ color: '#f0ede6' }}>Name</Text>} name="name">
            <Input style={{ background: '#0b0f12', color: '#f0ede6', borderColor: 'rgba(255,255,255,0.1)' }} />
          </Form.Item>
          <Form.Item label={<Text style={{ color: '#f0ede6' }}>Type</Text>} name="type" initialValue="Allowance">
            <Select options={PAYROLL_TYPES.map(t => ({ value: t, label: t }))} />
          </Form.Item>
          <Form.Item label={<Text style={{ color: '#f0ede6' }}>Default Amount</Text>} name="default_amount" initialValue={0}>
            <InputNumber min={0} style={{ width: '100%', background: '#0b0f12', color: '#f0ede6', borderColor: 'rgba(255,255,255,0.1)' }} />
          </Form.Item>
          <Form.Item label={<Text style={{ color: '#f0ede6' }}>Is Taxable</Text>} name="is_taxable" valuePropName="checked" initialValue={true}>
            <Checkbox />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
