-- 045_item_buying_currency.sql — a catalog item can be bought in another currency than it is sold in
-- (e.g. bought from a Malaysian supplier in MYR, sold in SGD).
--   catalog_items.currency            the currency of the selling price (and of the cost, when no buying currency is set)
--   catalog_items.purchase_currency   the currency of the cost / buying price, when it differs; empty = same as above
-- Idempotent.

ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS purchase_currency text;

SELECT 'migration 045 complete' AS status;
