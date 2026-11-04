// 2026 law updates for every country Quantivra offers, layered over the
// older built-in packs in countries.ts. This is what version "2026" of each
// country pack is built from (see packConfig.ts and migration 015).
//
// Researched November 2026 from official announcements and payroll guides;
// each country lists its sources and anything still to verify. Leave
// minimums follow countries.ts: min_days in working days (5 per week) for
// working-day and week-based leave; calendar days for calendar-day leave.

import type { CountryPackConfig } from './countries';
import { COUNTRY_PACKS } from './countries';
import { COUNTRY_LAW_2026_MORE } from './country-law-2026-more';

type Bracket = CountryPackConfig['income_tax']['brackets'][number];
type LeaveType = CountryPackConfig['leave']['types'][number];
type Contribution = CountryPackConfig['statutory_contributions'][number];

export interface CountryLaw2026 {
  effective_from: string;
  sources: string[];
  verify?: string[];
  minimum_wage?: number;
  minimum_wage_note?: string;
  retirement_age?: number;
  statutory_contributions?: Contribution[];
  tax_brackets?: Bracket[];
  tax_notes?: string;
  sales_tax?: CountryPackConfig['sales_tax'];
  leave?: LeaveType[];
  /** a full pack for countries that had none (Taiwan) */
  base?: CountryPackConfig;
}

export { progressive } from './tax-brackets';
import { progressive } from './tax-brackets';

const wd = (name: string, days: number, extra: Partial<LeaveType> = {}): LeaveType =>
  ({ name, min_days: days, carry_forward: 0, encashable: false, count_method: 'working_days', ...extra });
const weeks = (name: string, w: number, extra: Partial<LeaveType> = {}): LeaveType =>
  ({ name, min_days: w * 5, carry_forward: 0, encashable: false, count_method: 'weeks', ...extra });
const cal = (name: string, days: number, extra: Partial<LeaveType> = {}): LeaveType =>
  ({ name, min_days: days, carry_forward: 0, encashable: false, count_method: 'calendar_days', ...extra });
const c = (scheme_code: string, employee_rate: string, employer_rate: string, notes: string, extra: Partial<Contribution> = {}): Contribution =>
  ({ scheme_code, scheme_name: scheme_code, name: scheme_code, employee_rate, employer_rate, notes, effective_date: '2026-01-01', ...extra });

export const COUNTRY_LAW_2026: Record<string, CountryLaw2026> = {
  SG: {
    effective_from: '2026-01-01',
    sources: ['https://www.cpf.gov.sg', 'https://www.iras.gov.sg', 'https://www.mom.gov.sg'],
    verify: ['CPF rates above age 60 (employer/employee split)'],
    minimum_wage: 0, minimum_wage_note: 'No general minimum wage (Progressive Wage Model for some sectors)',
    retirement_age: 63,
    statutory_contributions: [
      c('CPF', '20%', '17%', 'Ordinary Wage ceiling S$8,000/month; Additional Wage ceiling S$102,000 less OW for the year', {
        max_earnings_ceiling: 8000, annual_contribution_ceiling: 102000,
        age_rules: [
          { label: '55 and below', max_age: 55, employee_rate: 20, employer_rate: 17 },
          { label: 'Above 55 to 60', min_age: 55, max_age: 60, employee_rate: 18, employer_rate: 16 },
          { label: 'Above 60 to 65', min_age: 60, max_age: 65, employee_rate: 12.5, employer_rate: 12.5 },
          { label: 'Above 65 to 70', min_age: 65, max_age: 70, employee_rate: 7.5, employer_rate: 9 },
          { label: 'Above 70', min_age: 70, max_age: null, employee_rate: 5, employer_rate: 7.5 },
        ],
      }),
      c('SDL', '0%', '0.25%', 'Skills Development Levy on first S$4,500 of monthly wages; min S$2, max S$11.25'),
      c('SHG', 'Varies', '0%', 'Self-help group (CDAC / MBMF / SINDA / ECF) by ethnicity; employee-funded'),
    ],
    tax_brackets: progressive([[0, 0], [20000, 2], [30000, 3.5], [40000, 7], [80000, 11.5], [120000, 15], [160000, 18],
      [200000, 19], [240000, 19.5], [280000, 20], [320000, 22], [500000, 23], [1000000, 24]]),
    tax_notes: 'Resident rates from YA2024. Non-residents: 15% or resident rates, whichever is higher; directors 24%.',
  },

  MY: {
    effective_from: '2026-01-01',
    sources: ['https://www.kwsp.gov.my', 'https://www.perkeso.gov.my', 'https://www.hasil.gov.my', 'https://www.mohr.gov.my'],
    verify: ['Personal income tax bands for YA2026'],
    minimum_wage: 1700, minimum_wage_note: 'RM1,700/month nationwide (since Feb 2025; Aug 2025 for employers with <5 staff)',
    statutory_contributions: [
      c('EPF', '11%', '13%', 'Employer 13% on wages ≤ RM5,000, 12% above. Foreign workers 2% / 2% since Oct 2025', { formula_type: 'percentage' }),
      c('SOCSO', '0.5%', '1.75%', 'Table-based; wage ceiling RM6,000/month', { max_earnings_ceiling: 6000 }),
      c('EIS', '0.2%', '0.2%', 'Table-based; wage ceiling RM6,000/month', { max_earnings_ceiling: 6000 }),
      c('HRD Corp', '0%', '1%', 'Human Resources Development levy (0.5% for some smaller employers)'),
      c('PCB', 'Variable', '0%', 'Monthly tax deduction (MTD) per LHDN schedule'),
    ],
    tax_brackets: progressive([[0, 0], [5000, 1], [20000, 3], [35000, 6], [50000, 11], [70000, 19], [100000, 25],
      [400000, 26], [600000, 28], [2000000, 30]]),
    tax_notes: 'Resident chargeable income rates from YA2025. Non-residents 30%.',
    leave: [
      wd('Annual Leave', 8, { carry_forward: 0, encashable: true }),
      wd('Sick Leave', 14), wd('Hospitalisation Leave', 60),
      cal('Maternity Leave', 98), wd('Paternity Leave', 7), wd('Unpaid Leave', 0),
    ],
  },

  HK: {
    effective_from: '2026-05-01',
    sources: ['https://www.labour.gov.hk/eng/news/mwo.htm', 'https://www.mpfa.org.hk', 'https://www.ird.gov.hk'],
    verify: ['Number of statutory holidays in 2026'],
    minimum_wage: 43.1, minimum_wage_note: 'HK$43.1/hour from 1 May 2026 (was HK$42.1)',
    statutory_contributions: [
      c('MPF', '5%', '5%', 'Relevant income HK$7,100–30,000/month; max HK$1,500 each side. Employees earning < HK$7,100 pay nothing',
        { min_earnings_threshold: 7100, max_earnings_ceiling: 30000 }),
    ],
    tax_brackets: progressive([[0, 2], [50000, 6], [100000, 10], [150000, 14], [200000, 17]]),
    tax_notes: 'Progressive rates on net chargeable income; capped at the standard rate (15% on the first HK$5M of net income, 16% above).',
    sales_tax: [{ name: 'No sales tax / VAT', rate: 0, notes: 'Hong Kong has no GST/VAT' }],
    leave: [
      wd('Annual Leave', 7, { carry_forward: 0 }), wd('Sick Leave', 12),
      weeks('Maternity Leave', 14), wd('Paternity Leave', 5), wd('Unpaid Leave', 0),
    ],
  },

  AU: {
    effective_from: '2026-07-01',
    sources: ['https://www.fairwork.gov.au', 'https://www.ato.gov.au', 'https://www.servicesaustralia.gov.au'],
    minimum_wage: 26.44, minimum_wage_note: 'A$26.44/hour (A$1,004.90/week) from 1 July 2026; award rates may be higher',
    retirement_age: 67,
    statutory_contributions: [
      c('Superannuation Guarantee', '0%', '12%', 'Employer-only; maximum super contribution base applies per quarter', { effective_date: '2025-07-01' }),
      c('Medicare Levy', '2%', '0%', 'Collected through PAYG withholding'),
      c('PAYG Withholding', 'Variable', '0%', 'Per ATO tax tables'),
    ],
    tax_brackets: progressive([[0, 0], [18200, 15], [45000, 30], [135000, 37], [190000, 45]]),
    tax_notes: 'Resident rates 2026–27 (lowest rate cut from 16% to 15% on 1 July 2026). Plus 2% Medicare levy.',
    leave: [
      wd('Annual Leave', 20, { carry_forward: 0 }), wd("Personal/Carer's Leave", 10),
      wd('Compassionate Leave', 2), wd('Family & Domestic Violence Leave', 10),
      weeks('Parental Leave (unpaid)', 52), weeks('Paid Parental Leave (Government)', 24, { allow_single_days: true }),
      wd('Community Service Leave', 0), wd('Unpaid Leave', 0),
    ],
  },

  GB: {
    effective_from: '2026-04-06',
    sources: ['https://www.gov.uk/national-minimum-wage-rates', 'https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027'],
    minimum_wage: 12.71, minimum_wage_note: 'National Living Wage £12.71/hour (21+) from 1 April 2026; £10.85 for 18–20',
    retirement_age: 66,
    statutory_contributions: [
      c('NI Class 1 (employee)', '8%', '0%', '8% between £12,570 and £50,270 a year, 2% above', { min_earnings_threshold: 12570, max_earnings_ceiling: 50270, effective_date: '2026-04-06' }),
      c('NI Class 1 (employer)', '0%', '15%', '15% above the £5,000/year secondary threshold; Employment Allowance £10,500', { min_earnings_threshold: 5000, effective_date: '2026-04-06' }),
      c('Workplace Pension (auto-enrolment)', '5%', '3%', 'On qualifying earnings £6,240–£50,270', { min_earnings_threshold: 6240, max_earnings_ceiling: 50270, effective_date: '2026-04-06' }),
      c('PAYE Income Tax', '20–45%', '0%', 'Per tax code', { effective_date: '2026-04-06' }),
    ],
    tax_brackets: progressive([[0, 0], [12570, 20], [50270, 40], [125140, 45]]),
    tax_notes: 'England, Wales & NI rates 2026–27 (thresholds frozen). Personal allowance tapers away above £100,000. Scotland has its own bands.',
    leave: [
      wd('Annual Leave', 28, { carry_forward: 0 }),
      weeks('Statutory Sick Pay', 28, { allow_single_days: true }),
      weeks('Maternity Leave', 52), weeks('Paternity Leave', 2), weeks('Shared Parental Leave', 50),
      weeks('Adoption Leave', 52), weeks('Parental Bereavement Leave', 2), wd('Unpaid Leave', 0),
    ],
  },

  US: {
    effective_from: '2026-01-01',
    sources: ['https://www.irs.gov (Rev. Proc. 2025-32)', 'https://www.ssa.gov/oact/cola/cbb.html', 'https://www.dol.gov'],
    minimum_wage: 7.25, minimum_wage_note: 'Federal minimum; most states and many cities set higher rates',
    statutory_contributions: [
      c('Social Security (OASDI)', '6.2%', '6.2%', 'Wage base US$184,500 for 2026', { max_earnings_ceiling: 184500 }),
      c('Medicare', '1.45%', '1.45%', 'No cap; extra 0.9% employee tax on wages above US$200,000'),
      c('FUTA', '0%', '6%', 'First US$7,000 per employee; 0.6% net after state credit', { max_earnings_ceiling: 7000 }),
      c('SUTA', '0%', 'Varies', 'State unemployment insurance; rates and wage bases vary by state'),
    ],
    tax_brackets: progressive([[0, 10], [12400, 12], [50400, 22], [105700, 24], [201775, 32], [256225, 35], [640600, 37]]),
    tax_notes: 'Federal brackets 2026, single filer. Standard deduction US$16,100. State income taxes are separate.',
    leave: [
      wd('Annual Leave', 0), wd('Sick Leave (state law)', 0),
      weeks('FMLA Leave (unpaid)', 12, { allow_single_days: true }), wd('Unpaid Leave', 0),
    ],
  },

  DE: {
    effective_from: '2026-01-01',
    sources: ['https://www.bundesregierung.de', 'https://www.barmer.de/unsere-leistungen/beitraege-tarife/beitragsbemessungsgrenze', 'https://www.tk.de'],
    minimum_wage: 13.90, minimum_wage_note: '€13.90/hour from 1 January 2026; Minijob limit €603/month',
    retirement_age: 67,
    statutory_contributions: [
      c('Pension Insurance', '9.3%', '9.3%', '18.6% total; ceiling €8,450/month', { max_earnings_ceiling: 8450 }),
      c('Unemployment Insurance', '1.3%', '1.3%', '2.6% total; ceiling €8,450/month', { max_earnings_ceiling: 8450 }),
      c('Health Insurance', '8.75%', '8.75%', '14.6% + average additional rate 2.9% (fund-specific), shared; ceiling €5,812.50/month', { max_earnings_ceiling: 5812.5 }),
      c('Long-term Care Insurance', '1.8%', '1.8%', '3.6% total; +0.6% for childless employees 23+ (employee pays); ceiling €5,812.50/month', { max_earnings_ceiling: 5812.5 }),
      c('Insolvency Levy', '0%', '0.15%', 'Employer-only; ceiling €8,450/month', { max_earnings_ceiling: 8450 }),
    ],
    tax_brackets: progressive([[0, 0], [12348, 14], [17799, 24], [69878, 42], [277825, 45]]),
    tax_notes: 'Basic allowance €12,348 (2026). Between €12,348 and €69,878 the rate rises gradually (14%→42%); rates shown are each zone\'s starting rate. Plus solidarity surcharge for high incomes and church tax where applicable.',
    leave: [
      wd('Annual Leave', 20, { carry_forward: 0 }), weeks('Sick Pay (employer-paid)', 6, { allow_single_days: true }),
      weeks('Maternity Protection', 14), weeks('Parental Leave (Elternzeit)', 156, { allow_single_days: true }), wd('Unpaid Leave', 0),
    ],
  },

  FR: {
    effective_from: '2026-06-01',
    sources: ['https://www.service-public.fr', 'https://www.urssaf.fr', 'https://www.impots.gouv.fr'],
    verify: ['Exact employer rates for your sector / company size (many reductions apply)'],
    minimum_wage: 12.31, minimum_wage_note: 'SMIC €12.31 gross/hour from 1 June 2026 (€1,867.02/month for 35h)',
    retirement_age: 64,
    statutory_contributions: [
      c('Old-age insurance (capped)', '6.9%', '8.55%', 'Up to the social security ceiling (PMSS) €4,005/month', { max_earnings_ceiling: 4005 }),
      c('Old-age insurance (uncapped)', '0.4%', '2.11%', 'On total salary'),
      c('Health insurance', '0%', '13%', 'Reduced 7% rate for salaries up to 2.25 SMIC'),
      c('Family allowances', '0%', '5.25%', 'Reduced 3.45% rate for salaries up to 3.3 SMIC'),
      c('Unemployment insurance', '0%', '4%', 'Up to 4 × PMSS', { max_earnings_ceiling: 16020 }),
      c('Supplementary pension AGIRC-ARRCO (T1)', '3.15%', '4.72%', 'Up to PMSS; higher rates on tranche 2', { max_earnings_ceiling: 4005 }),
      c('CSG / CRDS', '9.7%', '0%', 'On 98.25% of gross salary'),
    ],
    tax_brackets: progressive([[0, 0], [11600, 11], [29580, 30], [84578, 41], [181918, 45]]),
    tax_notes: 'Barème 2026 (2025 income), per tax share (quotient familial). Withheld at source (prélèvement à la source).',
    leave: [
      wd('Annual Leave (Congés Payés)', 25, { carry_forward: 0 }), weeks('Maternity Leave', 16),
      weeks('Paternity & Birth Leave', 4, { allow_single_days: true }), wd('Unpaid Leave', 0),
    ],
  },

  JP: {
    effective_from: '2026-04-01',
    sources: ['https://www.mhlw.go.jp', 'https://www.kyoukaikenpo.or.jp', 'https://www.nta.go.jp'],
    verify: ['Health and nursing-care insurance rates differ by prefecture and insurer', 'Employment insurance rate for fiscal 2026'],
    minimum_wage: 1177, minimum_wage_note: 'National weighted average ¥1,177/hour (prefectural rates take effect Oct 2026–early 2027; previous average ¥1,121)',
    retirement_age: 65,
    statutory_contributions: [
      c('Employees\' Pension (Kōsei Nenkin)', '9.15%', '9.15%', '18.3% total; standard monthly remuneration cap ¥650,000', { max_earnings_ceiling: 650000 }),
      c('Health Insurance (Kyōkai Kenpo, Tokyo)', '4.93%', '4.93%', 'About 9.85% total in Tokyo; varies by prefecture/insurer; cap ¥1,390,000', { max_earnings_ceiling: 1390000 }),
      c('Nursing Care Insurance (age 40–64)', '0.81%', '0.81%', 'About 1.62% total'),
      c('Child & Child-rearing Support Levy', '0.115%', '0.115%', 'New from April 2026, collected with health insurance (about 0.23% total)'),
      c('Employment Insurance', '0.5%', '0.85%', 'General business rate, fiscal 2026'),
      c('Workers\' Accident Insurance', '0%', 'Varies', 'Employer-only, by industry'),
    ],
    tax_brackets: progressive([[0, 5], [1950000, 10], [3300000, 20], [6950000, 23], [9000000, 33], [18000000, 40], [40000000, 45]]),
    tax_notes: 'National income tax; plus 2.1% reconstruction surtax on the tax and ~10% local inhabitant tax.',
    leave: [
      wd('Annual Leave', 10, { carry_forward: 10 }), weeks('Maternity Leave', 14),
      weeks('Childcare Leave', 52, { allow_single_days: true }), weeks('Post-birth Childcare Leave (fathers)', 4, { allow_single_days: true }),
      wd('Nursing Care Leave', 5), wd('Unpaid Leave', 0),
    ],
  },

  KR: {
    effective_from: '2026-01-01',
    sources: ['https://www.minimumwage.go.kr', 'https://www.nps.or.kr', 'https://www.nhis.or.kr', 'https://en.sedaily.com/society/2026/01/03/korea-workers-face-smaller-paychecks-as-pension-health'],
    verify: ['Pension income cap is revised every July'],
    minimum_wage: 10320, minimum_wage_note: '₩10,320/hour (₩2,156,880/month on 209 hours) from 1 January 2026',
    retirement_age: 60,
    statutory_contributions: [
      c('National Pension', '4.75%', '4.75%', '9.5% total in 2026, rising 0.5 pt a year to 13% by 2033; monthly income cap about ₩6,370,000', { max_earnings_ceiling: 6370000 }),
      c('Health Insurance', '3.595%', '3.595%', '7.19% total'),
      c('Long-term Care Insurance', '13.14% of health premium', '13.14% of health premium', 'Surcharge on the health insurance premium'),
      c('Employment Insurance', '0.9%', '1.15–1.75%', 'Employer rate depends on company size'),
      c('Industrial Accident Insurance', '0%', 'Varies', 'Employer-only, by industry'),
    ],
    tax_brackets: progressive([[0, 6], [14000000, 15], [50000000, 24], [88000000, 35], [150000000, 38], [300000000, 40], [500000000, 42], [1000000000, 45]]),
    tax_notes: 'National income tax; plus local income tax of 10% of the tax.',
    leave: [
      wd('Annual Leave', 15, { carry_forward: 0 }), cal('Maternity Leave', 90),
      wd('Paternity Leave', 20), weeks('Childcare Leave', 52, { allow_single_days: true }), wd('Unpaid Leave', 0),
    ],
  },

  CN: {
    effective_from: '2026-07-01',
    sources: ['https://www.mohrss.gov.cn', 'https://knitpeople.com/blog/china-eor-alert-multiple-chinese-cities-raise-2026-social-insurance-contribution-bases'],
    verify: ['Contribution bases and rates are set city by city; Shanghai shown'],
    minimum_wage: 2740, minimum_wage_note: 'Shanghai RMB 2,740/month (highest tier); varies by city',
    retirement_age: 60,
    statutory_contributions: [
      c('Pension', '8%', '16%', 'Shanghai base RMB 7,546–37,731/month from July 2026', { min_earnings_threshold: 7546, max_earnings_ceiling: 37731, effective_date: '2026-07-01' }),
      c('Medical (incl. maternity)', '2%', '10%', 'Shanghai; same base', { min_earnings_threshold: 7546, max_earnings_ceiling: 37731, effective_date: '2026-07-01' }),
      c('Unemployment', '0.5%', '0.5%', 'Shanghai; same base', { min_earnings_threshold: 7546, max_earnings_ceiling: 37731, effective_date: '2026-07-01' }),
      c('Work Injury', '0%', '0.16–1.52%', 'Employer-only, by industry risk', { effective_date: '2026-07-01' }),
      c('Housing Provident Fund', '7%', '7%', 'Shanghai 5–7% each side', { effective_date: '2026-07-01' }),
    ],
    tax_brackets: progressive([[0, 3], [36000, 10], [144000, 20], [300000, 25], [420000, 30], [660000, 35], [960000, 45]]),
    tax_notes: 'Annual comprehensive income after the RMB 60,000 standard deduction and special deductions; withheld cumulatively each month.',
    leave: [
      wd('Annual Leave', 5, { carry_forward: 0 }), cal('Maternity Leave', 98),
      wd('Paternity Leave', 10), wd('Marriage Leave', 3), wd('Bereavement Leave', 3), wd('Unpaid Leave', 0),
    ],
  },

  ID: {
    effective_from: '2026-01-01',
    sources: ['https://www.bpjsketenagakerjaan.go.id', 'https://www.statelinemedia.world/en/article/ump-jakarta-2026'],
    verify: ['JP (pension) wage ceiling for 2026'],
    minimum_wage: 5729876, minimum_wage_note: 'Jakarta UMP Rp5,729,876/month for 2026; varies by province',
    retirement_age: 59,
    statutory_contributions: [
      c('BPJS Kesehatan', '1%', '4%', 'Health; wage ceiling Rp12,000,000/month', { max_earnings_ceiling: 12000000 }),
      c('BPJS TK – JHT', '2%', '3.7%', 'Old-age savings; no ceiling'),
      c('BPJS TK – JP', '1%', '2%', 'Pension; wage ceiling about Rp10.5 million/month (indexed yearly)', { max_earnings_ceiling: 10547400 }),
      c('BPJS TK – JKK', '0%', '0.24–1.74%', 'Work accident; by risk class'),
      c('BPJS TK – JKM', '0%', '0.3%', 'Death benefit'),
    ],
    tax_brackets: progressive([[0, 5], [60000000, 15], [250000000, 25], [500000000, 30], [5000000000, 35]]),
    tax_notes: 'Annual PPh 21 rates; monthly withholding uses the TER (average effective rate) tables.',
    sales_tax: [{ name: 'VAT (PPN)', rate: 12, notes: '12% rate; for most goods/services applied to 11/12 of the price (effective 11%)' }],
    leave: [
      wd('Annual Leave', 12, { carry_forward: 0 }), cal('Maternity Leave', 90),
      wd('Paternity Leave', 2), wd('Marriage Leave', 3), wd('Unpaid Leave', 0),
    ],
  },

  TH: {
    effective_from: '2026-01-01',
    sources: ['https://www.sso.go.th', 'https://www.thailawonline.com/minimum-wage-in-thailand/'],
    verify: ['Maternity (120 days) and spouse leave under the 2025 Labour Protection Act amendment'],
    minimum_wage: 400, minimum_wage_note: 'Up to ฿400/day (Bangkok and some provinces); ฿337–400 by province',
    statutory_contributions: [
      c('Social Security (SSO)', '5%', '5%', 'Wage ceiling ฿17,500/month from 1 Jan 2026 (max ฿875 each side)', { max_earnings_ceiling: 17500 }),
    ],
    tax_brackets: progressive([[0, 0], [150000, 5], [300000, 10], [500000, 15], [750000, 20], [1000000, 25], [2000000, 30], [5000000, 35]]),
    tax_notes: 'Net assessable income after expense deduction and allowances.',
    leave: [
      wd('Annual Leave', 6, { carry_forward: 0 }), wd('Sick Leave', 30), cal('Maternity Leave', 120),
      wd('Paternity Leave', 15), wd('Personal Business Leave', 3), wd('Unpaid Leave', 0),
    ],
  },

  PH: {
    effective_from: '2026-01-01',
    sources: ['https://www.sss.gov.ph', 'https://www.philhealth.gov.ph', 'https://www.pagibigfund.gov.ph', 'https://nwpc.dole.gov.ph'],
    verify: ['NCR minimum wage (new wage orders under review)'],
    minimum_wage: 695, minimum_wage_note: 'NCR non-agriculture ₱695/day; newer wage orders (₱755) pending/contested; varies by region',
    statutory_contributions: [
      c('SSS', '5%', '10%', '15% of monthly salary credit; MSC capped at ₱35,000', { max_earnings_ceiling: 35000 }),
      c('PhilHealth', '2.5%', '2.5%', '5% premium; income floor ₱10,000, ceiling ₱100,000', { min_earnings_threshold: 10000, max_earnings_ceiling: 100000 }),
      c('Pag-IBIG (HDMF)', '2%', '2%', 'Maximum fund salary ₱10,000 (₱200 each side)', { max_earnings_ceiling: 10000 }),
    ],
    tax_brackets: progressive([[0, 0], [250000, 15], [400000, 20], [800000, 25], [2000000, 30], [8000000, 35]]),
    tax_notes: 'TRAIN law rates from 2023.',
    leave: [
      wd('Service Incentive Leave', 5, { carry_forward: 0, encashable: true }), cal('Maternity Leave', 105),
      wd('Paternity Leave', 7), wd('Solo Parent Leave', 7), wd('VAWC Leave', 10), wd('Unpaid Leave', 0),
    ],
  },

  VN: {
    effective_from: '2026-01-01',
    sources: ['https://ayp-group.com/resources/payroll-guide/vietnam', 'https://vietnamnews.vn/economy/1732735/millions-set-to-benefit-from-personal-income-tax-reduction-from-2026.html'],
    verify: ['New five-bracket PIT rates and start date (Law 109/2025/QH15)'],
    minimum_wage: 5310000, minimum_wage_note: 'Region I ₫5,310,000/month from 1 Jan 2026 (Decree 293/2025); II ₫4.73M, III ₫4.14M, IV ₫3.7M',
    statutory_contributions: [
      c('Social Insurance', '8%', '17.5%', 'Capped at 20 × the reference level (₫46.8M/month)', { max_earnings_ceiling: 46800000 }),
      c('Health Insurance', '1.5%', '3%', 'Same cap as social insurance', { max_earnings_ceiling: 46800000 }),
      c('Unemployment Insurance', '1%', '1%', 'Capped at 20 × the regional minimum wage'),
      c('Trade Union Fee', '0%', '2%', 'Employer, where a union is established'),
    ],
    tax_brackets: progressive([[0, 5], [10000000, 10], [30000000, 20], [60000000, 30], [100000000, 35]]),
    tax_notes: 'Monthly taxable income after the ₫15.5M personal and ₫6.2M per-dependant deductions (2026).',
    leave: [
      wd('Annual Leave', 12, { carry_forward: 0 }), cal('Maternity Leave', 180),
      wd('Paternity Leave', 5), wd('Marriage Leave', 3), wd('Bereavement Leave', 3), wd('Unpaid Leave', 0),
    ],
  },
};

// ---------------------------------------------------------------------------
// Taiwan had no built-in pack; this is a complete one.
// ---------------------------------------------------------------------------
const TW_BASE: CountryPackConfig = {
  general: { name: 'Taiwan', code: 'TW', currency: 'TWD', currency_symbol: 'NT$', phone_code: '+886', timezone: 'Asia/Taipei', primary_language: 'Traditional Chinese', secondary_language: 'English', date_format: 'YYYY/MM/DD', time_format: '24h', week_starts_on: 'Monday', financial_year: '01-01', tax_year: '01-01', default_payroll_frequency: 'Monthly', payslip_language: 'Traditional Chinese / English' },
  employment_types: [{ name: 'Full-Time', enabled: true }, { name: 'Part-Time', enabled: true }, { name: 'Fixed-Term Contract', enabled: true }, { name: 'Internship', enabled: true }],
  employee_categories: [
    { name: 'Taiwan National', statutory_treatment: 'Labour, employment and health insurance; labour pension' },
    { name: 'Foreign Professional (APRC holder)', statutory_treatment: 'Same as nationals, incl. new labour pension' },
    { name: 'Foreign Worker', statutory_treatment: 'Labour & health insurance; no labour pension' },
  ],
  employment: { max_weekly_hours: 40, probation_months: 3, notice_period_days: 30, retirement_age: 65, rest_days: '2 days/week (1 regular day off + 1 rest day)', employment_types: ['Full-Time', 'Part-Time', 'Fixed-Term Contract', 'Internship'], contract_types: ['Non-fixed term', 'Fixed term'] },
  payroll: { frequencies: ['Monthly (Default)'], minimum_wage: 29500, payroll_cutoff: 'Last day of month', payroll_lock_date: '5th of next month', thirteenth_month: 'Year-end bonus customary (not mandatory)', bank_file_format: 'Bank-specific CSV' },
  payroll_components: {
    earnings: [{ name: 'Basic Salary', is_taxable: true }, { name: 'Overtime', is_taxable: true }, { name: 'Allowance', is_taxable: true }, { name: 'Meal Allowance', is_taxable: false }, { name: 'Year-End Bonus', is_taxable: true }],
    deductions: [{ name: 'Labour Insurance', is_taxable: false, is_mandatory: true }, { name: 'Health Insurance', is_taxable: false, is_mandatory: true }, { name: 'Income Tax Withholding', is_taxable: false, is_mandatory: true }, { name: 'Voluntary Pension', is_taxable: false }],
  },
  statutory_contributions: [],
  income_tax: { brackets: [], resident_rules: 'Residents: progressive rates on net consolidated income. Non-residents: 18% withholding on salary (6% if pay ≤ 1.5 × minimum wage).', non_resident_rate: 18, filing_frequency: 'Annual (May)', form_types: ['Withholding statement', 'Annual income tax return'] },
  sales_tax: [{ name: 'Business Tax (VAT)', rate: 5, notes: 'Standard rate' }],
  leave: { types: [] },
  public_holidays: ["New Year's Day", 'Lunar New Year (several days)', 'Peace Memorial Day', "Children's Day", 'Tomb Sweeping Day', 'Labour Day', 'Dragon Boat Festival', 'Mid-Autumn Festival', 'National Day'],
  government_agencies: [
    { name: 'Bureau of Labor Insurance', submission_frequency: 'Monthly', portal: 'https://www.bli.gov.tw' },
    { name: 'National Health Insurance Administration', submission_frequency: 'Monthly', portal: 'https://www.nhi.gov.tw' },
    { name: 'National Taxation Bureau', submission_frequency: 'Monthly withholding / annual', portal: 'https://www.ntbt.gov.tw' },
  ],
  government_forms: [
    { name: 'Withholding tax payment', frequency: 'Monthly', deadline: '10th of next month' },
    { name: 'Withholding statements', frequency: 'Annual', deadline: 'End of January' },
    { name: 'Labour / health insurance enrolment', frequency: 'On hire / exit', deadline: 'Day of hire or exit' },
  ],
  accounting: { fiscal_year_start: '01-01', default_tax_code: 'VAT5', invoice_number_format: 'INV-{YYYY}-{0000}', payment_terms: 'Net 30', tax_codes: [{ code: 'VAT5', name: 'Business tax 5%', rate: 5, is_default: true }, { code: 'ZR', name: 'Zero rated', rate: 0, is_default: false }] },
  banking: { bank_file_format: 'Bank-specific CSV', supported_banks: ['Bank of Taiwan', 'Cathay United Bank', 'CTBC Bank', 'E.SUN Bank', 'Taishin Bank'], payment_methods: ['Bank transfer'] },
  compliance: { employment_act: 'Labor Standards Act', record_retention_years: 5, payslip_requirements: 'Itemised wage statement each pay period', privacy_law: 'Personal Data Protection Act' },
  termination: { notice_period: '10 days (3 months–1 year service), 20 days (1–3 years), 30 days (3+ years)', severance_pay: 'New pension system: half a month\'s average wage per year of service, max 6 months', last_pay_rules: 'Pay final wages promptly on termination' },
  foreign_workers: { work_pass_types: ['Employment Gold Card', 'Work Permit (professional)', 'Migrant worker permit'], levy: 'Employment stabilisation fee for migrant workers', quota: 'Quotas apply to migrant workers' },
  localisation: { address_format: 'Postal code, City/County, District, Road, No., Floor', postal_code_format: '3+3 digits', phone_format: '+886 9xx xxx xxx', national_id_format: 'A123456789 (National ID) / ARC number' },
  document_numbering: [{ entity: 'invoice', format: 'INV-{YYYY}-{0000}' }],
};

COUNTRY_LAW_2026.TW = {
  effective_from: '2026-01-01',
  base: TW_BASE,
  sources: ['https://www.mol.gov.tw', 'https://www.bli.gov.tw', 'https://www.nhi.gov.tw', 'https://ayp-group.com/payroll/taiwan'],
  verify: ['Labour insurance total rate (11.5% vs 12.5% including employment insurance)'],
  minimum_wage: 29500, minimum_wage_note: 'NT$29,500/month, NT$196/hour from 1 January 2026',
  statutory_contributions: [
    c('Labour Insurance (incl. employment insurance)', '2.5%', '8.75%', '12.5% total split 20% employee / 70% employer / 10% government; insured salary cap NT$45,800', { max_earnings_ceiling: 45800 }),
    c('National Health Insurance', '1.55%', '4.84%', '5.17% premium; employee 30%, employer 60% × (1 + 0.56 average dependants); cap NT$219,500', { max_earnings_ceiling: 219500 }),
    c('Labour Pension (new system)', '0–6% (voluntary)', '6%', 'Employer at least 6% into the employee\'s account; wage cap NT$150,000', { max_earnings_ceiling: 150000 }),
    c('Occupational Accident Insurance', '0%', 'About 0.2%', 'Employer-only, by industry'),
  ],
  tax_brackets: progressive([[0, 5], [610000, 12], [1380000, 20], [2770000, 30], [5190000, 40]]),
  tax_notes: 'Consolidated income tax for income year 2026, after exemptions and the standard / salary deductions.',
  leave: [
    wd('Annual Leave', 7, { carry_forward: 0, encashable: true }), wd('Sick Leave (half pay)', 30),
    weeks('Maternity Leave', 8), wd('Paternity Leave', 7), wd('Personal Leave (unpaid)', 14),
    wd('Menstrual Leave', 12), weeks('Parental Leave (unpaid)', 104, { allow_single_days: true }),
  ],
};

/** Every country with a 2026 version, including the second wave (country-law-2026-more.ts). */
export function allCountryLaw2026(): Record<string, CountryLaw2026> {
  return { ...COUNTRY_LAW_2026, ...COUNTRY_LAW_2026_MORE };
}

/** Apply the 2026 updates over a built-in pack (or a new country's full pack). */
export function packFor2026(code: string): CountryPackConfig | null {
  const law = allCountryLaw2026()[code];
  const base = law?.base ?? COUNTRY_PACKS[code];
  if (!base) return null;
  if (!law) return base;
  return {
    ...base,
    employment: { ...base.employment, ...(law.retirement_age ? { retirement_age: law.retirement_age } : {}) },
    payroll: { ...base.payroll, ...(law.minimum_wage !== undefined ? { minimum_wage: law.minimum_wage } : {}) },
    statutory_contributions: law.statutory_contributions ?? base.statutory_contributions,
    income_tax: {
      ...base.income_tax,
      ...(law.tax_brackets ? { brackets: law.tax_brackets } : {}),
      ...(law.tax_notes ? { resident_rules: law.tax_notes } : {}),
    },
    sales_tax: law.sales_tax ?? base.sales_tax,
    leave: law.leave ? { types: law.leave } : base.leave,
  };
}
