import { supabase } from '../utils/supabase';
import { calculatePayroll } from '../engine';
import type { CountryPackDef } from '../data/country-packs/schema';
import type { EmployeePayrollInput, PayrollPeriod, PayrollRunResult } from '../engine/types';
import { hrService, type Employee } from './hr';
import dayjs from 'dayjs';
import { payrollResidency } from '../data/residency-options';
import { toEngineItems, PAY_ITEM_BY_CODE, isOvertime, type PayItemRow } from '../data/payItems';

/** Country packs authored for the payroll engine. */
const COUNTRY_PACK_LOADERS: Record<string, () => Promise<{ default: CountryPackDef }>> = {
  SG: () => import('../data/country-packs/SG/index'),
  AE: () => import('../data/country-packs/AE/index'),
  SA: () => import('../data/country-packs/SA/index'),
  HK: () => import('../data/country-packs/HK/index'),
};

export const SUPPORTED_PACK_CODES = Object.keys(COUNTRY_PACK_LOADERS);

async function loadCountryPack(code: string): Promise<CountryPackDef> {
  const loader = COUNTRY_PACK_LOADERS[code.toUpperCase()];
  if (!loader) {
    throw new Error(`Country pack for "${code}" is not built yet — available: ${SUPPORTED_PACK_CODES.join(', ')}.`);
  }
  return (await loader()).default;
}

const STATUS_MAP: Record<string, string> = {
  full_time: 'FULL_TIME', part_time: 'PART_TIME', contract: 'FIXED_TERM',
  intern: 'INTERNSHIP', casual: 'CASUAL',
  // directors (owners / shareholder-directors) are left out of end-of-service gratuity
  director: 'DIRECTOR',
};

function toEngineInput(e: Employee, periodEnd: string, items: PayItemRow[] = [], country = 'SG'): EmployeePayrollInput {
  // Fall back to a ~35-year-old if DOB missing, so the run still produces numbers.
  const dob = e.date_of_birth || dayjs(periodEnd).subtract(35, 'year').format('YYYY-MM-DD');
  const hk = (country || 'SG').toUpperCase() === 'HK';
  const residency = hk ? payrollResidency('HK', (e as any).residency_status) : ((e as any).residency_status || 'SC');
  const extra = toEngineItems(items);
  return {
    employeeId: String(e.id),
    name: e.full_name,
    dateOfBirth: dob,
    // no join date: assume an earlier start (in Hong Kong a "new" joiner would wrongly skip their MPF share)
    dateOfJoining: e.join_date || dayjs(periodEnd).subtract(hk ? 1 : 0, 'year').startOf('year').format('YYYY-MM-DD'),
    dateOfLeaving: e.exit_date || undefined,
    employmentStatusCode: STATUS_MAP[e.employment_type] || 'FULL_TIME',
    immigrationStatusCode: residency,
    prStage: (e as any).pr_stage || undefined,
    ethnicity: (e as any).ethnicity || undefined,
    salaryComponents: [{ componentCode: 'BASIC', amount: Number(e.base_salary) || 0 }, ...extra.salaryComponents],
    otherDeductions: extra.otherDeductions,
    ...(extra.statutoryOverride ? { statutoryOverride: extra.statutoryOverride } : {}),
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
  earnings_json: { componentCode: string; amount: number; label?: string }[];
  deductions_json: { componentCode: string; amount: number; label?: string }[];
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
  async run(opts: { companyId: number; countryCode: string; currency: string; year: number; month: number; createdBy?: number; payDate?: string | null }): Promise<{ runId: number; result: PayrollRunResult }> {
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
      // the day salaries actually go out (HR picks it); last day of the month if not given
      payDate: opts.payDate || start.endOf('month').format('YYYY-MM-DD'),
      frequency: 'monthly',
      payYear: year, payMonth: month, payPeriod: month,
    };

    const absorbedSchemes = await statutorySettingsService.absorbedList(companyId);
    const items = await payItemService.listForPeriod(companyId, year, month);
    const itemsFor = (id: number) => items.filter(i => Number(i.employee_id) === Number(id));

    const result = calculatePayroll({
      period, countryPack: pack,
      employees: employees.map(e => toEngineInput(e, period.endDate, itemsFor(e.id), countryCode)),
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
    // re-running a month keeps the bank details each payslip was paid to (not the employee's newer account)
    let paidTo = new Map<number, { bankMasked: string | null; bankName: string | null }>();
    if (existing.data) {
      runId = existing.data.id;
      const old = await supabase.from('payslips').select('employee_id, result_json').eq('run_id', runId);
      paidTo = new Map((old.data || []).filter((p: any) => p.result_json?.bankMasked)
        .map((p: any) => [Number(p.employee_id), { bankMasked: p.result_json.bankMasked, bankName: p.result_json.bankName ?? null }]));
      await supabase.from('payroll_runs').update(runPayload).eq('id', runId);
      await supabase.from('payslips').delete().eq('run_id', runId);
    } else {
      const { data, error } = await supabase.from('payroll_runs').insert(runPayload).select('id').single();
      if (error) throw new Error(error.message);
      runId = data.id;
    }

    const mask = maskId;
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
        result_json: {
          ...r, ...(paidTo.get(Number(r.employeeId)) || { bankMasked: mask(e?.bank_account), bankName: e?.bank_name ?? null }),
          designation: e?.job_title ?? null, department: e?.department_name ?? null, idMasked: mask(e?.national_id),
        },
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

  /** Back to draft, so the run can be calculated again (e.g. after a rule fix). */
  /** The day the salaries actually left the bank (set when they're matched to the bank statement). */
  async setPayDate(runId: number, date: string) {
    const { error } = await supabase.from('payroll_runs').update({ pay_date: date }).eq('id', runId);
    if (error) throw new Error(error.message);
  },
  async reopen(runId: number) {
    const { error } = await supabase.from('payroll_runs').update({ status: 'draft', finalised_at: null }).eq('id', runId);
    if (error) throw new Error(error.message);
  },

  async deleteRun(runId: number) {
    const { error } = await supabase.from('payroll_runs').delete().eq('id', runId);
    if (error) throw new Error(error.message);
  },
};

/** Hide all but the last 4 characters: S1234567A → •••••567A. */
export function maskId(v?: string | null): string | null {
  return v ? String(v).replace(/.(?=.{4})/g, '•') : null;
}

/** Pretty component-code → label. */
export function componentLabel(code: string): string {
  const map: Record<string, string> = {
    BASIC: 'Basic Salary', OVERTIME: 'Overtime', BONUS: 'Bonus', COMMISSION: 'Commission',
    AWS: 'Annual Wage Supplement', DEDUCTION_CPF: 'CPF (Employee)', DEDUCTION_PAYE: 'Income Tax',
    DEDUCTION_SDL: 'SDL', DEDUCTION_SHG: 'Self-Help Group', CPF_EMPLOYER: 'CPF (Employer)',
  };
  if (map[code] || PAY_ITEM_BY_CODE[code]) return map[code] || PAY_ITEM_BY_CODE[code].label;
  // the employer's share of a scheme: COST_MPF_EMPLOYER → "MPF (Employer)"
  const er = code.match(/^COST_(.+)_EMPLOYER$/);
  if (er) return er[1] === 'EOSB' ? 'End-of-service gratuity' : `${er[1].replace(/_/g, ' ')} (Employer)`;
  if (EMPLOYEE_SHARE.has(code)) return `${code.slice(10)} (Employee)`;
  return code.replace(/^DEDUCTION_/, '').replace(/_/g, ' ');
}
/** Schemes with an employee and an employer share, so the employee's line says whose it is. */
const EMPLOYEE_SHARE = new Set(['DEDUCTION_MPF', 'DEDUCTION_GPSSA', 'DEDUCTION_GOSI']);

/** Overtime, allowances, bonuses, reimbursements and deductions for payroll (pay-access users only). */
export const payItemService = {
  /** Fixed monthly items plus the one-off items for this month. */
  async listForPeriod(companyId: number, year: number, month: number): Promise<PayItemRow[]> {
    const { data, error } = await supabase.from('payroll_pay_items').select('*')
      .eq('company_id', companyId)
      .or(`recurring.eq.true,and(period_year.eq.${Number(year)},period_month.eq.${Number(month)})`)
      .order('id');
    if (error) throw new Error(error.message);
    return (data || []) as PayItemRow[];
  },

  async save(row: PayItemRow): Promise<void> {
    const t = PAY_ITEM_BY_CODE[row.item_code];
    if (!t) throw new Error('Unknown pay item');
    const payload = {
      company_id: row.company_id, employee_id: row.employee_id, item_code: row.item_code,
      label: row.label || null, quantity: t.unit && row.quantity != null ? row.quantity : null,
      ...(isOvertime(t.code)
        ? { rate: row.rate != null ? row.rate : null, multiplier: row.multiplier != null ? row.multiplier : null }
        : {}),
      amount: Math.max(0, Math.round((Number(row.amount) || 0) * 100) / 100),
      note: row.note?.trim() || null, recurring: !!row.recurring,
      period_year: row.recurring ? null : row.period_year, period_month: row.recurring ? null : row.period_month,
      updated_at: new Date().toISOString(),
    };
    const q = row.id
      ? supabase.from('payroll_pay_items').update(payload).eq('id', row.id)
      : supabase.from('payroll_pay_items').insert(payload);
    const { error } = await q;
    if (error) throw new Error(error.message);
  },

  async remove(id: number): Promise<void> {
    const { error } = await supabase.from('payroll_pay_items').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};
