-- 030_catalog_used_for.sql — Catalog: whether an item is something we sell, buy, or both.
-- Invoices and quotations only offer items we sell; bills and expenses only items we buy.
-- Idempotent.

ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS used_for text NOT NULL DEFAULT 'both';
ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_used_for_check;
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_used_for_check CHECK (used_for IN ('sales', 'purchases', 'both'));

SELECT 'migration 030 complete' AS status;
