import { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Typography, Tag, Space, Descriptions, Tabs, List, InputNumber, Divider, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, CloseOutlined } from '@ant-design/icons';
import { supabase } from '../../../utils/supabase';
import { COUNTRY_PACKS } from '../../../data/countries';

const { Title, Text } = Typography;

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

export function CountryPacksPage() {
  const [countries, setCountries] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editSection, setEditSection] = useState('');
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const timer = setTimeout(() => {
      setCountries(DEFAULT_COUNTRIES);
      setVersions([]);
      setLoading(false);
    }, 10000);
    try {
      const [cResult, vResult] = await Promise.all([
        supabase.from('country_profiles').select('*').order('name'),
        supabase.from('country_pack_versions').select('*').order('version', { ascending: false }),
      ]);
      clearTimeout(timer);
      if (cResult.error) console.warn('country_profiles fetch error:', cResult.error.message);
      if (vResult.error) console.warn('country_pack_versions fetch error:', vResult.error.message);
      setCountries(cResult.data && cResult.data.length > 0 ? cResult.data : DEFAULT_COUNTRIES);
      setVersions(vResult.data || []);
    } catch (err: any) {
      clearTimeout(timer);
      console.warn('Load error, using defaults:', err.message);
      setCountries(DEFAULT_COUNTRIES);
      setVersions([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const countryVersionCounts = countries.map(c => ({
    ...c,
    versionCount: versions.filter(v => v.country_code === c.code).length,
  }));

  const selectedCountryVersions = versions
    .filter(v => v.country_code === selectedCountry)
    .sort((a, b) => Number(b.version) - Number(a.version));

  const localFallback = useMemo(() => {
    if (!selectedCountry) return null;
    const p = COUNTRY_PACKS[selectedCountry];
    if (!p) return null;
    const config = {
      currency: p.general?.currency,
      currency_symbol: p.general?.currency_symbol,
      timezone: p.general?.timezone,
      primary_language: p.general?.primary_language,
      secondary_language: p.general?.secondary_language,
      date_format: p.general?.date_format,
      statutory_deductions: p.statutory_contributions,
      payroll_components: p.payroll_components,
      payroll: p.payroll,
      employment_rules: {
        max_weekly_hours: p.employment?.max_weekly_hours,
        probation_months: p.employment?.probation_months,
        notice_period_days: p.employment?.notice_period_days,
        retirement_age: p.employment?.retirement_age,
        rest_days: p.employment?.rest_days,
        termination_rules: p.termination?.notice_period || '',
      },
      employment_types: p.employment_types,
      employee_categories: p.employee_categories,
      tax_brackets: p.income_tax?.brackets,
      gst_rate: p.sales_tax && p.sales_tax.length > 0 ? p.sales_tax[0].rate : undefined,
      tax_filing_frequency: p.income_tax?.filing_frequency,
      leave_minimums: p.leave?.types,
      public_holidays: p.public_holidays,
      government_agencies: p.government_agencies,
      government_forms: p.government_forms,
      fiscal_year_start: p.accounting?.fiscal_year_start,
      default_tax_code: p.accounting?.default_tax_code,
      invoice_number_format: p.accounting?.invoice_number_format,
      payment_terms: p.accounting?.payment_terms,
      tax_codes: p.accounting?.tax_codes,
      payment_methods: p.banking?.payment_methods,
      document_numbering: p.document_numbering,
      workflow_templates: p.workflow_templates,
      dashboard_widgets: p.dashboard_widgets,
      compliance: {
        employment_act: p.compliance?.employment_act,
        record_retention_years: p.compliance?.record_retention_years,
        payslip_requirements: p.compliance?.payslip_requirements,
        privacy_law: p.compliance?.privacy_law,
        checklist: p.compliance?.checklist,
      },
      localisation: p.localisation,
      statutory_contribution_rate: undefined,
      overtime_rules: [],
    };
    return {
      id: null,
      country_code: selectedCountry,
      version: 'local',
      effective_from: '',
      effective_to: null,
      is_active: true,
      config,
    };
  }, [selectedCountry]);

  const selectedVersion = selectedVersionId
    ? versions.find(v => v.id === selectedVersionId)
    : selectedCountryVersions[0] || localFallback;

  const selectedCountryData = countries.find(c => c.code === selectedCountry);

  useEffect(() => {
    if (selectedCountry && selectedCountryVersions.length > 0) {
      const active = selectedCountryVersions.find(v => v.is_active);
      setSelectedVersionId((active || selectedCountryVersions[0]).id);
    } else {
      setSelectedVersionId(null);
    }
  }, [selectedCountry]);

  const handleNewVersion = async () => {
    if (!selectedCountry) { message.warning('Select a country first'); return; }
    const existing = selectedCountryVersions;
    const nums = existing.map(v => Number(v.version)).filter(n => !isNaN(n));
    const maxVer = nums.length > 0 ? Math.max(...nums) : new Date().getFullYear() - 1;
    const newVer = String(maxVer + 1);
    const source = existing.find(v => v.is_active) || existing[0];
    const newConfig = source
      ? JSON.parse(JSON.stringify(source.config))
      : localFallback
        ? JSON.parse(JSON.stringify(localFallback.config))
        : {
            statutory_deductions: [],
            tax_brackets: [],
            employment_rules: { max_weekly_hours: 44, probation_months: 3, notice_period_days: 30, termination_rules: '' },
            public_holidays: [],
            leave_minimums: [],
            payroll_frequencies: ['monthly'],
            overtime_rules: [],
            currency: selectedCountryData?.currency || DEFAULT_COUNTRIES.find(c => c.code === selectedCountry)?.currency || 'SGD',
          };
    try {
      const { error } = await supabase.from('country_pack_versions').insert({
        country_code: selectedCountry, version: newVer, effective_from: `${newVer}-01-01`, config: newConfig, is_active: true,
      });
      if (error) throw error;
      message.success(`Version ${newVer} created`);
      load();
    } catch (e: any) {
      console.error('New version error:', e);
      const localId = Date.now();
      const lv = { id: localId, country_code: selectedCountry, version: newVer, effective_from: `${newVer}-01-01`, effective_to: null, config: newConfig, is_active: true };
      setVersions(prev => [...prev, lv]);
      setSelectedVersionId(localId);
      message.info(`Version ${newVer} saved locally (${e?.message || 'unknown error'})`);
    }
  };

  const handleDeleteVersion = (countryCode: string, versionId: number | null) => {
    if (!versionId) return;
    Modal.confirm({
      title: 'Delete version?',
      content: 'This will permanently delete the version.',
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        try {
          const { error } = await supabase.from('country_pack_versions').delete().eq('id', versionId);
          if (error && !error.message?.includes('0 rows')) throw error;
        } catch {}
        setVersions(prev => prev.filter(v => v.id !== versionId));
        if (selectedVersionId === versionId) setSelectedVersionId(null);
        message.info('Version deleted');
      },
    });
  };

  const openEdit = (section: string) => {
    if (!selectedVersion || selectedVersion.id === null) {
      message.info('Save version to DB first to enable editing');
      return;
    }
    const value = section === 'general'
      ? { currency: selectedVersion.config?.currency }
      : selectedVersion.config?.[section];
    setEditSection(section);
    setEditValue(JSON.stringify(value, null, 2));
    setEditModalOpen(true);
  };

  const handleEditSave = async () => {
    if (!selectedVersion) return;
    setSaving(true);
    try {
      const parsed = JSON.parse(editValue);
      let updatedConfig = { ...selectedVersion.config };
      if (editSection === 'general') {
        updatedConfig.currency = parsed.currency;
      } else if (editSection === '__full__') {
        updatedConfig = parsed;
      } else {
        updatedConfig[editSection] = parsed;
      }
      const { error } = await supabase.from('country_pack_versions')
        .update({ config: updatedConfig })
        .eq('id', selectedVersion.id);
      if (error) throw error;
      message.success('Updated');
      setEditModalOpen(false);
      load();
    } catch (e: any) {
      message.error(e.message || 'Invalid JSON');
    } finally {
      setSaving(false);
    }
  };

  const masterColumns = [
    { title: 'Country', key: 'country', render: (_: any, r: any) => countries.find(c => c.code === r.country_code)?.name || r.country_code },
    { title: 'Version', dataIndex: 'version', key: 'version' },
    { title: 'From', dataIndex: 'effective_from', key: 'effective_from' },
    { title: 'To', dataIndex: 'effective_to', key: 'effective_to', render: (v: any) => v || 'Current' },
    {
      title: 'Status', dataIndex: 'is_active', key: 'status',
      render: (v: boolean) => <Tag color={v ? 'green' : 'orange'}>{v ? 'Active' : 'Superseded'}</Tag>,
    },
    {
      title: '', key: 'actions', width: 100,
      render: (_: any, record: any) => (
        <Button type="link" onClick={() => { setSelectedCountry(record.country_code); setSelectedVersionId(record.id); }}>
          Manage
        </Button>
      ),
    },
  ];

  const subTabItems = selectedVersion ? [
    {
      key: 'general', label: '1 General',
      children: (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Title level={5} style={{ color: '#f0ede6', margin: 0 }}>General Settings</Title>
            <Button icon={<EditOutlined />} size="small" onClick={() => openEdit('general')}>Edit</Button>
          </div>
          <Descriptions column={2} size="small"
            styles={{ label: { color: 'rgba(240,237,230,0.6)' }, content: { color: '#f0ede6' } }}>
            <Descriptions.Item label="Country Code">{selectedVersion.country_code}</Descriptions.Item>
            <Descriptions.Item label="Country">{selectedCountryData?.name || selectedVersion.country_code}</Descriptions.Item>
            <Descriptions.Item label="Currency">{selectedVersion.config?.currency || selectedCountryData?.currency}</Descriptions.Item>
            <Descriptions.Item label="Currency Symbol">{selectedVersion.config?.currency_symbol || '-'}</Descriptions.Item>
            <Descriptions.Item label="Timezone">{selectedVersion.config?.timezone || '-'}</Descriptions.Item>
            <Descriptions.Item label="Primary Language">{selectedVersion.config?.primary_language || '-'}</Descriptions.Item>
            <Descriptions.Item label="Secondary Language">{selectedVersion.config?.secondary_language || '-'}</Descriptions.Item>
            <Descriptions.Item label="Date Format">{selectedVersion.config?.date_format || '-'}</Descriptions.Item>
            <Descriptions.Item label="Phone Code">{selectedCountryData?.phone_code || '-'}</Descriptions.Item>
            <Descriptions.Item label="Version">{selectedVersion.version}</Descriptions.Item>
            <Descriptions.Item label="Effective">{selectedVersion.effective_from} ~ {selectedVersion.effective_to || 'Current'}</Descriptions.Item>
          </Descriptions>
        </div>
      ),
    },
    {
      key: 'payroll', label: '2 Payroll & Statutory',
      children: (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Title level={5} style={{ color: '#f0ede6', margin: 0 }}>Statutory Deductions</Title>
            <Button icon={<EditOutlined />} size="small" onClick={() => openEdit('statutory_deductions')}>Edit</Button>
          </div>
          <Table
            dataSource={selectedVersion.config?.statutory_deductions || []}
            rowKey={(_, i) => String(i)}
            pagination={false} size="small" style={{ background: 'transparent' }}
            expandable={{
              expandedRowRender: (r: any) => (
                <div style={{ padding: '8px 0' }}>
                  {r.age_rules && r.age_rules.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <Text style={{ color: 'rgba(240,237,230,0.6)', fontSize: 12, display: 'block', marginBottom: 6 }}>Age Rates</Text>
                      <Table
                        dataSource={r.age_rules} rowKey={(_, i) => String(i)}
                        pagination={false} size="small" style={{ background: 'transparent' }}
                        columns={[
                          { title: 'Group', dataIndex: 'label', key: 'label', render: (v: string) => <Text style={{ color: '#f0ede6' }}>{v}</Text> },
                          { title: 'Employee %', dataIndex: 'employee_rate', key: 'employee_rate', render: (v: number) => `${v}%` },
                          { title: 'Employer %', dataIndex: 'employer_rate', key: 'employer_rate', render: (v: number) => `${v}%` },
                        ]}
                      />
                    </div>
                  )}
                  {r.rate_table && r.rate_table.length > 0 && (
                    <div>
                      <Text style={{ color: 'rgba(240,237,230,0.6)', fontSize: 12, display: 'block', marginBottom: 6 }}>Wage Bands</Text>
                      <Table
                        dataSource={r.rate_table} rowKey={(_, i) => String(i)}
                        pagination={false} size="small" style={{ background: 'transparent' }}
                        columns={[
                          { title: 'Min Wage', dataIndex: 'min_wage', key: 'min_wage', render: (v: number) => v > 0 ? `${v.toLocaleString()}` : '0' },
                          { title: 'Max Wage', dataIndex: 'max_wage', key: 'max_wage', render: (v: number | null) => v ? `${v.toLocaleString()}` : '∞' },
                          { title: 'Employee %', dataIndex: 'employee_rate', key: 'employee_rate', render: (v: number) => `${v}%` },
                          { title: 'Employer %', dataIndex: 'employer_rate', key: 'employer_rate', render: (v: number) => `${v}%` },
                        ]}
                      />
                    </div>
                  )}
                  {r.eligibility_rules && (
                    <Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12, display: 'block', marginTop: 8 }}>
                      Eligibility: {r.eligibility_rules}
                    </Text>
                  )}
                </div>
              ),
            }}
            columns={[
              { title: 'Scheme', key: 'scheme_code', render: (_: any, r: any) => <Text style={{ color: '#f0ede6', fontWeight: 600 }}>{r.scheme_code || r.name || '-'}</Text> },
              { title: 'Name', key: 'scheme_name', render: (_: any, r: any) => <Text style={{ color: 'rgba(240,237,230,0.8)' }}>{r.scheme_name || r.name || '-'}</Text> },
              { title: 'Employee %', dataIndex: 'employee_rate', key: 'employee_rate', render: (v: number) => v != null ? `${v}%` : '-' },
              { title: 'Employer %', dataIndex: 'employer_rate', key: 'employer_rate', render: (v: number) => v != null ? `${v}%` : '-' },
              { title: 'Ceiling', key: 'ceiling', render: (_: any, r: any) => {
                const parts: string[] = [];
                if (r.max_earnings_ceiling) parts.push(`Max $${r.max_earnings_ceiling.toLocaleString()}`);
                if (r.min_earnings_threshold) parts.push(`Min $${r.min_earnings_threshold.toLocaleString()}`);
                if (r.annual_contribution_ceiling) parts.push(`Annual $${r.annual_contribution_ceiling.toLocaleString()}`);
                return <Text style={{ color: 'rgba(240,237,230,0.6)' }}>{parts.join(' | ') || '-'}</Text>;
              }},
              { title: 'Freq', dataIndex: 'contribution_frequency', key: 'contribution_frequency', render: (v: string) => v ? <Tag style={{ fontSize: 11 }}>{v}</Tag> : '-' },
              { title: 'Type', dataIndex: 'formula_type', key: 'formula_type', render: (v: string) => v ? v.replace(/_/g, ' ') : '-' },
            ]}
          />

          <Divider style={{ borderColor: 'rgba(255,255,255,0.06)', margin: '20px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Title level={5} style={{ color: '#f0ede6', margin: 0 }}>Payroll Components</Title>
            <Button icon={<EditOutlined />} size="small" onClick={() => openEdit('payroll_components')}>Edit</Button>
          </div>
          {selectedVersion.config?.payroll_components ? (
            <Row gutter={16}>
              <Col span={12}>
                <Text style={{ color: 'rgba(240,237,230,0.6)', display: 'block', marginBottom: 8 }}>Earnings</Text>
                <List
                  dataSource={selectedVersion.config.payroll_components.earnings || []}
                  renderItem={(item: any) => (
                    <List.Item style={{ border: 'none', padding: '2px 0' }}>
                      <Text style={{ color: '#f0ede6', fontSize: 13 }}>{item.name}</Text>
                      {item.is_taxable && <Tag style={{ marginLeft: 8, fontSize: 10 }}>Taxable</Tag>}
                    </List.Item>
                  )}
                />
              </Col>
              <Col span={12}>
                <Text style={{ color: 'rgba(240,237,230,0.6)', display: 'block', marginBottom: 8 }}>Deductions</Text>
                <List
                  dataSource={selectedVersion.config.payroll_components.deductions || []}
                  renderItem={(item: any) => (
                    <List.Item style={{ border: 'none', padding: '2px 0' }}>
                      <Text style={{ color: '#f0ede6', fontSize: 13 }}>{item.name}</Text>
                      {item.is_mandatory && <Tag color="orange" style={{ marginLeft: 8, fontSize: 10 }}>Mandatory</Tag>}
                    </List.Item>
                  )}
                />
              </Col>
            </Row>
          ) : (
            <Text style={{ color: 'rgba(240,237,230,0.4)' }}>No components configured</Text>
          )}

          <Divider style={{ borderColor: 'rgba(255,255,255,0.06)', margin: '20px 0' }} />

          <Descriptions column={2} size="small"
            styles={{ label: { color: 'rgba(240,237,230,0.6)' }, content: { color: '#f0ede6' } }}>
            <Descriptions.Item label="Minimum Wage">{selectedVersion.config?.payroll?.minimum_wage ? `S${selectedVersion.config.payroll.minimum_wage}` : '-'}</Descriptions.Item>
            <Descriptions.Item label="Payroll Frequency">{selectedVersion.config?.payroll?.frequencies?.join(', ') || '-'}</Descriptions.Item>
            <Descriptions.Item label="Payroll Cutoff">{selectedVersion.config?.payroll?.payroll_cutoff || '-'}</Descriptions.Item>
            <Descriptions.Item label="13th Month">{selectedVersion.config?.payroll?.thirteenth_month || '-'}</Descriptions.Item>
            <Descriptions.Item label="Bank File Format">{selectedVersion.config?.payroll?.bank_file_format || '-'}</Descriptions.Item>
          </Descriptions>
        </div>
      ),
    },
    {
      key: 'employment', label: '3 Employment',
      children: (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Title level={5} style={{ color: '#f0ede6', margin: 0 }}>Employment Rules</Title>
            <Button icon={<EditOutlined />} size="small" onClick={() => openEdit('employment_rules')}>Edit</Button>
          </div>
          <Descriptions column={2} size="small"
            styles={{ label: { color: 'rgba(240,237,230,0.6)' }, content: { color: '#f0ede6' } }}>
            <Descriptions.Item label="Max Weekly Hours">{selectedVersion.config?.employment_rules?.max_weekly_hours ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Probation Months">{selectedVersion.config?.employment_rules?.probation_months ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Notice Period Days">{selectedVersion.config?.employment_rules?.notice_period_days ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Retirement Age">{selectedVersion.config?.employment_rules?.retirement_age ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Rest Days">{selectedVersion.config?.employment_rules?.rest_days ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Termination Rules">{selectedVersion.config?.employment_rules?.termination_rules || '-'}</Descriptions.Item>
          </Descriptions>

          <Divider style={{ borderColor: 'rgba(255,255,255,0.06)', margin: '20px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Title level={5} style={{ color: '#f0ede6', margin: 0 }}>Employment Types</Title>
            <Button icon={<EditOutlined />} size="small" onClick={() => openEdit('employment_types')}>Edit</Button>
          </div>
          {selectedVersion.config?.employment_types && selectedVersion.config.employment_types.length > 0 ? (
            <Table
              dataSource={selectedVersion.config.employment_types}
              rowKey={(_, i) => String(i)}
              pagination={false} size="small" style={{ background: 'transparent' }}
              columns={[
                { title: 'Type', dataIndex: 'name', key: 'name', render: (v: string) => <Text style={{ color: '#f0ede6' }}>{v}</Text> },
                { title: 'Enabled', dataIndex: 'enabled', key: 'enabled', render: (v: boolean) => v ? <Tag color="green">Yes</Tag> : <Tag color="red">No</Tag> },
              ]}
            />
          ) : (
            <Text style={{ color: 'rgba(240,237,230,0.4)' }}>No employment types configured</Text>
          )}

          <Divider style={{ borderColor: 'rgba(255,255,255,0.06)', margin: '20px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Title level={5} style={{ color: '#f0ede6', margin: 0 }}>Employee Categories</Title>
            <Button icon={<EditOutlined />} size="small" onClick={() => openEdit('employee_categories')}>Edit</Button>
          </div>
          {selectedVersion.config?.employee_categories && selectedVersion.config.employee_categories.length > 0 ? (
            <Table
              dataSource={selectedVersion.config.employee_categories}
              rowKey={(_, i) => String(i)}
              pagination={false} size="small" style={{ background: 'transparent' }}
              columns={[
                { title: 'Category', dataIndex: 'name', key: 'name', render: (v: string) => <Text style={{ color: '#f0ede6' }}>{v}</Text> },
                { title: 'Treatment', dataIndex: 'statutory_treatment', key: 'statutory_treatment', render: (v: string) => <Tag color="orange">{v}</Tag> },
              ]}
            />
          ) : (
            <Text style={{ color: 'rgba(240,237,230,0.4)' }}>No employee categories configured</Text>
          )}
        </div>
      ),
    },
    {
      key: 'tax', label: '4 Tax',
      children: (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Title level={5} style={{ color: '#f0ede6', margin: 0 }}>Tax Brackets</Title>
            <Button icon={<EditOutlined />} size="small" onClick={() => openEdit('tax_brackets')}>Edit</Button>
          </div>
          <Table
            dataSource={selectedVersion.config?.tax_brackets || []}
            rowKey={(_, i) => String(i)}
            pagination={false} size="small" style={{ background: 'transparent' }}
            columns={[
              { title: 'Min', dataIndex: 'min', key: 'min', render: (v: number) => v != null ? `$${v.toLocaleString()}` : '-' },
              { title: 'Max', dataIndex: 'max', key: 'max', render: (v: number | null) => v != null ? `$${v.toLocaleString()}` : '\u221e' },
              { title: 'Rate', dataIndex: 'rate', key: 'rate', render: (v: number) => `${v}%` },
              { title: 'Fixed', dataIndex: 'fixed', key: 'fixed', render: (v: number) => `$${v.toLocaleString()}` },
            ]}
          />
          <div style={{ marginTop: 16 }}>
            <Descriptions column={2} size="small"
              styles={{ label: { color: 'rgba(240,237,230,0.6)' }, content: { color: '#f0ede6' } }}>
              <Descriptions.Item label="GST/VAT Rate">{selectedVersion.config?.gst_rate ? `${selectedVersion.config.gst_rate}%` : '-'}</Descriptions.Item>
              <Descriptions.Item label="Tax Filing Frequency">{selectedVersion.config?.tax_filing_frequency || '-'}</Descriptions.Item>
            </Descriptions>
          </div>
        </div>
      ),
    },
    {
      key: 'leave', label: '5 Leave',
      children: (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Title level={5} style={{ color: '#f0ede6', margin: 0 }}>Leave Entitlements</Title>
            <Button icon={<EditOutlined />} size="small" onClick={() => openEdit('leave_minimums')}>Edit</Button>
          </div>
          <Table
            dataSource={selectedVersion.config?.leave_minimums || []}
            rowKey={(_, i) => String(i)}
            pagination={false} size="small" style={{ background: 'transparent' }}
            columns={[
              { title: 'Leave Type', dataIndex: 'name', key: 'name', render: (v: string) => <Text style={{ color: '#f0ede6' }}>{v}</Text> },
              { title: 'Min Days', dataIndex: 'min_days', key: 'min_days' },
              { title: 'Carry Forward', dataIndex: 'carry_forward', key: 'carry_forward', render: (v: any) => v ? `${v} days` : '-' },
              { title: 'Encashable', dataIndex: 'encashable', key: 'encashable', render: (v: boolean) => v ? 'Yes' : 'No' },
            ]}
          />
        </div>
      ),
    },
    {
      key: 'holidays', label: '6 Public Holidays',
      children: (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Title level={5} style={{ color: '#f0ede6', margin: 0 }}>Public Holidays</Title>
            <Button icon={<EditOutlined />} size="small" onClick={() => openEdit('public_holidays')}>Edit</Button>
          </div>
          {(selectedVersion.config?.public_holidays || []).length === 0
            ? <Text style={{ color: 'rgba(240,237,230,0.4)' }}>No public holidays configured</Text>
            : <List
                dataSource={selectedVersion.config?.public_holidays}
                renderItem={(item: any) => (
                  <List.Item style={{ border: 'none', padding: '4px 0' }}>
                    <Text style={{ color: '#f0ede6' }}>{typeof item === 'string' ? item : `${item.name} (${item.date})`}</Text>
                  </List.Item>
                )}
              />
          }
        </div>
      ),
    },
    {
      key: 'government', label: '7 Government',
      children: (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Title level={5} style={{ color: '#f0ede6', margin: 0 }}>Statutory Agencies</Title>
            <Button icon={<EditOutlined />} size="small" onClick={() => openEdit('government')}>Edit</Button>
          </div>
          {(selectedVersion.config?.government_agencies || []).length === 0
            ? <Text style={{ color: 'rgba(240,237,230,0.4)' }}>No government agencies configured</Text>
            : <Table
                dataSource={selectedVersion.config?.government_agencies || []}
                rowKey={(_, i) => String(i)}
                pagination={false} size="small" style={{ background: 'transparent' }}
                columns={[
                  { title: 'Agency', dataIndex: 'name', key: 'name', render: (v: string) => <Text style={{ color: '#f0ede6' }}>{v}</Text> },
                  { title: 'Submission Frequency', dataIndex: 'frequency', key: 'frequency' },
                  { title: 'Portal', dataIndex: 'portal', key: 'portal' },
                ]}
              />
          }
        </div>
      ),
    },
    {
      key: 'accounting', label: '8 Accounting',
      children: (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Title level={5} style={{ color: '#f0ede6', margin: 0 }}>Accounting Settings</Title>
            <Button icon={<EditOutlined />} size="small" onClick={() => openEdit('accounting')}>Edit</Button>
          </div>
          <Descriptions column={2} size="small"
            styles={{ label: { color: 'rgba(240,237,230,0.6)' }, content: { color: '#f0ede6' } }}>
            <Descriptions.Item label="Fiscal Year Start">{selectedVersion.config?.fiscal_year_start || '-'}</Descriptions.Item>
            <Descriptions.Item label="Default Tax Code">{selectedVersion.config?.default_tax_code || '-'}</Descriptions.Item>
            <Descriptions.Item label="Invoice Number Format">{selectedVersion.config?.invoice_number_format || '-'}</Descriptions.Item>
            <Descriptions.Item label="Payment Terms">{selectedVersion.config?.payment_terms || '-'}</Descriptions.Item>
          </Descriptions>
        </div>
      ),
    },
    {
      key: 'numbering', label: '9 Document Numbers',
      children: (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Title level={5} style={{ color: '#f0ede6', margin: 0 }}>Default Numbering Formats</Title>
            <Button icon={<EditOutlined />} size="small" onClick={() => openEdit('document_numbering')}>Edit</Button>
          </div>
          {selectedVersion.config?.document_numbering && selectedVersion.config.document_numbering.length > 0 ? (
            <Table
              dataSource={selectedVersion.config.document_numbering}
              rowKey={(_, i) => String(i)}
              pagination={false} size="small" style={{ background: 'transparent' }}
              columns={[
                { title: 'Entity', dataIndex: 'entity', key: 'entity', render: (v: string) => <Text style={{ color: '#f0ede6', textTransform: 'capitalize' }}>{v.replace(/_/g, ' ')}</Text> },
                { title: 'Format', dataIndex: 'format', key: 'format', render: (v: string) => <Tag style={{ fontFamily: 'monospace' }}>{v}</Tag> },
              ]}
            />
          ) : (
            <Text style={{ color: 'rgba(240,237,230,0.4)' }}>No numbering formats configured</Text>
          )}
        </div>
      ),
    },
    {
      key: 'compliance', label: '10 Compliance',
      children: (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Title level={5} style={{ color: '#f0ede6', margin: 0 }}>Compliance Rules</Title>
            <Button icon={<EditOutlined />} size="small" onClick={() => openEdit('compliance')}>Edit</Button>
          </div>
          <Descriptions column={2} size="small"
            styles={{ label: { color: 'rgba(240,237,230,0.6)' }, content: { color: '#f0ede6' } }}>
            <Descriptions.Item label="Employment Act">{selectedVersion.config?.compliance?.employment_act || '-'}</Descriptions.Item>
            <Descriptions.Item label="Record Retention Years">{selectedVersion.config?.compliance?.record_retention_years ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Payslip Requirements">{selectedVersion.config?.compliance?.payslip_requirements || '-'}</Descriptions.Item>
            <Descriptions.Item label="Privacy Law">{selectedVersion.config?.compliance?.privacy_law || '-'}</Descriptions.Item>
          </Descriptions>

          {selectedVersion.config?.compliance?.checklist && (
            <>
              <Divider style={{ borderColor: 'rgba(255,255,255,0.06)', margin: '20px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Title level={5} style={{ color: '#f0ede6', margin: 0 }}>Compliance Checklist</Title>
                <Button icon={<EditOutlined />} size="small" onClick={() => openEdit('compliance')}>Edit</Button>
              </div>
              <Table
                dataSource={selectedVersion.config.compliance.checklist}
                rowKey={(_, i) => String(i)}
                pagination={false} size="small" style={{ background: 'transparent' }}
                columns={[
                  { title: 'Item', dataIndex: 'name', key: 'name', render: (v: string) => <Text style={{ color: '#f0ede6' }}>{v}</Text> },
                  { title: 'Frequency', dataIndex: 'frequency', key: 'frequency' },
                  { title: 'Deadline', dataIndex: 'deadline', key: 'deadline' },
                ]}
              />
            </>
          )}
        </div>
      ),
    },
    {
      key: 'localisation', label: '11 Localisation',
      children: (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Title level={5} style={{ color: '#f0ede6', margin: 0 }}>Localisation</Title>
            <Button icon={<EditOutlined />} size="small" onClick={() => openEdit('localisation')}>Edit</Button>
          </div>
          <Descriptions column={2} size="small"
            styles={{ label: { color: 'rgba(240,237,230,0.6)' }, content: { color: '#f0ede6' } }}>
            <Descriptions.Item label="Address Format">{selectedVersion.config?.localisation?.address_format || '-'}</Descriptions.Item>
            <Descriptions.Item label="Postal Code Format">{selectedVersion.config?.localisation?.postal_code_format || '-'}</Descriptions.Item>
            <Descriptions.Item label="Phone Format">{selectedVersion.config?.localisation?.phone_format || '-'}</Descriptions.Item>
            <Descriptions.Item label="National ID Format">{selectedVersion.config?.localisation?.national_id_format || '-'}</Descriptions.Item>
          </Descriptions>
        </div>
      ),
    },
    {
      key: 'version_history', label: '12 Version History',
      children: (
        <div>
          <Title level={5} style={{ color: '#f0ede6', marginBottom: 12 }}>Package Versions</Title>
          <Table
            dataSource={versions.filter(v => v.country_code === selectedVersion.country_code)}
            rowKey="id" pagination={false} size="small" style={{ background: 'transparent' }}
            columns={[
              { title: 'Version', dataIndex: 'version', key: 'version', render: (v: string) => <Text style={{ color: '#f0ede6' }}>{v}</Text> },
              { title: 'Effective From', dataIndex: 'effective_from', key: 'effective_from' },
              { title: 'Effective To', dataIndex: 'effective_to', key: 'effective_to', render: (v: string) => v || 'Current' },
              { title: 'Status', dataIndex: 'is_active', key: 'is_active', render: (v: boolean) => v ? <Tag color="green">Active</Tag> : <Tag color="red">Archived</Tag> },
              { title: 'Created', dataIndex: 'created_at', key: 'created_at', render: (v: string) => new Date(v).toLocaleDateString() },
            ]}
          />
        </div>
      ),
    },
    {
      key: 'audit', label: '13 Audit',
      children: (
        <div>
          <Title level={5} style={{ color: '#f0ede6', marginBottom: 12 }}>Change History</Title>
          <Text style={{ color: 'rgba(240,237,230,0.4)' }}>
            Audit trail for this country pack will be displayed here once the audit engine is integrated.
          </Text>
        </div>
      ),
    },
  ] : [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ color: '#f0ede6', margin: 0 }}>Country Packs</Title>
        <Space>
          {selectedCountry && (
            <Text style={{ color: 'rgba(240,237,230,0.6)', fontSize: 13 }}>
              Selected: {selectedCountryData?.name || selectedCountry}
            </Text>
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={handleNewVersion}
            style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>
            New Version
          </Button>
        </Space>
      </div>

      <Table
        dataSource={versions}
        columns={masterColumns}
        loading={loading}
        rowKey="id"
        style={{ background: 'transparent', marginBottom: 24 }}
        pagination={false}
        size="small"
        locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No country packs yet</span> }}
      />

      <div style={{ display: 'flex', gap: 0, minHeight: 480 }}>
        <div style={{ width: 240, minWidth: 240, borderRight: '1px solid rgba(255,255,255,0.08)', paddingRight: 16 }}>
          <Title level={5} style={{ color: '#f0ede6', marginBottom: 12 }}>Countries</Title>
          <List
            dataSource={countryVersionCounts}
            loading={loading}
            renderItem={(item: any) => (
              <List.Item
                onClick={() => setSelectedCountry(item.code)}
                style={{
                  cursor: 'pointer', padding: '8px 12px', borderRadius: 6,
                  background: selectedCountry === item.code ? 'rgba(199,206,234,0.12)' : 'transparent',
                  border: 'none', marginBottom: 2, transition: 'background 0.15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  <Text style={{ color: '#f0ede6' }}>{item.name}</Text>
                  <Tag style={{ borderRadius: 10, marginRight: 0 }}>{item.versionCount}</Tag>
                </div>
              </List.Item>
            )}
            locale={{ emptyText: <Text style={{ color: 'rgba(240,237,230,0.4)' }}>No countries</Text> }}
          />
        </div>

        <div style={{ flex: 1, paddingLeft: 24 }}>
          {!selectedCountry ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
              <Text style={{ color: 'rgba(240,237,230,0.4)', fontSize: 15 }}>
                Select a country from the list or click Manage on a version
              </Text>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <Title level={4} style={{ color: '#f0ede6', margin: 0 }}>
                  {selectedCountryData?.name || selectedCountry}
                  <Text style={{ color: 'rgba(240,237,230,0.5)', fontWeight: 'normal', marginLeft: 8, fontSize: 14 }}>
                    ({selectedCountry}) · {selectedVersion?.config?.currency || selectedCountryData?.currency || '-'}
                  </Text>
                </Title>
              </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Text style={{ color: 'rgba(240,237,230,0.6)', fontSize: 13 }}>Versions:</Text>
                    <Space size={4}>
                      {selectedCountryVersions.length > 0 ? (
                        selectedCountryVersions.map(v => (
                          <Space key={v.id} size={0}>
                            <Button
                              size="small"
                              type={selectedVersionId === v.id ? 'primary' : 'default'}
                              onClick={() => setSelectedVersionId(v.id)}
                              style={selectedVersionId === v.id
                                ? { background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }
                                : {}}
                            >
                              {v.version}{v.is_active ? ' ★' : ''}
                            </Button>
                            {v.id != null && (
                              <Button
                                size="small" type="text"
                                icon={<CloseOutlined style={{ fontSize: 10, color: 'rgba(240,237,230,0.5)' }} />}
                                onClick={() => handleDeleteVersion(selectedCountry, v.id)}
                                style={{ width: 20, height: 22, padding: 0 }}
                              />
                            )}
                          </Space>
                        ))
                      ) : (
                        <Tag color="blue" style={{ fontSize: 11 }}>Local data (DB empty)</Tag>
                      )}
                    </Space>
                  </div>
                  {selectedVersion && (
                    <div style={{ fontSize: 12, color: 'rgba(240,237,230,0.5)' }}>
                      {selectedVersion.effective_from ? `Effective: ${selectedVersion.effective_from} ~ ${selectedVersion.effective_to || 'Current'} | ` : ''}
                      Status: <Tag color={selectedVersion.is_active ? 'green' : 'orange'} style={{ fontSize: 11, marginRight: 0 }}>
                        {selectedVersion.is_active ? 'Active' : 'Superseded'}
                      </Tag>
                    </div>
                  )}
                </div>

              {selectedVersion && subTabItems.length > 0 && (
                <Tabs items={subTabItems} tabBarStyle={{ marginBottom: 16 }} />
              )}
            </>
          )}
        </div>
      </div>

      <Modal
        title={editSection === '__full__' ? 'Edit Full Configuration'
          : `Edit ${editSection.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`}
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onOk={handleEditSave}
        confirmLoading={saving}
        okText="Save"
        width={700}
        styles={{ header: { background: '#151a1e', color: '#f0ede6' }, body: { background: '#151a1e' } }}
      >
        <Input.TextArea
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          rows={16}
          style={{
            fontFamily: 'monospace', fontSize: 13,
            background: '#0b0f12', color: '#f0ede6',
            borderColor: 'rgba(255,255,255,0.1)',
          }}
        />
      </Modal>
    </div>
  );
}
