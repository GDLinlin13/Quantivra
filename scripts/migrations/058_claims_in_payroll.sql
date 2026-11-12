-- 058_claims_in_payroll.sql — approved staff claims are paid in the next payroll run.
--
--   claims.payroll_run_id            the payroll run that paid the claim back (empty = not yet)
--   payroll_claims_waiting(...)      the approved claims a run will pay (same currency as the company, not already
--                                    booked in Finance, not paid by another run) — for people with pay access
--   payroll_take_claims(run, ids)    marks those claims as paid by this run (a re-run starts over)
-- Needs 040 and the payroll tables. Idempotent.

ALTER TABLE claims ADD COLUMN IF NOT EXISTS payroll_run_id bigint REFERENCES payroll_runs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_claims_payroll_run ON claims(payroll_run_id);

DROP TRIGGER IF EXISTS trg_ref_company ON claims;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON claims FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('employee_id', 'employees', 'document_id', 'fin_documents', 'payroll_run_id', 'payroll_runs');

CREATE OR REPLACE FUNCTION public.payroll_claims_waiting(p_company_id bigint, p_run_id bigint DEFAULT NULL)
RETURNS TABLE (claim_id bigint, employee_id bigint, category text, description text, amount numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.app_require_company(p_company_id);
  IF NOT public.app_can_view_pay(p_company_id) THEN
    RAISE EXCEPTION 'Payroll needs pay access' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT c.id, c.employee_id, c.category, c.description, c.amount
    FROM claims c JOIN companies co ON co.id = c.company_id
    WHERE c.company_id = p_company_id AND c.status = 'approved' AND c.document_id IS NULL
      AND c.currency = co.currency
      AND (c.payroll_run_id IS NULL OR c.payroll_run_id = p_run_id)
    ORDER BY c.claim_date, c.id;
END $$;

CREATE OR REPLACE FUNCTION public.payroll_take_claims(p_run_id bigint, p_claim_ids bigint[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company bigint;
BEGIN
  SELECT company_id INTO v_company FROM payroll_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.app_require_company(v_company);
  IF NOT public.app_can_view_pay(v_company) THEN
    RAISE EXCEPTION 'Payroll needs pay access' USING ERRCODE = '42501';
  END IF;
  UPDATE claims SET payroll_run_id = NULL WHERE payroll_run_id = p_run_id;           -- a re-run starts over
  UPDATE claims SET payroll_run_id = p_run_id
   WHERE id = ANY (coalesce(p_claim_ids, ARRAY[]::bigint[])) AND company_id = v_company
     AND status = 'approved' AND document_id IS NULL AND payroll_run_id IS NULL;
END $$;

REVOKE ALL ON FUNCTION public.payroll_claims_waiting(bigint, bigint), public.payroll_take_claims(bigint, bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_claims_waiting(bigint, bigint), public.payroll_take_claims(bigint, bigint[]) TO authenticated, service_role;

SELECT 'migration 058 complete' AS status;
