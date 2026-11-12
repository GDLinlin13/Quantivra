import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Card, ColorPicker, Typography, Spin, Tabs, Form, Input, InputNumber, Button, message, Switch, Space, Segmented, Alert, Tag, Tooltip, Select, Popconfirm } from 'antd';
import { DeleteOutlined, SaveOutlined, PlusOutlined, FileAddOutlined } from '@ant-design/icons';
import { supabase } from '../../../utils/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { brandingService, DEFAULT_TEMPLATES, type Branding } from '../../../services/branding';
import { DocumentShell } from '../../../components/DocumentShell';
import { GridTemplateEditor } from '../../../components/GridTemplateEditor';
import { LetterEditor } from '../../../components/LetterEditor';
import { STARTER_LAYOUTS, money, AMOUNT_FORMATS, plainAmount, paymentRows, paymentAccounts, type DocKind, type PaymentAccount, type PaymentLine } from '../../../data/documentLayouts';
import { CellValue } from '../../../components/GridDocument';
import { toA4, type GridTemplate } from '../../../utils/gridTemplate';
import { formatFileName, FILE_NAME_TOKENS, DEFAULT_FILE_NAME, DEFAULT_COMBINED_FILE_NAME, formatDocFileName, DOC_FILE_NAME_TOKENS, DEFAULT_DOC_FILE_NAME } from '../../../utils/payslipFiles';
import { DEFAULT_STATEMENT_FILE_NAME } from './finance/Statements';
import { nationalIdLabel } from '../../../data/countries';
import { fmtDate } from '../../../utils/dateFormat';

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
  const [creating, setCreating] = useState(false);
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

  // the accent colour and the default footer are shared by all the templates
  const saveLook = async () => {
    setSaving(true);
    try {
      await brandingService.save(companyId!, { accent_color: accent, footer_note: vals.footer_note ?? null });
      message.success('Saved');
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
    const layout: GridTemplate = tpl[kind].layout || toA4(STARTER_LAYOUTS[kind](company.country, previewBranding));
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
            {' '}Your logo and company details come from Settings → Company Settings.
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
      <TplToggle label="Pay month and pay date" v={tpl.payslip.showPeriod ?? true} on={x => setTplField('payslip', 'showPeriod', x)} />
      <TplToggle label="Employee ID" v={tpl.payslip.showEmployeeId} on={x => setTplField('payslip', 'showEmployeeId', x)} />
      <TplToggle label="Designation" v={tpl.payslip.showDesignation ?? true} on={x => setTplField('payslip', 'showDesignation', x)} />
      <TplToggle label="Department" v={!!tpl.payslip.showDepartment} on={x => setTplField('payslip', 'showDepartment', x)} />
      <TplToggle label="Date joined" v={!!tpl.payslip.showJoinDate} on={x => setTplField('payslip', 'showJoinDate', x)} />
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
      <TplToggle label="Gross pay line" v={tpl.payslip.showGrossPay ?? true} on={x => setTplField('payslip', 'showGrossPay', x)} />
      <TplToggle label="Employer's contributions (CPF, SDL…)" v={tpl.payslip.showEmployerContributions ?? true} on={x => setTplField('payslip', 'showEmployerContributions', x)} />
      <TplToggle label="Paid by the company on the employee's behalf" v={tpl.payslip.showOnBehalf ?? true} on={x => setTplField('payslip', 'showOnBehalf', x)} />
      <Form.Item label="Payslip footer note" style={{ marginTop: 8 }}>
        <Input.TextArea rows={2} value={tpl.payslip.footerNote} onChange={e => setTplField('payslip', 'footerNote', e.target.value)} placeholder="Leave empty to use the default footer from Company Settings" />
      </Form.Item>
      </Form>
    </Card>,
    previewBox('Preview with example data', (
      <DocumentShell country={company?.country} branding={previewBranding} companyName={company.name} title="PAYSLIP" meta={(tpl.payslip.showPeriod ?? true) ? <>August 2026<br />Pay date {fmtDate('2026-08-31')}</> : undefined}
        showLogo={tpl.payslip.showLogo} showCompanyBlock={tpl.payslip.showCompanyBlock} footerNote={tpl.payslip.footerNote} forPrint>
        <table style={{ width: '100%', fontSize: 13, color: '#111', borderCollapse: 'collapse' }}>
          <tbody>
            {row('Employee', `Alice Tan${tpl.payslip.showEmployeeId ? ' · EMP-001' : ''}`, { muted: true })}
            {(tpl.payslip.showDesignation ?? true) && row('Designation', 'Senior Designer', { muted: true })}
            {tpl.payslip.showDepartment && row('Department', 'Design', { muted: true })}
            {tpl.payslip.showJoinDate && row('Date joined', fmtDate('2021-03-01'), { muted: true })}
            {tpl.payslip.showNationalId && row(nationalIdLabel(company.country), tpl.payslip.nationalIdFull ? 'S1234567A' : '•••••567A', { muted: true })}
            {tpl.payslip.showBankAccount && row('Bank account', tpl.payslip.bankAccountFull ? 'DBS 012-345678-9' : 'DBS ••••••••78-9', { muted: true })}
            <tr><td colSpan={2} style={{ color: '#888', paddingTop: 10 }}>Earnings</td></tr>
            {row('Basic Salary', money(9000, cur, tpl.payslip.amountFormat))}
            {row('Transport allowance', money(200, cur, tpl.payslip.amountFormat))}
            {(tpl.payslip.showGrossPay ?? true) && row('Gross Pay', money(9200, cur, tpl.payslip.amountFormat), { line: true })}
            <tr><td colSpan={2} style={{ color: '#888', paddingTop: 10 }}>Deductions</td></tr>
            {row('CPF (Employee)', money(-1600, cur, tpl.payslip.amountFormat))}
            {row('Net Pay', money(7600, cur, tpl.payslip.amountFormat), { bold: true, line: true })}
          </tbody>
        </table>
        {(tpl.payslip.showOnBehalf ?? true) && <div style={{ marginTop: 10, fontSize: 12, color: '#15803d' }}>Paid by the company on your behalf: SDL {plainAmount(money(25, cur, tpl.payslip.amountFormat))}</div>}
        {(tpl.payslip.showEmployerContributions ?? true) && <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>Employer contributions: CPF (Employer) {plainAmount(money(1700, cur, tpl.payslip.amountFormat))} · SDL {plainAmount(money(25, cur, tpl.payslip.amountFormat))}</div>}
      </DocumentShell>
    )),
  );

  // the colour and the footer behind the letterhead, and the way to make a document on it
  const letterheadCommon = (
    <Card size="small" style={{ ...panel, marginBottom: 12 }} title={<span style={{ color: '#f0ede6' }}>Colour, footer and new documents</span>}>
      <Space size={24} wrap align="start">
        <Form layout="vertical" size="small" component={false}>
          <Form.Item label="Accent colour" style={{ marginBottom: 0 }}><ColorPicker value={accent} onChange={c => setAccent(c.toHexString())} showText /></Form.Item>
        </Form>
        <div style={{ width: 420, maxWidth: '100%' }}>
          <Text style={{ color: 'rgba(240,237,230,0.8)', fontSize: 12 }}>Default document footer</Text>
          <Input.TextArea rows={2} value={vals.footer_note || ''} onChange={e => setVals(p => ({ ...p, footer_note: e.target.value }))} placeholder="e.g. This is a computer-generated document." />
        </div>
        <Space>
          <Button icon={<SaveOutlined />} loading={saving} onClick={saveLook}>Save colour and footer</Button>
          <Button type="primary" icon={<FileAddOutlined />} onClick={() => setCreating(true)}>Create document</Button>
        </Space>
      </Space>
    </Card>
  );
  const letterheadPrebuilt = twoCol(
    <Card size="small" style={panel} title={<span style={{ color: '#f0ede6' }}>What the letterhead shows</span>}>
      <TplToggle label="Logo" v={tpl.letterhead.showLogo} on={x => setTplField('letterhead', 'showLogo', x)} />
      <TplToggle label="Company address block" v={tpl.letterhead.showCompanyBlock} on={x => setTplField('letterhead', 'showCompanyBlock', x)} />
      <Form layout="vertical" component={false}>
        <Form.Item label="Footer note" style={{ marginTop: 8 }}>
          <Input.TextArea rows={2} value={tpl.letterhead.footerNote} onChange={e => setTplField('letterhead', 'footerNote', e.target.value)} placeholder="Leave empty to use the default document footer" />
        </Form.Item>
      </Form>
    </Card>,
    previewBox('Preview — how it looks at the top of your documents', (
      <DocumentShell country={company?.country} branding={previewBranding} companyName={company.name} title="LETTER OF EMPLOYMENT" meta={<>{fmtDate(new Date().toISOString().slice(0, 10))}</>}
        showLogo={tpl.letterhead.showLogo} showCompanyBlock={tpl.letterhead.showCompanyBlock} footerNote={tpl.letterhead.footerNote || vals.footer_note} forPrint>
        <div style={{ color: '#999', fontSize: 12, padding: '12px 0' }}>What you type goes here.</div>
      </DocumentShell>
    )),
  );

  // Bank accounts shown as payment details; older single list becomes the first account.
  const banks: PaymentAccount[] = paymentAccounts(tpl.invoice).length
    ? paymentAccounts(tpl.invoice)
    : [{ title: '', lines: [{ label: '', value: '' }], isDefault: true }];
  const setBanks = (next: PaymentAccount[]) => setTpl(p => ({ ...p, invoice: { ...p.invoice, paymentAccounts: next, paymentDetails: undefined } }));
  const setBank = (bi: number, patch: Partial<PaymentAccount>) => setBanks(banks.map((b, j) => (j === bi ? { ...b, ...patch } : b)));
  const setBankLine = (bi: number, li: number, patch: Partial<PaymentLine>) =>
    setBank(bi, { lines: banks[bi].lines.map((r, j) => (j === li ? { ...r, ...patch } : r)) });

  const soaSettings = (
    <Form layout="vertical" component={false}>
      <Form.Item label="Footer note" style={{ marginBottom: 0 }}>
        <Input.TextArea rows={2} value={tpl.soa.footerNote} onChange={e => setTplField('soa', 'footerNote', e.target.value)} placeholder="Leave empty to use the default footer from Company Settings" />
      </Form.Item>
    </Form>
  );

  const invoiceSettings = (
    <Form layout="vertical" component={false}>
      <Form.Item label="Payment terms (days)" style={{ marginTop: 8, maxWidth: 200 }}>
        <InputNumber min={0} style={{ width: '100%' }} value={tpl.invoice.paymentTermsDays} onChange={x => setTplField('invoice', 'paymentTermsDays', x ?? 30)} />
      </Form.Item>
      <Form.Item label="Payment details">
        {banks.map((b, bi) => (
          <div key={bi} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 10, marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <Input style={{ width: 240 }} value={b.title} placeholder="Payment name" onChange={e => setBank(bi, { title: e.target.value })} />
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
                <Input style={{ width: 170 }} value={r.label} placeholder={li === 0 ? 'Payment Label' : undefined} onChange={e => setBankLine(bi, li, { label: e.target.value })} />
                <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} style={{ flex: 1 }} value={r.value} placeholder={li === 0 ? 'Payment Value' : undefined} onChange={e => setBankLine(bi, li, { value: e.target.value })} />
                <Button icon={<DeleteOutlined />} onClick={() => setBank(bi, { lines: b.lines.filter((_, j) => j !== li) })} />
              </div>
            ))}
            <Button size="small" icon={<PlusOutlined />} onClick={() => setBank(bi, { lines: [...b.lines, { label: '', value: '' }] })}>Add a line</Button>
          </div>
        ))}
        <Button icon={<PlusOutlined />} onClick={() => setBanks([...banks, { title: '', lines: [{ label: '', value: '' }] }])}>Add another bank</Button>
      </Form.Item>
      {(tpl.invoice.bankDetails || '').trim() && (
        <Form.Item label="Older payment details (free text)">
          <Input.TextArea rows={2} value={tpl.invoice.bankDetails} onChange={e => setTplField('invoice', 'bankDetails', e.target.value)} />
        </Form.Item>
      )}
      <Form.Item label="Invoice footer note">
        <Input.TextArea rows={2} value={tpl.invoice.footerNote} onChange={e => setTplField('invoice', 'footerNote', e.target.value)} placeholder="Leave empty to use the default footer from Company Settings" />
      </Form.Item>
    </Form>
  );

  // Statement of account: what it shows, and its settings. Bank details come from the Invoice Template.
  const soaPrebuilt = twoCol(
    <Card size="small" style={panel} title={<span style={{ color: '#f0ede6' }}>What the statement shows</span>}>
      <TplToggle label="Logo" v={tpl.soa.showLogo} on={x => setTplField('soa', 'showLogo', x)} />
      <TplToggle label="Company address block" v={tpl.soa.showCompanyBlock} on={x => setTplField('soa', 'showCompanyBlock', x)} />
      {soaSettings}
    </Card>,
    previewBox('Preview (example figures)', (
      <DocumentShell country={company.country} branding={previewBranding} companyName={company.name} title="STATEMENT OF ACCOUNT"
        meta={<>As at 2026-08-31<br />1 Jul 2026 to 31 Aug 2026</>}
        showLogo={tpl.soa.showLogo} showCompanyBlock={tpl.soa.showCompanyBlock} footerNote={tpl.soa.footerNote} forPrint>
        <div style={{ fontSize: 12, color: '#111' }}>
          <div style={{ color: '#666' }}>Statement for</div>
          <b>Acme Trading Pte Ltd</b>
          <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse' }}><tbody>
            {row('Balance brought forward', money(1200, cur, tpl.soa.amountFormat))}
            {row('INV-0007', money(1800, cur, tpl.soa.amountFormat))}
            {row('Payment received — INV-0005', money(-1200, cur, tpl.soa.amountFormat))}
            {row('Amount due', money(2000, cur, tpl.soa.amountFormat), { bold: true, line: true })}
          </tbody></table>
        </div>
      </DocumentShell>
    )),
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
      <Title level={4} style={{ color: '#f0ede6', marginBottom: 16 }}>Document Templates</Title>
      <Tabs
        items={[
          {
            key: 'payslip-template', label: 'Payslip',
            children: templateTab('payslip', 'Payslips', payslipPrebuilt, undefined,
              <Card size="small" style={{ ...panel, marginBottom: 12, maxWidth: 640 }} title={<span style={{ color: '#f0ede6' }}>Payslip footer (the {'{{footer_note}}'} field)</span>}>
                <Input.TextArea rows={2} value={tpl.payslip.footerNote} onChange={e => setTplField('payslip', 'footerNote', e.target.value)} placeholder="Leave empty to use the default footer from Company Settings" />
              </Card>,
              undefined),
          },
          {
            key: 'invoice-template', label: 'Invoice',
            children: templateTab('invoice', 'Invoices', tpl.invoice.layout?.enabled ? null : invoicePrebuilt,
              undefined,
              <Card size="small" style={{ ...panel, marginBottom: 12, maxWidth: 760 }} title={<span style={{ color: '#f0ede6' }}>Invoice settings</span>}>
                {invoiceSettings}
              </Card>),
          },
          {
            key: 'soa-template', label: 'Statement',
            children: templateTab('soa', 'Statements', tpl.soa.layout?.enabled ? null : soaPrebuilt,
              'The bank details printed on a statement are the ones in the Invoice Template.',
              <Card size="small" style={{ ...panel, marginBottom: 12, maxWidth: 760 }} title={<span style={{ color: '#f0ede6' }}>Statement settings</span>}>
                {soaSettings}
              </Card>),
          },
          {
            key: 'letterhead', label: 'Letterhead',
            children: templateTab('letterhead', 'Documents', tpl.letterhead.layout?.enabled ? null : letterheadPrebuilt, undefined, undefined, letterheadCommon),
          },
        ]}
      />
      {creating && branding && <LetterEditor companyId={companyId!} company={company} branding={previewBranding} onClose={() => setCreating(false)} onSaved={() => setCreating(false)} />}
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
