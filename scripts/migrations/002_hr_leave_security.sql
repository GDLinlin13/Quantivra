-- ============================================================
-- 002_hr_leave_security.sql
-- Employee module + Leave management + password hashing + PII encryption.
-- Idempotent. Run: node scripts/run-sql.mjs scripts/migrations/002_hr_leave_security.sql
-- ============================================================

-- pgcrypto lives in the "extensions" schema on Supabase; qualify every call.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ------------------------------------------------------------
-- Secret storage: a schema PostgREST does not expose.
-- ------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS private.app_secrets (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- Generate the PII encryption key once, keep it thereafter.
INSERT INTO private.app_secrets (key, value)
VALUES ('pii_key', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION private.pii_key() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = private AS $$
  SELECT value FROM private.app_secrets WHERE key = 'pii_key'
$$;

CREATE OR REPLACE FUNCTION private.enc(p text) RETURNS bytea
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = private, public, extensions AS $$
  SELECT CASE WHEN p IS NULL OR p = '' THEN NULL
    ELSE extensions.pgp_sym_encrypt(p, private.pii_key()) END
$$;

CREATE OR REPLACE FUNCTION private.dec(p bytea) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = private, public, extensions AS $$
  SELECT CASE WHEN p IS NULL THEN NULL
    ELSE extensions.pgp_sym_decrypt(p, private.pii_key()) END
$$;

-- ------------------------------------------------------------
-- Password hashing for company_users  (bcrypt via pgcrypto)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_company_user_password(p_user_id bigint, p_password text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$
  UPDATE company_users SET password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
         updated_at = now()
  WHERE id = p_user_id;
$$;

-- Rehash any plaintext passwords currently stored (bcrypt hashes start with $2)
UPDATE company_users
SET password_hash = extensions.crypt(password_hash, extensions.gen_salt('bf', 10))
WHERE password_hash IS NOT NULL AND left(password_hash, 2) <> '$2';

CREATE OR REPLACE FUNCTION public.company_login(p_company_code text, p_identifier text, p_password text)
RETURNS TABLE (id bigint, company_id bigint, email text, full_name text, job_title text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_company_id bigint;
BEGIN
  SELECT c.id INTO v_company_id FROM companies c
  WHERE lower(c.company_code) = lower(p_company_code) AND c.is_active = true;
  IF v_company_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT u.id, u.company_id, u.email, u.full_name, u.job_title
  FROM company_users u
  WHERE u.company_id = v_company_id
    AND u.is_active = true
    AND (lower(u.email) = lower(p_identifier) OR lower(u.full_name) = lower(p_identifier))
    AND u.password_hash = extensions.crypt(p_password, u.password_hash)
  LIMIT 1;
END;
$$;

-- ------------------------------------------------------------
-- Replace the earlier (aegis-era) HR tables. All are empty in this DB and
-- their schema differs from what this codebase needs (no company_id on
-- leave_requests/leave_balances, different column names, no encrypted PII).
-- ------------------------------------------------------------
DO $$
BEGIN
  -- Only drop when the OLD schema is present (employees without national_id_enc).
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='employees')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='employees' AND column_name='national_id_enc') THEN
    DROP TABLE IF EXISTS employee_documents CASCADE;
    DROP TABLE IF EXISTS leave_requests CASCADE;
    DROP TABLE IF EXISTS leave_balances CASCADE;
    DROP TABLE IF EXISTS leave_types CASCADE;
    DROP TABLE IF EXISTS employees CASCADE;
  END IF;
END $$;

-- ------------------------------------------------------------
-- Departments (company-scoped)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_departments (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id  bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

-- ------------------------------------------------------------
-- Employees
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id      bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id         bigint REFERENCES company_users(id) ON DELETE SET NULL,
  manager_id      bigint REFERENCES employees(id) ON DELETE SET NULL,
  department_id   bigint REFERENCES hr_departments(id) ON DELETE SET NULL,
  employee_code   text NOT NULL,
  full_name       text NOT NULL,
  email           text,
  phone           text,
  job_title       text,
  employment_type text NOT NULL DEFAULT 'full_time',
  join_date       date,
  exit_date       date,
  base_salary     numeric(14,2) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_leave','terminated')),
  -- encrypted PII
  national_id_enc     bytea,
  tax_id_enc          bytea,
  bank_account_enc    bytea,
  bank_name           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, employee_code)
);
CREATE INDEX IF NOT EXISTS idx_employees_company ON employees(company_id);

-- ------------------------------------------------------------
-- Leave
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leave_types (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id        bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name              text NOT NULL,
  code              text,
  default_days      numeric(6,2) NOT NULL DEFAULT 0,
  is_paid           boolean NOT NULL DEFAULT true,
  requires_approval boolean NOT NULL DEFAULT true,
  carry_forward_cap numeric(6,2) NOT NULL DEFAULT 0,
  encashable        boolean NOT NULL DEFAULT false,
  color             text DEFAULT '#4fc3f7',
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS leave_balances (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id     bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id    bigint NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id  bigint NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  year           int NOT NULL,
  entitled_days  numeric(6,2) NOT NULL DEFAULT 0,
  carried_days   numeric(6,2) NOT NULL DEFAULT 0,
  taken_days     numeric(6,2) NOT NULL DEFAULT 0,
  pending_days   numeric(6,2) NOT NULL DEFAULT 0,
  UNIQUE (employee_id, leave_type_id, year)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id     bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id    bigint NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id  bigint NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  start_date     date NOT NULL,
  end_date       date NOT NULL,
  half_day       boolean NOT NULL DEFAULT false,
  days           numeric(6,2) NOT NULL,
  reason         text,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  applied_at     timestamptz NOT NULL DEFAULT now(),
  decided_by     bigint REFERENCES company_users(id) ON DELETE SET NULL,
  decided_at     timestamptz,
  decision_note  text
);
CREATE INDEX IF NOT EXISTS idx_leave_requests_company ON leave_requests(company_id, status);

-- ------------------------------------------------------------
-- Employee RPCs (handle PII encrypt/decrypt)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_list_employees(p_company_id bigint)
RETURNS TABLE (
  id bigint, employee_code text, full_name text, email text, phone text,
  job_title text, employment_type text, join_date date, exit_date date,
  base_salary numeric, status text, department_id bigint, department_name text,
  manager_id bigint, manager_name text, user_id bigint,
  national_id text, tax_id text, bank_account text, bank_name text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public, private AS $$
  SELECT e.id, e.employee_code, e.full_name, e.email, e.phone,
         e.job_title, e.employment_type, e.join_date, e.exit_date,
         e.base_salary, e.status, e.department_id, d.name,
         e.manager_id, m.full_name, e.user_id,
         private.dec(e.national_id_enc), private.dec(e.tax_id_enc),
         private.dec(e.bank_account_enc), e.bank_name
  FROM employees e
  LEFT JOIN hr_departments d ON d.id = e.department_id
  LEFT JOIN employees m ON m.id = e.manager_id
  WHERE e.company_id = p_company_id
  ORDER BY e.full_name;
$$;

CREATE OR REPLACE FUNCTION public.hr_upsert_employee(p jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_id bigint := NULLIF(p->>'id','')::bigint;
BEGIN
  IF v_id IS NULL THEN
    INSERT INTO employees (company_id, user_id, manager_id, department_id, employee_code,
      full_name, email, phone, job_title, employment_type, join_date, exit_date,
      base_salary, status, national_id_enc, tax_id_enc, bank_account_enc, bank_name)
    VALUES (
      (p->>'company_id')::bigint, NULLIF(p->>'user_id','')::bigint,
      NULLIF(p->>'manager_id','')::bigint, NULLIF(p->>'department_id','')::bigint,
      p->>'employee_code', p->>'full_name', p->>'email', p->>'phone', p->>'job_title',
      COALESCE(p->>'employment_type','full_time'), NULLIF(p->>'join_date','')::date,
      NULLIF(p->>'exit_date','')::date, COALESCE((p->>'base_salary')::numeric,0),
      COALESCE(p->>'status','active'),
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
      national_id_enc = COALESCE(private.enc(p->>'national_id'), national_id_enc),
      tax_id_enc = COALESCE(private.enc(p->>'tax_id'), tax_id_enc),
      bank_account_enc = COALESCE(private.enc(p->>'bank_account'), bank_account_enc),
      bank_name = p->>'bank_name', updated_at = now()
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_delete_employee(p_id bigint)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM employees WHERE id = p_id;
$$;

-- ------------------------------------------------------------
-- Leave RPCs (keep balances consistent)
-- ------------------------------------------------------------
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
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_decide(p_request_id bigint, p_decision text, p_note text, p_decided_by bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r leave_requests%ROWTYPE; v_year int;
BEGIN
  SELECT * INTO r FROM leave_requests WHERE id = p_request_id;
  IF NOT FOUND OR r.status <> 'pending' THEN RETURN; END IF;
  v_year := EXTRACT(YEAR FROM r.start_date);

  UPDATE leave_requests SET status = p_decision, decision_note = p_note,
    decided_by = p_decided_by, decided_at = now()
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
END;
$$;

-- ------------------------------------------------------------
-- Grants + RLS (consistent with this dev DB: RLS off, anon allowed)
-- ------------------------------------------------------------
ALTER TABLE hr_departments   DISABLE ROW LEVEL SECURITY;
ALTER TABLE employees        DISABLE ROW LEVEL SECURITY;
ALTER TABLE leave_types      DISABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances   DISABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests   DISABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.company_login(text,text,text),
  public.set_company_user_password(bigint,text),
  public.hr_list_employees(bigint),
  public.hr_upsert_employee(jsonb),
  public.hr_delete_employee(bigint),
  public.leave_apply(jsonb),
  public.leave_decide(bigint,text,text,bigint)
TO anon, authenticated, service_role;

-- Do NOT expose the PII helpers or secret table
REVOKE ALL ON FUNCTION private.enc(text), private.dec(bytea), private.pii_key() FROM anon, authenticated;

SELECT 'migration 002 complete' AS status;
