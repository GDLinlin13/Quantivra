-- 008_company_lifecycle.sql — deactivate/reinstate cascades to users; hard delete.

-- Deactivating or reinstating a company applies the same active flag to all its
-- login users (so nobody in a suspended company can sign in, and reinstating
-- restores access).
CREATE OR REPLACE FUNCTION public.company_set_active(p_company_id bigint, p_active boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE companies SET is_active = p_active, updated_at = now() WHERE id = p_company_id;
  UPDATE company_users SET is_active = p_active, updated_at = now() WHERE company_id = p_company_id;
$$;

-- Permanently delete a company and everything belonging to it. Every company_id
-- foreign key is ON DELETE CASCADE, so this removes users, roles, employees,
-- leave, payroll runs, payslips, branding, settings — all of it.
-- Guard: the company must be deactivated first.
CREATE OR REPLACE FUNCTION public.company_delete(p_company_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM companies WHERE id = p_company_id AND is_active) THEN
    RAISE EXCEPTION 'Deactivate the company before deleting it';
  END IF;
  DELETE FROM companies WHERE id = p_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.company_set_active(bigint, boolean), public.company_delete(bigint)
  TO anon, authenticated, service_role;

SELECT 'migration 008 complete' AS status;
