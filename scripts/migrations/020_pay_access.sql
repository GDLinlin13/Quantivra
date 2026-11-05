-- 020_pay_access.sql — only people with "pay access" see pay.
--
-- A company role can have pay access (Admin / Director / HR by default).
-- People with it see salaries, payroll runs, payslips and employees' ID / tax
-- / bank numbers, and they are the only ones who can manage users and roles
-- (otherwise anyone could give themselves pay access). Everyone else in the
-- company sees those fields as hidden. Enforced here in the database.
--
-- Also: one login belongs to at most one employee.
-- Idempotent. Run BEFORE deploying the matching app version.

ALTER TABLE company_roles ADD COLUMN IF NOT EXISTS can_view_pay boolean NOT NULL DEFAULT false;
UPDATE company_roles SET can_view_pay = true
WHERE lower(name) IN ('admin', 'administrator', 'owner', 'director', 'hr', 'human resources', 'payroll')
  AND NOT can_view_pay;

-- Companies created before this get the new HR (pay access) and Finance roles.
INSERT INTO company_roles (company_id, name, is_system, can_view_pay)
SELECT c.id, r.name, true, r.pay
FROM companies c CROSS JOIN (VALUES ('HR', true), ('Finance', false)) AS r(name, pay)
WHERE NOT EXISTS (SELECT 1 FROM company_roles x WHERE x.company_id = c.id AND lower(x.name) = lower(r.name));

INSERT INTO company_permissions (role_id, module, feature, action)
SELECT cr.id, a.module, '*', a.action
FROM company_roles cr
JOIN (VALUES
  ('HR', 'employees'), ('HR', 'leave'), ('HR', 'attendance'), ('HR', 'claims'), ('HR', 'payroll'),
  ('Finance', 'finance')) AS m(role_name, module) ON lower(cr.name) = lower(m.role_name)
CROSS JOIN LATERAL (SELECT m.module, x.action FROM unnest(ARRAY['view','create','edit','delete','approve','export']) AS x(action)) a
WHERE NOT EXISTS (SELECT 1 FROM company_permissions p WHERE p.role_id = cr.id);

INSERT INTO company_permissions (role_id, module, feature, action)
SELECT cr.id, 'claims', '*', x.action
FROM company_roles cr CROSS JOIN unnest(ARRAY['view','approve','export']) AS x(action)
WHERE lower(cr.name) = 'finance'
  AND NOT EXISTS (SELECT 1 FROM company_permissions p WHERE p.role_id = cr.id AND p.module = 'claims');

CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_user ON employees(user_id) WHERE user_id IS NOT NULL;

-- Does the signed-in person have pay access in this company?
CREATE OR REPLACE FUNCTION public.app_can_view_pay(p_company_id bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.app_is_privileged_role() OR public.app_is_platform_admin() OR EXISTS (
    SELECT 1
    FROM company_users cu
    JOIN companies c ON c.id = cu.company_id AND c.is_active
    JOIN company_user_roles ur ON ur.user_id = cu.id
    JOIN company_roles r ON r.id = ur.role_id AND r.company_id = cu.company_id
    WHERE auth.uid() IS NOT NULL AND cu.auth_user_id = auth.uid()
      AND cu.company_id = p_company_id AND cu.is_active AND r.can_view_pay)
$$;

-- Companies where the signed-in person has pay access (for RLS).
-- (Not SECURITY DEFINER: it only combines the two checked helpers.)
CREATE OR REPLACE FUNCTION public.app_my_pay_company_ids() RETURNS SETOF bigint
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT c FROM public.app_my_company_ids() c WHERE public.app_can_view_pay(c)
$$;
GRANT EXECUTE ON FUNCTION public.app_can_view_pay(bigint), public.app_my_pay_company_ids() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.app_can_view_pay(bigint), public.app_my_pay_company_ids() FROM PUBLIC, anon;

-- ------------------------------------------------------------------
-- Payroll runs and payslips: pay access only.
-- ------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payroll_runs', 'payslips'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      PERFORM public.app_drop_policies(t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format($f$CREATE POLICY pay_rows ON public.%I FOR ALL TO authenticated
        USING ((SELECT public.app_is_platform_admin()) OR company_id IN (SELECT public.app_my_pay_company_ids()))
        WITH CHECK ((SELECT public.app_is_platform_admin()) OR company_id IN (SELECT public.app_my_pay_company_ids()))$f$, t);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------------
-- Users, roles and permissions: everyone in the company can see them;
-- only people with pay access can change them.
-- ------------------------------------------------------------------
DO $$ BEGIN
  PERFORM public.app_drop_policies('company_roles');
  PERFORM public.app_drop_policies('company_users');
  PERFORM public.app_drop_policies('company_user_roles');
  PERFORM public.app_drop_policies('company_permissions');
END $$;

CREATE POLICY members_read ON company_roles FOR SELECT TO authenticated
  USING ((SELECT public.app_is_platform_admin()) OR company_id IN (SELECT public.app_my_company_ids()));
CREATE POLICY pay_admins_write ON company_roles FOR ALL TO authenticated
  USING ((SELECT public.app_is_platform_admin()) OR company_id IN (SELECT public.app_my_pay_company_ids()))
  WITH CHECK ((SELECT public.app_is_platform_admin()) OR company_id IN (SELECT public.app_my_pay_company_ids()));

CREATE POLICY members_read ON company_users FOR SELECT TO authenticated
  USING ((SELECT public.app_is_platform_admin()) OR company_id IN (SELECT public.app_my_company_ids()));
CREATE POLICY pay_admins_write ON company_users FOR ALL TO authenticated
  USING ((SELECT public.app_is_platform_admin()) OR company_id IN (SELECT public.app_my_pay_company_ids()))
  WITH CHECK ((SELECT public.app_is_platform_admin()) OR company_id IN (SELECT public.app_my_pay_company_ids()));

CREATE POLICY members_read ON company_user_roles FOR SELECT TO authenticated
  USING ((SELECT public.app_is_platform_admin()) OR EXISTS (SELECT 1 FROM company_users p
    WHERE p.id = user_id AND p.company_id IN (SELECT public.app_my_company_ids())));
CREATE POLICY pay_admins_write ON company_user_roles FOR ALL TO authenticated
  USING ((SELECT public.app_is_platform_admin()) OR EXISTS (SELECT 1 FROM company_users p
    WHERE p.id = user_id AND p.company_id IN (SELECT public.app_my_pay_company_ids())))
  WITH CHECK ((SELECT public.app_is_platform_admin()) OR (
    EXISTS (SELECT 1 FROM company_users p WHERE p.id = user_id AND p.company_id IN (SELECT public.app_my_pay_company_ids()))
    AND EXISTS (SELECT 1 FROM company_users p JOIN company_roles r ON r.company_id = p.company_id
                WHERE p.id = user_id AND r.id = role_id)));

CREATE POLICY members_read ON company_permissions FOR SELECT TO authenticated
  USING ((SELECT public.app_is_platform_admin()) OR EXISTS (SELECT 1 FROM company_roles p
    WHERE p.id = role_id AND p.company_id IN (SELECT public.app_my_company_ids())));
CREATE POLICY pay_admins_write ON company_permissions FOR ALL TO authenticated
  USING ((SELECT public.app_is_platform_admin()) OR EXISTS (SELECT 1 FROM company_roles p
    WHERE p.id = role_id AND p.company_id IN (SELECT public.app_my_pay_company_ids())))
  WITH CHECK ((SELECT public.app_is_platform_admin()) OR EXISTS (SELECT 1 FROM company_roles p
    WHERE p.id = role_id AND p.company_id IN (SELECT public.app_my_pay_company_ids())));

-- ------------------------------------------------------------------
-- Employees: the table itself never shows salary or ID / bank numbers;
-- everything goes through hr_list_employees / hr_upsert_employee below.
-- ------------------------------------------------------------------
REVOKE SELECT, INSERT, UPDATE, DELETE ON employees FROM authenticated;
GRANT SELECT (id, company_id, user_id, manager_id, department_id, employee_code, full_name, email, phone,
  job_title, employment_type, join_date, exit_date, status, bank_name, created_at, updated_at,
  date_of_birth, residency_status, pr_stage, ethnicity, marital_status, gender) ON employees TO authenticated;

DROP FUNCTION IF EXISTS public.hr_list_employees(bigint);
CREATE FUNCTION public.hr_list_employees(p_company_id bigint)
RETURNS TABLE (
  id bigint, employee_code text, full_name text, email text, phone text,
  job_title text, employment_type text, join_date date, exit_date date,
  base_salary numeric, status text, department_id bigint, department_name text,
  manager_id bigint, manager_name text, user_id bigint,
  date_of_birth date, residency_status text, pr_stage text, ethnicity text, marital_status text, gender text,
  national_id text, tax_id text, bank_account text, bank_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_pay boolean;
BEGIN
  PERFORM public.app_require_company(p_company_id);
  v_pay := public.app_can_view_pay(p_company_id);
  RETURN QUERY
  SELECT e.id, e.employee_code, e.full_name, e.email, e.phone,
         e.job_title, e.employment_type, e.join_date, e.exit_date,
         CASE WHEN v_pay THEN e.base_salary END, e.status, e.department_id, d.name,
         e.manager_id, m.full_name, e.user_id,
         e.date_of_birth, e.residency_status, e.pr_stage, e.ethnicity, e.marital_status, e.gender,
         CASE WHEN v_pay THEN private.dec(e.national_id_enc) END,
         CASE WHEN v_pay THEN private.dec(e.tax_id_enc) END,
         CASE WHEN v_pay THEN private.dec(e.bank_account_enc) END,
         CASE WHEN v_pay THEN e.bank_name END
  FROM employees e
  LEFT JOIN hr_departments d ON d.id = e.department_id AND d.company_id = e.company_id
  LEFT JOIN employees m ON m.id = e.manager_id AND m.company_id = e.company_id
  WHERE e.company_id = p_company_id
  ORDER BY e.full_name;
END $$;

CREATE OR REPLACE FUNCTION public.hr_upsert_employee(p jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  v_id bigint := NULLIF(p->>'id','')::bigint;
  v_company bigint;
  v_pay boolean;
BEGIN
  IF v_id IS NULL THEN
    v_company := (p->>'company_id')::bigint;
  ELSE
    SELECT e.company_id INTO v_company FROM employees e WHERE e.id = v_id;
  END IF;
  PERFORM public.app_require_company(v_company);
  v_pay := public.app_can_view_pay(v_company);

  -- Links must stay inside the same company.
  IF NULLIF(p->>'manager_id','') IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM employees x WHERE x.id = (p->>'manager_id')::bigint AND x.company_id = v_company)
  OR NULLIF(p->>'department_id','') IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM hr_departments x WHERE x.id = (p->>'department_id')::bigint AND x.company_id = v_company)
  OR NULLIF(p->>'user_id','') IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM company_users x WHERE x.id = (p->>'user_id')::bigint AND x.company_id = v_company) THEN
    RAISE EXCEPTION 'Manager, department and user must belong to the same company' USING ERRCODE = '42501';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO employees (company_id, user_id, manager_id, department_id, employee_code,
      full_name, email, phone, job_title, employment_type, join_date, exit_date,
      base_salary, status, date_of_birth, residency_status, pr_stage, ethnicity, marital_status, gender,
      national_id_enc, tax_id_enc, bank_account_enc, bank_name)
    VALUES (
      v_company, CASE WHEN v_pay THEN NULLIF(p->>'user_id','')::bigint END,
      NULLIF(p->>'manager_id','')::bigint, NULLIF(p->>'department_id','')::bigint,
      p->>'employee_code', p->>'full_name', p->>'email', p->>'phone', p->>'job_title',
      COALESCE(p->>'employment_type','full_time'), NULLIF(p->>'join_date','')::date,
      NULLIF(p->>'exit_date','')::date,
      CASE WHEN v_pay THEN COALESCE(NULLIF(p->>'base_salary','')::numeric, 0) ELSE 0 END,
      COALESCE(p->>'status','active'),
      NULLIF(p->>'date_of_birth','')::date, COALESCE(p->>'residency_status','SC'),
      NULLIF(p->>'pr_stage',''), NULLIF(p->>'ethnicity',''), NULLIF(p->>'marital_status',''), NULLIF(p->>'gender',''),
      CASE WHEN v_pay THEN private.enc(p->>'national_id') END,
      CASE WHEN v_pay THEN private.enc(p->>'tax_id') END,
      CASE WHEN v_pay THEN private.enc(p->>'bank_account') END,
      CASE WHEN v_pay THEN p->>'bank_name' END)
    RETURNING id INTO v_id;
  ELSE
    -- Without pay access, salary, ID / bank numbers and the login link are
    -- left exactly as they are.
    UPDATE employees SET
      manager_id = NULLIF(p->>'manager_id','')::bigint,
      department_id = NULLIF(p->>'department_id','')::bigint,
      employee_code = p->>'employee_code', full_name = p->>'full_name',
      email = p->>'email', phone = p->>'phone', job_title = p->>'job_title',
      employment_type = COALESCE(p->>'employment_type','full_time'),
      join_date = NULLIF(p->>'join_date','')::date,
      exit_date = NULLIF(p->>'exit_date','')::date,
      base_salary = CASE WHEN v_pay THEN COALESCE(NULLIF(p->>'base_salary','')::numeric, base_salary) ELSE base_salary END,
      user_id = CASE WHEN v_pay AND p ? 'user_id' THEN NULLIF(p->>'user_id','')::bigint ELSE user_id END,
      status = COALESCE(p->>'status','active'),
      date_of_birth = NULLIF(p->>'date_of_birth','')::date,
      residency_status = COALESCE(p->>'residency_status','SC'),
      pr_stage = NULLIF(p->>'pr_stage',''),
      ethnicity = NULLIF(p->>'ethnicity',''),
      marital_status = NULLIF(p->>'marital_status',''),
      gender = NULLIF(p->>'gender',''),
      national_id_enc = CASE WHEN v_pay THEN COALESCE(private.enc(p->>'national_id'), national_id_enc) ELSE national_id_enc END,
      tax_id_enc = CASE WHEN v_pay THEN COALESCE(private.enc(p->>'tax_id'), tax_id_enc) ELSE tax_id_enc END,
      bank_account_enc = CASE WHEN v_pay THEN COALESCE(private.enc(p->>'bank_account'), bank_account_enc) ELSE bank_account_enc END,
      bank_name = CASE WHEN v_pay THEN p->>'bank_name' ELSE bank_name END,
      updated_at = now()
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.hr_list_employees(bigint), public.hr_upsert_employee(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_list_employees(bigint), public.hr_upsert_employee(jsonb) TO authenticated, service_role;

SELECT 'migration 020 complete' AS status;
