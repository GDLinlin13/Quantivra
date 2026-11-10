-- 038_payslip_bank.sql — each payslip keeps the bank account it was paid to.
-- The employee record only holds the current account, so an older payslip used to show a newer account once it
-- changed. The account at the time of each run is now kept, encrypted like the employee's (private.enc), in
-- payslip_bank, one row per run and employee, and read back only by users who may see pay. Re-running a month
-- keeps the first one. Existing payslips get the employee's account where it is still the one they were paid to;
-- older ones can be filled in by hand from the payslip. Idempotent.

CREATE TABLE IF NOT EXISTS payslip_bank (
  run_id            bigint NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  company_id        bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id       bigint NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  bank_account_enc  bytea,
  bank_name         text,
  PRIMARY KEY (run_id, employee_id)
);
SELECT public.app_apply_tenant_policy('payslip_bank');
-- only through the functions below (the numbers are decrypted there, for pay users only)
REVOKE ALL ON payslip_bank FROM anon, authenticated;

-- after a payroll run: keep each employee's current account for this run (the first one stays on a re-run)
CREATE OR REPLACE FUNCTION public.payroll_keep_bank(p_run_id bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  PERFORM public.app_require_company((SELECT r.company_id FROM payroll_runs r WHERE r.id = p_run_id));
  IF NOT public.app_can_view_pay((SELECT r.company_id FROM payroll_runs r WHERE r.id = p_run_id)) THEN
    RAISE EXCEPTION 'Not allowed to see pay' USING ERRCODE = '42501';
  END IF;
  INSERT INTO payslip_bank (run_id, company_id, employee_id, bank_account_enc, bank_name)
  SELECT s.run_id, s.company_id, s.employee_id, e.bank_account_enc, e.bank_name
  FROM payslips s JOIN employees e ON e.id = s.employee_id AND e.company_id = s.company_id
  WHERE s.run_id = p_run_id
  ON CONFLICT (run_id, employee_id) DO NOTHING;
END $$;

-- the accounts a run's payslips were paid to (pay users only; others get nothing)
CREATE OR REPLACE FUNCTION public.payroll_bank_accounts(p_run_id bigint)
RETURNS TABLE (employee_id bigint, bank_account text, bank_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  PERFORM public.app_require_company((SELECT r.company_id FROM payroll_runs r WHERE r.id = p_run_id));
  IF NOT public.app_can_view_pay((SELECT r.company_id FROM payroll_runs r WHERE r.id = p_run_id)) THEN RETURN; END IF;
  RETURN QUERY SELECT b.employee_id, private.dec(b.bank_account_enc), b.bank_name FROM payslip_bank b WHERE b.run_id = p_run_id;
END $$;

-- set the account an older payslip was paid to, by hand
CREATE OR REPLACE FUNCTION public.payroll_set_bank(p_run_id bigint, p_employee_id bigint, p_bank_account text, p_bank_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_company bigint;
BEGIN
  PERFORM public.app_require_company((SELECT r.company_id FROM payroll_runs r WHERE r.id = p_run_id));
  v_company := (SELECT r.company_id FROM payroll_runs r WHERE r.id = p_run_id);
  IF NOT public.app_can_view_pay(v_company) THEN RAISE EXCEPTION 'Not allowed to see pay' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM employees e WHERE e.id = p_employee_id AND e.company_id = v_company) THEN
    RAISE EXCEPTION 'employee does not belong to this company' USING ERRCODE = '42501';
  END IF;
  INSERT INTO payslip_bank (run_id, company_id, employee_id, bank_account_enc, bank_name)
  VALUES (p_run_id, v_company, p_employee_id, private.enc(NULLIF(trim(p_bank_account), '')), NULLIF(trim(p_bank_name), ''))
  ON CONFLICT (run_id, employee_id) DO UPDATE
    SET bank_account_enc = EXCLUDED.bank_account_enc, bank_name = COALESCE(EXCLUDED.bank_name, payslip_bank.bank_name);
END $$;

REVOKE ALL ON FUNCTION public.payroll_keep_bank(bigint), public.payroll_bank_accounts(bigint),
  public.payroll_set_bank(bigint, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_keep_bank(bigint), public.payroll_bank_accounts(bigint),
  public.payroll_set_bank(bigint, bigint, text, text) TO authenticated, service_role;

-- existing payslips: the employee's account where it is still the one shown (masked) on the payslip
INSERT INTO payslip_bank (run_id, company_id, employee_id, bank_account_enc, bank_name)
SELECT s.run_id, s.company_id, s.employee_id, e.bank_account_enc, e.bank_name
FROM payslips s JOIN employees e ON e.id = s.employee_id AND e.company_id = s.company_id
WHERE e.bank_account_enc IS NOT NULL
  AND (s.result_json->>'bankMasked' IS NULL
       OR regexp_replace(private.dec(e.bank_account_enc), '.(?=.{4})', '•', 'g') = s.result_json->>'bankMasked')
ON CONFLICT (run_id, employee_id) DO NOTHING;

SELECT 'migration 038 complete' AS status;
