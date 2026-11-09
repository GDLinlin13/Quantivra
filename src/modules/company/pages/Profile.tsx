import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Card, Descriptions, Typography, Spin, Tabs, Form, Input, InputNumber, Button, Upload, message, Switch, Space, ColorPicker, Segmented, Alert, Tag, Tooltip, Select, Popconfirm } from 'antd';
import { UploadOutlined, DeleteOutlined, SaveOutlined, PlusOutlined } from '@ant-design/icons';
import { supabase } from '../../../utils/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { brandingService, fileToLogoDataUri, DEFAULT_TEMPLATES, type Branding } from '../../../services/branding';
import { DocumentShell } from '../../../components/DocumentShell';
import { GridTemplateEditor } from '../../../components/GridTemplateEditor';
import { STARTER_LAYOUTS, money, AMOUNT_FORMATS, plainAmount, paymentRows, paymentAccounts, DEFAULT_PAYMENT_LABELS, type DocKind, type PaymentAccount, type PaymentLine } from '../../../data/documentLayouts';
import { CellValue } from '../../../components/GridDocument';
import type { GridTemplate } from '../../../utils/gridTemplate';
import { formatFileName, FILE_NAME_TOKENS, DEFAULT_FILE_NAME, DEFAULT_COMBINED_FILE_NAME, formatDocFileName, DOC_FILE_NAME_TOKENS, DEFAULT_DOC_FILE_NAME } from '../../../utils/payslipFiles';
import { nationalIdLabel, companyRegLabel } from '../../../data/countries';

const { Title, Text } = Typography;
const panel = { background: '#151a1e', border: '1px solid rgba(255,255,255,0.08)' };

export function CompanyProfilePage() {
  const { companyId } = useAuth();
  const [company, setCompany] = useState<any>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [form] = Form.useForm();
  const [tpl, setTpl] = useState(DEFAULT_TEMPLATES);
  const [logo, setLogo] = useState<string | null>(null);
  const [accent, setAccent] = useState('#1677ff');
  const [saving, setSaving] = useState(false);
  const [vals, setVals] = useState<Record<string, any>>({}); // mirror of the form, for the preview

  const load = useCallback(async () => {
    if (!companyId) return;
    const [{ data: co }, b] = await Promise.all([
      supabase.from('companies').select('*').eq('id', companyId).maybeSingle(),
      brandingService.get(companyId),
    ]);
    setCompany(co); setBranding(b);
    setLogo(b.logo_data_uri); setAccent(b.accent_color); setTpl(b.templates);
    const initial = {
      legal_name: b.legal_name || co?.name, registration_no: b.registration_no,
      address: b.address, phone: b.phone, email: b.email, website: b.website, footer_note: b.footer_note,
    };
    setVals(initial);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  if (!company) return <Spin />;

  // Profile tab: logo and company details shown on documents.
  const saveBranding = async () => {
    setSaving(true);
    try {
      const v = { ...vals, ...form.getFieldsValue(true) };
      await brandingService.save(companyId!, {
        legal_name: v.legal_name ?? null, registration_no: v.registration_no ?? null, address: v.address ?? null,
        phone: v.phone ?? null, email: v.email ?? null, website: v.website ?? null, footer_note: v.footer_note ?? null,
        logo_data_uri: logo, accent_color: accent,
      });
      message.success('Company details saved');
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };

  // Template tabs: templates only.
  const saveTemplates = async () => {
    setSaving(true);
    try {
      await brandingService.save(companyId!, { templates: tpl });
      message.success('Template saved');
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

  const v = vals;
  const previewBranding: Branding = {
    ...(branding as Branding), logo_data_uri: logo, accent_color: accent,
    legal_name: v.legal_name, registration_no: v.registration_no, address: v.address, phone: v.phone,
    email: v.email, website: v.website, footer_note: v.footer_note, templates: tpl,
  };
  const cur = company.currency || 'SGD';

  /** Pre-built or custom, then the matching editor. */
  const templateTab = (kind: DocKind, what: string, prebuilt: ReactNode, note?: string, customExtra?: ReactNode, common?: ReactNode) => {
    const layout: GridTemplate = tpl[kind].layout || STARTER_LAYOUTS[kind]();
    const setLayout = (next: GridTemplate) => setTpl(p => ({ ...p, [kind]: { ...p[kind], layout: next } }));
    return (
      <div>
        <Card size="small" style={{ ...panel, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Space wrap>
              <Text style={{ color: '#f0ede6' }}>Use</Text>
              <Segmented value={layout.enabled ? 'custom' : 'prebuilt'}
                onChange={x => setLayout({ ...layout, enabled: x === 'custom' })}
                options={[{ value: 'prebuilt', label: 'Pre-built template' }, { value: 'custom', label: 'Custom template (design your own)' }]} />
            </Space>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={saveTemplates}>Save template</Button>
          </div>
          <Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12, display: 'block', marginTop: 8 }}>
            {layout.enabled
              ? `${what} are printed with the layout you design below.`
              : `${what} are printed with Quantivra's ready-made design; you choose what it shows below.`}
            {' '}Your logo and company details come from the Profile tab.
          </Text>
          {note && <Alert type="info" showIcon style={{ marginTop: 8 }} title={note} />}
        </Card>
        {common}
        {layout.enabled && customExtra}
        {layout.enabled
          ? <GridTemplateEditor kind={kind} value={layout} onChange={setLayout} company={company} branding={previewBranding} />
          : prebuilt}
      </div>
    );
  };

  const twoCol = (left: ReactNode, right: ReactNode) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 1.2fr)', gap: 24, alignItems: 'start' }}>
      <div>{left}</div>
      <div style={{ position: 'sticky', top: 16 }}>{right}</div>
    </div>
  );
  const previewBox = (label: string, children: ReactNode) => (
    <>
      <Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>{label}</Text>
      <div style={{ background: '#fff', borderRadius: 8, padding: 24, marginTop: 8 }}>{children}</div>
    </>
  );
  const row = (a: ReactNode, b: ReactNode, opts: { bold?: boolean; line?: boolean; muted?: boolean } = {}) => (
    <tr>
      <td style={{ color: opts.muted ? '#666' : undefined, fontWeight: opts.bold ? 700 : 400, borderTop: opts.line ? '1px solid #e2e2e2' : undefined, padding: '2px 0' }}>{a}</td>
      <td style={{ textAlign: 'right', fontWeight: opts.bold ? 700 : 400, borderTop: opts.line ? '1px solid #e2e2e2' : undefined }}>{typeof b === 'string' ? <CellValue text={b} /> : b}</td>
    </tr>
  );

  const payslipPrebuilt = twoCol(
    <Card size="small" style={panel} title={<span style={{ color: '#f0ede6' }}>What the payslip shows</span>}>
      <Form layout="vertical" component={false}>
      <TplToggle label="Logo" v={tpl.payslip.showLogo} on={x => setTplField('payslip', 'showLogo', x)} />
      <TplToggle label="Company address block" v={tpl.payslip.showCompanyBlock} on={x => setTplField('payslip', 'showCompanyBlock', x)} />
      <TplToggle label="Employee ID" v={tpl.payslip.showEmployeeId} on={x => setTplField('payslip', 'showEmployeeId', x)} />
      <TplToggle label="Designation" v={tpl.payslip.showDesignation ?? true} on={x => setTplField('payslip', 'showDesignation', x)} />
      <TplToggle label={nationalIdLabel(company.country)} v={!!tpl.payslip.showNationalId} on={x => setTplField('payslip', 'showNationalId', x)} />
      {tpl.payslip.showNationalId && (
        <div style={{ padding: '4px 0 4px 16px' }}>
          <Segmented size="small" value={tpl.payslip.nationalIdFull ? 'full' : 'masked'}
            onChange={x => setTplField('payslip', 'nationalIdFull', x === 'full')}
            options={[{ value: 'masked', label: 'Masked (•••••567A)' }, { value: 'full', label: 'Full number' }]} />
        </div>
      )}
      <TplToggle label="Bank account" v={tpl.payslip.showBankAccount} on={x => setTplField('payslip', 'showBankAccount', x)} />
      {tpl.payslip.showBankAccount && (
        <div style={{ padding: '4px 0 4px 16px' }}>
          <Segmented size="small" value={tpl.payslip.bankAccountFull ? 'full' : 'masked'}
            onChange={x => setTplField('payslip', 'bankAccountFull', x === 'full')}
            options={[{ value: 'masked', label: 'Masked (••••6789)' }, { value: 'full', label: 'Full number' }]} />
        </div>
      )}
      <Form.Item label="Payslip footer note" style={{ marginTop: 8 }}>
        <Input.TextArea rows={2} value={tpl.payslip.footerNote} onChange={e => setTplField('payslip', 'footerNote', e.target.value)} placeholder="Leave empty to use the default footer from Profile" />
      </Form.Item>
      </Form>
    </Card>,
    previewBox('Preview with example data', (
      <DocumentShell country={company?.country} branding={previewBranding} companyName={company.name} title="PAYSLIP" meta={<>August 2026<br />Pay date 2026-08-31</>}
        showLogo={tpl.payslip.showLogo} showCompanyBlock={tpl.payslip.showCompanyBlock} footerNote={tpl.payslip.footerNote} forPrint>
        <table style={{ width: '100%', fontSize: 13, color: '#111', borderCollapse: 'collapse' }}>
          <tbody>
            {row('Employee', `Alice Tan${tpl.payslip.showEmployeeId ? ' · EMP-001' : ''}`, { muted: true })}
            {(tpl.payslip.showDesignation ?? true) && row('Designation', 'Senior Designer', { muted: true })}
            {tpl.payslip.showNationalId && row(nationalIdLabel(company.country), tpl.payslip.nationalIdFull ? 'S1234567A' : '•••••567A', { muted: true })}
            {tpl.payslip.showBankAccount && row('Bank account', tpl.payslip.bankAccountFull ? 'DBS 012-345678-9' : 'DBS ••••••••78-9', { muted: true })}
            <tr><td colSpan={2} style={{ color: '#888', paddingTop: 10 }}>Earnings</td></tr>
            {row('Basic Salary', money(9000, cur, tpl.payslip.amountFormat))}
            {row('Transport allowance', money(200, cur, tpl.payslip.amountFormat))}
            {row('Gross Pay', money(9200, cur, tpl.payslip.amountFormat), { line: true })}
            <tr><td colSpan={2} style={{ color: '#888', paddingTop: 10 }}>Deductions</td></tr>
            {row('CPF (Employee)', money(-1600, cur, tpl.payslip.amountFormat))}
            {row('Net Pay', money(7600, cur, tpl.payslip.amountFormat), { bold: true, line: true })}
          </tbody>
        </table>
      </DocumentShell>
    )),
  );

  const fileCtx = { name: 'Alice Tan', id: 'EMP-001', designation: 'Senior Designer', year: 2026, month: 5, company: v.legal_name || company.name };
  const amountFormatCard = (kind: DocKind) => (
    <Card size="small" style={{ ...panel, marginBottom: 12 }} title={<span style={{ color: '#f0ede6' }}>Amount format</span>}>
      <Space wrap>
        <div style={{ width: 520, maxWidth: '100%' }}>{amountSelect(kind)}</div>
        <Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>
          How amounts appear on {kind === 'payslip' ? 'payslips' : 'invoices'}, e.g. {plainAmount(money(1234.5, cur, tpl[kind].amountFormat))}
        </Text>
      </Space>
    </Card>
  );

  const fileNamesCard = (
    <Card size="small" style={{ ...panel, marginBottom: 12 }} title={<span style={{ color: '#f0ede6' }}>Download file names</span>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <div>
          <Text style={{ color: 'rgba(240,237,230,0.8)' }}>Each payslip</Text>
          <Input value={tpl.payslip.fileName ?? ''} placeholder={DEFAULT_FILE_NAME} style={{ marginTop: 4 }}
            onChange={e => setTplField('payslip', 'fileName', e.target.value)} />
          <Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>e.g. {formatFileName(tpl.payslip.fileName, fileCtx)}</Text>
        </div>
        <div>
          <Text style={{ color: 'rgba(240,237,230,0.8)' }}>All payslips in one file (or the .zip)</Text>
          <Input value={tpl.payslip.combinedFileName ?? ''} placeholder={DEFAULT_COMBINED_FILE_NAME} style={{ marginTop: 4 }}
            onChange={e => setTplField('payslip', 'combinedFileName', e.target.value)} />
          <Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>e.g. {formatFileName(tpl.payslip.combinedFileName, fileCtx, DEFAULT_COMBINED_FILE_NAME)}</Text>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(240,237,230,0.6)' }}>
        Click to add:{' '}
        {FILE_NAME_TOKENS.map(tk => (
          <Tooltip key={tk.token} title={`Adds to “Each payslip”. ${tk.label}`}>
            <Tag style={{ cursor: 'pointer', marginBottom: 4 }}
              onClick={() => setTplField('payslip', 'fileName', `${(tpl.payslip.fileName ?? DEFAULT_FILE_NAME)}${tk.token}`)}>
              {tk.token} <span style={{ opacity: 0.6 }}>{tk.label}</span>
            </Tag>
          </Tooltip>
        ))}
      </div>
    </Card>
  );

  const amountSelect = (kind: DocKind) => (
    <Select style={{ width: '100%', maxWidth: 520 }} popupMatchSelectWidth={false} value={tpl[kind].amountFormat || 'code'}
      onChange={x => setTplField(kind, 'amountFormat', x)}
      options={AMOUNT_FORMATS.map(f => ({ value: f.value, label: f.value.startsWith('accounting') ? f.label.replace('$', f.value === 'accounting_code' ? cur : money(0, cur, 'symbol').replace(/[0-9.,]/g, '')) : f.label.replace(/ — .*$/, '') + ' — ' + money(1234.5, cur, f.value) }))} />
  );

  // Bank accounts shown as payment details; older single list becomes the first account.
  const banks: PaymentAccount[] = paymentAccounts(tpl.invoice).length
    ? paymentAccounts(tpl.invoice)
    : [{ title: '', lines: DEFAULT_PAYMENT_LABELS.map(label => ({ label, value: '' })), isDefault: true }];
  const setBanks = (next: PaymentAccount[]) => setTpl(p => ({ ...p, invoice: { ...p.invoice, paymentAccounts: next, paymentDetails: undefined } }));
  const setBank = (bi: number, patch: Partial<PaymentAccount>) => setBanks(banks.map((b, j) => (j === bi ? { ...b, ...patch } : b)));
  const setBankLine = (bi: number, li: number, patch: Partial<PaymentLine>) =>
    setBank(bi, { lines: banks[bi].lines.map((r, j) => (j === li ? { ...r, ...patch } : r)) });

  const invoiceSettings = (
    <Form layout="vertical" component={false}>
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, marginTop: 8 }}>
        <Form.Item label="Payment terms (days)">
          <InputNumber min={0} style={{ width: '100%' }} value={tpl.invoice.paymentTermsDays} onChange={x => setTplField('invoice', 'paymentTermsDays', x ?? 30)} />
        </Form.Item>
        <Form.Item label="Amount format">{amountSelect('invoice')}</Form.Item>
      </div>
      <Form.Item label="Download file name" style={{ marginBottom: 12 }}>
        <Input value={tpl.invoice.fileName ?? ''} placeholder={DEFAULT_DOC_FILE_NAME} onChange={e => setTplField('invoice', 'fileName', e.target.value)} />
        <Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>
          e.g. {formatDocFileName(tpl.invoice.fileName, { type: 'Invoice', number: 'INV-0001', customer: 'Argos Solutions Limited', reference: 'PO-123', date: '2026-06-01', company: v.legal_name || company.name })}
        </Text>
        <div style={{ marginTop: 6 }}>
          {DOC_FILE_NAME_TOKENS.map(tk => (
            <Tag key={tk.token} style={{ cursor: 'pointer', marginBottom: 4 }}
              onClick={() => setTplField('invoice', 'fileName', `${(tpl.invoice.fileName ?? DEFAULT_DOC_FILE_NAME)}${tk.token}`)}>
              {tk.token} <span style={{ opacity: 0.6 }}>{tk.label}</span>
            </Tag>
          ))}
        </div>
      </Form.Item>
      <Form.Item label="Payment details">
        {banks.map((b, bi) => (
          <div key={bi} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 10, marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <Input style={{ width: 240 }} value={b.title} placeholder="Bank account name, e.g. DBS (SGD)" onChange={e => setBank(bi, { title: e.target.value })} />
              <Switch size="small" checked={!!b.isDefault || banks.length === 1}
                onChange={on => setBanks(banks.map((x, j) => ({ ...x, isDefault: on ? j === bi : (j === 0 && bi !== 0) })))} />
              <Text style={{ color: 'rgba(240,237,230,0.7)', fontSize: 12 }}>Default</Text>
              {banks.length > 1 && (
                <Popconfirm title="Remove this bank account?" onConfirm={() => {
                  const rest = banks.filter((_, j) => j !== bi);
                  if (!rest.some(x => x.isDefault) && rest[0]) rest[0] = { ...rest[0], isDefault: true };
                  setBanks(rest);
                }}>
                  <Button size="small" danger icon={<DeleteOutlined />} style={{ marginLeft: 'auto' }}>Remove bank</Button>
                </Popconfirm>
              )}
            </div>
            {b.lines.map((r, li) => (
              <div key={li} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <Input style={{ width: 170 }} value={r.label} onChange={e => setBankLine(bi, li, { label: e.target.value })} />
                <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} style={{ flex: 1 }} value={r.value} onChange={e => setBankLine(bi, li, { value: e.target.value })} />
                <Button icon={<DeleteOutlined />} onClick={() => setBank(bi, { lines: b.lines.filter((_, j) => j !== li) })} />
              </div>
            ))}
            <Button size="small" icon={<PlusOutlined />} onClick={() => setBank(bi, { lines: [...b.lines, { label: '', value: '' }] })}>Add a line</Button>
          </div>
        ))}
        <Button icon={<PlusOutlined />} onClick={() => setBanks([...banks, { title: '', lines: DEFAULT_PAYMENT_LABELS.map(label => ({ label, value: '' })) }])}>Add another bank</Button>
      </Form.Item>
      {(tpl.invoice.bankDetails || '').trim() && (
        <Form.Item label="Older payment details (free text)">
          <Input.TextArea rows={2} value={tpl.invoice.bankDetails} onChange={e => setTplField('invoice', 'bankDetails', e.target.value)} />
        </Form.Item>
      )}
      <Form.Item label="Invoice footer note">
        <Input.TextArea rows={2} value={tpl.invoice.footerNote} onChange={e => setTplField('invoice', 'footerNote', e.target.value)} placeholder="Leave empty to use the default footer from Profile" />
      </Form.Item>
    </Form>
  );

  const invoicePrebuilt = twoCol(
    <Card size="small" style={panel} title={<span style={{ color: '#f0ede6' }}>What the invoice shows</span>}>
      <TplToggle label="Logo" v={tpl.invoice.showLogo} on={x => setTplField('invoice', 'showLogo', x)} />
      <TplToggle label="Company address block" v={tpl.invoice.showCompanyBlock} on={x => setTplField('invoice', 'showCompanyBlock', x)} />
      {invoiceSettings}
    </Card>,
    previewBox('Preview with example data', (
      <DocumentShell country={company?.country} branding={previewBranding} companyName={company.name} title="INVOICE" meta={<>INV-0001<br />Date 2026-08-01</>}
        showLogo={tpl.invoice.showLogo} showCompanyBlock={tpl.invoice.showCompanyBlock} footerNote={tpl.invoice.footerNote} forPrint>
        <div style={{ fontSize: 13, color: '#111', marginBottom: 10 }}>
          <div style={{ color: '#666' }}>Bill to</div>Acme Trading Pte Ltd<br />1 Example Road, Singapore 123456
          <div style={{ color: '#666', marginTop: 4 }}>Due 2026-08-{String(Math.min(31, 1 + (tpl.invoice.paymentTermsDays ?? 30))).padStart(2, '0')} ({tpl.invoice.paymentTermsDays} days)</div>
        </div>
        <table style={{ width: '100%', fontSize: 13, color: '#111', borderCollapse: 'collapse' }}>
          <tbody>
            {row('Consulting services (10 × 250.00)', money(2500, cur, tpl.invoice.amountFormat))}
            {row('Travel', money(500, cur, tpl.invoice.amountFormat))}
            {row('Total', money(3000, cur, tpl.invoice.amountFormat), { bold: true, line: true })}
          </tbody>
        </table>
        {paymentRows(tpl.invoice).length > 0 ? (
          <div style={{ fontSize: 12, color: '#444', marginTop: 10 }}>
            <b>Payment details</b>
            <table style={{ borderCollapse: 'collapse', marginTop: 4 }}><tbody>
              {paymentRows(tpl.invoice).map((r, i) => (
                <tr key={i}><td style={{ paddingRight: 24, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{r.label}</td><td style={{ whiteSpace: 'pre-line' }}>{r.value}</td></tr>
              ))}
            </tbody></table>
          </div>
        ) : tpl.invoice.bankDetails && <div style={{ fontSize: 12, color: '#444', marginTop: 10, whiteSpace: 'pre-line' }}><b>Payment details</b><br />{tpl.invoice.bankDetails}</div>}
      </DocumentShell>
    )),
  );

  return (
    <div>
      <Title level={4} style={{ color: '#f0ede6', marginBottom: 16 }}>Company Profile</Title>
      <Tabs
        items={[
          {
            key: 'profile', label: 'Profile', forceRender: true,
            children: twoCol(
              <>
                <Card size="small" style={{ ...panel, marginBottom: 16 }} title={<span style={{ color: '#f0ede6' }}>Company</span>}>
                  <Descriptions column={2} size="large"
                  styles={{ label: { color: 'rgba(240,237,230,0.6)' }, content: { color: '#f0ede6' } }}>
                  <Descriptions.Item label="Name">{company.name}</Descriptions.Item>
                  <Descriptions.Item label="Code">{company.company_code}</Descriptions.Item>
                  <Descriptions.Item label="Country">{company.country}</Descriptions.Item>
                  <Descriptions.Item label="Currency">{company.currency}</Descriptions.Item>
                  <Descriptions.Item label="Financial Year">{company.financial_year_start}</Descriptions.Item>
                  <Descriptions.Item label="Timezone">{company.timezone}</Descriptions.Item>
                  <Descriptions.Item label="Modules">{(company.modules || []).join(', ') || 'None'}</Descriptions.Item>
                </Descriptions>
                </Card>
                <Card size="small" style={panel} title={<span style={{ color: '#f0ede6' }}>Logo and company details</span>}>
                  <Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12, display: 'block', marginBottom: 12 }}>
                    Shown at the top of payslips, invoices and other documents.
                  </Text>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ width: 120, height: 60, border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#fff' }}>
                    {logo ? <img src={logo} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <Text style={{ color: '#999', fontSize: 12 }}>No logo</Text>}
                  </div>
                  <Space orientation="vertical">
                    <Upload beforeUpload={onLogo} showUploadList={false} accept="image/*">
                      <Button size="small" icon={<UploadOutlined />}>Upload logo</Button>
                    </Upload>
                    {logo && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setLogo(null)}>Remove</Button>}
                  </Space>
                </div>
                <Form form={form} initialValues={vals} layout="vertical" size="small" onValuesChange={(_, all) => setVals(p => ({ ...p, ...all }))}>
                  <Form.Item name="legal_name" label="Legal name (on documents)"><Input /></Form.Item>
                  <Form.Item name="registration_no" label={companyRegLabel(company.country)}><Input /></Form.Item>
                  <Form.Item name="address" label="Address"><Input.TextArea rows={2} /></Form.Item>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
                    <Form.Item name="phone" label="Phone"><Input /></Form.Item>
                    <Form.Item name="email" label="Email"><Input /></Form.Item>
                  </div>
                  <Form.Item name="website" label="Website"><Input /></Form.Item>
                  <Form.Item label="Accent colour">
                    <ColorPicker value={accent} onChange={c => setAccent(c.toHexString())} showText />
                  </Form.Item>
                  <Form.Item name="footer_note" label="Default document footer"><Input.TextArea rows={2} placeholder="e.g. This is a computer-generated document." /></Form.Item>
                </Form>
                <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={saveBranding}>Save</Button>
                </Card>
              </>,
              previewBox('Preview — how it looks at the top of your documents', (
                <DocumentShell country={company?.country} branding={previewBranding} companyName={company.name} title="DOCUMENT" meta={<>Reference<br />Date</>} forPrint>
                  <div style={{ color: '#999', fontSize: 12, padding: '12px 0' }}>Document content goes here.</div>
                </DocumentShell>
              )),
            ),
          },
          {
            key: 'payslip-template', label: 'Payslip Template',
            children: templateTab('payslip', 'Payslips', payslipPrebuilt, undefined,
              <Card size="small" style={{ ...panel, marginBottom: 12, maxWidth: 640 }} title={<span style={{ color: '#f0ede6' }}>Payslip footer (the {'{{footer_note}}'} field)</span>}>
                <Input.TextArea rows={2} value={tpl.payslip.footerNote} onChange={e => setTplField('payslip', 'footerNote', e.target.value)} placeholder="Leave empty to use the default footer from Profile" />
              </Card>,
              <>{amountFormatCard('payslip')}{fileNamesCard}</>),
          },
          {
            key: 'invoice-template', label: 'Invoice Template',
            children: templateTab('invoice', 'Invoices', tpl.invoice.layout?.enabled ? null : invoicePrebuilt,
              undefined,
              <Card size="small" style={{ ...panel, marginBottom: 12, maxWidth: 760 }} title={<span style={{ color: '#f0ede6' }}>Invoice settings</span>}>
                {invoiceSettings}
              </Card>),
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
