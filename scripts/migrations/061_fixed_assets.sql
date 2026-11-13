-- 061_fixed_assets.sql — fixed assets register (Finance → Accounting & reports → Fixed assets).
--   fixed_assets   one row per asset: cost, residual value, useful life and the accounts it is booked to. Straight-line
--                  depreciation is worked out month by month from these (nothing is stored per month); a disposed asset
--                  stops depreciating and is written off.
-- Everyone in the company reads; the Finance permission changes them. A loan on an asset: the monthly interest is worked
-- out from the loan amount, term and monthly repayment, and accrues onto the loan payable account; the repayments
-- themselves are matched from the bank. Idempotent.

CREATE TABLE IF NOT EXISTS fixed_assets (
  id                    bigserial PRIMARY KEY,
  company_id            bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code                  text,
  name                  text NOT NULL,
  category              text,
  purchase_date         date NOT NULL,
  cost                  numeric(16, 2) NOT NULL DEFAULT 0,
  residual_value        numeric(16, 2) NOT NULL DEFAULT 0,
  life_months           integer NOT NULL DEFAULT 60 CHECK (life_months > 0),
  start_month           date NOT NULL,                       -- first month depreciated (first day of the month)
  asset_account_id      bigint REFERENCES fin_accounts(id) ON DELETE SET NULL,
  expense_account_id    bigint REFERENCES fin_accounts(id) ON DELETE SET NULL,
  accumulated_account_id bigint REFERENCES fin_accounts(id) ON DELETE SET NULL,
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disposed')),
  disposed_date         date,
  disposal_account_id   bigint REFERENCES fin_accounts(id) ON DELETE SET NULL,   -- where the written-off value is booked
  notes                 text,
  -- bought on a loan (a vehicle, say): the system works out the interest and the schedule
  book_purchase         boolean NOT NULL DEFAULT false,       -- book the purchase here (asset in, loan and deposit out)
  deposit_account_id    bigint REFERENCES fin_accounts(id) ON DELETE SET NULL,   -- where the part not on loan was paid from
  loan_amount           numeric(16, 2) NOT NULL DEFAULT 0,
  loan_term_months      integer,
  monthly_repayment     numeric(16, 2),
  loan_start_month      date,                                 -- month of the first repayment
  loan_account_id       bigint REFERENCES fin_accounts(id) ON DELETE SET NULL,       -- loan payable
  interest_account_id   bigint REFERENCES fin_accounts(id) ON DELETE SET NULL,       -- interest expense
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_company ON fixed_assets(company_id, purchase_date);

DO $$
BEGIN
  PERFORM public.app_apply_tenant_policy('fixed_assets');
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_assets TO authenticated;
  GRANT USAGE, SELECT ON SEQUENCE public.fixed_assets_id_seq TO authenticated;
  GRANT ALL ON public.fixed_assets TO service_role;
  GRANT ALL ON SEQUENCE public.fixed_assets_id_seq TO service_role;
  REVOKE ALL ON public.fixed_assets FROM anon;
  REVOKE ALL ON SEQUENCE public.fixed_assets_id_seq FROM anon;
END $$;
SELECT public.app_apply_module_policy('fixed_assets', ARRAY['finance']);

DROP TRIGGER IF EXISTS trg_ref_company ON fixed_assets;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON fixed_assets FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('asset_account_id', 'fin_accounts', 'expense_account_id', 'fin_accounts',
                                                'accumulated_account_id', 'fin_accounts', 'disposal_account_id', 'fin_accounts',
                                                'deposit_account_id', 'fin_accounts', 'loan_account_id', 'fin_accounts', 'interest_account_id', 'fin_accounts');

SELECT 'migration 061 complete' AS status;
