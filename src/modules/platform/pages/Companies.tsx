import { useState, useEffect, useCallback, useRef } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Typography, Tag, Space, Popconfirm, Steps, Checkbox, Result, List, Alert, Spin, Card, Row, Col } from 'antd';
import { PlusOutlined, CheckCircleOutlined, CheckOutlined, LoadingOutlined, CloseCircleOutlined, BankOutlined, CopyOutlined } from '@ant-design/icons';
import { companyService } from '../../../services';
import { supabase } from '../../../utils/supabase';
import { adminUsersService, MIN_PASSWORD_LENGTH } from '../../../services/adminUsers';
import type { Company } from '../../../types';
import { MODULES } from '../../../types';
import { provisionCompany, getProvisionSteps, type ProvisionInput, type ProvisionResult, type ProvisionStep } from '../../../services/provisioning';

const { Title, Text } = Typography;

const stepTitles = ['Company Info', 'Owner', 'Modules', 'Review', 'Provisioning', 'Complete'];

const STEP_WIZARD = 6;

const DEFAULT_COUNTRIES = [
  { code: 'SG', name: '\uD83C\uDDF8\uD83C\uDDEC Singapore', currency: 'SGD', phone_code: '+65' },
  { code: 'MY', name: '\uD83C\uDDF2\uD83C\uDDFE Malaysia', currency: 'MYR', phone_code: '+60' },
  { code: 'HK', name: '\uD83C\uDDED\uD83C\uDDF0 Hong Kong', currency: 'HKD', phone_code: '+852' },
  { code: 'AE', name: '\uD83C\uDDE6\uD83C\uDDEA United Arab Emirates', currency: 'AED', phone_code: '+971' },
  { code: 'AU', name: '\uD83C\uDDE6\uD83C\uDDFA Australia', currency: 'AUD', phone_code: '+61' },
  { code: 'NZ', name: '\uD83C\uDDF3\uD83C\uDDFF New Zealand', currency: 'NZD', phone_code: '+64' },
  { code: 'GB', name: '\uD83C\uDDEC\uD83C\uDDE7 United Kingdom', currency: 'GBP', phone_code: '+44' },
  { code: 'US', name: '\uD83C\uDDFA\uD83C\uDDF8 United States', currency: 'USD', phone_code: '+1' },
  { code: 'CA', name: '\uD83C\uDDE8\uD83C\uDDE6 Canada', currency: 'CAD', phone_code: '+1' },
  { code: 'JP', name: '\uD83C\uDDEF\uD83C\uDDF5 Japan', currency: 'JPY', phone_code: '+81' },
  { code: 'KR', name: '\uD83C\uDDF0\uD83C\uDDF7 South Korea', currency: 'KRW', phone_code: '+82' },
  { code: 'DE', name: '\uD83C\uDDE9\uD83C\uDDEA Germany', currency: 'EUR', phone_code: '+49' },
  { code: 'FR', name: '\uD83C\uDDEB\uD83C\uDDF7 France', currency: 'EUR', phone_code: '+33' },
  { code: 'NL', name: '\uD83C\uDDF3\uD83C\uDDF1 Netherlands', currency: 'EUR', phone_code: '+31' },
  { code: 'CH', name: '\uD83C\uDDE8\uD83C\uDDED Switzerland', currency: 'CHF', phone_code: '+41' },
  { code: 'IN', name: '\uD83C\uDDEE\uD83C\uDDF3 India', currency: 'INR', phone_code: '+91' },
  { code: 'CN', name: '\uD83C\uDDE8\uD83C\uDDF3 China', currency: 'CNY', phone_code: '+86' },
  { code: 'ID', name: '\uD83C\uDDEE\uD83C\uDDE9 Indonesia', currency: 'IDR', phone_code: '+62' },
  { code: 'TH', name: '\uD83C\uDDF9\uD83C\uDDED Thailand', currency: 'THB', phone_code: '+66' },
  { code: 'PH', name: '\uD83C\uDDF5\uD83C\uDDED Philippines', currency: 'PHP', phone_code: '+63' },
  { code: 'VN', name: '\uD83C\uDDFB\uD83C\uDDF3 Vietnam', currency: 'VND', phone_code: '+84' },
];

const ALL_FEATURES_MODULES = ['Dashboard', 'HR', 'Payroll', 'Leave', 'Attendance', 'Claims', 'Finance', 'Accounting', 'Inventory', 'Purchasing', 'Sales', 'CRM', 'Projects', 'Assets', 'Reports', 'AI'];


const GLOBAL_CHART_OF_ACCOUNTS = [
  { code: '1000', name: 'Assets' },
  { code: '1100', name: 'Cash' },
  { code: '1110', name: 'Bank' },
  { code: '1120', name: 'Petty Cash' },
  { code: '1200', name: 'Accounts Receivable' },
  { code: '1300', name: 'Inventory' },
  { code: '1400', name: 'Fixed Assets' },
  { code: '1500', name: 'Accumulated Depreciation' },
  { code: '2000', name: 'Liabilities' },
  { code: '2100', name: 'Accounts Payable' },
  { code: '2200', name: 'Loans' },
  { code: '2300', name: 'Payroll Payable' },
  { code: '2400', name: 'Tax Payable' },
  { code: '3000', name: 'Equity' },
  { code: '3100', name: 'Share Capital' },
  { code: '3200', name: 'Retained Earnings' },
  { code: '3300', name: 'Current Year Earnings' },
  { code: '4000', name: 'Revenue' },
  { code: '4100', name: 'Sales' },
  { code: '4200', name: 'Service Revenue' },
  { code: '4300', name: 'Other Revenue' },
  { code: '5000', name: 'Cost of Sales' },
  { code: '5100', name: 'Purchases' },
  { code: '5200', name: 'Direct Labour' },
  { code: '5300', name: 'Freight In' },
  { code: '6000', name: 'Operating Expenses' },
  { code: '6100', name: 'Salary' },
  { code: '6200', name: 'Employer Contributions' },
  { code: '6300', name: 'Rent' },
  { code: '6400', name: 'Utilities' },
  { code: '6500', name: 'Telephone & Internet' },
  { code: '6600', name: 'Insurance' },
  { code: '6700', name: 'Transport' },
  { code: '6800', name: 'Marketing' },
  { code: '6900', name: 'Professional Fees' },
  { code: '7000', name: 'Other Income' },
  { code: '7100', name: 'Interest Income' },
  { code: '7200', name: 'Gain on Disposal' },
  { code: '8000', name: 'Other Expenses' },
  { code: '8100', name: 'Bank Charges' },
  { code: '8200', name: 'Interest Expense' },
  { code: '8300', name: 'Depreciation' },
  { code: '8400', name: 'Bad Debts' },
  { code: '9000', name: 'Income Tax' },
  { code: '9100', name: 'Income Tax Expense' },
];

const BUSINESS_PACK_PRESETS: Record<string, { label: string; desc: string; modules: string[] }> = {
  starter: { label: 'Starter', desc: 'Core HR essentials', modules: ['Dashboard', 'HR', 'Leave', 'Claims'] },
  hr_payroll: { label: 'HR & Payroll', desc: 'Full HR with payroll', modules: ['Dashboard', 'HR', 'Payroll', 'Leave', 'Attendance', 'Claims'] },
  finance: { label: 'Finance', desc: 'Accounting & finance', modules: ['Dashboard', 'Finance', 'Accounting', 'Assets'] },
  trading: { label: 'Trading', desc: 'Finance + inventory', modules: ['Dashboard', 'Finance', 'Inventory', 'Purchasing', 'Sales'] },
  enterprise: { label: 'Enterprise', desc: 'All modules', modules: ALL_FEATURES_MODULES },
};

export function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [countries, setCountries] = useState<any[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [provisionResult, setProvisionResult] = useState<ProvisionResult | null>(null);
  const [provisionSteps, setProvisionSteps] = useState<ProvisionStep[]>(getProvisionSteps());
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [form] = Form.useForm();
  const provisionStarted = useRef(false);
  const [legacyLogins, setLegacyLogins] = useState(0);
  const [migrating, setMigrating] = useState(false);

  // Company logins created before the switch to Supabase Auth, not yet moved over.
  const loadLegacyLogins = async () => {
    const { count } = await supabase.from('company_users')
      .select('id', { count: 'exact', head: true }).is('auth_user_id', null);
    setLegacyLogins(count || 0);
  };

  const handleMigrateLogins = async () => {
    setMigrating(true);
    try {
      const r = await adminUsersService.migrateLegacyUsers();
      const moved = r.migrated + r.linked_to_existing_login;
      if (r.failed.length) {
        Modal.warning({
          title: `Moved ${moved} login(s); ${r.failed.length} could not be moved`,
          content: r.failed.map(f => `${f.email}: ${f.reason}`).join('\n'),
        });
      } else {
        message.success(`Moved ${moved} login(s). Everyone keeps their current password.`);
      }
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setMigrating(false);
      loadLegacyLogins();
    }
  };

  const load = async () => {
    setLoading(true);
    loadLegacyLogins();
    try {
      const [comps, cntrs] = await Promise.all([
        companyService.list(),
        supabase.from('country_profiles').select('*').then(({ data }) => data || []),
      ]);
      setCompanies(comps);
      setCountries(cntrs.length > 0 ? cntrs : DEFAULT_COUNTRIES);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const stepFields = [
    ['name', 'registration_number', 'country', 'business_pack', 'currency', 'financial_year_start', 'timezone'],
    ['owner_full_name', 'owner_email', 'owner_mobile', 'owner_password'],
    ['modules'],
    [],
    [],
    [],
  ];

  const handleNext = async () => {
    try {
      await form.validateFields(stepFields[currentStep]);
      setCurrentStep(s => s + 1);
    } catch { /* validation failed */ }
  };

  const handlePrev = () => setCurrentStep(s => s - 1);

  const handleBusinessPackChange = (packKey: string) => {
    const pack = BUSINESS_PACK_PRESETS[packKey];
    if (!pack) return;
    const current = form.getFieldValue('modules') as string[] || [];
    const merged = [...new Set([...current, ...pack.modules])];
    form.setFieldValue('modules', merged);
  };

  const handleCreateCompany = async () => {
    // Steps 1-3 were each validated on "Next"; the Review step has no fields.
    // (antd v6 treats validateFields([]) as "validate everything", which wrongly
    // trips on optional fields here.)
    setCurrentStep(4);
    setSubmitting(true);
    setProvisionSteps(getProvisionSteps());
    provisionStarted.current = true;

    const values = form.getFieldsValue();
    const mappedModules = (values.modules || []).map((m: string) => {
      const entry = Object.entries(MODULES).find(([, v]) => v.label === m);
      return entry ? entry[0] : m.toLowerCase();
    });

    try {
      const result = await provisionCompany({
        name: values.name,
        registration_number: values.registration_number,
        country: values.country,
        business_pack: values.business_pack || '',
        currency: values.currency,
        financial_year_start: values.financial_year_start,
        timezone: values.timezone,
        modules: mappedModules.length > 0 ? mappedModules : ALL_FEATURES_MODULES.map(m => m.toLowerCase()),
        owner_full_name: values.owner_full_name,
        owner_email: values.owner_email,
        owner_mobile: values.owner_mobile,
        owner_password: values.owner_password,
      }, (stepIndex, status) => {
        setProvisionSteps(prev => {
          const next = [...prev];
          next[stepIndex] = { ...next[stepIndex], status };
          return next;
        });
      });

      setProvisionResult(result);
      setTimeout(() => setCurrentStep(5), 500);
    } catch (err: any) {
      message.error(err.message);
      setCurrentStep(3);
    } finally {
      setSubmitting(false);
      provisionStarted.current = false;
    }
  };

  const handleOpenCompany = () => {
    if (provisionResult) {
      window.open(`/login?company=${provisionResult.company_code}`, '_blank');
    }
  };

  const handleProvisionDone = () => {
    setModalOpen(false);
    setCurrentStep(0);
    setProvisionResult(null);
    setProvisionSteps(getProvisionSteps());
    form.resetFields();
    load();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => message.success('Copied'));
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name', render: (n: string) => <span style={{ color: '#f0ede6' }}>{n}</span> },
    { title: 'Code', dataIndex: 'company_code', key: 'code' },
    { title: 'Country', dataIndex: 'country', key: 'country' },
    { title: 'Industry', dataIndex: 'industry', key: 'industry' },
    { title: 'Currency', dataIndex: 'currency', key: 'currency' },
    {
      title: 'Status', dataIndex: 'is_active', key: 'status',
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag>,
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: any, record: Company) => (
        record.is_active ? (
          <Popconfirm title="Deactivate this company?"
            description="All its users will be signed out and blocked from logging in."
            onConfirm={() => companyService.setActive(record.id, false).then(load).catch(e => message.error(e.message))}>
            <Button type="link" danger>Deactivate</Button>
          </Popconfirm>
        ) : (
          <Space>
            <Popconfirm title="Reinstate this company?"
              description="Its users regain access."
              onConfirm={() => companyService.setActive(record.id, true).then(load).catch(e => message.error(e.message))}>
              <Button type="link">Reinstate</Button>
            </Popconfirm>
            <Button type="link" danger onClick={() => setDeleteTarget(record)}>Delete…</Button>
          </Space>
        )
      ),
    },
  ];

  const countryOptions = [...countries]
    .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)))
    .map((c: any) => ({ label: `${c.name} (${c.code})`, value: c.code }));
  const getCountryName = (code: string) => countries.find(c => c.code === code)?.name || code;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ color: '#f0ede6', margin: 0 }}>Companies</Title>
        <Space>
          {legacyLogins > 0 && (
            <Popconfirm
              title={`Move ${legacyLogins} older login(s) to secure sign-in?`}
              description="People keep their current passwords. Logins that are not moved cannot sign in."
              onConfirm={handleMigrateLogins}>
              <Button loading={migrating}>Upgrade {legacyLogins} older login(s)</Button>
            </Popconfirm>
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}
            style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>
            Create Company
          </Button>
        </Space>
      </div>

      <Table
        dataSource={companies}
        columns={columns}
        loading={loading}
        rowKey="id"
        style={{ background: 'transparent' }}
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No companies yet</span> }}
      />

      <Modal
        title={currentStep === 5 ? 'Company Created' : 'Create Company'}
        open={modalOpen}
        onCancel={currentStep === 5 ? undefined : handleProvisionDone}
        footer={null}
        width={720}
        closable={currentStep !== 5}
        maskClosable={false}
        styles={{ header: { background: '#151a1e', color: '#f0ede6' }, body: { background: '#151a1e' } }}
      >
        {currentStep < 5 && (
          <Steps
            current={currentStep}
            items={stepTitles.slice(0, 5).map(t => ({ title: t }))}
            style={{ marginBottom: 32 }}
          />
        )}

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            currency: 'SGD', financial_year_start: '01-01', timezone: 'Asia/Singapore',
            modules: ALL_FEATURES_MODULES, business_pack: 'enterprise',
          }}
        >
          {currentStep === 0 && (
            <>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="name" label={<Text style={{ color: '#f0ede6' }}>Company Name</Text>}
                    rules={[{ required: true, message: 'Required' }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="registration_number" label={<Text style={{ color: '#f0ede6' }}>Registration Number</Text>}>
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="country" label={<Text style={{ color: '#f0ede6' }}>Country</Text>}
                    rules={[{ required: true, message: 'Required' }]}>
                    <Select placeholder="Select country" showSearch optionFilterProp="label" options={countryOptions} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="business_pack" label={<Text style={{ color: '#f0ede6' }}>Business Pack</Text>}>
                    <Select placeholder="Select a business pack" allowClear onChange={handleBusinessPackChange}
                      options={Object.entries(BUSINESS_PACK_PRESETS).map(([k, v]) => ({ label: `${v.label} — ${v.desc}`, value: k }))} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="currency" label={<Text style={{ color: '#f0ede6' }}>Currency</Text>}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="financial_year_start" label={<Text style={{ color: '#f0ede6' }}>Financial Year</Text>}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="timezone" label={<Text style={{ color: '#f0ede6' }}>Timezone</Text>}>
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}

          {currentStep === 1 && (
            <>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="owner_full_name" label={<Text style={{ color: '#f0ede6' }}>Owner Name</Text>}
                    rules={[{ required: true, message: 'Required' }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="owner_email" label={<Text style={{ color: '#f0ede6' }}>Owner Email</Text>}
                    rules={[{ required: true, type: 'email', message: 'Valid email required' }]}>
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="owner_mobile" label={<Text style={{ color: '#f0ede6' }}>Mobile</Text>}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="owner_password" label={<Text style={{ color: '#f0ede6' }}>Temporary Password</Text>}
                    rules={[{ required: true, message: 'Required' }, { min: MIN_PASSWORD_LENGTH, message: `At least ${MIN_PASSWORD_LENGTH} characters` }]}>
                    <Input.Password />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}

          {currentStep === 2 && (
            <Form.Item name="modules" label={<Text style={{ color: '#f0ede6' }}>Modules</Text>}>
              <Checkbox.Group>
                <Row gutter={[8, 8]}>
                  {ALL_FEATURES_MODULES.map(key => (
                    <Col span={8} key={key}>
                      <Checkbox value={key} style={{ color: '#f0ede6' }}>{key}</Checkbox>
                    </Col>
                  ))}
                </Row>
              </Checkbox.Group>
            </Form.Item>
          )}

          {currentStep === 3 && (
            <div style={{ color: '#f0ede6' }}>
              <Title level={5} style={{ color: '#f0ede6', marginBottom: 16 }}>Review</Title>
              <Card size="small" style={{ background: '#0b0f12', borderColor: 'rgba(255,255,255,0.08)', marginBottom: 16 }}>
                <Row gutter={[16, 8]}>
                  <Col span={12}><Text style={{ color: 'rgba(240,237,230,0.5)' }}>Company</Text><br /><Text>{form.getFieldValue('name')}</Text></Col>
                  <Col span={12}><Text style={{ color: 'rgba(240,237,230,0.5)' }}>Registration</Text><br /><Text>{form.getFieldValue('registration_number') || '-'}</Text></Col>
                  <Col span={12}><Text style={{ color: 'rgba(240,237,230,0.5)' }}>Country</Text><br /><Text>{getCountryName(form.getFieldValue('country'))}</Text></Col>
                  <Col span={12}><Text style={{ color: 'rgba(240,237,230,0.5)' }}>Business Pack</Text><br /><Text>{BUSINESS_PACK_PRESETS[form.getFieldValue('business_pack') as string]?.label || 'None'}</Text></Col>
                  <Col span={12}><Text style={{ color: 'rgba(240,237,230,0.5)' }}>Currency</Text><br /><Text>{form.getFieldValue('currency')}</Text></Col>
                  <Col span={12}><Text style={{ color: 'rgba(240,237,230,0.5)' }}>Timezone</Text><br /><Text>{form.getFieldValue('timezone')}</Text></Col>
                </Row>
              </Card>
              <Card size="small" style={{ background: '#0b0f12', borderColor: 'rgba(255,255,255,0.08)', marginBottom: 16 }}>
                <Row gutter={[16, 8]}>
                  <Col span={12}><Text style={{ color: 'rgba(240,237,230,0.5)' }}>Owner</Text><br /><Text>{form.getFieldValue('owner_full_name')}</Text></Col>
                  <Col span={12}><Text style={{ color: 'rgba(240,237,230,0.5)' }}>Email</Text><br /><Text>{form.getFieldValue('owner_email')}</Text></Col>
                </Row>
              </Card>
              <Card size="small" style={{ background: '#0b0f12', borderColor: 'rgba(255,255,255,0.08)' }}>
                <Text style={{ color: 'rgba(240,237,230,0.5)', display: 'block', marginBottom: 8 }}>Modules ({((form.getFieldValue('modules') as string[]) || []).length} enabled)</Text>
                <div>
                  {((form.getFieldValue('modules') as string[]) || []).map(k => <Tag key={k}>{k}</Tag>)}
                </div>
              </Card>
            </div>
          )}

          {currentStep === 4 && (
            <div style={{ maxHeight: 400, overflow: 'auto' }}>
              <Title level={5} style={{ color: '#f0ede6', marginBottom: 16 }}>
                {submitting ? 'Provisioning your company...' : 'Provisioning Complete'}
              </Title>
              <List
                dataSource={provisionSteps}
                renderItem={(step) => (
                  <List.Item style={{ border: 'none', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
                    {step.status === 'running' && <Spin indicator={<LoadingOutlined style={{ fontSize: 16, color: '#c7ceea' }} spin />} />}
                    {step.status === 'done' && <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />}
                    {step.status === 'error' && <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />}
                    {step.status === 'pending' && <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(240,237,230,0.15)' }} />}
                    <Text style={{
                      color: step.status === 'done' ? 'rgba(240,237,230,0.9)' :
                             step.status === 'running' ? '#c7ceea' :
                             step.status === 'error' ? '#ff4d4f' : 'rgba(240,237,230,0.35)',
                      fontSize: 13,
                    }}>{step.label}</Text>
                  </List.Item>
                )}
              />
            </div>
          )}

          {currentStep === 5 && provisionResult && (
            <div>
              <Result
                status="success"
                title={`${provisionResult.company.name} is ready`}
                subTitle="All systems provisioned successfully"
                icon={<CheckCircleOutlined style={{ color: '#52c41a', fontSize: 48 }} />}
              />
              <Card title={<Text style={{ color: '#f0ede6' }}>Login Credentials</Text>}
                style={{ background: '#0b0f12', borderColor: 'rgba(255,255,255,0.08)', marginBottom: 16 }}>
                <Row gutter={[16, 12]}>
                  <Col span={12}>
                    <Text style={{ color: 'rgba(240,237,230,0.5)', display: 'block', fontSize: 12 }}>Portal URL</Text>
                    <Text style={{ color: '#f0ede6' }}>{window.location.origin}/login?company={provisionResult.company_code}</Text>
                    <Button type="link" size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(`${window.location.origin}/login?company=${provisionResult.company_code}`)} />
                  </Col>
                  <Col span={12}>
                    <Text style={{ color: 'rgba(240,237,230,0.5)', display: 'block', fontSize: 12 }}>Company Code</Text>
                    <Text style={{ color: '#f0ede6' }}>{provisionResult.company_code}</Text>
                    <Button type="link" size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(provisionResult.company_code)} />
                  </Col>
                  <Col span={12}>
                    <Text style={{ color: 'rgba(240,237,230,0.5)', display: 'block', fontSize: 12 }}>Owner Email</Text>
                    <Text style={{ color: '#f0ede6' }}>{provisionResult.owner.email}</Text>
                  </Col>
                  <Col span={12}>
                    <Text style={{ color: 'rgba(240,237,230,0.5)', display: 'block', fontSize: 12 }}>Temporary Password</Text>
                    <Text style={{ color: '#f0ede6' }}>{form.getFieldValue('owner_password')}</Text>
                  </Col>
                </Row>
              </Card>
              <Card title={<Text style={{ color: '#f0ede6' }}>Provisioning Summary</Text>}
                style={{ background: '#0b0f12', borderColor: 'rgba(255,255,255,0.08)' }}>
                <Row gutter={[16, 8]}>
                  <Col span={8}><Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>Departments</Text><br /><Text>{provisionResult.departments.length}</Text></Col>
                  <Col span={8}><Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>Positions</Text><br /><Text>{provisionResult.positions.length}</Text></Col>
                  <Col span={8}><Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>Roles</Text><br /><Text>{provisionResult.roles.length}</Text></Col>
                  <Col span={8}><Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>COA Lines</Text><br /><Text>{provisionResult.coa.length}</Text></Col>
                  <Col span={8}><Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>Leave Types</Text><br /><Text>{provisionResult.leave_types.length}</Text></Col>
                  <Col span={8}><Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>Payroll Components</Text><br /><Text>{provisionResult.payroll_components.length}</Text></Col>
                  <Col span={8}><Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>Tax Codes</Text><br /><Text>{provisionResult.tax_codes.length}</Text></Col>
                  <Col span={8}><Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>Workflows</Text><br /><Text>{provisionResult.workflows.length}</Text></Col>
                  <Col span={8}><Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>Reports</Text><br /><Text>{provisionResult.report_count}</Text></Col>
                </Row>
              </Card>
            </div>
          )}
        </Form>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          {currentStep < 4 && <Button onClick={handleProvisionDone}>Cancel</Button>}
          {currentStep === 5 && <Button onClick={handleProvisionDone}>Close</Button>}
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            {currentStep > 0 && currentStep < 4 && <Button onClick={handlePrev}>Previous</Button>}
            {currentStep >= 0 && currentStep < 3 && (
              <Button type="primary" onClick={handleNext}
                style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>
                Next
              </Button>
            )}
            {currentStep === 3 && (
              <Button type="primary" loading={submitting} onClick={handleCreateCompany}
                style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>
                Create Company
              </Button>
            )}
            {currentStep === 5 && (
              <Button type="primary" icon={<BankOutlined />} onClick={handleOpenCompany}
                style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>
                Open Company Portal
              </Button>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        title={<span style={{ color: '#ff4d4f' }}>Delete company permanently</span>}
        open={!!deleteTarget}
        onCancel={() => { setDeleteTarget(null); setDeleteConfirmText(''); }}
        okText="Delete everything"
        okButtonProps={{ danger: true, disabled: deleteConfirmText !== deleteTarget?.name, loading: deleting }}
        onOk={async () => {
          if (!deleteTarget) return;
          setDeleting(true);
          try {
            await companyService.remove(deleteTarget.id);
            message.success(`${deleteTarget.name} and all its data were deleted`);
            setDeleteTarget(null); setDeleteConfirmText('');
            load();
          } catch (e: any) { message.error(e.message); }
          setDeleting(false);
        }}
      >
        <Alert type="error" showIcon style={{ marginBottom: 12 }}
          message="This cannot be undone"
          description="Users, employees, leave records, payroll runs, payslips, branding and all settings for this company are removed." />
        <p style={{ color: '#f0ede6' }}>Type <b>{deleteTarget?.name}</b> to confirm:</p>
        <Input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder={deleteTarget?.name} />
      </Modal>
    </div>
  );
}
