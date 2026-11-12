-- 059_claim_accounts.sql — which expense account a staff claim goes to.
--   claims.account_id   chosen for this claim (empty = the category's account from Claims → Category accounts)
-- Needs 040 / 058. Idempotent.
ALTER TABLE claims ADD COLUMN IF NOT EXISTS account_id bigint REFERENCES fin_accounts(id) ON DELETE SET NULL;

DROP TRIGGER IF EXISTS trg_ref_company ON claims;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON claims FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('employee_id', 'employees', 'document_id', 'fin_documents', 'payroll_run_id', 'payroll_runs', 'account_id', 'fin_accounts');

SELECT 'migration 059 complete' AS status;
