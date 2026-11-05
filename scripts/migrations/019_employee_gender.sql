-- 019_employee_gender.sql — record an employee's gender, so parental leave
-- goes to the right parent (maternity for mothers, paternity for fathers).
-- Expected births are recorded as a dependant with relationship
-- 'expected_child' and the expected delivery date. Idempotent.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS gender text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_gender_check') THEN
    ALTER TABLE employees ADD CONSTRAINT employees_gender_check CHECK (gender IS NULL OR gender IN ('female', 'male'));
  END IF;
END $$;

-- Employee lookups now include gender (same caller checks as migration 011).
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
BEGIN
  PERFORM public.app_require_company(p_company_id);
  RETURN QUERY
  SELECT e.id, e.employee_code, e.full_name, e.email, e.phone,
         e.job_title, e.employment_type, e.join_date, e.exit_date,
         e.base_salary, e.status, e.department_id, d.name,
         e.manager_id, m.full_name, e.user_id,
         e.date_of_birth, e.residency_status, e.pr_stage, e.ethnicity, e.marital_status, e.gender,
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
      base_salary, status, date_of_birth, residency_status, pr_stage, ethnicity, marital_status, gender,
      national_id_enc, tax_id_enc, bank_account_enc, bank_name)
    VALUES (
      v_company, NULLIF(p->>'user_id','')::bigint,
      NULLIF(p->>'manager_id','')::bigint, NULLIF(p->>'department_id','')::bigint,
      p->>'employee_code', p->>'full_name', p->>'email', p->>'phone', p->>'job_title',
      COALESCE(p->>'employment_type','full_time'), NULLIF(p->>'join_date','')::date,
      NULLIF(p->>'exit_date','')::date, COALESCE((p->>'base_salary')::numeric,0),
      COALESCE(p->>'status','active'),
      NULLIF(p->>'date_of_birth','')::date, COALESCE(p->>'residency_status','SC'),
      NULLIF(p->>'pr_stage',''), NULLIF(p->>'ethnicity',''), NULLIF(p->>'marital_status',''), NULLIF(p->>'gender',''),
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
      gender = NULLIF(p->>'gender',''),
      national_id_enc = COALESCE(private.enc(p->>'national_id'), national_id_enc),
      tax_id_enc = COALESCE(private.enc(p->>'tax_id'), tax_id_enc),
      bank_account_enc = COALESCE(private.enc(p->>'bank_account'), bank_account_enc),
      bank_name = p->>'bank_name', updated_at = now()
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$;


REVOKE ALL ON FUNCTION public.hr_list_employees(bigint), public.hr_upsert_employee(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_list_employees(bigint), public.hr_upsert_employee(jsonb) TO authenticated, service_role;

SELECT 'migration 019 complete' AS status;
