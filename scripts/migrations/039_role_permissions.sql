-- 039_role_permissions.sql — every section follows the ticks on Roles → Configure Permissions.
-- Until now anyone who could open a section could also change it. Now, per section:
--   view                 → read only
--   create or edit       → add and change
--   delete or edit       → remove
--   approve (Leave)      → approve or reject leave
-- Admin / Director roles, roles with "Can see pay & manage users" and platform admins keep full access.
--
--   Finance   invoices, bills, payments, bank lines, journals, accounts, attached and saved files
--   CRM       customers, suppliers and their contact people
--   Catalog   items, stock adjustments, customer prices          (module "inventory")
--   Employees employee records, dependents, work patterns, departments, leave types and balances
--   Leave     approving / rejecting leave; leave types and balances
--   Settings  company details, branding, holidays
--   Payroll   statutory settings (pay access, as before)
-- Staff can still apply for their own leave. Idempotent.

-- may the signed-in person do any of `actions` in any of `modules` of this company
CREATE OR REPLACE FUNCTION public.app_can_any(p_company_id bigint, p_modules text[], p_actions text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.app_can_view_pay(p_company_id) OR EXISTS (
    SELECT 1
    FROM company_users cu
    JOIN companies c ON c.id = cu.company_id AND c.is_active
    JOIN company_user_roles ur ON ur.user_id = cu.id
    JOIN company_roles r ON r.id = ur.role_id AND r.company_id = cu.company_id
    JOIN company_permissions p ON p.role_id = r.id
    WHERE auth.uid() IS NOT NULL AND cu.auth_user_id = auth.uid()
      AND cu.company_id = p_company_id AND cu.is_active
      AND p.module = ANY (p_modules) AND p.action = ANY (p_actions))
$$;
REVOKE ALL ON FUNCTION public.app_can_any(bigint, text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_can_any(bigint, text[], text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.app_can(p_company_id bigint, p_module text, p_action text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.app_can_any(p_company_id, ARRAY[p_module], ARRAY[p_action])
$$;
REVOKE ALL ON FUNCTION public.app_can(bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_can(bigint, text, text) TO authenticated, service_role;

-- read: everyone in the company (as before); write: by permission in any of `p_modules`
CREATE OR REPLACE FUNCTION public.app_apply_module_policy(p_table text, p_modules text[]) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_tenant text := '((SELECT public.app_is_platform_admin()) OR company_id IN (SELECT public.app_my_company_ids()))';
  v_mods text := quote_literal(p_modules::text) || '::text[]';
  v_write text;
  v_remove text;
BEGIN
  v_write  := format('(%s AND public.app_can_any(company_id, %s, ARRAY[''create'',''edit'']))', v_tenant, v_mods);
  v_remove := format('(%s AND public.app_can_any(company_id, %s, ARRAY[''delete'',''edit'']))', v_tenant, v_mods);
  PERFORM public.app_drop_policies(p_table);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING %s', p_table, v_tenant);
  EXECUTE format('CREATE POLICY module_add ON public.%I FOR INSERT TO authenticated WITH CHECK %s', p_table, v_write);
  EXECUTE format('CREATE POLICY module_change ON public.%I FOR UPDATE TO authenticated USING %s WITH CHECK %s', p_table, v_write, v_write);
  EXECUTE format('CREATE POLICY module_remove ON public.%I FOR DELETE TO authenticated USING %s', p_table, v_remove);
END $$;
REVOKE ALL ON FUNCTION public.app_apply_module_policy(text, text[]) FROM PUBLIC, anon, authenticated;
-- an earlier draft took a single module
DROP FUNCTION IF EXISTS public.app_apply_module_policy(text, text);

DO $$
DECLARE
  m text[][] := ARRAY[
    ['fin_accounts',              'finance'],
    ['fin_documents',             'finance'],
    ['fin_document_lines',        'finance'],
    ['fin_payments',              'finance'],
    ['fin_payment_allocations',   'finance'],
    ['fin_journals',              'finance'],
    ['fin_journal_lines',         'finance'],
    ['fin_bank_transactions',     'finance'],
    ['fin_attachments',           'finance'],
    ['company_files',             'finance'],
    ['contacts',                  'crm'],
    ['contact_people',            'crm'],
    ['catalog_items',             'inventory'],
    ['catalog_stock_adjustments', 'inventory'],
    ['catalog_customer_prices',   'inventory'],
    ['employee_dependents',       'employees'],
    ['employee_work_patterns',    'employees'],
    ['hr_departments',            'employees,settings'],
    ['leave_types',               'employees,leave,settings'],
    ['leave_balances',            'employees,leave'],
    ['company_branding',          'settings,company'],
    ['company_default_settings',  'settings,company'],
    ['company_holidays',          'settings,company'],
    ['company_statutory_settings','payroll']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(m, 1) LOOP
    IF to_regclass('public.' || m[i][1]) IS NOT NULL THEN
      PERFORM public.app_apply_module_policy(m[i][1], string_to_array(m[i][2], ','));
    END IF;
  END LOOP;
END $$;

-- company details: members still read them; changing them needs Settings
DROP POLICY IF EXISTS company_update ON companies;
CREATE POLICY company_update ON companies FOR UPDATE TO authenticated
  USING ((SELECT public.app_is_platform_admin())
    OR (id IN (SELECT public.app_my_company_ids()) AND public.app_can_any(id, ARRAY['settings','company'], ARRAY['create','edit'])))
  WITH CHECK ((SELECT public.app_is_platform_admin())
    OR (id IN (SELECT public.app_my_company_ids()) AND public.app_can_any(id, ARRAY['settings','company'], ARRAY['create','edit'])));

-- uploaded files (invoices, bills, statements, documents): adding or removing needs Finance
DO $$ BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS fin_attachments_add ON storage.objects;
    DROP POLICY IF EXISTS fin_attachments_change ON storage.objects;
    DROP POLICY IF EXISTS fin_attachments_remove ON storage.objects;
    CREATE POLICY fin_attachments_add ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'fin-attachments' AND ((SELECT public.app_is_platform_admin())
        OR ((storage.foldername(name))[1] IN (SELECT c::text FROM public.app_my_company_ids() c)
            AND public.app_can_any(((storage.foldername(name))[1])::bigint, ARRAY['finance'], ARRAY['create','edit']))));
    CREATE POLICY fin_attachments_change ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'fin-attachments' AND ((SELECT public.app_is_platform_admin())
        OR ((storage.foldername(name))[1] IN (SELECT c::text FROM public.app_my_company_ids() c)
            AND public.app_can_any(((storage.foldername(name))[1])::bigint, ARRAY['finance'], ARRAY['create','edit']))))
      WITH CHECK (bucket_id = 'fin-attachments' AND ((SELECT public.app_is_platform_admin())
        OR ((storage.foldername(name))[1] IN (SELECT c::text FROM public.app_my_company_ids() c)
            AND public.app_can_any(((storage.foldername(name))[1])::bigint, ARRAY['finance'], ARRAY['create','edit']))));
    CREATE POLICY fin_attachments_remove ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'fin-attachments' AND ((SELECT public.app_is_platform_admin())
        OR ((storage.foldername(name))[1] IN (SELECT c::text FROM public.app_my_company_ids() c)
            AND public.app_can_any(((storage.foldername(name))[1])::bigint, ARRAY['finance'], ARRAY['delete','edit']))));
  END IF;
END $$;

-- employee records are written through hr_upsert_employee / hr_delete_employee; check the person's Employees ticks.
-- (Server-side jobs and the SQL editor have no signed-in person and are not limited.)
CREATE OR REPLACE FUNCTION public.app_guard_employee_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_company bigint := COALESCE(NEW.company_id, OLD.company_id);
BEGIN
  IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN
    IF NOT public.app_can_any(v_company, ARRAY['employees'], ARRAY['delete','edit']) THEN
      RAISE EXCEPTION 'Your role cannot remove employees' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF NOT public.app_can_any(v_company, ARRAY['employees'], ARRAY['create','edit']) THEN
    RAISE EXCEPTION 'Your role can only view employees' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.app_guard_employee_write() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_employee_permission ON employees;
CREATE TRIGGER trg_employee_permission BEFORE INSERT OR UPDATE OR DELETE ON employees
  FOR EACH ROW EXECUTE FUNCTION public.app_guard_employee_write();

-- approving or rejecting leave needs Leave → approve (applying for and cancelling your own leave does not)
CREATE OR REPLACE FUNCTION public.app_guard_leave_decision() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.status IN ('approved', 'rejected')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NOT public.app_can_any(NEW.company_id, ARRAY['leave'], ARRAY['approve']) THEN
    RAISE EXCEPTION 'Your role cannot approve or reject leave' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.app_guard_leave_decision() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_leave_decision_permission ON leave_requests;
CREATE TRIGGER trg_leave_decision_permission BEFORE INSERT OR UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.app_guard_leave_decision();

SELECT 'migration 039 complete' AS status;
