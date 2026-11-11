import { A4_MODAL } from '../../../../utils/renderPdf';
import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Select, InputNumber, Input, Table, Tag, message, Modal, Descriptions, Space, Popconfirm, Alert, Statistic, Row, Col, Switch, Tooltip, DatePicker } from 'antd';
import { PlayCircleOutlined, FileTextOutlined, CheckCircleOutlined, DeleteOutlined, PrinterOutlined, InfoCircleOutlined, DownloadOutlined, EditOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { payrollService, statutorySettingsService, componentLabel, payslipBankAccounts, setPayslipBank, ABSORBABLE_SCHEMES, type PayrollRunRow, type PayslipRow } from '../../../../services/payroll';
import { brandingService, type Branding } from '../../../../services/branding';
import { useAuth } from '../../../../contexts/AuthContext';
import { PayItemsCard } from './PayItemsCard';
import { PayslipView, printPayslip } from './PayslipView';
import { BulkPayslips } from './BulkPayslips';
import { formatFileName, elementsToPdf, downloadBlob } from '../../../../utils/payslipFiles';
import { supabase } from '../../../../utils/supabase';
import { fmtDate } from '../../../../utils/dateFormat';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ label: dayjs().month(i).format('MMMM'), value: i + 1 }));
const money = (n: number, c = 'SGD') => `${c} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The bank account this payslip was paid to; older payslips (before it was kept) can have it filled in. */
function PaidTo({ slip, onSaved }: { slip: PayslipRow; onSaved: () => void }) {
  const [kept, setKept] = useState<{ bank_account: string | null; bank_name: string | null } | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [acct, setAcct] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const load = () => payslipBankAccounts(slip.run_id).then(m => setKept(m.get(Number(slip.employee_id)) || null)).catch(() => setKept(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setEditing(false); load(); }, [slip.id]);
  if (kept === undefined) return null;
  const savedName = (slip as any).result_json?.bankName || '';
  const masked = (slip as any).result_json?.bankMasked || '';
  return (
    <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ color: 'rgba(240,237,230,0.6)' }}>Paid to:</span>
      {!editing ? (<>
        <span>{[kept?.bank_name || savedName, kept?.bank_account || masked || '—'].filter(Boolean).join(' ')}</span>
        <Button size="small" icon={<EditOutlined />} onClick={() => { setAcct(kept?.bank_account || ''); setName(kept?.bank_name || savedName); setEditing(true); }} />
      </>) : (<>
        <Input style={{ width: 180 }} placeholder="Bank" value={name} onChange={e => setName(e.target.value)} />
        <Input style={{ width: 220 }} placeholder={masked || 'Account number'} value={acct} onChange={e => setAcct(e.target.value)} />
        <Button size="small" type="primary" loading={saving} disabled={!acct.trim()} onClick={async () => {
          setSaving(true);
          try { await setPayslipBank(slip.run_id, Number(slip.employee_id), acct, name || null); await load(); setEditing(false); onSaved(); message.success('Saved'); }
          catch (e: any) { message.error(e.message); }
          setSaving(false);
        }}>Save</Button>
        <Button size="small" onClick={() => setEditing(false)}>Cancel</Button>
      </>)}
    </div>
  );
}

export function PayrollTab({ companyId }: { companyId: number }) {
  const { user } = useAuth();
  const now = dayjs();
  const [year, setYear] = useState(now.month() === 0 ? now.year() - 1 : now.year());
  const [month, setMonth] = useState(now.month() === 0 ? 12 : now.month());
  // the date salaries are paid out; empty = last day of the month
  const [payDate, setPayDate] = useState<dayjs.Dayjs | null>(null);
  const [company, setCompany] = useState<any>(null);
  const [runs, setRuns] = useState<PayrollRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [openRun, setOpenRun] = useState<{ run: PayrollRunRow; payslips: PayslipRow[] } | null>(null);
  const [slip, setSlip] = useState<PayslipRow | null>(null);
  const [bankKey, setBankKey] = useState(0);
  const [absorb, setAbsorb] = useState<Record<string, boolean>>({});
  const [branding, setBranding] = useState<Branding | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const downloadOne = async (p: PayslipRow) => {
    const el = document.getElementById('payslip-print');
    if (!el || !openRun) return;
    setDownloading(true);
    try {
      downloadBlob(await elementsToPdf([el]), formatFileName(branding?.templates.payslip.fileName, {
        name: p.employee_name, id: p.employee_code || '', designation: p.result_json?.designation || '',
        year: openRun.run.period_year, month: openRun.run.period_month, company: branding?.legal_name || company?.name || '',
      }));
    } catch (e: any) { message.error(`Could not create the PDF: ${e.message}`); }
    setDownloading(false);
  };

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
        year, month, createdBy: user?.id, payDate: payDate ? payDate.format('YYYY-MM-DD') : null,
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
          <span style={{ color: 'rgba(240,237,230,0.6)' }}>paid on</span>
          <DatePicker value={payDate} onChange={setPayDate} placeholder={fmtDate(dayjs(`${year}-${String(month).padStart(2, '0')}-01`).endOf('month').format('YYYY-MM-DD'))} />
          <Button type="primary" icon={<PlayCircleOutlined />} loading={running} onClick={doRun}
            style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>Run Payroll</Button>
        </Space>
        <div style={{ color: 'rgba(240,237,230,0.35)', fontSize: 12, marginTop: 8 }}>
          Calculates gross pay, statutory contributions, tax and net for all active employees using the {company?.country || 'SG'} country pack. Re-runnable while in draft.
        </div>
      </Card>

      <PayItemsCard companyId={companyId} year={year} month={month} currency={cur} />

      {/* CDAC / SINDA / MBMF / ECF are Singapore funds */}
      {(company?.country || 'SG').toUpperCase() === 'SG' && <Card size="small" style={{ marginBottom: 16, background: 'rgba(255,255,255,0.03)' }}
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
      </Card>}

      <Table
        dataSource={runs} rowKey="id" loading={loading} size="small" pagination={false} style={{ background: 'transparent' }}
        locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No payroll runs yet</span> }}
        columns={[
          { title: 'Period', key: 'p', render: (_, r) => dayjs(`${r.period_year}-${r.period_month}-01`).format('MMM YYYY') },
          { title: 'Pay Date', dataIndex: 'pay_date', render: (v: string) => fmtDate(v), key: 'pd' },
          { title: 'Gross', key: 'g', render: (_, r) => money(r.total_gross, r.currency) },
          { title: 'Deductions', key: 'd', render: (_, r) => money(r.total_deductions, r.currency) },
          { title: 'Employer Cost', key: 'e', render: (_, r) => money(r.total_employer, r.currency) },
          { title: 'Net', key: 'n', render: (_, r) => <b style={{ color: '#4fc3f7' }}>{money(r.total_net, r.currency)}</b> },
          { title: 'Status', dataIndex: 'status', key: 's', render: (v: string) => <Tag color={v === 'draft' ? 'gold' : v === 'finalised' ? 'green' : 'blue'}>{v}</Tag> },
          {
            title: '', key: 'act', render: (_, r) => (
              <Space>
                <Button size="small" icon={<FileTextOutlined />} onClick={() => openView(r.id)}>View</Button>
                {r.status === 'finalised' && (
                  <Popconfirm title="Reopen this run?" description="It goes back to draft so it can be calculated again. Finance leaves it out until you finalise it again."
                    onConfirm={async () => { try { await payrollService.reopen(r.id); message.success('Back to draft — run it again, then finalise'); load(); } catch (e: any) { message.error(e.message); } }}>
                    <Button size="small">Reopen</Button>
                  </Popconfirm>
                )}
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
                ...((company?.country || 'SG').toUpperCase() === 'SG' ? [{ title: 'CPF (EE)', key: 'cpf', render: (_: any, p: PayslipRow) => money((p.deductions_json.find(d => d.componentCode === 'DEDUCTION_CPF')?.amount) || 0, cur) }] : []),
                { title: 'Tax', key: 't', render: (_, p) => money(p.tax_withheld, cur) },
                { title: 'Net', key: 'n', render: (_, p) => <b style={{ color: '#4fc3f7' }}>{money(p.net_pay, cur)}</b> },
                { title: '', key: 'a', render: (_, p) => <Button size="small" icon={<FileTextOutlined />} onClick={() => setSlip(p)}>Payslip</Button> },
              ]}
            />
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button icon={<PrinterOutlined />} onClick={() => setBulkOpen(true)} disabled={!openRun.payslips.length}>Print / download payslips</Button>
              {openRun.run.status === 'draft' && (
                <Popconfirm title="Finalise this run? It can no longer be re-calculated." onConfirm={() => finalise(openRun.run.id)}>
                  <Button type="primary" icon={<CheckCircleOutlined />}>Finalise Run</Button>
                </Popconfirm>
              )}
            </div>
          </div>
        )}
      </Modal>

      {openRun && bulkOpen && (
        <BulkPayslips open={bulkOpen} onClose={() => setBulkOpen(false)} run={openRun.run} slips={openRun.payslips} company={company} branding={branding} />
      )}

      {/* Payslip */}
      <Modal open={!!slip} onCancel={() => setSlip(null)} width={A4_MODAL}
        title={<Space><FileTextOutlined />Payslip</Space>}
        footer={<Space>
          <Button icon={<PrinterOutlined />} onClick={() => printPayslip(slip!)}>Print</Button>
          <Button type="primary" icon={<DownloadOutlined />} loading={downloading} onClick={() => downloadOne(slip!)}>Download PDF</Button>
        </Space>}>
        {slip && <PaidTo slip={slip} onSaved={() => setBankKey(k => k + 1)} />}
        {slip && <PayslipView slip={slip} company={company} branding={branding} period={openRun?.run} refreshKey={bankKey} />}
      </Modal>
    </div>
  );
}
