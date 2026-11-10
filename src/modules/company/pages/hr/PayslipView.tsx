import { useState, useEffect } from 'react';
import { message } from 'antd';
import dayjs from 'dayjs';
import { componentLabel, maskId, type PayrollRunRow, type PayslipRow } from '../../../../services/payroll';
import type { Branding } from '../../../../services/branding';
import { DocumentShell } from '../../../../components/DocumentShell';
import { GridDocument, CellValue } from '../../../../components/GridDocument';
import { companyFields, money as fmtMoney, plainAmount } from '../../../../data/documentLayouts';
import { hrService, type Employee } from '../../../../services/hr';
import type { FieldValues, ListValues } from '../../../../utils/gridTemplate';
import { nationalIdLabel } from '../../../../data/countries';


export const PRINT_CSS = `@page{size:A4;margin:12mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#fff}
  table{width:100%;border-collapse:collapse}td{padding:3px 0}img{max-width:100%}
  .qv-page{break-after:page;page-break-after:always}.qv-page:last-child{break-after:auto;page-break-after:auto}`;

/**
 * One payslip, in the company's chosen template. Pass `employee` when you already have the
 * employee record (bulk printing); otherwise it is looked up (pay-access users only).
 */
export function PayslipView({ slip, company, branding, period, employee, domId = 'payslip-print' }: {
  slip: PayslipRow; company: any; branding: Branding | null; period?: PayrollRunRow;
  employee?: Employee | null; domId?: string;
}) {
  const cur = company?.currency || 'SGD';
  const stat = (slip.statutory_json || []) as any[];
  const t = branding?.templates.payslip;
  const M = (n: number) => fmtMoney(n, cur, t?.amountFormat);
  const res = slip.result_json || {};
  const bankMasked: string | null = res.bankMasked || null;
  const bankName: string | null = res.bankName || null;
  const layout = t?.layout;
  const useLayout = !!layout?.enabled;
  // The employee's current record (pay-access users only). Full bank / ID numbers are only kept
  // encrypted, so they are looked up here rather than saved on the payslip; designation and
  // department also come from here for payslips made before they were saved on the payslip.
  const [fetched, setFetched] = useState<Employee | null>(null);
  const emp = employee !== undefined ? employee : fetched;
  const setEmp = setFetched;
  useEffect(() => {
    let live = true;
    setEmp(null);
    if (employee !== undefined || !company?.id) return;
    hrService.listEmployees(company.id)
      .then(list => { if (live) setEmp(list.find(e => Number(e.id) === Number(slip.employee_id)) || null); })
      .catch(() => {});
    return () => { live = false; };
  }, [company?.id, slip.employee_id, employee]);
  // the full number only when the employee still has the account this payslip was paid to (a newer account
  // never shows on an older payslip — that one shows the masked number it was saved with)
  const sameAccount = !!emp?.bank_account && (!bankMasked || maskId(emp.bank_account) === bankMasked);
  const bankFull = sameAccount ? emp!.bank_account! : null;
  const designation: string = res.designation ?? emp?.job_title ?? '';
  const department: string = res.department ?? emp?.department_name ?? '';
  const idMasked: string = res.idMasked ?? maskId(emp?.national_id) ?? '';
  const idFull: string = emp?.national_id || idMasked;

  if (useLayout && layout) {
    const line = (x: { componentCode: string; amount: number; label?: string }) => ({ name: x.label || componentLabel(x.componentCode), amount: M(x.amount) });
    const onBehalf = stat.filter(s => s.absorbedByEmployer && s.employeeTotal > 0);
    const scheme = (code: string) => stat.find(s => String(s.schemeCode).toUpperCase() === code);
    const cpf = scheme('CPF');
    const mpf = scheme('MPF');
    const shg = stat.find(s => ['CDAC', 'SINDA', 'MBMF', 'ECF'].includes(String(s.schemeCode).toUpperCase()) && s.employeeTotal > 0);
    const n = (x: any) => Number(x) || 0;
    const fields: FieldValues = {
      ...companyFields(company, branding, t?.footerNote),
      employee_name: slip.employee_name || '',
      employee_code: slip.employee_code || '',
      employee_designation: designation,
      employee_department: department,
      employee_id_no: idFull,
      employee_id_no_masked: idMasked,
      bank_name: bankName || '',
      bank_account: bankFull || bankMasked || '',
      bank_account_masked: bankMasked || '',
      period: period ? dayjs(`${period.period_year}-${period.period_month}-01`).format('MMMM YYYY') : '',
      pay_date: period?.pay_date || '',
      gross_pay: M(slip.gross_pay),
      total_deductions: M(slip.total_deductions),
      net_pay: M(slip.net_pay),
      total_employer: M(slip.total_employer),
      cpf_employee: M(n(cpf?.employeeTotal)),
      cpf_employer: M(n(cpf?.employerTotal)),
      cpf_total: M(n(cpf?.employeeTotal) + n(cpf?.employerTotal)),
      mpf_employee: M(n(mpf?.employeeTotal)),
      mpf_employer: M(n(mpf?.employerTotal)),
      mpf_total: M(n(mpf?.employeeTotal) + n(mpf?.employerTotal)),
      sdl: M(n(scheme('SDL')?.employerTotal)),
      shg_name: shg ? (shg.schemeName || shg.schemeCode) : '',
      shg_amount: shg ? M(n(shg.employeeTotal)) : '',
      paid_on_behalf: onBehalf.map(s => `${s.schemeName || s.schemeCode} ${plainAmount(M(s.employeeTotal))}`).join(' · '),
    };
    const lists: ListValues = {
      earnings: (slip.earnings_json || []).map(line),
      deductions: (slip.deductions_json || []).map(line),
      employer: (slip.employer_json || []).map(line),
      statutory: stat.filter(s => n(s.employeeTotal) > 0 || n(s.employerTotal) > 0).map(s => ({
        name: s.schemeName || s.schemeCode,
        employee: M(n(s.employeeTotal)),
        employer: M(n(s.employerTotal)),
        total: M(n(s.employeeTotal) + n(s.employerTotal)),
      })),
    };
    return (
      <div id={domId} style={{ background: '#fff', borderRadius: 8, padding: 24 }}>
        <GridDocument template={layout} fields={fields} lists={lists} logo={branding?.logo_data_uri} />
      </div>
    );
  }

  return (
    <div id={domId} style={{ background: '#fff', borderRadius: 8, padding: 24 }}>
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
            {(t?.showDesignation ?? true) && designation && <tr><td style={{ color: '#666' }}>Designation</td><td style={{ textAlign: 'right' }}>{designation}</td></tr>}
            {t?.showNationalId && idMasked && <tr><td style={{ color: '#666' }}>{nationalIdLabel(company?.country)}</td><td style={{ textAlign: 'right' }}>{t?.nationalIdFull ? idFull : idMasked}</td></tr>}
            {t?.showBankAccount && bankMasked && <tr><td style={{ color: '#666' }}>Bank account</td><td style={{ textAlign: 'right' }}>{[bankName, (t?.bankAccountFull && bankFull) || bankMasked].filter(Boolean).join(' ')}</td></tr>}

            <tr><td colSpan={2} style={{ color: '#888', paddingTop: 10 }}>Earnings</td></tr>
            {slip.earnings_json.map((e, i) => (
              <tr key={i}><td style={{ padding: '2px 0' }}>{e.label || componentLabel(e.componentCode)}</td><td style={{ textAlign: 'right' }}><CellValue text={M(e.amount)} /></td></tr>
            ))}
            <tr><td style={{ borderTop: '1px solid #e2e2e2' }}>Gross Pay</td><td style={{ textAlign: 'right', borderTop: '1px solid #e2e2e2' }}><CellValue text={M(slip.gross_pay)} /></td></tr>

            <tr><td colSpan={2} style={{ color: '#888', paddingTop: 10 }}>Deductions</td></tr>
            {slip.deductions_json.map((d, i) => (
              <tr key={i}><td style={{ padding: '2px 0' }}>{d.label || componentLabel(d.componentCode)}</td><td style={{ textAlign: 'right' }}><CellValue text={M(-d.amount)} /></td></tr>
            ))}
            {slip.deductions_json.length === 0 && <tr><td colSpan={2} style={{ color: '#999' }}>None</td></tr>}
            <tr><td style={{ borderTop: '1px solid #e2e2e2', fontWeight: 700 }}>Net Pay</td><td style={{ textAlign: 'right', borderTop: '1px solid #e2e2e2', fontWeight: 700, color: branding?.accent_color || '#0369a1' }}><CellValue text={M(slip.net_pay)} /></td></tr>
          </tbody>
        </table>

        {stat.some(s => s.absorbedByEmployer && s.employeeTotal > 0) && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#15803d' }}>
            Paid by the company on your behalf: {stat.filter(s => s.absorbedByEmployer && s.employeeTotal > 0)
              .map(s => `${s.schemeName || s.schemeCode} ${plainAmount(M(s.employeeTotal))}`).join(' · ')}
          </div>
        )}
        {stat.some(s => s.employerTotal > 0) && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>
            Employer contributions: {stat.filter(s => s.employerTotal > 0).map(s => `${s.schemeName || s.schemeCode} ${plainAmount(M(s.employerTotal))}`).join(' · ')}
          </div>
        )}
      </DocumentShell>
    </div>
  );
}

export function printPayslip(slip: PayslipRow) {
  const el = document.getElementById('payslip-print');
  if (!el) return;
  const w = window.open('', '_blank', 'width=760,height=950');
  if (!w) { message.error('Allow pop-ups to print'); return; }
  w.document.write(`<html><head><title>Payslip — ${slip.employee_name}</title>
    <style>${PRINT_CSS}</style>
    </head><body>${el.innerHTML}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
