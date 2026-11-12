-- 056_show_cents.sql — per item: always show cents (46.00) or only when there are cents (46, 46.50).
-- Replaces the price decimals of migration 055 (that column is left in place, unused). Idempotent.
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS show_cents boolean NOT NULL DEFAULT true;

SELECT 'migration 056 complete' AS status;
