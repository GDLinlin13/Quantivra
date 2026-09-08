-- ============================================================
-- 003_payroll.sql — Payroll runs + payslips, employee payroll fields.
-- Idempotent. node scripts/run-sql.mjs scripts/migrations/003_payroll.sql
-- ============================================================

-- Employee fields the payroll engine needs
ALTER TABLE employees ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS residency_status text NOT NULL DEFAULT 'SC';   -- SC | PR | EP | SP | WP | DP | OTHER
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pr_stage text;                                  -- year_1 | year_2 | year_3_plus | null

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_runs (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id        bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_year       int NOT NULL,
  period_month      int NOT NULL,
  pay_date          date NOT NULL,
  frequency         text NOT NULL DEFAULT 'monthly',
  currency          text NOT NULL DEFAULT 'SGD',
  country_code      text NOT NULL DEFAULT 'SG',
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalised','paid')),
  engine_version    text,
  total_gross       numeric(16,2) NOT NULL DEFAULT 0,
  total_deductions  numeric(16,2) NOT NULL DEFAULT 0,
  total_employer    numeric(16,2) NOT NULL DEFAULT 0,
  total_net         numeric(16,2) NOT NULL DEFAULT 0,
  total_stat_ee     numeric(16,2) NOT NULL DEFAULT 0,
  total_stat_er     numeric(16,2) NOT NULL DEFAULT 0,
  created_by        bigint REFERENCES company_users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  finalised_at      timestamptz,
  UNIQUE (company_id, period_year, period_month, frequency)
);

CREATE TABLE IF NOT EXISTS payslips (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id             bigint NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  company_id         bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id        bigint NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  employee_name      text NOT NULL,
  employee_code      text,
  gross_pay          numeric(14,2) NOT NULL DEFAULT 0,
  total_deductions   numeric(14,2) NOT NULL DEFAULT 0,
  total_employer     numeric(14,2) NOT NULL DEFAULT 0,
  net_pay            numeric(14,2) NOT NULL DEFAULT 0,
  tax_withheld       numeric(14,2) NOT NULL DEFAULT 0,
  earnings_json      jsonb NOT NULL DEFAULT '[]',
  deductions_json    jsonb NOT NULL DEFAULT '[]',
  employer_json      jsonb NOT NULL DEFAULT '[]',
  statutory_json     jsonb NOT NULL DEFAULT '[]',
  result_json        jsonb NOT NULL DEFAULT '{}',
  status             text NOT NULL DEFAULT 'draft',
  errors             text[],
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_payslips_company ON payslips(company_id);

ALTER TABLE payroll_runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE payslips     DISABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Refresh employee RPCs to carry the new payroll fields
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.hr_list_employees(bigint);
CREATE OR REPLACE FUNCTION public.hr_list_employees(p_company_id bigint)
RETURNS TABLE (
  id bigint, employee_code text, full_name text, email text, phone text,
  job_title text, employment_type text, join_date date, exit_date date,
  base_salary numeric, status text, department_id bigint, department_name text,
  manager_id bigint, manager_name text, user_id bigint,
  date_of_birth date, residency_status text, pr_stage text,
  national_id text, tax_id text, bank_account text, bank_name text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public, private AS $$
  SELECT e.id, e.employee_code, e.full_name, e.email, e.phone,
         e.job_title, e.employment_type, e.join_date, e.exit_date,
         e.base_salary, e.status, e.department_id, d.name,
         e.manager_id, m.full_name, e.user_id,
         e.date_of_birth, e.residency_status, e.pr_stage,
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
      base_salary, status, date_of_birth, residency_status, pr_stage,
      national_id_enc, tax_id_enc, bank_account_enc, bank_name)
    VALUES (
      (p->>'company_id')::bigint, NULLIF(p->>'user_id','')::bigint,
      NULLIF(p->>'manager_id','')::bigint, NULLIF(p->>'department_id','')::bigint,
      p->>'employee_code', p->>'full_name', p->>'email', p->>'phone', p->>'job_title',
      COALESCE(p->>'employment_type','full_time'), NULLIF(p->>'join_date','')::date,
      NULLIF(p->>'exit_date','')::date, COALESCE((p->>'base_salary')::numeric,0),
      COALESCE(p->>'status','active'),
      NULLIF(p->>'date_of_birth','')::date, COALESCE(p->>'residency_status','SC'),
      NULLIF(p->>'pr_stage',''),
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
      national_id_enc = COALESCE(private.enc(p->>'national_id'), national_id_enc),
      tax_id_enc = COALESCE(private.enc(p->>'tax_id'), tax_id_enc),
      bank_account_enc = COALESCE(private.enc(p->>'bank_account'), bank_account_enc),
      bank_name = p->>'bank_name', updated_at = now()
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$$;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

SELECT 'migration 003 complete' AS status;
