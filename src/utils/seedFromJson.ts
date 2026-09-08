// ============================================================
// COUNTRY PACK SEEDER
// Reads JSON files from src/data/country-packs/ and seeds
// all normalized Supabase tables. Idempotent — safe to re-run.
// ============================================================

import { supabase } from './supabase';
import sharedSalaryComponents from '../data/country-packs/shared/salary-components.json';
import type { CountryPackDef, StatutorySchemeDef } from '../data/country-packs/schema';

interface SeedResult {
  country: string;
  schemes: number;
  errors: string[];
}

// ============================================================
// SHARED DATA
// ============================================================

async function seedSharedData(): Promise<void> {
  for (const comp of sharedSalaryComponents) {
    await supabase.from('salary_components').upsert(comp, { onConflict: 'code' });
  }
}

// ============================================================
// COUNTRY PACK
// ============================================================

async function seedCountryPack(pack: CountryPackDef): Promise<SeedResult> {
  const result: SeedResult = { country: pack.general.code, schemes: 0, errors: [] };
  const cc = pack.general.code;

  // Ensure country profile exists
  await supabase.from('country_profiles').upsert({
    code: cc,
    name: pack.general.name,
    currency: pack.general.currency,
    phone_code: pack.general.phoneCode,
  }, { onConflict: 'code' });

  // Ensure pack version exists
  const { data: version } = await supabase.from('country_pack_versions')
    .upsert({
      country_code: cc,
      version: '2026',
      effective_from: '2026-01-01',
      config: {},
      is_active: true,
    }, { onConflict: 'country_code,version' })
    .select('id')
    .single();

  if (!version) { result.errors.push('Failed to get/create country_pack_version'); return result; }
  const packId = version.id;

  // Seed employment
  await seedEmployment(packId, pack.employment);

  // Seed payroll components
  await seedPayrollComponents(packId, pack);

  // Seed tax
  await seedTax(packId, pack);

  // Seed accounting
  await seedAccounting(packId, pack);

  // Seed public holidays
  await supabase.from('country_public_holidays').delete().eq('version_id', packId);
  if (pack.publicHolidays.length) {
    await supabase.from('country_public_holidays').insert(
      pack.publicHolidays.map(h => ({ version_id: packId, name: h.name, recurring: h.recurring }))
    );
  }

  // Seed government forms
  await supabase.from('country_government_forms').delete().eq('version_id', packId);
  if (pack.governmentForms.length) {
    await supabase.from('country_government_forms').insert(
      pack.governmentForms.map(f => ({ version_id: packId, name: f.name, frequency: f.frequency, deadline: f.deadline }))
    );
  }

  // Seed document numbering
  await supabase.from('country_document_numbering').delete().eq('version_id', packId);
  if (pack.documentNumbering?.length) {
    await supabase.from('country_document_numbering').insert(
      pack.documentNumbering.map(d => ({ version_id: packId, entity: d.entity, format: d.format }))
    );
  }

  // Seed workflow templates
  await supabase.from('country_workflow_templates').delete().eq('version_id', packId);
  if (pack.workflowTemplates?.length) {
    await supabase.from('country_workflow_templates').insert(
      pack.workflowTemplates.map(w => ({ version_id: packId, name: w.name, entity_type: w.entityType }))
    );
  }

  // Seed dashboard widgets
  await supabase.from('country_dashboard_widgets').delete().eq('version_id', packId);
  if (pack.dashboardWidgets?.length) {
    await supabase.from('country_dashboard_widgets').insert(
      pack.dashboardWidgets.map(w => ({ version_id: packId, name: w }))
    );
  }

  // Seed compliance items
  await supabase.from('country_compliance_items').delete().eq('version_id', packId);

  // Seed statutory schemes
  for (const [schemeKey, scheme] of Object.entries(pack.statutorySchemes)) {
    try {
      await seedStatutoryScheme(packId, scheme);
      result.schemes++;
    } catch (e: any) {
      result.errors.push(`${schemeKey}: ${e.message}`);
    }
  }

  return result;
}

// ============================================================
// EMPLOYMENT
// ============================================================

async function seedEmployment(packId: number, emp: CountryPackDef['employment']): Promise<void> {
  // Immigration statuses
  await supabase.from('immigration_statuses').delete().eq('version_id', packId);
  if (emp.immigrationStatuses.length) {
    await supabase.from('immigration_statuses').insert(
      emp.immigrationStatuses.map(s => ({ version_id: packId, code: s.code, name: s.name }))
    );
  }

  // Employment statuses
  await supabase.from('employment_statuses').delete().eq('version_id', packId);
  if (emp.statuses.length) {
    await supabase.from('employment_statuses').insert(
      emp.statuses.map(s => ({ version_id: packId, code: s.code, name: s.name, enabled: s.enabled }))
    );
  }

  // Employment rules
  await supabase.from('employment_rules').delete().eq('version_id', packId);
  if (emp.rules.length) {
    await supabase.from('employment_rules').insert(
      emp.rules.map(r => ({
        version_id: packId,
        rule_key: r.key,
        rule_value: r.value,
        editable_by_company: r.editableByCompany,
        reference_only: r.referenceOnly,
        description: r.description,
      }))
    );
  }

  // Notice periods
  await supabase.from('notice_periods').delete().eq('version_id', packId);
  if (emp.noticePeriods.length) {
    await supabase.from('notice_periods').insert(
      emp.noticePeriods.map(n => ({
        version_id: packId,
        min_service_months: n.minServiceMonths,
        max_service_months: n.maxServiceMonths,
        notice_days: n.noticeDays,
        description: n.description,
      }))
    );
  }
}

// ============================================================
// PAYROLL COMPONENTS
// ============================================================

async function seedPayrollComponents(packId: number, pack: CountryPackDef): Promise<void> {
  // Not seeded from JSON directly — components are defined per statutory scheme via salaryComponents.
  // Country-specific payroll components (earnings/deductions) are derived from statutory scheme data.
}

// ============================================================
// TAX
// ============================================================

async function seedTax(packId: number, pack: CountryPackDef): Promise<void> {
  await supabase.from('country_tax_brackets').delete().eq('version_id', packId);
  if (pack.tax.brackets.length) {
    await supabase.from('country_tax_brackets').insert(
      pack.tax.brackets.map(b => ({
        version_id: packId,
        min_income: b.min,
        max_income: b.max,
        rate: b.rate,
        fixed_amount: b.fixed,
      }))
    );
  }
}

// ============================================================
// ACCOUNTING
// ============================================================

async function seedAccounting(packId: number, pack: CountryPackDef): Promise<void> {
  await supabase.from('country_tax_codes').delete().eq('version_id', packId);
  if (pack.accounting.taxCodes.length) {
    await supabase.from('country_tax_codes').insert(
      pack.accounting.taxCodes.map(t => ({
        version_id: packId,
        code: t.code,
        name: t.name,
        rate: t.rate,
        is_default: t.isDefault,
      }))
    );
  }
}

// ============================================================
// STATUTORY SCHEME
// ============================================================

async function seedStatutoryScheme(packId: number, scheme: StatutorySchemeDef): Promise<void> {
  // Upsert scheme
  const { data: schemeRow } = await supabase.from('country_statutory_schemes')
    .upsert({
      version_id: packId,
      name: scheme.general.name,
      type: mapSchemeType(scheme.general.type),
      description: scheme.general.description,
      employee_rate: null,
      employer_rate: null,
    }, { onConflict: 'id' })
    .select('id')
    .single();

  if (!schemeRow) throw new Error('Failed to create statutory scheme');
  const schemeId = schemeRow.id;

  // Upsert scheme version
  const { data: verRow } = await supabase.from('country_scheme_versions')
    .upsert({
      scheme_id: schemeId,
      version: scheme.general.version,
      status: scheme.general.status,
      effective_from: scheme.general.effectiveDate,
      notes: scheme.general.description,
    }, { onConflict: 'scheme_id,version' })
    .select('id')
    .single();

  if (!verRow) throw new Error('Failed to create scheme version');
  const verId = verRow.id;

  // Clear existing child data for this version
  await supabase.from('country_scheme_employee_categories').delete().eq('scheme_version_id', verId);
  await supabase.from('country_scheme_age_bands').delete().eq('scheme_version_id', verId);
  await supabase.from('country_scheme_rates').delete().eq('scheme_version_id', verId);
  await supabase.from('country_scheme_rules').delete().eq('scheme_version_id', verId);
  await supabase.from('country_scheme_salary_components').delete().eq('scheme_version_id', verId);
  await supabase.from('country_scheme_formulas').delete().eq('scheme_version_id', verId);
  await supabase.from('country_scheme_rounding').delete().eq('scheme_version_id', verId);
  await supabase.from('country_scheme_government_forms').delete().eq('scheme_version_id', verId);
  await supabase.from('country_scheme_validations').delete().eq('scheme_version_id', verId);

  // Employee categories
  for (const cat of scheme.employeeCategories) {
    let immId: number | null = null;
    if (cat.immigrationStatusCode) {
      const { data: imm } = await supabase.from('immigration_statuses')
        .select('id').eq('version_id', packId).eq('code', cat.immigrationStatusCode).single();
      if (imm) immId = imm.id;
    }
    await supabase.from('country_scheme_employee_categories').insert({
      scheme_version_id: verId,
      name: cat.name,
      treatment: cat.name,
      display_order: 0,
      immigration_status_id: immId,
      pr_stage: cat.prStage || null,
    });
  }

  // Age bands (from rate tables where ageFrom/ageTo differ from the rate table defaults)
  const ageBands = scheme.rateTables
    .filter(r => r.ageFrom !== undefined || r.ageTo !== undefined)
    .map((r, i) => ({
      scheme_version_id: verId,
      min_age: r.ageFrom ?? 0,
      max_age: r.ageTo,
      employee_rate: r.employeeRate,
      employer_rate: r.employerRate,
      label: r.ageFrom !== undefined ? `${r.ageFrom}–${r.ageTo ?? '+'}` : null,
    }));
  if (ageBands.length) {
    await supabase.from('country_scheme_age_bands').insert(ageBands);
  }

  // Rates
  const rates = scheme.rateTables.map((r, i) => ({
    scheme_version_id: verId,
    rate_type: r.wageMin !== undefined || r.wageMax !== undefined ? 'wage_band' : 'flat_percentage',
    employee_rate: r.employeeRate,
    employer_rate: r.employerRate,
    wage_min: r.wageMin ?? null,
    wage_max: r.wageMax ?? null,
    display_order: i + 1,
  }));
  if (rates.length) {
    await supabase.from('country_scheme_rates').insert(rates);
  }

  // Rules (thresholds + caps combined)
  const rules: any[] = [];
  for (const t of scheme.thresholds) {
    rules.push({
      scheme_version_id: verId,
      rule_type: 'threshold',
      name: t.name || t.code,
      value_type: 'fixed_amount',
      value: t.value,
      frequency: t.frequency || 'monthly',
      description: t.name,
      display_order: rules.length + 1,
    });
  }
  for (const c of scheme.caps) {
    rules.push({
      scheme_version_id: verId,
      rule_type: c.formula ? 'formula' : 'ceiling',
      name: c.name || c.code,
      value_type: c.formula ? 'formula' : 'fixed_amount',
      value: c.value ?? null,
      formula_ref: c.formula || null,
      frequency: c.type.includes('annual') ? 'annual' : 'monthly',
      description: c.name,
      display_order: rules.length + 1,
    });
  }
  if (rules.length) {
    await supabase.from('country_scheme_rules').insert(rules);
  }

  // Salary components
  for (const sc of scheme.salaryComponents) {
    const { data: salaryComp } = await supabase.from('salary_components')
      .select('id').eq('code', sc.componentCode).single();
    if (salaryComp) {
      await supabase.from('country_scheme_salary_components').insert({
        scheme_version_id: verId,
        salary_component_id: salaryComp.id,
        included: sc.included,
        calculation_type: sc.classification === 'ordinary_wage' ? 'full' : sc.classification === 'additional_wage' ? 'additional' : 'excluded',
      });
    }
  }

  // Calculation rules
  for (const calc of scheme.calculationRules) {
    await supabase.from('country_scheme_formulas').insert({
      scheme_version_id: verId,
      formula_code: calc.code,
      formula_name: calc.name,
      formula_type: mapFormulaType(calc.action),
      expression: calc.action,
      description: calc.description,
      priority: calc.priority,
    });
  }

  // Rounding
  if (scheme.rounding.employee || scheme.rounding.employer) {
    const roundRows: any[] = [];
    if (scheme.rounding.employee) {
      roundRows.push({
        scheme_version_id: verId,
        field: 'employee_contribution',
        method: scheme.rounding.employee.method,
        decimals: scheme.rounding.employee.decimals,
      });
    }
    if (scheme.rounding.employer) {
      roundRows.push({
        scheme_version_id: verId,
        field: 'employer_contribution',
        method: scheme.rounding.employer.method,
        decimals: scheme.rounding.employer.decimals,
      });
    }
    await supabase.from('country_scheme_rounding').insert(roundRows);
  }

  // Government forms / reporting
  if (scheme.reporting.forms.length) {
    await supabase.from('country_scheme_government_forms').insert(
      scheme.reporting.forms.map(f => ({
        scheme_version_id: verId,
        name: f.name,
        frequency: f.frequency,
        deadline: f.deadline,
        submission_method: 'online',
      }))
    );
  }

  // Validations
  for (const v of scheme.validations) {
    await supabase.from('country_scheme_validations').insert({
      scheme_version_id: verId,
      rule_code: v.code,
      rule_name: v.name,
      validation_type: v.type,
      expression: v.expression,
      error_message: v.errorMessage,
      severity: v.severity,
    });
  }
}

// ============================================================
// HELPERS
// ============================================================

function mapSchemeType(type: string): string {
  const map: Record<string, string> = {
    'provident_fund': 'pension',
    'pension': 'pension',
    'social_security': 'social_security',
    'training': 'training',
    'development': 'development',
    'tax': 'tax',
    'health': 'health',
    'insurance': 'social_security',
  };
  return map[type] || 'other';
}

function mapFormulaType(action: string): string {
  if (action.includes('CEILING') || action.toLowerCase().includes('ceiling')) return 'ceiling';
  if (action.includes('MIN(') || action.includes('MAX(')) return 'ceiling';
  return 'custom';
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

export async function seedAll(): Promise<SeedResult[]> {
  const results: SeedResult[] = [];

  console.log('Seeding shared data...');
  await seedSharedData();

  // Dynamically import country packs
  // Each country pack exports or has its JSON files imported dynamically
  const sgPack: CountryPackDef = (await import('../data/country-packs/SG/index')).default;
  // Future: myPack, hkPack, etc.

  for (const pack of [sgPack]) {
    console.log(`Seeding ${pack.general.code}...`);
    const result = await seedCountryPack(pack);
    results.push(result);
    console.log(`  ${result.schemes} schemes, ${result.errors.length} errors`);
    result.errors.forEach(e => console.error(`  ERROR: ${e}`));
  }

  return results;
}

// Auto-run entry for Node.js: `npx tsx src/utils/seedFromJson.ts`
// Vite builds will tree-shake this block since it's only reached via direct execution.
