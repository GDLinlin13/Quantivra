-- 060_claims_finance_approval.sql — Finance approves a claim before it can go into payroll.
--   claims.finance_approved_at / finance_approved_by   set by Finance (Finance → Payables → Staff claims)
-- A claim goes into the next payroll run only once Finance has approved it and has not already recorded / paid it
-- in Finance. Needs 040 / 058. Idempotent.

ALTER TABLE claims ADD COLUMN IF NOT EXISTS finance_approved_at timestamptz;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS finance_approved_by bigint REFERENCES company_users(id) ON DELETE SET NULL;

-- only Finance (Finance → create / edit, or pay access) sets or clears the approval
CREATE OR REPLACE FUNCTION public.app_guard_claim_finance() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF (TG_OP = 'INSERT' AND NEW.finance_approved_at IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.finance_approved_at IS DISTINCT FROM OLD.finance_approved_at) THEN
    IF NOT public.app_can_any(NEW.company_id, ARRAY['finance'], ARRAY['create', 'edit']) THEN
      RAISE EXCEPTION 'Only Finance approves a claim for payment' USING ERRCODE = '42501';
    END IF;
    IF NEW.finance_approved_at IS NOT NULL THEN
      NEW.finance_approved_by := (SELECT cu.id FROM company_users cu WHERE cu.auth_user_id = auth.uid() AND cu.company_id = NEW.company_id LIMIT 1);
    ELSE
      NEW.finance_approved_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.app_guard_claim_finance() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_claim_finance ON claims;
CREATE TRIGGER trg_claim_finance BEFORE INSERT OR UPDATE ON claims
  FOR EACH ROW EXECUTE FUNCTION public.app_guard_claim_finance();

-- payroll only takes what Finance has approved
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
    WHERE c.company_id = p_company_id AND c.status = 'approved' AND c.finance_approved_at IS NOT NULL AND c.document_id IS NULL
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
  UPDATE claims SET payroll_run_id = NULL WHERE payroll_run_id = p_run_id;
  UPDATE claims SET payroll_run_id = p_run_id
   WHERE id = ANY (coalesce(p_claim_ids, ARRAY[]::bigint[])) AND company_id = v_company
     AND status = 'approved' AND finance_approved_at IS NOT NULL AND document_id IS NULL AND payroll_run_id IS NULL;
END $$;

REVOKE ALL ON FUNCTION public.payroll_claims_waiting(bigint, bigint), public.payroll_take_claims(bigint, bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_claims_waiting(bigint, bigint), public.payroll_take_claims(bigint, bigint[]) TO authenticated, service_role;

SELECT 'migration 060 complete' AS status;
