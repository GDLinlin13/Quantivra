-- Quantivra — unblock the app's anon key on all reference / platform / country tables.
--
-- Problem: 39 tables hold seed data but Row Level Security is ENABLED with no
-- anon policy, so every read from the app returns []. The Country Packs page,
-- HR Settings, etc. all show empty even though the data is in the DB.
--
-- This matches the intent of src/utils/migration.sql ("disable RLS for development").
-- Safe to run repeatedly. Paste into the Supabase SQL editor:
--   https://supabase.com/dashboard/project/zxutyxqyvfnadbdabwvf/sql/new

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- platform
    'platform_users','platform_roles','platform_permissions','platform_subscriptions','platform_audit_log',
    -- country profiles / pack versions
    'country_profiles','country_pack_versions','country_regions',
    -- country reference
    'country_employment_types','country_employee_categories','country_payroll_components',
    'country_statutory_schemes','country_statutory_rates','country_tax_brackets','country_tax_codes',
    'country_statutory_leave','country_public_holidays','country_government_forms',
    'country_document_numbering','country_workflow_templates','country_dashboard_widgets',
    'country_compliance_items','country_cpf_age_rates','country_shg_organizations',
    -- country scheme engine
    'country_scheme_versions','country_scheme_employee_categories','country_scheme_age_bands',
    'country_scheme_rates','country_scheme_rules','country_scheme_salary_components',
    'country_scheme_formulas','country_scheme_rounding','country_scheme_government_forms',
    'country_scheme_submission_formats','country_scheme_validations','country_scheme_compliance',
    'country_scheme_caps','country_scheme_thresholds',
    -- shared reference
    'salary_components','statutory_deductions','employment_rules','employment_statuses',
    'immigration_statuses','notice_periods',
    -- business / industry packs
    'business_profiles','business_pack_modules','industry_profiles'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
