-- 036_foreign_currency_documents.sql — invoices, quotations, credit notes, bills and expenses in another
-- currency (one the company has a bank account in), and catalog prices in another currency.
--   fin_documents.fx_rate       company currency per 1 unit of the document's currency (e.g. 1 USD = 7.80 HKD);
--                               empty for documents in the company's own currency. The document's amounts, and
--                               what has been paid off it, stay in the document's currency; the books use the rate.
--   catalog_items.currency  the currency of the item's prices (empty = the company's currency)
-- Payments are kept as before (amount in the company's currency, plus currency / foreign_amount when they went
-- through a foreign bank account); the difference from the invoice's rate is booked as an exchange gain or loss.
-- Idempotent.

ALTER TABLE fin_documents ADD COLUMN IF NOT EXISTS fx_rate numeric(18,8);
ALTER TABLE fin_documents DROP CONSTRAINT IF EXISTS fin_documents_fx_rate_check;
ALTER TABLE fin_documents ADD CONSTRAINT fin_documents_fx_rate_check CHECK (fx_rate IS NULL OR fx_rate > 0);

ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS currency text;

SELECT 'migration 036 complete' AS status;
