import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Select, InputNumber, Table, Tag, message, Modal, Descriptions, Space, Popconfirm, Alert, Statistic, Row, Col, Switch, Tooltip } from 'antd';
import { PlayCircleOutlined, FileTextOutlined, CheckCircleOutlined, DeleteOutlined, PrinterOutlined, InfoCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { payrollService, statutorySettingsService, componentLabel, ABSORBABLE_SCHEMES, type PayrollRunRow, type PayslipRow } from '../../../../services/payroll';
import { brandingService, type Branding } from '../../../../services/branding';
import { DocumentShell } from '../../../../components/DocumentShell';
import { useAuth } from '../../../../contexts/AuthContext';
import { supabase } from '../../../../utils/supabase';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ label: dayjs().month(i).format('MMMM'), value: i + 1 }));
const money = (n: number, c = 'SGD') => `${c} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PayrollTab({ companyId }: { companyId: number }) {
  const { user } = useAuth();
  const now = dayjs();
  const [year, setYear] = useState(now.month() === 0 ? now.year() - 1 : now.year());
  const [month, setMonth] = useState(now.month() === 0 ? 12 : now.month());
  const [company, setCompany] = useState<any>(null);
  const [runs, setRuns] = useState<PayrollRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [openRun, setOpenRun] = useState<{ run: PayrollRunRow; payslips: PayslipRow[] } | null>(null);
  const [slip, setSlip] = useState<PayslipRow | null>(null);
  const [absorb, setAbsorb] = useState<Record<string, boolean>>({});
  const [branding, setBranding] = useState<Branding | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: co }, r, a, b] = await Promise.all([
      supabase.from('companies').select('*').eq('id', companyId).maybeSingle(),
      payrollService.listRuns(companyId),
      statutorySettingsService.get(companyId),
      brandingService.get(companyId),
    ]);
    setCompany(co); setRuns(r); setAbsorb(a); setBranding(b); setLoading(false);
  }, [companyId]);

  const toggleAbsorb = async (code: string, val: boolean) => {
    setAbsorb(p => ({ ...p, [code]: val }));
    try { await statutorySettingsService.set(companyId, code, val); }
    catch (e: any) { message.error(e.message); load(); }
  };
  useEffect(() => { load(); }, [load]);

  const doRun = async () => {
    setRunning(true);
    try {
      const { runId } = await payrollService.run({
        companyId, countryCode: company?.country || 'SG', currency: company?.currency || 'SGD',
        year, month, createdBy: user?.id,
      });
      message.success('Payroll calculated');
      await load();
      const full = await payrollService.getRun(runId);
      setOpenRun(full);
    } catch (e: any) { message.error(e.message); }
    setRunning(false);
  };

  const openView = async (id: number) => setOpenRun(await payrollService.getRun(id));

  const finalise = async (id: number) => { await payrollService.finalise(id); message.success('Run finalised'); load(); setOpenRun(null); };

  const cur = company?.currency || 'SGD';

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16, background: 'rgba(255,255,255,0.03)' }}>
        <Space wrap>
          <span style={{ color: 'rgba(240,237,230,0.6)' }}>Run payroll for</span>
          <Select value={month} onChange={setMonth} options={MONTHS} style={{ width: 130 }} />
          <InputNumber value={year} onChange={v => setYear(v || year)} min={2020} max={2100} />
          <Button type="primary" icon={<PlayCircleOutlined />} loading={running} onClick={doRun}
            style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>Run Payroll</Button>
        </Space>
        <div style={{ color: 'rgba(240,237,230,0.35)', fontSize: 12, marginTop: 8 }}>
          Calculates gross pay, statutory contributions, tax and net for all active employees using the {company?.country || 'SG'} country pack. Re-runnable while in draft.
        </div>
      </Card>

      <Card size="small" style={{ marginBottom: 16, background: 'rgba(255,255,255,0.03)' }}
        title={<span style={{ color: '#f0ede6', fontSize: 13 }}>Self-help group contributions the company absorbs</span>}>
        <Space size={[24, 8]} wrap>
          {ABSORBABLE_SCHEMES.map(s => (
            <span key={s.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Switch size="small" checked={!!absorb[s.code]} onChange={v => toggleAbsorb(s.code, v)} />
              <span style={{ color: 'rgba(240,237,230,0.8)' }}>{s.label}</span>
              <Tooltip title={s.note}><InfoCircleOutlined style={{ color: 'rgba(240,237,230,0.3)' }} /></Tooltip>
            </span>
          ))}
        </Space>
        <div style={{ color: 'rgba(240,237,230,0.35)', fontSize: 12, marginTop: 8 }}>
          When on, the employee's CDAC/SINDA/MBMF/ECF amount isn't deducted from net pay — the company pays it. CPF is always split (employee and employer each pay their own share); SDL is always fully employer-paid. Applies to the next run.
        </div>
      </Card>

      <Table
        dataSource={runs} rowKey="id" loading={loading} size="small" pagination={false} style={{ background: 'transparent' }}
        locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No payroll runs yet</span> }}
        columns={[
          { title: 'Period', key: 'p', render: (_, r) => dayjs(`${r.period_year}-${r.period_month}-01`).format('MMM YYYY') },
          { title: 'Pay Date', dataIndex: 'pay_date', key: 'pd' },
          { title: 'Gross', key: 'g', render: (_, r) => money(r.total_gross, r.currency) },
          { title: 'Deductions', key: 'd', render: (_, r) => money(r.total_deductions, r.currency) },
          { title: 'Employer Cost', key: 'e', render: (_, r) => money(r.total_employer, r.currency) },
          { title: 'Net', key: 'n', render: (_, r) => <b style={{ color: '#4fc3f7' }}>{money(r.total_net, r.currency)}</b> },
          { title: 'Status', dataIndex: 'status', key: 's', render: (v: string) => <Tag color={v === 'draft' ? 'gold' : v === 'finalised' ? 'green' : 'blue'}>{v}</Tag> },
          {
            title: '', key: 'act', render: (_, r) => (
              <Space>
                <Button size="small" icon={<FileTextOutlined />} onClick={() => openView(r.id)}>View</Button>
                {r.status === 'draft' && (
                  <Popconfirm title="Delete this draft run?" onConfirm={async () => { await payrollService.deleteRun(r.id); load(); }}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      {/* Run detail */}
      <Modal open={!!openRun} onCancel={() => setOpenRun(null)} width={900} footer={null}
        title={openRun ? `Payroll — ${dayjs(`${openRun.run.period_year}-${openRun.run.period_month}-01`).format('MMMM YYYY')}` : ''}>
        {openRun && (
          <div>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}><Statistic title="Gross" value={openRun.run.total_gross} precision={2} prefix={cur + ' '} /></Col>
              <Col span={6}><Statistic title="Deductions" value={openRun.run.total_deductions} precision={2} prefix={cur + ' '} /></Col>
              <Col span={6}><Statistic title="Employer Cost" value={openRun.run.total_employer} precision={2} prefix={cur + ' '} /></Col>
              <Col span={6}><Statistic title="Net Pay" value={openRun.run.total_net} precision={2} prefix={cur + ' '} valueStyle={{ color: '#4fc3f7' }} /></Col>
            </Row>
            {openRun.payslips.some(p => p.status === 'error') && (
              <Alert type="warning" showIcon style={{ marginBottom: 12 }}
                message={`${openRun.payslips.filter(p => p.status === 'error').length} employee(s) failed to calculate`} />
            )}
            <Table
              dataSource={openRun.payslips} rowKey="id" size="small" pagination={false} style={{ background: 'transparent' }}
              columns={[
                { title: 'Employee', key: 'e', render: (_, p) => <span style={{ color: '#f0ede6' }}>{p.employee_name} <span style={{ color: 'rgba(240,237,230,0.4)' }}>{p.employee_code}</span></span> },
                { title: 'Gross', key: 'g', render: (_, p) => money(p.gross_pay, cur) },
                { title: 'CPF (EE)', key: 'cpf', render: (_, p) => money((p.deductions_json.find(d => d.componentCode === 'DEDUCTION_CPF')?.amount) || 0, cur) },
                { title: 'Tax', key: 't', render: (_, p) => money(p.tax_withheld, cur) },
                { title: 'Net', key: 'n', render: (_, p) => <b style={{ color: '#4fc3f7' }}>{money(p.net_pay, cur)}</b> },
                { title: '', key: 'a', render: (_, p) => <Button size="small" icon={<FileTextOutlined />} onClick={() => setSlip(p)}>Payslip</Button> },
              ]}
            />
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              {openRun.run.status === 'draft' && (
                <Popconfirm title="Finalise this run? It can no longer be re-calculated." onConfirm={() => finalise(openRun.run.id)}>
                  <Button type="primary" icon={<CheckCircleOutlined />}>Finalise Run</Button>
                </Popconfirm>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Payslip */}
      <Modal open={!!slip} onCancel={() => setSlip(null)} width={640}
        title={<Space><FileTextOutlined />Payslip</Space>}
        footer={<Button icon={<PrinterOutlined />} onClick={() => printPayslip(slip!)}>Print / Save PDF</Button>}>
        {slip && <PayslipView slip={slip} company={company} branding={branding} period={openRun?.run} />}
      </Modal>
    </div>
  );
}

function PayslipView({ slip, company, branding, period }: { slip: PayslipRow; company: any; branding: Branding | null; period?: PayrollRunRow }) {
  const cur = company?.currency || 'SGD';
  const stat = (slip.statutory_json || []) as any[];
  const t = branding?.templates.payslip;
  const res = slip.result_json || {};
  const bankMasked: string | null = res.bankMasked || null;
  const bankName: string | null = res.bankName || null;

  return (
    <div id="payslip-print" style={{ background: '#fff', borderRadius: 8, padding: 24 }}>
      <DocumentShell
        branding={branding} companyName={company?.name || ''} forPrint
        title="PAYSLIP"
        meta={<>{period && dayjs(`${period.period_year}-${period.period_month}-01`).format('MMMM YYYY')}<br />Pay date {period?.pay_date}</>}
        showLogo={t?.showLogo ?? true} showCompanyBlock={t?.showCompanyBlock ?? true}
        footerNote={t?.footerNote}
      >
        <table style={{ width: '100%', fontSize: 13, color: '#111', borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td style={{ color: '#666' }}>Employee</td><td style={{ textAlign: 'right' }}>{slip.employee_name}{(t?.showEmployeeId ?? true) && slip.employee_code ? ` · ${slip.employee_code}` : ''}</td></tr>
            {t?.showBankAccount && bankMasked && <tr><td style={{ color: '#666' }}>Bank account</td><td style={{ textAlign: 'right' }}>{[bankName, bankMasked].filter(Boolean).join(' ')}</td></tr>}

            <tr><td colSpan={2} style={{ color: '#888', paddingTop: 10 }}>Earnings</td></tr>
            {slip.earnings_json.map((e, i) => (
              <tr key={i}><td style={{ padding: '2px 0' }}>{componentLabel(e.componentCode)}</td><td style={{ textAlign: 'right' }}>{money(e.amount, cur)}</td></tr>
            ))}
            <tr><td style={{ borderTop: '1px solid #e2e2e2' }}>Gross Pay</td><td style={{ textAlign: 'right', borderTop: '1px solid #e2e2e2' }}>{money(slip.gross_pay, cur)}</td></tr>

            <tr><td colSpan={2} style={{ color: '#888', paddingTop: 10 }}>Deductions</td></tr>
            {slip.deductions_json.map((d, i) => (
              <tr key={i}><td style={{ padding: '2px 0' }}>{componentLabel(d.componentCode)}</td><td style={{ textAlign: 'right' }}>-{money(d.amount, cur)}</td></tr>
            ))}
            {slip.deductions_json.length === 0 && <tr><td colSpan={2} style={{ color: '#999' }}>None</td></tr>}
            <tr><td style={{ borderTop: '1px solid #e2e2e2', fontWeight: 700 }}>Net Pay</td><td style={{ textAlign: 'right', borderTop: '1px solid #e2e2e2', fontWeight: 700, color: branding?.accent_color || '#0369a1' }}>{money(slip.net_pay, cur)}</td></tr>
          </tbody>
        </table>

        {stat.some(s => s.absorbedByEmployer && s.employeeTotal > 0) && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#15803d' }}>
            Paid by the company on your behalf: {stat.filter(s => s.absorbedByEmployer && s.employeeTotal > 0)
              .map(s => `${s.schemeName || s.schemeCode} ${money(s.employeeTotal, cur)}`).join(' · ')}
          </div>
        )}
        {stat.some(s => s.employerTotal > 0) && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>
            Employer contributions: {stat.filter(s => s.employerTotal > 0).map(s => `${s.schemeName || s.schemeCode} ${money(s.employerTotal, cur)}`).join(' · ')}
          </div>
        )}
      </DocumentShell>
    </div>
  );
}

function printPayslip(slip: PayslipRow) {
  const el = document.getElementById('payslip-print');
  if (!el) return;
  const w = window.open('', '_blank', 'width=760,height=950');
  if (!w) { message.error('Allow pop-ups to print'); return; }
  w.document.write(`<html><head><title>Payslip — ${slip.employee_name}</title>
    <style>@page{margin:16mm}body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#fff}
    table{width:100%;border-collapse:collapse}td{padding:3px 0}img{max-width:100%}</style>
    </head><body>${el.innerHTML}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
