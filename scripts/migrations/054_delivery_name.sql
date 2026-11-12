-- 054_delivery_name.sql — the name and contact person an invoice is delivered to (printed above the delivery address).
-- Left blank, the invoice uses the customer's own name and address. Idempotent.
ALTER TABLE fin_documents ADD COLUMN IF NOT EXISTS delivery_name text;
ALTER TABLE fin_documents ADD COLUMN IF NOT EXISTS delivery_contact text;   -- the person at the delivery address

SELECT 'migration 054 complete' AS status;
