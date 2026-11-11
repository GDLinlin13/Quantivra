-- 051_supplier_tax.sql — whether a supplier charges tax on its bills, what the tax is called, and the rate.
--   contacts.tax_charged   true = charges tax, false = does not, empty = not set (bills follow the company's own tax setting)
--   contacts.tax_name      GST, VAT, SST, Sales tax …
--   contacts.tax_rate      percent, e.g. 9 or 8
-- Idempotent.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tax_charged boolean;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tax_name text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tax_rate numeric(6, 3);

SELECT 'migration 051 complete' AS status;
