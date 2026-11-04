-- ============================================================
-- 011_auth_rls.sql — Security foundation.
--
-- Before this migration the database trusted anyone holding the public
-- "anon" key (it ships inside the web app): every table was readable and
-- writable, RLS was off, and the employee RPCs returned decrypted ID/bank
-- numbers for any company id passed in.
--
-- After it:
--   * Sign-in is Supabase Auth. company_users / platform_users are linked to
--     auth.users via auth_user_id. No password hashes live in public tables.
--   * The anon key can read/write nothing. Signed-in users only see rows of
--     companies they belong to (tenant isolation by RLS); platform admins see
--     everything.
--   * Every SECURITY DEFINER RPC checks the caller before touching data.
--
-- RULES FOR FUTURE MIGRATIONS (see also CLAUDE.md):
--   * Never GRANT anything to anon. Never DISABLE ROW LEVEL SECURITY.
--   * A new table with company_id must get the tenant policy:
--       SELECT public.app_apply_tenant_policy('<table>');
--   * A SECURITY DEFINER function must call public.app_require_company(...)
--     or public.app_require_platform_admin() first.
--   * scripts/security-tests/run.sh checks all of this.
--
-- Idempotent. Paste into the Supabase SQL editor, or:
--   node scripts/run-sql.mjs scripts/migrations/011_auth_rls.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Link app users to Supabase Auth
-- ------------------------------------------------------------
ALTER TABLE company_users  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE platform_users ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_company_users_auth ON company_users(auth_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_users_company_auth ON company_users(company_id, auth_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_users_auth ON platform_users(auth_user_id);

-- Move legacy bcrypt hashes out of the API-visible schema. The
-- "migrate_legacy_users" admin action copies them into Supabase Auth (same
-- bcrypt format, so nobody has to reset a password) and then deletes them.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.legacy_password_hashes (
  company_user_id bigint PRIMARY KEY REFERENCES public.company_users(id) ON DELETE CASCADE,
  password_hash   text NOT NULL
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='company_users' AND column_name='password_hash') THEN
    INSERT INTO private.legacy_password_hashes (company_user_id, password_hash)
    SELECT id, password_hash FROM public.company_users
    WHERE password_hash IS NOT NULL AND left(password_hash, 2) = '$2' AND auth_user_id IS NULL
    ON CONFLICT (company_user_id) DO NOTHING;
    ALTER TABLE public.company_users DROP COLUMN password_hash;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='platform_users' AND column_name='password_hash') THEN
    ALTER TABLE public.platform_users DROP COLUMN password_hash;
  END IF;
END $$;

-- The old custom login and password RPCs are replaced by Supabase Auth.
DROP FUNCTION IF EXISTS public.company_login(text, text, text);
DROP FUNCTION IF EXISTS public.set_company_user_password(bigint, text);

-- ------------------------------------------------------------
-- 2. Who is calling?
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM platform_users p WHERE p.auth_user_id = auth.uid() AND p.is_active)
$$;

-- Companies the caller belongs to (active membership in an active company).
CREATE OR REPLACE FUNCTION public.app_my_company_ids() RETURNS SETOF bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cu.company_id FROM company_users cu
  JOIN companies c ON c.id = cu.company_id
  WHERE auth.uid() IS NOT NULL AND cu.auth_user_id = auth.uid() AND cu.is_active AND c.is_active
$$;

CREATE OR REPLACE FUNCTION public.app_can_access_company(p_company_id bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.app_is_platform_admin() OR p_company_id IN (SELECT public.app_my_company_ids())
$$;

CREATE OR REPLACE FUNCTION public.app_require_company(p_company_id bigint) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.app_is_privileged_role() THEN RETURN; END IF;
  IF p_company_id IS NULL OR NOT public.app_can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'Not authorised for this company' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.app_require_platform_admin() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.app_is_privileged_role() OR public.app_is_platform_admin()) THEN
    RAISE EXCEPTION 'Platform administrator only' USING ERRCODE = '42501';
  END IF;
END $$;

-- True for the database owner (SQL editor, migrations) and for requests made
-- with the server-side service key (the /api/admin-users function). Every
-- browser request arrives through PostgREST's "authenticator" login with an
-- anon/authenticated JWT, so it is never privileged. This deliberately does
-- not use current_user, which is the function owner inside SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.app_is_privileged_role() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN session_user = 'authenticator'
    THEN coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
    ELSE true END
$$;

-- ------------------------------------------------------------
-- 3. Sign-in lookups (called right after supabase.auth.signInWithPassword)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_sign_in_company(p_company_code text)
RETURNS TABLE (id bigint, company_id bigint, email text, full_name text, job_title text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.company_id, u.email, u.full_name, u.job_title
  FROM company_users u JOIN companies c ON c.id = u.company_id
  WHERE auth.uid() IS NOT NULL
    AND u.auth_user_id = auth.uid()
    AND lower(c.company_code) = lower(p_company_code)
    AND c.is_active AND u.is_active
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.app_sign_in_platform()
RETURNS TABLE (id bigint, username text, email text, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.username, p.email, p.full_name FROM platform_users p
  WHERE auth.uid() IS NOT NULL AND p.auth_user_id = auth.uid() AND p.is_active
  LIMIT 1
$$;

-- Owner bootstrap: after creating your login under Supabase → Authentication →
-- Users → "Add user", run:  SELECT public.grant_platform_admin('you@example.com');
-- Only the database owner (SQL editor) or the service key can call this.
CREATE OR REPLACE FUNCTION public.grant_platform_admin(p_email text, p_full_name text DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid; v_id bigint;
BEGIN
  IF NOT public.app_is_privileged_role() THEN
    RAISE EXCEPTION 'Run this from the Supabase SQL editor' USING ERRCODE = '42501';
  END IF;
  SELECT u.id INTO v_uid FROM auth.users u WHERE lower(u.email) = lower(p_email);
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No Supabase Auth user with email %. Create it under Authentication → Users first.', p_email;
  END IF;
  SELECT p.id INTO v_id FROM platform_users p WHERE p.auth_user_id = v_uid OR lower(p.email) = lower(p_email) LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO platform_users (username, email, full_name, auth_user_id, is_active)
    VALUES (lower(p_email), lower(p_email), coalesce(p_full_name, split_part(p_email, '@', 1)), v_uid, true)
    RETURNING id INTO v_id;
  ELSE
    UPDATE platform_users SET auth_user_id = v_uid, is_active = true, updated_at = now() WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$;

-- Server-side helpers for /api/admin-users (service key only).
CREATE OR REPLACE FUNCTION public.app_find_auth_user(p_email text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.app_is_privileged_role()
    THEN (SELECT u.id FROM auth.users u WHERE lower(u.email) = lower(p_email) LIMIT 1) END
$$;

CREATE OR REPLACE FUNCTION public.app_legacy_password_hashes()
RETURNS TABLE (company_user_id bigint, email text, password_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT l.company_user_id, u.email, l.password_hash
  FROM private.legacy_password_hashes l JOIN company_users u ON u.id = l.company_user_id
  WHERE public.app_is_privileged_role() AND u.auth_user_id IS NULL
$$;

CREATE OR REPLACE FUNCTION public.app_clear_legacy_password(p_company_user_id bigint) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, private AS $$
  DELETE FROM private.legacy_password_hashes
  WHERE company_user_id = p_company_user_id AND public.app_is_privileged_role()
$$;

-- ------------------------------------------------------------
-- 4. Guard columns that only the platform may change
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_guard_companies() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.app_is_privileged_role() OR public.app_is_platform_admin() THEN RETURN NEW; END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.company_code IS DISTINCT FROM OLD.company_code
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Only the platform can change company status or code' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_companies ON companies;
CREATE TRIGGER trg_guard_companies BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION public.app_guard_companies();

-- Login links are created by the server function, never by the browser.
CREATE OR REPLACE FUNCTION public.app_guard_auth_link() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.app_is_privileged_role() OR public.app_is_platform_admin() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND NEW.auth_user_id IS NOT NULL
     OR TG_OP = 'UPDATE' AND NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    RAISE EXCEPTION 'Login accounts are managed by the server' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_auth_link ON company_users;
CREATE TRIGGER trg_guard_auth_link BEFORE INSERT OR UPDATE ON company_users
  FOR EACH ROW EXECUTE FUNCTION public.app_guard_auth_link();

-- ------------------------------------------------------------
-- 5. Row Level Security
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_drop_policies(p_table text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = p_table LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, p_table);
  END LOOP;
END $$;

-- Rows belong to the company in their company_id column.
CREATE OR REPLACE FUNCTION public.app_apply_tenant_policy(p_table text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.app_drop_policies(p_table);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format($f$CREATE POLICY tenant_rows ON public.%I FOR ALL TO authenticated
    USING ((SELECT public.app_is_platform_admin()) OR company_id IN (SELECT public.app_my_company_ids()))
    WITH CHECK ((SELECT public.app_is_platform_admin()) OR company_id IN (SELECT public.app_my_company_ids()))$f$, p_table);
END $$;

-- Rows belong to the company of a parent row (e.g. permissions → role).
CREATE OR REPLACE FUNCTION public.app_apply_child_policy(p_table text, p_fk text, p_parent text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_rule text;
BEGIN
  PERFORM public.app_drop_policies(p_table);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  v_rule := format($f$(SELECT public.app_is_platform_admin()) OR EXISTS (
      SELECT 1 FROM public.%I p WHERE p.id = %I AND p.company_id IN (SELECT public.app_my_company_ids()))$f$,
    p_parent, p_fk);
  EXECUTE format('CREATE POLICY tenant_rows ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
    p_table, v_rule, v_rule);
END $$;

-- Shared reference data (country packs etc.): any signed-in user reads,
-- only platform admins write.
CREATE OR REPLACE FUNCTION public.app_apply_reference_policy(p_table text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.app_drop_policies(p_table);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('CREATE POLICY reference_read ON public.%I FOR SELECT TO authenticated USING (true)', p_table);
  EXECUTE format($f$CREATE POLICY reference_write ON public.%I FOR ALL TO authenticated
    USING ((SELECT public.app_is_platform_admin())) WITH CHECK ((SELECT public.app_is_platform_admin()))$f$, p_table);
END $$;

-- Platform-only data.
CREATE OR REPLACE FUNCTION public.app_apply_platform_policy(p_table text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.app_drop_policies(p_table);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format($f$CREATE POLICY platform_only ON public.%I FOR ALL TO authenticated
    USING ((SELECT public.app_is_platform_admin())) WITH CHECK ((SELECT public.app_is_platform_admin()))$f$, p_table);
END $$;

REVOKE ALL ON FUNCTION public.app_drop_policies(text), public.app_apply_tenant_policy(text),
  public.app_apply_child_policy(text, text, text), public.app_apply_reference_policy(text),
  public.app_apply_platform_policy(text) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t text;
  -- tables whose company lives on a parent row: table, fk column, parent table
  children text[][] := ARRAY[
    ['company_permissions', 'role_id',     'company_roles'],
    ['company_user_roles',  'user_id',     'company_users'],
    ['workflow_steps',      'template_id', 'workflow_templates'],
    ['workflow_logs',       'instance_id', 'workflow_instances']
  ];
  platform_tables text[] := ARRAY['platform_users','platform_roles','platform_permissions','platform_audit_log'];
  special text[] := ARRAY['companies','platform_subscriptions','audit_log'];
  handled text[] := ARRAY[]::text[];
  reference text[] := ARRAY[]::text[];
  i int;
BEGIN
  FOR i IN 1 .. array_length(children, 1) LOOP
    IF to_regclass('public.' || children[i][1]) IS NOT NULL THEN
      PERFORM public.app_apply_child_policy(children[i][1], children[i][2], children[i][3]);
    END IF;
    handled := handled || children[i][1];
  END LOOP;

  FOREACH t IN ARRAY platform_tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN PERFORM public.app_apply_platform_policy(t); END IF;
    handled := handled || t;
  END LOOP;
  handled := handled || special;

  FOR t IN
    SELECT c.table_name FROM information_schema.tables c
    WHERE c.table_schema = 'public' AND c.table_type = 'BASE TABLE' AND c.table_name <> ALL (handled)
    ORDER BY 1
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = t AND column_name = 'company_id') THEN
      PERFORM public.app_apply_tenant_policy(t);
    ELSE
      PERFORM public.app_apply_reference_policy(t);
      reference := reference || t;
    END IF;
  END LOOP;

  -- Review this list: anything here that actually holds company data needs
  -- a company_id column or an entry in "children" above.
  RAISE NOTICE 'Shared reference tables (readable by every signed-in user): %', array_to_string(reference, ', ');
END $$;

-- companies: members read and edit their own company (status/code guarded
-- by trigger); only the platform creates or deletes companies.
DO $$ BEGIN PERFORM public.app_drop_policies('companies'); END $$;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_read ON companies FOR SELECT TO authenticated
  USING ((SELECT public.app_is_platform_admin()) OR id IN (SELECT public.app_my_company_ids()));
CREATE POLICY company_update ON companies FOR UPDATE TO authenticated
  USING ((SELECT public.app_is_platform_admin()) OR id IN (SELECT public.app_my_company_ids()))
  WITH CHECK ((SELECT public.app_is_platform_admin()) OR id IN (SELECT public.app_my_company_ids()));
CREATE POLICY company_platform_write ON companies FOR ALL TO authenticated
  USING ((SELECT public.app_is_platform_admin())) WITH CHECK ((SELECT public.app_is_platform_admin()));

-- Subscriptions: a company can see its plan; only the platform changes it.
DO $$ BEGIN
  IF to_regclass('public.platform_subscriptions') IS NOT NULL THEN
    PERFORM public.app_drop_policies('platform_subscriptions');
    ALTER TABLE platform_subscriptions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY subscription_read ON platform_subscriptions FOR SELECT TO authenticated
      USING ((SELECT public.app_is_platform_admin()) OR company_id IN (SELECT public.app_my_company_ids()));
    CREATE POLICY subscription_platform_write ON platform_subscriptions FOR ALL TO authenticated
      USING ((SELECT public.app_is_platform_admin())) WITH CHECK ((SELECT public.app_is_platform_admin()));
  END IF;
END $$;

-- Company audit log: members add and read entries; nobody but the platform
-- edits or deletes them.
DO $$ BEGIN
  IF to_regclass('public.audit_log') IS NOT NULL THEN
    PERFORM public.app_drop_policies('audit_log');
    ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
    CREATE POLICY audit_read ON audit_log FOR SELECT TO authenticated
      USING ((SELECT public.app_is_platform_admin()) OR company_id IN (SELECT public.app_my_company_ids()));
    CREATE POLICY audit_insert ON audit_log FOR INSERT TO authenticated
      WITH CHECK ((SELECT public.app_is_platform_admin()) OR company_id IN (SELECT public.app_my_company_ids()));
    CREATE POLICY audit_platform_write ON audit_log FOR ALL TO authenticated
      USING ((SELECT public.app_is_platform_admin())) WITH CHECK ((SELECT public.app_is_platform_admin()));
  END IF;
END $$;

-- ------------------------------------------------------------
-- 6. RPCs: same behaviour as before, plus a caller check first
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_list_employees(p_company_id bigint)
RETURNS TABLE (
  id bigint, employee_code text, full_name text, email text, phone text,
  job_title text, employment_type text, join_date date, exit_date date,
  base_salary numeric, status text, department_id bigint, department_name text,
  manager_id bigint, manager_name text, user_id bigint,
  date_of_birth date, residency_status text, pr_stage text, ethnicity text, marital_status text,
  national_id text, tax_id text, bank_account text, bank_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  PERFORM public.app_require_company(p_company_id);
  RETURN QUERY
  SELECT e.id, e.employee_code, e.full_name, e.email, e.phone,
         e.job_title, e.employment_type, e.join_date, e.exit_date,
         e.base_salary, e.status, e.department_id, d.name,
         e.manager_id, m.full_name, e.user_id,
         e.date_of_birth, e.residency_status, e.pr_stage, e.ethnicity, e.marital_status,
         private.dec(e.national_id_enc), private.dec(e.tax_id_enc),
         private.dec(e.bank_account_enc), e.bank_name
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
BEGIN
  IF v_id IS NULL THEN
    v_company := (p->>'company_id')::bigint;
  ELSE
    SELECT e.company_id INTO v_company FROM employees e WHERE e.id = v_id;
  END IF;
  PERFORM public.app_require_company(v_company);

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
      base_salary, status, date_of_birth, residency_status, pr_stage, ethnicity, marital_status,
      national_id_enc, tax_id_enc, bank_account_enc, bank_name)
    VALUES (
      v_company, NULLIF(p->>'user_id','')::bigint,
      NULLIF(p->>'manager_id','')::bigint, NULLIF(p->>'department_id','')::bigint,
      p->>'employee_code', p->>'full_name', p->>'email', p->>'phone', p->>'job_title',
      COALESCE(p->>'employment_type','full_time'), NULLIF(p->>'join_date','')::date,
      NULLIF(p->>'exit_date','')::date, COALESCE((p->>'base_salary')::numeric,0),
      COALESCE(p->>'status','active'),
      NULLIF(p->>'date_of_birth','')::date, COALESCE(p->>'residency_status','SC'),
      NULLIF(p->>'pr_stage',''), NULLIF(p->>'ethnicity',''), NULLIF(p->>'marital_status',''),
      private.enc(p->>'national_id'), private.enc(p->>'tax_id'),
      private.enc(p->>'bank_account'), p->>'bank_name')
    RETURNING id INTO v_id;
  ELSE
    UPDATE employees SET
      manager_id = NULLIF(p->>'manager_id','')::bigint,
      department_id = NULLIF(p->>'department_id','')::bigint,
      employee_code = p->>'employee_code', full_name = p->>'full_name',
      email = p->>'email', phone = p->>'phone', job_title = p->>'job_title',
      employment_type = COALESCE(p->>'employment_type','full_time'),
      join_date = NULLIF(p->>'join_date','')::date,
      exit_date = NULLIF(p->>'exit_date','')::date,
      base_salary = COALESCE((p->>'base_salary')::numeric,0),
      status = COALESCE(p->>'status','active'),
      date_of_birth = NULLIF(p->>'date_of_birth','')::date,
      residency_status = COALESCE(p->>'residency_status','SC'),
      pr_stage = NULLIF(p->>'pr_stage',''),
      ethnicity = NULLIF(p->>'ethnicity',''),
      marital_status = NULLIF(p->>'marital_status',''),
      national_id_enc = COALESCE(private.enc(p->>'national_id'), national_id_enc),
      tax_id_enc = COALESCE(private.enc(p->>'tax_id'), tax_id_enc),
      bank_account_enc = COALESCE(private.enc(p->>'bank_account'), bank_account_enc),
      bank_name = p->>'bank_name', updated_at = now()
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.hr_delete_employee(p_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.app_require_company((SELECT e.company_id FROM employees e WHERE e.id = p_id));
  DELETE FROM employees WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION public.leave_apply(p jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company_id bigint := (p->>'company_id')::bigint;
  v_emp bigint := (p->>'employee_id')::bigint;
  v_type bigint := (p->>'leave_type_id')::bigint;
  v_days numeric := (p->>'days')::numeric;
  v_year int := EXTRACT(YEAR FROM (p->>'start_date')::date);
  v_id bigint;
BEGIN
  PERFORM public.app_require_company(v_company_id);
  IF NOT EXISTS (SELECT 1 FROM employees WHERE id = v_emp AND company_id = v_company_id)
     OR NOT EXISTS (SELECT 1 FROM leave_types WHERE id = v_type AND company_id = v_company_id) THEN
    RAISE EXCEPTION 'Employee and leave type must belong to the company' USING ERRCODE = '42501';
  END IF;

  INSERT INTO leave_requests (company_id, employee_id, leave_type_id, start_date, end_date,
    half_day, days, reason)
  VALUES (v_company_id, v_emp, v_type, (p->>'start_date')::date, (p->>'end_date')::date,
    COALESCE((p->>'half_day')::boolean,false), v_days, p->>'reason')
  RETURNING id INTO v_id;

  INSERT INTO leave_balances (company_id, employee_id, leave_type_id, year, pending_days)
  VALUES (v_company_id, v_emp, v_type, v_year, v_days)
  ON CONFLICT (employee_id, leave_type_id, year)
  DO UPDATE SET pending_days = leave_balances.pending_days + v_days;

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.leave_decide(p_request_id bigint, p_decision text, p_note text, p_decided_by bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r leave_requests%ROWTYPE; v_year int; v_decider bigint;
BEGIN
  SELECT * INTO r FROM leave_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM public.app_require_company(r.company_id);
  IF r.status <> 'pending' THEN RETURN; END IF;
  v_year := EXTRACT(YEAR FROM r.start_date);
  SELECT u.id INTO v_decider FROM company_users u WHERE u.id = p_decided_by AND u.company_id = r.company_id;

  UPDATE leave_requests SET status = p_decision, decision_note = p_note,
    decided_by = v_decider, decided_at = now()
  WHERE id = p_request_id;

  IF p_decision = 'approved' THEN
    UPDATE leave_balances
    SET pending_days = GREATEST(pending_days - r.days, 0),
        taken_days = taken_days + r.days
    WHERE employee_id = r.employee_id AND leave_type_id = r.leave_type_id AND year = v_year;
  ELSE
    UPDATE leave_balances
    SET pending_days = GREATEST(pending_days - r.days, 0)
    WHERE employee_id = r.employee_id AND leave_type_id = r.leave_type_id AND year = v_year;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.company_set_active(p_company_id bigint, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.app_require_platform_admin();
  UPDATE companies SET is_active = p_active, updated_at = now() WHERE id = p_company_id;
  UPDATE company_users SET is_active = p_active, updated_at = now() WHERE company_id = p_company_id;
END $$;

CREATE OR REPLACE FUNCTION public.company_delete(p_company_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.app_require_platform_admin();
  IF EXISTS (SELECT 1 FROM companies WHERE id = p_company_id AND is_active) THEN
    RAISE EXCEPTION 'Deactivate the company before deleting it';
  END IF;
  DELETE FROM companies WHERE id = p_company_id;
END $$;

-- ------------------------------------------------------------
-- 7. Privileges: nothing for anon; signed-in users go through RLS
-- ------------------------------------------------------------
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Server-only and setup-only functions: not callable from the browser.
REVOKE EXECUTE ON FUNCTION
  public.app_find_auth_user(text), public.app_legacy_password_hashes(),
  public.app_clear_legacy_password(bigint), public.grant_platform_admin(text, text),
  public.app_drop_policies(text), public.app_apply_tenant_policy(text),
  public.app_apply_child_policy(text, text, text), public.app_apply_reference_policy(text),
  public.app_apply_platform_policy(text)
FROM authenticated;

-- New objects created later stop being handed to anon automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.enc(text), private.dec(bytea), private.pii_key() FROM PUBLIC, anon, authenticated;

-- Report SECURITY DEFINER functions (they skip RLS) that have no caller check.
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
    AND p.prosrc !~ 'app_require_(company|platform_admin)|app_is_privileged_role|auth\.uid\(\)'
    AND p.proname NOT IN ('app_is_platform_admin', 'app_my_company_ids', 'app_can_access_company',
                          'app_require_company', 'app_require_platform_admin');
  IF v IS NOT NULL THEN
    RAISE WARNING 'SECURITY DEFINER functions without a caller check — review: %', v;
  END IF;
END $$;

SELECT 'migration 011 complete' AS status;
