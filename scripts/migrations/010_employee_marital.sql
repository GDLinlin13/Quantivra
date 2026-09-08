-- 010_employee_marital.sql — surface marital_status through the employee RPCs.
DROP FUNCTION IF EXISTS public.hr_list_employees(bigint);
CREATE OR REPLACE FUNCTION public.hr_list_employees(p_company_id bigint)
RETURNS TABLE (
  id bigint, employee_code text, full_name text, email text, phone text,
  job_title text, employment_type text, join_date date, exit_date date,
  base_salary numeric, status text, department_id bigint, department_name text,
  manager_id bigint, manager_name text, user_id bigint,
  date_of_birth date, residency_status text, pr_stage text, ethnicity text, marital_status text,
  national_id text, tax_id text, bank_account text, bank_name text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public, private AS $$
  SELECT e.id, e.employee_code, e.full_name, e.email, e.phone,
         e.job_title, e.employment_type, e.join_date, e.exit_date,
         e.base_salary, e.status, e.department_id, d.name,
         e.manager_id, m.full_name, e.user_id,
         e.date_of_birth, e.residency_status, e.pr_stage, e.ethnicity, e.marital_status,
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
      base_salary, status, date_of_birth, residency_status, pr_stage, ethnicity, marital_status,
      national_id_enc, tax_id_enc, bank_account_enc, bank_name)
    VALUES (
      (p->>'company_id')::bigint, NULLIF(p->>'user_id','')::bigint,
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
END;
$$;
GRANT EXECUTE ON FUNCTION public.hr_list_employees(bigint), public.hr_upsert_employee(jsonb) TO anon, authenticated, service_role;
SELECT 'migration 010 complete' AS status;
