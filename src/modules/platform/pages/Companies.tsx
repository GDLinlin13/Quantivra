import { useState, useEffect, useCallback, useRef } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Typography, Tag, Space, Popconfirm, Steps, Checkbox, Result, List, Alert, Spin, Card, Row, Col } from 'antd';
import { PlusOutlined, CheckCircleOutlined, CheckOutlined, LoadingOutlined, CloseCircleOutlined, BankOutlined, CopyOutlined } from '@ant-design/icons';
import { companyService } from '../../../services';
import { supabase } from '../../../utils/supabase';
import { adminUsersService, MIN_PASSWORD_LENGTH } from '../../../services/adminUsers';
import { USERNAME_PATTERN, USERNAME_RULE_TEXT, COMPANY_CODE_PATTERN, COMPANY_CODE_RULE_TEXT, suggestCompanyCode } from '../../../utils/loginEmail';
import { timezoneOptions } from '../../../utils/timezones';
import { currencyOptions } from '../../../utils/currencies';
import { packFor2026 } from '../../../data/country-law-2026';
import type { Company } from '../../../types';
import { MODULES } from '../../../types';
import { SWITCHABLE_MODULES } from '../../../data/permissionGuide';
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

// The sections a company can have (the Dashboard is always there). Accounting, assets, sales, purchasing and reports are all part of Finance.
const ALL_FEATURES_MODULES = SWITCHABLE_MODULES;
const moduleLabel = (key: string) => (MODULES as Record<string, { label: string }>)[key]?.label || key;


const BUSINESS_PACK_PRESETS: Record<string, { label: string; desc: string; modules: string[] }> = {
  starter: { label: 'Starter', desc: 'Core HR essentials', modules: ['employees', 'leave', 'claims'] },
  hr_payroll: { label: 'HR & Payroll', desc: 'Full HR with payroll', modules: ['employees', 'payroll', 'leave', 'attendance', 'claims'] },
  finance: { label: 'Finance', desc: 'Accounting & finance', modules: ['finance'] },
  trading: { label: 'Trading', desc: 'Finance + catalog + CRM', modules: ['finance', 'inventory', 'crm'] },
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
  // Typed name must match, ignoring extra spaces and capital letters.
  const normaliseName = (v: string | undefined) => (v || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const deleteNameMatches = !!deleteTarget && normaliseName(deleteConfirmText) === normaliseName(deleteTarget.name);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<Company | null>(null);
  const [editForm] = Form.useForm();
  const [savingEdit, setSavingEdit] = useState(false);
  const [form] = Form.useForm();
  const provisionStarted = useRef(false);
  const codeTouched = useRef(false);  // stop auto-suggesting once the code is edited by hand
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
    ['name', 'company_code', 'registration_number', 'country', 'business_pack', 'currency', 'financial_year_start', 'timezone'],
    ['owner_full_name', 'owner_username', 'owner_email', 'owner_mobile', 'owner_password'],
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

    // getFieldsValue(true): every step's values, not just the fields on screen now.
    const values = form.getFieldsValue(true);
    const mappedModules = (values.modules || []).map((m: string) => {
      const entry = Object.entries(MODULES).find(([, v]) => v.label === m);
      return entry ? entry[0] : m.toLowerCase();
    });

    try {
      const result = await provisionCompany({
        name: values.name,
        company_code: values.company_code,
        registration_number: values.registration_number,
        country: values.country,
        business_pack: values.business_pack || '',
        currency: values.currency,
        financial_year_start: values.financial_year_start,
        timezone: values.timezone,
        modules: mappedModules.length > 0 ? mappedModules : ALL_FEATURES_MODULES.map(m => m.toLowerCase()),
        owner_full_name: values.owner_full_name,
        owner_username: values.owner_username,
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

  // Ready to paste into a chat message or email for the new company's owner.
  const loginDetailsText = () => provisionResult ? [
    `Your Quantivra login for ${provisionResult.company?.name ?? ''}`.trim(),
    `Login page: ${window.location.origin}/login`,
    `Company code: ${provisionResult.company_code}`,
    `Username: ${provisionResult.owner?.username ?? ''}`,
    `Temporary password: ${form.getFieldValue('owner_password') ?? ''}`,
    'Please change your password after signing in (Settings → Change my password).',
  ].join('\n') : '';

  const handleProvisionDone = () => {
    setModalOpen(false);
    setCurrentStep(0);
    setProvisionResult(null);
    setProvisionSteps(getProvisionSteps());
    form.resetFields();
    codeTouched.current = false;
    load();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => message.success('Copied — paste it into a message'), () => message.error('Could not copy; select the text and copy it instead'));
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name', render: (n: string) => <span style={{ color: '#f0ede6' }}>{n}</span> },
    { title: 'Code', dataIndex: 'company_code', key: 'code' },
    { title: 'Country', dataIndex: 'country', key: 'country' },
    { title: 'Currency', dataIndex: 'currency', key: 'currency' },
    {
      title: 'Status', dataIndex: 'is_active', key: 'status',
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag>,
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: any, record: Company) => (
        record.is_active ? (
          <Space>
          <Button type="link" onClick={() => { setEditTarget(record); editForm.setFieldsValue({ name: record.name, financial_year_start: record.financial_year_start, timezone: record.timezone, modules: record.modules || [] }); }}>Edit</Button>
          <Popconfirm title="Deactivate this company?"
            description="All its users will be signed out and blocked from logging in."
            onConfirm={() => companyService.setActive(record.id, false).then(load).catch(e => message.error(e.message))}>
            <Button type="link" danger>Deactivate</Button>
          </Popconfirm>
          </Space>
        ) : (
          <Space>
            <Popconfirm title="Reinstate this company?"
              description="Its users regain access."
              onConfirm={() => companyService.setActive(record.id, true).then(load).catch(e => message.error(e.message))}>
              <Button type="link">Reinstate</Button>
            </Popconfirm>
            <Button type="link" onClick={() => { setEditTarget(record); editForm.setFieldsValue({ name: record.name, financial_year_start: record.financial_year_start, timezone: record.timezone, modules: record.modules || [] }); }}>Edit</Button>
            <Button type="link" danger onClick={() => setDeleteTarget(record)}>Delete…</Button>
          </Space>
        )
      ),
    },
  ];

  // Picking a country fills in its currency and timezone (both still editable).
  const handleCountryChange = (code: string) => {
    const g = packFor2026(code)?.general;
    if (!g) return;
    form.setFieldsValue({
      currency: g.currency || form.getFieldValue('currency'),
      timezone: g.timezone || form.getFieldValue('timezone'),
    });
    form.validateFields(['currency', 'timezone']).catch(() => {});
  };

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

      {editTarget && (
        <Modal open title={`Edit ${editTarget.name}`} okText="Save" confirmLoading={savingEdit} onCancel={() => setEditTarget(null)} width={560} destroyOnHidden
          onOk={async () => {
            try {
              const v = await editForm.validateFields();
              setSavingEdit(true);
              await companyService.update(editTarget.id, { name: v.name.trim(), financial_year_start: v.financial_year_start, timezone: v.timezone, modules: v.modules });
              message.success('Company updated');
              setEditTarget(null);
              load();
            } catch (e: any) { if (e?.message) message.error(e.message); }
            setSavingEdit(false);
          }}>
          <Form form={editForm} layout="vertical">
            <Form.Item name="name" label="Company name" rules={[{ required: true, message: 'Enter the company name' }]}><Input /></Form.Item>
            <Row gutter={12}>
              <Col span={8}><Form.Item label="Code"><Input value={editTarget.company_code} disabled /></Form.Item></Col>
              <Col span={8}><Form.Item label="Country"><Input value={getCountryName(editTarget.country)} disabled /></Form.Item></Col>
              <Col span={8}><Form.Item label="Currency"><Input value={editTarget.currency} disabled /></Form.Item></Col>
            </Row>
            <Row gutter={12}>
              <Col span={8}><Form.Item name="financial_year_start" label="Financial Year"><Input /></Form.Item></Col>
              <Col span={16}><Form.Item name="timezone" label="Timezone" rules={[{ required: true, message: 'Choose a timezone' }]}>
                <Select showSearch optionFilterProp="label" options={timezoneOptions()} />
              </Form.Item></Col>
            </Row>
            <Form.Item name="modules" label="Sections">
              <Checkbox.Group>
                <Row>{ALL_FEATURES_MODULES.map(key => <Col span={12} key={key}><Checkbox value={key}>{moduleLabel(key)}</Checkbox></Col>)}</Row>
              </Checkbox.Group>
            </Form.Item>
          </Form>
        </Modal>
      )}

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
            financial_year_start: '01-01',
            modules: ALL_FEATURES_MODULES, business_pack: 'enterprise',
          }}
        >
          {currentStep === 0 && (
            <>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="name" label={<Text style={{ color: '#f0ede6' }}>Company Name</Text>}
                    rules={[{ required: true, message: 'Required' }]}>
                    <Input onChange={e => {
                      if (!codeTouched.current) form.setFieldValue('company_code', suggestCompanyCode(e.target.value));
                    }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="company_code" label={<Text style={{ color: '#f0ede6' }}>Company Code</Text>}
                    tooltip="Staff type this on the login page. Suggested from the name; you can change it."
                    normalize={(v: string) => (v || '').toLowerCase().replace(/[^a-z0-9-]/g, '')}
                    rules={[
                      { required: true, message: 'Required' },
                      { pattern: COMPANY_CODE_PATTERN, message: COMPANY_CODE_RULE_TEXT },
                      { validator: (_, v) => (v && companies.some((c: any) => String(c.company_code).toLowerCase() === v)
                        ? Promise.reject(new Error('Another company already uses this code')) : Promise.resolve()) },
                    ]}>
                    <Input onChange={() => { codeTouched.current = true; }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="registration_number" label={<Text style={{ color: '#f0ede6' }}>Registration Number</Text>}>
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="country" label={<Text style={{ color: '#f0ede6' }}>Country</Text>}
                    rules={[{ required: true, message: 'Required' }]}>
                    <Select placeholder="Select country" showSearch optionFilterProp="label" options={countryOptions} onChange={handleCountryChange} />
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
                  <Form.Item name="currency" label={<Text style={{ color: '#f0ede6' }}>Currency</Text>}
                    rules={[{ required: true, message: 'Choose a currency, or pick a country' }]}>
                    <Select showSearch optionFilterProp="label" options={currencyOptions()} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="financial_year_start" label={<Text style={{ color: '#f0ede6' }}>Financial Year</Text>}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="timezone" label={<Text style={{ color: '#f0ede6' }}>Timezone</Text>}
                    rules={[{ required: true, message: 'Choose a timezone, or pick a country' }]}>
                    <Select showSearch optionFilterProp="label" options={timezoneOptions()} />
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
                  <Form.Item name="owner_username" label={<Text style={{ color: '#f0ede6' }}>Owner Username</Text>}
                    tooltip="Used to sign in, together with the company code"
                    normalize={(v: string) => (v || '').trim().toLowerCase()}
                    rules={[{ required: true, message: 'Required' }, { pattern: USERNAME_PATTERN, message: USERNAME_RULE_TEXT }]}>
                    <Input autoComplete="off" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="owner_email" label={<Text style={{ color: '#f0ede6' }}>Owner Email (optional)</Text>}
                    rules={[{ type: 'email', message: 'Enter a valid email, or leave it empty' }]}>
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
                      <Checkbox value={key} style={{ color: '#f0ede6' }}>{moduleLabel(key)}</Checkbox>
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
                  <Col span={12}><Text style={{ color: 'rgba(240,237,230,0.5)' }}>Company Code</Text><br /><Text>{form.getFieldValue('company_code')}</Text></Col>
                  <Col span={12}><Text style={{ color: 'rgba(240,237,230,0.5)' }}>Username</Text><br /><Text>{form.getFieldValue('owner_username')}</Text></Col>
                  <Col span={12}><Text style={{ color: 'rgba(240,237,230,0.5)' }}>Email</Text><br /><Text>{form.getFieldValue('owner_email') || '-'}</Text></Col>
                </Row>
              </Card>
              <Card size="small" style={{ background: '#0b0f12', borderColor: 'rgba(255,255,255,0.08)' }}>
                <Text style={{ color: 'rgba(240,237,230,0.5)', display: 'block', marginBottom: 8 }}>Modules ({((form.getFieldValue('modules') as string[]) || []).length} enabled)</Text>
                <div>
                  {((form.getFieldValue('modules') as string[]) || []).map(k => <Tag key={k}>{moduleLabel(k)}</Tag>)}
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
                extra={<Button size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(loginDetailsText())}>Copy login details</Button>}
                style={{ background: '#0b0f12', borderColor: 'rgba(255,255,255,0.08)', marginBottom: 16 }}>
                <Row gutter={[16, 12]}>
                  <Col span={12}>
                    <Text style={{ color: 'rgba(240,237,230,0.5)', display: 'block', fontSize: 12 }}>Login page</Text>
                    <Text style={{ color: '#f0ede6' }}>{window.location.origin}/login</Text>
                  </Col>
                  <Col span={12}>
                    <Text style={{ color: 'rgba(240,237,230,0.5)', display: 'block', fontSize: 12 }}>Company Code</Text>
                    <Text style={{ color: '#f0ede6' }}>{provisionResult.company_code}</Text>
                  </Col>
                  <Col span={12}>
                    <Text style={{ color: 'rgba(240,237,230,0.5)', display: 'block', fontSize: 12 }}>Owner Username</Text>
                    <Text style={{ color: '#f0ede6' }}>{provisionResult.owner.username}</Text>
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
          </div>
        </div>
      </Modal>

      <Modal
        title={<span style={{ color: '#ff4d4f' }}>Delete company permanently</span>}
        open={!!deleteTarget}
        onCancel={() => { setDeleteTarget(null); setDeleteConfirmText(''); }}
        okText="Delete everything"
        okButtonProps={{ danger: true, disabled: !deleteNameMatches, loading: deleting }}
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
        <Input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder={deleteTarget?.name} autoFocus />
      </Modal>
    </div>
  );
}
