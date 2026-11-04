// Turns a country pack (built-in data + 2026 law updates) into the config
// object stored in country_pack_versions.config and shown on Country Packs.
import type { CountryPackConfig } from './countries';
import { packFor2026, allCountryLaw2026 } from './country-law-2026';

export function buildPackConfig(p: CountryPackConfig, code?: string): Record<string, any> {
  const law = code ? allCountryLaw2026()[code] : undefined;
  const config: Record<string, any> = {
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
  if (law) {
    config.law_effective_from = law.effective_from;
    config.law_sources = law.sources;
    config.law_verify = law.verify || [];
    config.minimum_wage_note = law.minimum_wage_note;
    config.tax_notes = law.tax_notes;
  }
  return config;
}

/** The 2026 pack config for a country code, or null when there is no data. */
export function packConfig2026(code: string): Record<string, any> | null {
  const p = packFor2026(code);
  return p ? buildPackConfig(p, code) : null;
}
