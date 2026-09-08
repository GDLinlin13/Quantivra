-- 004_rls_tenant.sql — the company/tenant tables still have RLS enabled with no
-- anon policy, so client-side reads return []. Disable, consistent with the rest
-- of this dev database (migration.sql intent).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies','company_users','company_roles','company_permissions','company_user_roles',
    'company_settings','company_default_settings','company_departments',
    'hr_departments','employees','leave_types','leave_balances','leave_requests',
    'payroll_runs','payslips','workflow_templates','workflow_steps','workflow_instances',
    'workflow_logs','notifications','documents','audit_log','platform_audit_log',
    'platform_subscriptions','industry_profiles'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

SELECT 'migration 004 complete' AS status;
