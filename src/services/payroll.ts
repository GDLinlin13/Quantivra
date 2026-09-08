import { supabase } from '../utils/supabase';
import { calculatePayroll } from '../engine';
import type { CountryPackDef } from '../data/country-packs/schema';
import type { EmployeePayrollInput, PayrollPeriod, PayrollRunResult } from '../engine/types';
import { hrService, type Employee } from './hr';
import dayjs from 'dayjs';

/** Country packs available to the engine. Only SG is authored so far. */
async function loadCountryPack(code: string): Promise<CountryPackDef> {
  switch (code.toUpperCase()) {
    case 'SG':
      return (await import('../data/country-packs/SG/index')).default;
    default:
      throw new Error(`Country pack for "${code}" is not built yet — only Singapore (SG) is available.`);
  }
}

const STATUS_MAP: Record<string, string> = {
  full_time: 'FULL_TIME', part_time: 'PART_TIME', contract: 'FIXED_TERM',
  intern: 'INTERNSHIP', casual: 'CASUAL',
};

function toEngineInput(e: Employee, periodEnd: string): EmployeePayrollInput {
  // Fall back to a ~35-year-old if DOB missing, so the run still produces numbers.
  const dob = e.date_of_birth || dayjs(periodEnd).subtract(35, 'year').format('YYYY-MM-DD');
  const residency = (e as any).residency_status || 'SC';
  return {
    employeeId: String(e.id),
    name: e.full_name,
    dateOfBirth: dob,
    dateOfJoining: e.join_date || dayjs(periodEnd).startOf('year').format('YYYY-MM-DD'),
    dateOfLeaving: e.exit_date || undefined,
    employmentStatusCode: STATUS_MAP[e.employment_type] || 'FULL_TIME',
    immigrationStatusCode: residency,
    prStage: (e as any).pr_stage || undefined,
    ethnicity: (e as any).ethnicity || undefined,
    salaryComponents: [{ componentCode: 'BASIC', amount: Number(e.base_salary) || 0 }],
  };
}

export interface PayrollRunRow {
  id: number; company_id: number; period_year: number; period_month: number;
  pay_date: string; frequency: string; currency: string; country_code: string;
  status: 'draft' | 'finalised' | 'paid'; engine_version: string | null;
  total_gross: number; total_deductions: number; total_employer: number;
  total_net: number; total_stat_ee: number; total_stat_er: number;
  created_at: string; finalised_at: string | null;
}

export interface PayslipRow {
  id: number; run_id: number; employee_id: number; employee_name: string; employee_code: string | null;
  gross_pay: number; total_deductions: number; total_employer: number; net_pay: number; tax_withheld: number;
  earnings_json: { componentCode: string; amount: number }[];
  deductions_json: { componentCode: string; amount: number }[];
  employer_json: { componentCode: string; amount: number }[];
  statutory_json: any[];
  result_json: any;
  status: string; errors: string[] | null;
}

/** Self-help group schemes an SG company can choose to absorb (pay the employee share of).
 *  CPF is not absorbable — employee and employer each pay their own statutory share. */
export const ABSORBABLE_SCHEMES = [
  { code: 'CDAC', label: 'CDAC', note: 'Chinese Development Assistance Council.' },
  { code: 'SINDA', label: 'SINDA', note: 'Singapore Indian Development Association.' },
  { code: 'MBMF', label: 'MBMF', note: 'Mosque Building & Mendaki Fund.' },
  { code: 'ECF', label: 'ECF', note: 'Eurasian Community Fund.' },
];

export const statutorySettingsService = {
  async get(companyId: number): Promise<Record<string, boolean>> {
    const { data } = await supabase.from('company_statutory_settings').select('scheme_code, absorb_employee').eq('company_id', companyId);
    const map: Record<string, boolean> = {};
    for (const r of data || []) map[r.scheme_code] = r.absorb_employee;
    return map;
  },
  async set(companyId: number, schemeCode: string, absorb: boolean) {
    const { error } = await supabase.from('company_statutory_settings')
      .upsert({ company_id: companyId, scheme_code: schemeCode, absorb_employee: absorb, updated_at: new Date().toISOString() },
        { onConflict: 'company_id,scheme_code' });
    if (error) throw new Error(error.message);
  },
  async absorbedList(companyId: number): Promise<string[]> {
    const allowed = new Set(ABSORBABLE_SCHEMES.map(s => s.code));
    const map = await this.get(companyId);
    return Object.entries(map).filter(([k, v]) => v && allowed.has(k)).map(([k]) => k);
  },
};

export const payrollService = {
  async listRuns(companyId: number): Promise<PayrollRunRow[]> {
    const { data } = await supabase.from('payroll_runs').select('*')
      .eq('company_id', companyId).order('period_year', { ascending: false }).order('period_month', { ascending: false });
    return data || [];
  },

  async getRun(runId: number): Promise<{ run: PayrollRunRow; payslips: PayslipRow[] } | null> {
    const { data: run } = await supabase.from('payroll_runs').select('*').eq('id', runId).maybeSingle();
    if (!run) return null;
    const { data: payslips } = await supabase.from('payslips').select('*').eq('run_id', runId).order('employee_name');
    return { run, payslips: payslips || [] };
  },

  /** Run (or re-run, if still draft) payroll for a period. Returns the run id. */
  async run(opts: { companyId: number; countryCode: string; currency: string; year: number; month: number; createdBy?: number }): Promise<{ runId: number; result: PayrollRunResult }> {
    const { companyId, countryCode, currency, year, month, createdBy } = opts;

    const existing = await supabase.from('payroll_runs').select('id, status')
      .eq('company_id', companyId).eq('period_year', year).eq('period_month', month).eq('frequency', 'monthly').maybeSingle();
    if (existing.data && existing.data.status !== 'draft') {
      throw new Error(`Payroll for ${year}-${String(month).padStart(2, '0')} is already ${existing.data.status} and cannot be re-run.`);
    }

    const pack = await loadCountryPack(countryCode);
    const employees = (await hrService.listEmployees(companyId)).filter(e => e.status === 'active');
    if (employees.length === 0) throw new Error('No active employees to pay.');

    const start = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
    const period: PayrollPeriod = {
      startDate: start.format('YYYY-MM-DD'),
      endDate: start.endOf('month').format('YYYY-MM-DD'),
      payDate: start.endOf('month').format('YYYY-MM-DD'),
      frequency: 'monthly',
      payYear: year, payMonth: month, payPeriod: month,
    };

    const absorbedSchemes = await statutorySettingsService.absorbedList(companyId);

    const result = calculatePayroll({
      period, countryPack: pack,
      employees: employees.map(e => toEngineInput(e, period.endDate)),
      absorbedSchemes,
    });

    // upsert run
    const runPayload = {
      company_id: companyId, period_year: year, period_month: month,
      pay_date: period.payDate, frequency: 'monthly', currency, country_code: countryCode,
      status: 'draft', engine_version: result.trace?.engine.engineVersion ?? null,
      total_gross: result.summary.totalGrossPay,
      total_deductions: result.summary.totalDeductions,
      total_employer: result.summary.totalEmployerCosts,
      total_net: result.summary.totalNetPay,
      total_stat_ee: result.summary.totalStatutoryEmployee,
      total_stat_er: result.summary.totalStatutoryEmployer,
      created_by: createdBy ?? null,
    };
    let runId: number;
    if (existing.data) {
      runId = existing.data.id;
      await supabase.from('payroll_runs').update(runPayload).eq('id', runId);
      await supabase.from('payslips').delete().eq('run_id', runId);
    } else {
      const { data, error } = await supabase.from('payroll_runs').insert(runPayload).select('id').single();
      if (error) throw new Error(error.message);
      runId = data.id;
    }

    const mask = (v?: string | null) => (v ? String(v).replace(/.(?=.{4})/g, '•') : null);
    const empById = new Map(employees.map(e => [String(e.id), e]));
    const slips = result.employees.map(r => {
      const e = empById.get(r.employeeId);
      return {
        run_id: runId, company_id: companyId,
        employee_id: Number(r.employeeId),
        employee_name: r.name,
        employee_code: e?.employee_code ?? null,
        gross_pay: r.grossPay, total_deductions: r.totalDeductions,
        total_employer: r.totalEmployerCosts, net_pay: r.netPay,
        tax_withheld: r.tax?.taxWithheld ?? 0,
        earnings_json: r.earnings, deductions_json: r.deductions, employer_json: r.employerCosts,
        statutory_json: r.statutoryContributions,
        result_json: { ...r, bankMasked: mask(e?.bank_account), bankName: e?.bank_name ?? null },
        status: r.status, errors: r.errors ?? null,
      };
    });
    const { error: slipErr } = await supabase.from('payslips').insert(slips);
    if (slipErr) throw new Error(slipErr.message);

    return { runId, result };
  },

  async finalise(runId: number) {
    const { error } = await supabase.from('payroll_runs')
      .update({ status: 'finalised', finalised_at: new Date().toISOString() }).eq('id', runId);
    if (error) throw new Error(error.message);
  },

  async markPaid(runId: number) {
    const { error } = await supabase.from('payroll_runs').update({ status: 'paid' }).eq('id', runId);
    if (error) throw new Error(error.message);
  },

  async deleteRun(runId: number) {
    const { error } = await supabase.from('payroll_runs').delete().eq('id', runId);
    if (error) throw new Error(error.message);
  },
};

/** Pretty component-code → label. */
export function componentLabel(code: string): string {
  const map: Record<string, string> = {
    BASIC: 'Basic Salary', OVERTIME: 'Overtime', BONUS: 'Bonus', COMMISSION: 'Commission',
    AWS: 'Annual Wage Supplement', DEDUCTION_CPF: 'CPF (Employee)', DEDUCTION_PAYE: 'Income Tax',
    DEDUCTION_SDL: 'SDL', DEDUCTION_SHG: 'Self-Help Group', CPF_EMPLOYER: 'CPF (Employer)',
  };
  return map[code] || code.replace(/^DEDUCTION_/, '').replace(/_/g, ' ');
}
