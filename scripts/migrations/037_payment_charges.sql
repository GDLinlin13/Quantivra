-- 037_payment_charges.sql — bank charges taken with a payment.
--   fin_payments.charges             the bank's fee, in the company's currency (0 = none)
--   fin_payments.charges_account_id  where the fee is booked (e.g. 6900 Bank charges)
-- Money out: the bank paid the bills plus the fee (6,835 = bill 6,500 + charges 335).
-- Money in:  the customer paid the invoices; the bank kept the fee (6,165 arrived = invoice 6,500 - charges 335).
-- Idempotent.

ALTER TABLE fin_payments ADD COLUMN IF NOT EXISTS charges numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE fin_payments ADD COLUMN IF NOT EXISTS charges_account_id bigint REFERENCES fin_accounts(id) ON DELETE SET NULL;
ALTER TABLE fin_payments DROP CONSTRAINT IF EXISTS fin_payments_charges_check;
ALTER TABLE fin_payments ADD CONSTRAINT fin_payments_charges_check CHECK (charges >= 0);

-- the fee's account must belong to the payment's own company, like its other references
DROP TRIGGER IF EXISTS trg_ref_company ON fin_payments;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON fin_payments FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('contact_id', 'contacts', 'account_id', 'fin_accounts', 'charges_account_id', 'fin_accounts');

SELECT 'migration 037 complete' AS status;
