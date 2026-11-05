-- 026_foreign_currency_banks.sql — bank accounts in other currencies.
--
-- The books stay in the company's own currency (e.g. SGD). A foreign-currency
-- bank account keeps its statement in its own currency (e.g. USD); when a line is
-- matched, the amount in the company's currency is recorded next to it.
--   fin_accounts.currency           the account's currency (empty = company currency)
--   fin_accounts.opening_foreign    opening balance in the account's currency
--                                   (opening_balance stays in the company currency)
--   fin_bank_transactions.base_amount  the line in the company's currency, once matched
--   fin_payments.currency / foreign_amount  a payment that went through a foreign account
-- Idempotent: safe to run more than once.

ALTER TABLE fin_accounts ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE fin_accounts ADD COLUMN IF NOT EXISTS opening_foreign numeric(16, 2);
ALTER TABLE fin_bank_transactions ADD COLUMN IF NOT EXISTS base_amount numeric(16, 2);
ALTER TABLE fin_payments ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE fin_payments ADD COLUMN IF NOT EXISTS foreign_amount numeric(16, 2);

SELECT 'migration 026 complete' AS status;
