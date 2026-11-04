// 2026 law data for the second wave of countries: updates for India, New
// Zealand, Canada, UAE, Netherlands and Switzerland (which already had
// built-in packs) and complete packs for Ireland, Spain, Italy, Saudi Arabia,
// Brazil and Mexico. Same conventions as country-law-2026.ts.

import type { CountryPackConfig } from './countries';
import type { CountryLaw2026 } from './country-law-2026';
import { progressive } from './tax-brackets';

type LeaveType = CountryPackConfig['leave']['types'][number];
type Contribution = CountryPackConfig['statutory_contributions'][number];

const wd = (name: string, days: number, extra: Partial<LeaveType> = {}): LeaveType =>
  ({ name, min_days: days, carry_forward: 0, encashable: false, count_method: 'working_days', ...extra });
const weeks = (name: string, w: number, extra: Partial<LeaveType> = {}): LeaveType =>
  ({ name, min_days: w * 5, carry_forward: 0, encashable: false, count_method: 'weeks', ...extra });
const cal = (name: string, days: number, extra: Partial<LeaveType> = {}): LeaveType =>
  ({ name, min_days: days, carry_forward: 0, encashable: false, count_method: 'calendar_days', ...extra });
const c = (scheme_code: string, employee_rate: string, employer_rate: string, notes: string, extra: Partial<Contribution> = {}): Contribution =>
  ({ scheme_code, scheme_name: scheme_code, name: scheme_code, employee_rate, employer_rate, notes, effective_date: '2026-01-01', ...extra });

interface BaseInput {
  code: string; name: string; currency: string; symbol: string; phone: string; timezone: string;
  language: string; secondLanguage?: string; dateFormat?: string; fiscalYear?: string; taxYear?: string;
  frequency?: string; weeklyHours: number; probationMonths: number; noticeDays: number; retirementAge: number;
  restDays?: string; thirteenth?: string; employmentAct: string; privacyLaw: string; retentionYears: number;
  vat: { name: string; rate: number; notes: string }[]; holidays: string[];
  agencies: { name: string; submission_frequency: string; portal: string }[];
  forms: { name: string; frequency: string; deadline: string }[];
  banks: string[]; bankFormat: string; severance: string; notice: string;
  workPasses: string[]; address: string; postal: string; phoneFormat: string; nationalId: string;
  nonResidentRule: string; filing: string;
}

/** A complete pack skeleton for countries with no built-in data. */
function makeBase(b: BaseInput): CountryPackConfig {
  const empTypes = ['Full-Time', 'Part-Time', 'Fixed-Term Contract', 'Internship'];
  return {
    general: { name: b.name, code: b.code, currency: b.currency, currency_symbol: b.symbol, phone_code: b.phone, timezone: b.timezone,
      primary_language: b.language, secondary_language: b.secondLanguage, date_format: b.dateFormat || 'DD/MM/YYYY', time_format: '24h',
      week_starts_on: 'Monday', financial_year: b.fiscalYear || '01-01', tax_year: b.taxYear || '01-01',
      default_payroll_frequency: b.frequency || 'Monthly', payslip_language: b.language },
    employment_types: empTypes.map(name => ({ name, enabled: true })),
    employee_categories: [
      { name: 'Citizen / permanent resident', statutory_treatment: 'All statutory contributions apply' },
      { name: 'Foreign employee', statutory_treatment: 'Depends on residency, work permit and treaties' },
    ],
    employment: { max_weekly_hours: b.weeklyHours, probation_months: b.probationMonths, notice_period_days: b.noticeDays,
      retirement_age: b.retirementAge, rest_days: b.restDays || '1–2 days/week', employment_types: empTypes, contract_types: ['Permanent', 'Fixed term'] },
    payroll: { frequencies: [b.frequency || 'Monthly'], minimum_wage: 0, payroll_cutoff: 'Last day of month', payroll_lock_date: '5th of next month',
      thirteenth_month: b.thirteenth || 'Not mandatory', bank_file_format: b.bankFormat },
    payroll_components: {
      earnings: [{ name: 'Basic Salary', is_taxable: true }, { name: 'Overtime', is_taxable: true }, { name: 'Allowance', is_taxable: true }, { name: 'Bonus', is_taxable: true }],
      deductions: [{ name: 'Income Tax Withholding', is_taxable: false, is_mandatory: true }, { name: 'Social Security (employee)', is_taxable: false, is_mandatory: true }, { name: 'Other Deduction', is_taxable: false }],
    },
    statutory_contributions: [],
    income_tax: { brackets: [], resident_rules: '', non_resident_rate: undefined, filing_frequency: b.filing, form_types: [] },
    sales_tax: b.vat,
    leave: { types: [] },
    public_holidays: b.holidays,
    government_agencies: b.agencies,
    government_forms: b.forms,
    accounting: { fiscal_year_start: b.fiscalYear || '01-01', default_tax_code: 'STD', invoice_number_format: 'INV-{YYYY}-{0000}', payment_terms: 'Net 30',
      tax_codes: b.vat.map((v, i) => ({ code: i === 0 ? 'STD' : `R${i}`, name: v.name, rate: v.rate, is_default: i === 0 })) },
    banking: { bank_file_format: b.bankFormat, supported_banks: b.banks, payment_methods: ['Bank transfer'] },
    compliance: { employment_act: b.employmentAct, record_retention_years: b.retentionYears, payslip_requirements: 'Itemised payslip each pay period', privacy_law: b.privacyLaw },
    termination: { notice_period: b.notice, severance_pay: b.severance, last_pay_rules: 'Final pay including accrued leave on termination' },
    foreign_workers: { work_pass_types: b.workPasses, levy: '—', quota: '—' },
    localisation: { address_format: b.address, postal_code_format: b.postal, phone_format: b.phoneFormat, national_id_format: b.nationalId },
    document_numbering: [{ entity: 'invoice', format: 'INV-{YYYY}-{0000}' }],
  };
}

export const COUNTRY_LAW_2026_MORE: Record<string, CountryLaw2026> = {
  IN: {
    effective_from: '2026-04-01',
    sources: ['https://www.incometax.gov.in', 'https://www.epfindia.gov.in', 'https://labour.gov.in'],
    verify: ['State minimum wages, professional tax and labour welfare fund vary by state', 'Wage definition under the new Labour Codes (in force from Nov 2025)'],
    minimum_wage: 178, minimum_wage_note: 'National floor ₹178/day; each state sets higher scheduled rates',
    retirement_age: 58,
    statutory_contributions: [
      c('EPF', '12%', '12%', 'On basic + DA up to ₹15,000/month (employer 8.33% to EPS, rest to EPF)', { max_earnings_ceiling: 15000, effective_date: '2026-04-01' }),
      c('ESI', '0.75%', '3.25%', 'For wages up to ₹21,000/month', { max_earnings_ceiling: 21000, effective_date: '2026-04-01' }),
      c('Professional Tax', 'Up to ₹2,500/yr', '0%', 'State-specific', { effective_date: '2026-04-01' }),
      c('Labour Welfare Fund', 'Varies', 'Varies', 'State-specific', { effective_date: '2026-04-01' }),
    ],
    tax_brackets: progressive([[0, 0], [400000, 5], [800000, 10], [1200000, 15], [1600000, 20], [2000000, 25], [2400000, 30]]),
    tax_notes: 'New (default) regime FY2026–27; rebate makes income up to ₹12 lakh tax-free (₹12.75 lakh salaried with standard deduction). Plus 4% health & education cess.',
    leave: [
      wd('Earned Leave', 12, { carry_forward: 30, encashable: true }), wd('Sick Leave', 12), wd('Casual Leave', 8),
      weeks('Maternity Leave', 26), wd('Paternity Leave', 0), wd('Unpaid Leave', 0),
    ],
  },

  NZ: {
    effective_from: '2026-04-01',
    sources: ['https://www.employment.govt.nz', 'https://www.ird.govt.nz'],
    verify: ['ACC earners\' levy rate for 2026–27'],
    minimum_wage: 23.95, minimum_wage_note: 'Adult minimum NZ$23.95/hour from 1 April 2026',
    retirement_age: 65,
    statutory_contributions: [
      c('KiwiSaver', '3.5%', '3.5%', 'Default rate 3.5% each from 1 April 2026 (employee may choose 3–10%); ESCT on employer share', { effective_date: '2026-04-01' }),
      c('ACC Earners\' Levy', '1.75%', '0%', 'On earnings up to the annual maximum', { effective_date: '2026-04-01' }),
      c('PAYE', '10.5–39%', '0%', 'Per tax code', { effective_date: '2026-04-01' }),
    ],
    tax_brackets: progressive([[0, 10.5], [15600, 17.5], [53500, 30], [78100, 33], [180000, 39]]),
    tax_notes: 'Rates from 31 July 2024.',
    leave: [
      wd('Annual Leave', 20, { carry_forward: 0 }), wd('Sick Leave', 10, { carry_forward: 10 }), wd('Bereavement Leave', 3),
      wd('Family Violence Leave', 10), weeks('Paid Parental Leave (Government)', 26), weeks('Extended Parental Leave (unpaid)', 52), wd('Unpaid Leave', 0),
    ],
  },

  CA: {
    effective_from: '2026-01-01',
    sources: ['https://www.canada.ca/en/revenue-agency (T4127)', 'https://www.everstonecpa.com/tax-update/payroll-figures-2026'],
    verify: ['Provincial income tax, minimum wage and employment standards vary by province; federal shown'],
    minimum_wage: 18.10, minimum_wage_note: 'Federal minimum C$18.10/hour from 1 April 2026 (federally regulated sectors); provinces set their own',
    retirement_age: 65,
    statutory_contributions: [
      c('CPP', '5.95%', '5.95%', 'On earnings C$3,500–74,600 (YMPE); CPP2 4% each on C$74,600–85,000', { min_earnings_threshold: 3500, max_earnings_ceiling: 74600 }),
      c('EI', '1.63%', '2.282%', 'Employer 1.4 × employee; maximum insurable earnings C$68,900 (Quebec: 1.30%)', { max_earnings_ceiling: 68900 }),
    ],
    tax_brackets: progressive([[0, 14], [58523, 20.5], [117045, 26], [181440, 29], [258482, 33]]),
    tax_notes: 'Federal rates 2026; provincial tax is added on top.',
    leave: [
      wd('Vacation', 10, { carry_forward: 0 }), wd('Medical Leave (paid, federal)', 10), wd('Personal Leave', 5),
      weeks('Maternity Leave', 17), weeks('Parental Leave', 63, { allow_single_days: false }), wd('Bereavement Leave', 10), wd('Unpaid Leave', 0),
    ],
  },

  AE: {
    effective_from: '2026-01-01',
    sources: ['https://www.mohre.gov.ae', 'https://gpssa.gov.ae'],
    verify: ['GPSSA rates for GCC nationals'],
    minimum_wage: 0, minimum_wage_note: 'No general minimum wage',
    statutory_contributions: [
      c('GPSSA Pension (UAE nationals)', '5%', '12.5%', 'Private sector; government adds 2.5%. Contribution salary AED 1,000–50,000', { max_earnings_ceiling: 50000 }),
      c('End-of-Service Gratuity', '0%', 'Accrual', '21 days\' basic pay per year for first 5 years, 30 days thereafter (expatriates)'),
      c('Unemployment Insurance (ILOE)', 'AED 5–10/month', '0%', 'Mandatory for employees'),
    ],
    tax_brackets: progressive([[0, 0]]),
    tax_notes: 'No personal income tax.',
    leave: [
      cal('Annual Leave', 30, { carry_forward: 0 }), cal('Sick Leave', 90), cal('Maternity Leave', 60),
      wd('Parental Leave', 5), wd('Bereavement Leave', 5), wd('Study Leave', 10), wd('Unpaid Leave', 0),
    ],
  },

  NL: {
    effective_from: '2026-07-01',
    sources: ['https://www.rijksoverheid.nl', 'https://www.belastingdienst.nl', 'https://whichpayroll.com/countries/netherlands/global-payroll'],
    verify: ['Box 1 first-band rate (35.70% vs 35.75%)', 'Employer premium rates (sector-specific)'],
    minimum_wage: 14.99, minimum_wage_note: '€14.99/hour (21+) from 1 July 2026 (was €14.71 from January)',
    retirement_age: 67,
    statutory_contributions: [
      c('Unemployment (WW)', '0%', '2.74% / 7.74%', 'Low rate for permanent contracts, high for flexible; ceiling €79,409/yr', { max_earnings_ceiling: 79409 }),
      c('Disability (WIA/Aof)', '0%', 'About 6.3%', 'Ceiling €79,409/yr', { max_earnings_ceiling: 79409 }),
      c('Health Insurance Act (Zvw)', '0%', '6.1%', 'Employer levy; ceiling €79,409/yr', { max_earnings_ceiling: 79409 }),
      c('Wage tax & national insurance', 'Per Box 1 table', '0%', 'Combined wage tax and AOW/Anw/Wlz premiums in the first bands'),
    ],
    tax_brackets: progressive([[0, 35.75], [38883, 37.56], [79137, 49.5]]),
    tax_notes: 'Box 1 2026 (below AOW age), including national insurance premiums in the first band.',
    leave: [
      wd('Annual Leave', 20, { carry_forward: 0 }), weeks('Sick Pay (70%)', 104, { allow_single_days: true }),
      weeks('Pregnancy & Maternity Leave', 16), weeks('Partner Leave', 6, { allow_single_days: true }),
      weeks('Parental Leave', 26, { allow_single_days: true }), wd('Unpaid Leave', 0),
    ],
  },

  CH: {
    effective_from: '2026-01-01',
    sources: ['https://www.ahv-iv.ch', 'https://www.bsv.admin.ch', 'https://www.estv.admin.ch'],
    verify: ['BVG coordination deduction and entry threshold for 2026', 'Federal tax schedule indexation for 2026', 'Cantonal minimum wages and taxes'],
    minimum_wage: 0, minimum_wage_note: 'No federal minimum; cantonal minimums (e.g. Geneva, Neuchâtel, Basel-Stadt)',
    retirement_age: 65,
    statutory_contributions: [
      c('AHV/IV/EO', '5.3%', '5.3%', '10.6% total, no ceiling'),
      c('Unemployment (ALV)', '1.1%', '1.1%', 'On salary up to CHF 148,200/yr', { max_earnings_ceiling: 148200 }),
      c('Occupational Pension (BVG)', '≥ half', '≥ half', 'Age-related credits 7–18%; coordination deduction CHF 26,460; entry threshold CHF 22,680', { min_earnings_threshold: 22680 }),
      c('Accident Insurance (UVG)', 'Non-occupational', 'Occupational', 'Insured salary up to CHF 148,200/yr', { max_earnings_ceiling: 148200 }),
      c('Family Allowance Fund', '0%', 'About 1–3%', 'Cantonal'),
    ],
    tax_brackets: progressive([[0, 0], [15200, 0.77], [33200, 0.88], [43500, 2.64], [58000, 2.97], [76100, 5.94],
      [82000, 6.6], [108800, 8.8], [141500, 11], [184900, 13.2], [793400, 11.5]]),
    tax_notes: 'Federal direct tax, single person (above CHF 793,400 a flat 11.5% applies to the whole income). Cantonal and municipal taxes are added and usually larger.',
    leave: [
      wd('Annual Leave', 20, { carry_forward: 0 }), weeks('Maternity Leave', 14), wd('Paternity Leave', 10),
      wd('Care Leave', 3), wd('Unpaid Leave', 0),
    ],
  },

  IE: {
    effective_from: '2026-10-01',
    sources: ['https://www.citizensinformation.ie', 'https://www.revenue.ie', 'https://brightsg.com/blog/my-future-fund-prsi-budget-2026/'],
    verify: ['PRSI rates from 1 October 2026 (employee 4.35%, employer 11.4% / 9.15%)', 'USC band limits for 2026'],
    minimum_wage: 14.15, minimum_wage_note: '€14.15/hour (20+) from 1 January 2026',
    base: makeBase({
      code: 'IE', name: 'Ireland', currency: 'EUR', symbol: '€', phone: '+353', timezone: 'Europe/Dublin', language: 'English', secondLanguage: 'Irish',
      weeklyHours: 48, probationMonths: 6, noticeDays: 7, retirementAge: 66, employmentAct: 'Organisation of Working Time Act 1997; Payment of Wages Act 1991',
      privacyLaw: 'GDPR / Data Protection Act 2018', retentionYears: 6, filing: 'Real-time (PAYE Modernisation) + annual',
      vat: [{ name: 'VAT Standard', rate: 23, notes: '' }, { name: 'VAT Reduced', rate: 13.5, notes: '' }, { name: 'VAT Second Reduced', rate: 9, notes: '' }],
      holidays: ["New Year's Day", "St Brigid's Day", "St Patrick's Day", 'Easter Monday', 'May Bank Holiday', 'June Bank Holiday', 'August Bank Holiday', 'October Bank Holiday', 'Christmas Day', "St Stephen's Day"],
      agencies: [{ name: 'Revenue', submission_frequency: 'Each pay date (payroll submission)', portal: 'https://www.ros.ie' }],
      forms: [{ name: 'Payroll submission (PSR)', frequency: 'Each pay date', deadline: 'On or before pay date' }, { name: 'Monthly return / payment', frequency: 'Monthly', deadline: '14th (23rd via ROS)' }],
      banks: ['AIB', 'Bank of Ireland', 'PTSB'], bankFormat: 'SEPA XML', severance: 'Statutory redundancy: 2 weeks\' pay per year of service + 1 week (weekly pay cap €600)',
      notice: '1 week (13 weeks–2 years) up to 8 weeks (15+ years)', workPasses: ['Critical Skills Employment Permit', 'General Employment Permit', 'Stamp 4'],
      address: 'Street, Town, County, Eircode', postal: 'Eircode (A65 F4E2)', phoneFormat: '+353 8x xxx xxxx', nationalId: 'PPSN (1234567TW)',
      nonResidentRule: 'Taxed on Irish-source employment income',
    }),
    statutory_contributions: [
      c('PRSI Class A (employee)', '4.35%', '0%', 'From 1 Oct 2026 (4.2% before); employees earning ≤ €352/week exempt', { effective_date: '2026-10-01' }),
      c('PRSI Class A (employer)', '0%', '11.4%', '9.15% where weekly pay ≤ €552; from 1 Oct 2026', { effective_date: '2026-10-01' }),
      c('USC', '0.5–8%', '0%', '0.5% to €12,012; 2% to €28,700; 3% to €70,044; 8% above (exempt if income ≤ €13,000)'),
      c('MyFutureFund (auto-enrolment)', '1.5%', '1.5%', 'From 1 Jan 2026 for employees 23–60 earning €20,000+ not in a pension; State adds 0.5%; rises to 6% by 2036', { max_earnings_ceiling: 80000 }),
    ],
    tax_brackets: progressive([[0, 20], [44000, 40]]),
    tax_notes: 'Single person 2026: 20% on first €44,000, 40% above, less tax credits (personal €2,000 + employee €2,000).',
    leave: [
      wd('Annual Leave', 20, { carry_forward: 0 }), wd('Statutory Sick Leave', 5), weeks('Maternity Leave', 26),
      weeks('Paternity Leave', 2), weeks("Parent's Leave", 9, { allow_single_days: true }), weeks('Parental Leave (unpaid)', 26, { allow_single_days: true }),
      wd('Force Majeure Leave', 3), wd('Unpaid Leave', 0),
    ],
  },

  ES: {
    effective_from: '2026-01-01',
    sources: ['https://www.mites.gob.es', 'https://www.seg-social.es', 'https://sede.agenciatributaria.gob.es'],
    verify: ['Maximum contribution base for 2026', 'Regional IRPF rates differ; combined general scale shown'],
    minimum_wage: 1221, minimum_wage_note: 'SMI €1,221/month in 14 payments (€17,094/year) for 2026',
    base: makeBase({
      code: 'ES', name: 'Spain', currency: 'EUR', symbol: '€', phone: '+34', timezone: 'Europe/Madrid', language: 'Spanish',
      weeklyHours: 40, probationMonths: 6, noticeDays: 15, retirementAge: 66, thirteenth: 'Two extra payments (pagas extra) customary — salary often paid in 14 instalments',
      employmentAct: 'Estatuto de los Trabajadores', privacyLaw: 'GDPR / LOPDGDD', retentionYears: 4, filing: 'Quarterly (Modelo 111) + annual (Modelo 190)',
      vat: [{ name: 'IVA General', rate: 21, notes: '' }, { name: 'IVA Reducido', rate: 10, notes: '' }, { name: 'IVA Superreducido', rate: 4, notes: '' }],
      holidays: ['Año Nuevo', 'Epifanía', 'Viernes Santo', 'Fiesta del Trabajo', 'Asunción', 'Fiesta Nacional', 'Todos los Santos', 'Día de la Constitución', 'Inmaculada Concepción', 'Navidad', '+ regional and local holidays (14 in total)'],
      agencies: [{ name: 'Seguridad Social (Sistema RED)', submission_frequency: 'Monthly', portal: 'https://www.seg-social.es' }, { name: 'Agencia Tributaria', submission_frequency: 'Quarterly / annual', portal: 'https://sede.agenciatributaria.gob.es' }],
      forms: [{ name: 'Modelo 111 (IRPF withholding)', frequency: 'Quarterly', deadline: '20th of the month after the quarter' }, { name: 'Modelo 190', frequency: 'Annual', deadline: '31 January' }, { name: 'SILTRA social security settlement', frequency: 'Monthly', deadline: 'End of following month' }],
      banks: ['Santander', 'BBVA', 'CaixaBank', 'Sabadell'], bankFormat: 'SEPA XML (Norma 34)', severance: 'Unfair dismissal: 33 days\' pay per year (max 24 months); objective dismissal: 20 days per year (max 12 months)',
      notice: '15 days', workPasses: ['Highly Qualified Professional', 'EU Blue Card', 'Work & residence permit'],
      address: 'Calle, número, piso, código postal, ciudad, provincia', postal: '5 digits', phoneFormat: '+34 6xx xxx xxx', nationalId: 'DNI / NIE (X1234567L)',
      nonResidentRule: 'Non-residents: 24% (19% for EU/EEA residents)',
    }),
    statutory_contributions: [
      c('Social Security – common contingencies', '4.7%', '23.6%', 'On contribution base; maximum base about €5,101/month in 2026', { max_earnings_ceiling: 5101.2 }),
      c('Unemployment', '1.55%', '5.5%', 'Permanent contracts (higher for fixed-term)'),
      c('Vocational Training', '0.1%', '0.6%', ''),
      c('FOGASA', '0%', '0.2%', 'Wage guarantee fund'),
      c('MEI (intergenerational equity)', '0.15%', '0.75%', '0.9% total in 2026'),
      c('Work accident (AT/EP)', '0%', 'About 1.5%', 'By activity'),
    ],
    tax_brackets: progressive([[0, 19], [12450, 24], [20200, 30], [35200, 37], [60000, 45], [300000, 47]]),
    tax_notes: 'Combined state + standard regional IRPF scale; each region sets its own half.',
    leave: [
      wd('Annual Leave (Vacaciones)', 22, { carry_forward: 0 }), weeks('Birth & Childcare Leave (mother)', 19),
      weeks('Birth & Childcare Leave (other parent)', 19), cal('Marriage Leave', 15), wd('Bereavement Leave', 2), wd('Unpaid Leave', 0),
    ],
  },

  IT: {
    effective_from: '2026-01-01',
    sources: ['https://www.agenziaentrate.gov.it', 'https://www.inps.it'],
    verify: ['INPS rates depend on sector and company size (CCNL)', 'Regional and municipal IRPEF surcharges'],
    minimum_wage: 0, minimum_wage_note: 'No statutory minimum; set by national collective agreements (CCNL)',
    base: makeBase({
      code: 'IT', name: 'Italy', currency: 'EUR', symbol: '€', phone: '+39', timezone: 'Europe/Rome', language: 'Italian',
      weeklyHours: 40, probationMonths: 6, noticeDays: 30, retirementAge: 67, thirteenth: '13th month (tredicesima) mandatory; 14th common under many CCNLs',
      employmentAct: 'Codice Civile, Statuto dei Lavoratori, CCNL', privacyLaw: 'GDPR / Codice Privacy', retentionYears: 10, filing: 'Monthly F24 + annual Certificazione Unica / 770',
      vat: [{ name: 'IVA Ordinaria', rate: 22, notes: '' }, { name: 'IVA Ridotta', rate: 10, notes: '' }, { name: 'IVA Ridotta', rate: 5, notes: '' }, { name: 'IVA Minima', rate: 4, notes: '' }],
      holidays: ['Capodanno', 'Epifania', 'Pasquetta', 'Festa della Liberazione', 'Festa del Lavoro', 'Festa della Repubblica', 'Ferragosto', 'Ognissanti', 'San Francesco (4 Oct, from 2026)', 'Immacolata', 'Natale', 'Santo Stefano', '+ patron saint day'],
      agencies: [{ name: 'INPS', submission_frequency: 'Monthly (UniEmens)', portal: 'https://www.inps.it' }, { name: 'Agenzia delle Entrate', submission_frequency: 'Monthly F24 / annual', portal: 'https://www.agenziaentrate.gov.it' }, { name: 'INAIL', submission_frequency: 'Annual', portal: 'https://www.inail.it' }],
      forms: [{ name: 'F24 (taxes & contributions)', frequency: 'Monthly', deadline: '16th of following month' }, { name: 'Certificazione Unica (CU)', frequency: 'Annual', deadline: '16 March' }, { name: 'Modello 770', frequency: 'Annual', deadline: '31 October' }],
      banks: ['Intesa Sanpaolo', 'UniCredit', 'Banco BPM'], bankFormat: 'SEPA XML (CBI)', severance: 'TFR: about 6.91% of annual pay accrued each year, paid on leaving',
      notice: 'Per CCNL (typically 15 days–4 months)', workPasses: ['EU Blue Card', 'Work permit (Decreto Flussi)'],
      address: 'Via, numero civico, CAP, città, provincia', postal: '5 digits (CAP)', phoneFormat: '+39 3xx xxx xxxx', nationalId: 'Codice Fiscale (RSSMRA80A01H501U)',
      nonResidentRule: 'Non-residents taxed on Italian-source income at IRPEF rates',
    }),
    statutory_contributions: [
      c('INPS pension & social insurance', '9.19%', 'About 30%', 'Typical for industry/commerce; employee 9.49% above about €56,000; varies by CCNL and company size'),
      c('INAIL (work accident)', '0%', 'Varies', 'By risk class'),
      c('TFR (severance accrual)', '0%', '6.91%', 'Accrued, not paid monthly'),
    ],
    tax_brackets: progressive([[0, 23], [28000, 33], [50000, 43]]),
    tax_notes: 'IRPEF 2026 (middle band cut from 35% to 33%). Plus regional (1.23–3.33%) and municipal (0–0.9%) surcharges.',
    leave: [
      wd('Annual Leave (Ferie)', 20, { carry_forward: 0 }), cal('Maternity Leave', 150), wd('Paternity Leave', 10),
      weeks('Parental Leave', 26, { allow_single_days: true }), wd('Marriage Leave', 15), wd('Unpaid Leave', 0),
    ],
  },

  SA: {
    effective_from: '2026-07-01',
    sources: ['https://www.gosi.gov.sa', 'https://www.hrsd.gov.sa'],
    verify: ['GOSI annuity rate for employees under the new system (rising 0.5 pt each July to 11% by 2028)'],
    minimum_wage: 4000, minimum_wage_note: 'SAR 4,000/month for Saudi nationals to count fully for Nitaqat; no general minimum for expatriates',
    base: makeBase({
      code: 'SA', name: 'Saudi Arabia', currency: 'SAR', symbol: 'SAR', phone: '+966', timezone: 'Asia/Riyadh', language: 'Arabic', secondLanguage: 'English',
      weeklyHours: 48, probationMonths: 3, noticeDays: 60, retirementAge: 60, restDays: 'Friday (and usually Saturday)',
      employmentAct: 'Saudi Labour Law (amended 2025)', privacyLaw: 'Personal Data Protection Law (PDPL)', retentionYears: 10, filing: 'No personal income tax',
      vat: [{ name: 'VAT', rate: 15, notes: 'Standard rate' }],
      holidays: ['Founding Day (22 Feb)', 'Eid al-Fitr (4 days)', 'Eid al-Adha (4 days)', 'National Day (23 Sep)'],
      agencies: [{ name: 'GOSI', submission_frequency: 'Monthly', portal: 'https://www.gosi.gov.sa' }, { name: 'Mudad / WPS', submission_frequency: 'Monthly', portal: 'https://mudad.com.sa' }, { name: 'Qiwa', submission_frequency: 'As needed', portal: 'https://qiwa.sa' }],
      forms: [{ name: 'GOSI contributions', frequency: 'Monthly', deadline: '15th of following month' }, { name: 'WPS salary file (Mudad)', frequency: 'Monthly', deadline: 'Within salary due date' }],
      banks: ['Al Rajhi Bank', 'Saudi National Bank', 'Riyad Bank', 'SAB'], bankFormat: 'WPS (Mudad / SARIE)', severance: 'End-of-service award: half a month\'s pay per year for the first 5 years, one month per year after',
      notice: '60 days (monthly paid), 30 days (others)', workPasses: ['Work visa / Iqama', 'Premium Residency'],
      address: 'Building no., street, district, city, postal code (National Address)', postal: '5 digits + 4', phoneFormat: '+966 5x xxx xxxx', nationalId: 'National ID / Iqama (10 digits)',
      nonResidentRule: 'No personal income tax',
    }),
    statutory_contributions: [
      c('GOSI Annuities (Saudi, existing)', '9%', '9%', 'Employees insured before 3 Jul 2024; contribution wage SAR 1,500–45,000', { min_earnings_threshold: 1500, max_earnings_ceiling: 45000, effective_date: '2026-07-01' }),
      c('GOSI Annuities (Saudi, new system)', '10%', '10%', 'New entrants from 3 Jul 2024: 9.5% from Jul 2025, 10% from Jul 2026, rising to 11% by 2028', { max_earnings_ceiling: 45000, effective_date: '2026-07-01' }),
      c('SANED (unemployment, Saudi)', '0.75%', '0.75%', '', { max_earnings_ceiling: 45000, effective_date: '2026-07-01' }),
      c('Occupational Hazards', '0%', '2%', 'All employees, Saudi and expatriate', { max_earnings_ceiling: 45000, effective_date: '2026-07-01' }),
    ],
    tax_brackets: progressive([[0, 0]]),
    tax_notes: 'No personal income tax.',
    leave: [
      wd('Annual Leave', 21, { carry_forward: 0 }), cal('Sick Leave', 120), weeks('Maternity Leave', 12),
      wd('Paternity Leave', 3), wd('Marriage Leave', 5), wd('Bereavement Leave', 5), wd('Unpaid Leave', 0),
    ],
  },

  BR: {
    effective_from: '2026-01-01',
    sources: ['https://www.gov.br/inss', 'https://www.gov.br/receitafederal', 'https://blog.convenia.com.br/nova-tabela-inss/'],
    verify: ['IRRF monthly table with the 2026 reduction for income up to R$7,350'],
    minimum_wage: 1621, minimum_wage_note: 'R$1,621/month from 1 January 2026 (Decree 12,797/2025)',
    base: makeBase({
      code: 'BR', name: 'Brazil', currency: 'BRL', symbol: 'R$', phone: '+55', timezone: 'America/Sao_Paulo', language: 'Portuguese',
      weeklyHours: 44, probationMonths: 3, noticeDays: 30, retirementAge: 65, thirteenth: '13th salary mandatory (paid in two instalments by 20 December)',
      employmentAct: 'CLT (Consolidação das Leis do Trabalho)', privacyLaw: 'LGPD', retentionYears: 5, filing: 'Monthly via eSocial / EFD-Reinf / DCTFWeb',
      vat: [{ name: 'ICMS (state)', rate: 18, notes: 'Typical; varies by state' }, { name: 'ISS (municipal services)', rate: 5, notes: '2–5%' }],
      holidays: ['Confraternização Universal', 'Carnaval (optional)', 'Sexta-feira Santa', 'Tiradentes', 'Dia do Trabalho', 'Corpus Christi (optional)', 'Independência', 'Nossa Senhora Aparecida', 'Finados', 'Proclamação da República', 'Consciência Negra', 'Natal'],
      agencies: [{ name: 'eSocial', submission_frequency: 'Monthly / per event', portal: 'https://www.gov.br/esocial' }, { name: 'Receita Federal (DCTFWeb)', submission_frequency: 'Monthly', portal: 'https://www.gov.br/receitafederal' }, { name: 'Caixa (FGTS Digital)', submission_frequency: 'Monthly', portal: 'https://www.gov.br/trabalho-e-emprego' }],
      forms: [{ name: 'DCTFWeb (INSS & IRRF)', frequency: 'Monthly', deadline: '20th of following month' }, { name: 'FGTS Digital', frequency: 'Monthly', deadline: '20th of following month' }, { name: 'Informe de Rendimentos', frequency: 'Annual', deadline: 'End of February' }],
      banks: ['Itaú', 'Bradesco', 'Banco do Brasil', 'Caixa', 'Santander Brasil'], bankFormat: 'CNAB 240', severance: 'Dismissal without cause: 40% fine on FGTS balance + notice + pro-rata 13th and vacation',
      notice: '30 days + 3 days per year of service (max 90 days)', workPasses: ['Temporary residence for work', 'Permanent residence'],
      address: 'Rua, número, complemento, bairro, cidade – UF, CEP', postal: 'CEP 00000-000', phoneFormat: '+55 11 9xxxx-xxxx', nationalId: 'CPF (000.000.000-00)',
      nonResidentRule: 'Non-residents: 25% withholding on Brazilian-source salary',
    }),
    statutory_contributions: [
      c('INSS (employee)', '7.5–14%', '0%', 'Progressive: 7.5% / 9% / 12% / 14%; ceiling R$8,475.55 (max R$988.09)', { max_earnings_ceiling: 8475.55 }),
      c('INSS (employer)', '0%', '20%', 'Plus RAT/SAT 1–3% and third-party contributions (~5.8%)'),
      c('FGTS', '0%', '8%', 'Severance fund deposit'),
    ],
    tax_brackets: progressive([[0, 0], [2428.81, 7.5], [2826.66, 15], [3751.06, 22.5], [4664.69, 27.5]]),
    tax_notes: 'Monthly IRRF table; from 2026 a reduction makes income up to R$5,000/month tax-free, phasing out up to R$7,350.',
    leave: [
      cal('Vacation (Férias)', 30, { carry_forward: 0 }), cal('Maternity Leave', 120), cal('Paternity Leave', 5),
      cal('Marriage Leave', 3), cal('Bereavement Leave', 2), wd('Unpaid Leave', 0),
    ],
  },

  MX: {
    effective_from: '2026-01-01',
    sources: ['https://www.gob.mx/conasami', 'https://www.imss.gob.mx', 'https://www.sat.gob.mx'],
    verify: ['UMA value for 2026 (updated each February)', 'ISR tables (annual figures shown)', 'Employer retirement (cesantía) rate by salary band'],
    minimum_wage: 315.04, minimum_wage_note: 'General zone MX$315.04/day from 1 Jan 2026; Northern Border Zone MX$440.87',
    base: makeBase({
      code: 'MX', name: 'Mexico', currency: 'MXN', symbol: 'MX$', phone: '+52', timezone: 'America/Mexico_City', language: 'Spanish',
      frequency: 'Fortnightly', weeklyHours: 48, probationMonths: 1, noticeDays: 0, retirementAge: 65, thirteenth: 'Aguinaldo: at least 15 days\' pay by 20 December',
      employmentAct: 'Ley Federal del Trabajo', privacyLaw: 'Ley Federal de Protección de Datos Personales', retentionYears: 5, filing: 'Monthly ISR withholding + annual',
      vat: [{ name: 'IVA', rate: 16, notes: '8% in the northern border region' }],
      holidays: ['Año Nuevo', 'Día de la Constitución (1st Mon Feb)', 'Natalicio de Benito Juárez (3rd Mon Mar)', 'Día del Trabajo', 'Independencia', 'Revolución (3rd Mon Nov)', 'Navidad'],
      agencies: [{ name: 'IMSS (IDSE / SUA)', submission_frequency: 'Monthly / bimonthly', portal: 'https://www.imss.gob.mx' }, { name: 'SAT', submission_frequency: 'Monthly', portal: 'https://www.sat.gob.mx' }, { name: 'INFONAVIT', submission_frequency: 'Bimonthly', portal: 'https://portalempresarial.infonavit.org.mx' }],
      forms: [{ name: 'ISR withholding', frequency: 'Monthly', deadline: '17th of following month' }, { name: 'IMSS contributions', frequency: 'Monthly', deadline: '17th of following month' }, { name: 'CFDI payroll receipts', frequency: 'Each payment', deadline: 'At payment' }],
      banks: ['BBVA México', 'Banorte', 'Santander México', 'Citibanamex'], bankFormat: 'Bank-specific layout', severance: 'Unjustified dismissal: 3 months\' pay + 20 days per year + seniority premium (12 days per year, capped)',
      notice: 'Not required by law', workPasses: ['Temporary resident with work permit', 'Permanent resident'],
      address: 'Calle, número, colonia, código postal, municipio, estado', postal: '5 digits', phoneFormat: '+52 55 xxxx xxxx', nationalId: 'CURP / RFC',
      nonResidentRule: 'Non-residents: 0% / 15% / 30% on Mexican-source salary by amount',
    }),
    statutory_contributions: [
      c('IMSS (employee)', 'About 2.4–2.8%', '0%', 'Sickness, disability, retirement branches; contribution salary capped at 25 UMA/day'),
      c('IMSS (employer)', '0%', 'About 20–30%', 'Includes work-risk premium (by class) and fixed quota on 1 UMA'),
      c('SAR (retirement)', '0%', '2%', ''),
      c('Cesantía y vejez (employer)', '0%', '3.15–8.73%', 'Rising each year to 2030 by salary band (2026 schedule)'),
      c('INFONAVIT', '0%', '5%', 'Housing fund'),
      c('State payroll tax (ISN)', '0%', '2–4%', 'By state (Mexico City 4%)'),
    ],
    tax_brackets: progressive([[0, 1.92], [8952.5, 6.4], [75984.56, 10.88], [133536.08, 16], [155229.81, 17.92], [185852.58, 21.36],
      [374837.89, 23.52], [590796, 30], [1127926.85, 32], [1503902.47, 34], [4511707.38, 35]]),
    tax_notes: 'Annual ISR table; monthly withholding uses the equivalent monthly table plus employment subsidy for low wages.',
    leave: [
      wd('Vacation', 12, { carry_forward: 0 }), weeks('Maternity Leave', 12), wd('Paternity Leave', 5), wd('Unpaid Leave', 0),
    ],
  },
};
