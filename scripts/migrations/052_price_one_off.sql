-- 052_price_one_off.sql — a bill line can be marked as a one-off price.
-- When a bill comes in at a different price from the supplier's last one, the person saving it chooses whether
-- that becomes the supplier's price from now on, or only applies to this bill (price_one_off = true: Supplier
-- prices ignores the line). Idempotent.

ALTER TABLE fin_document_lines ADD COLUMN IF NOT EXISTS price_one_off boolean NOT NULL DEFAULT false;

SELECT 'migration 052 complete' AS status;
