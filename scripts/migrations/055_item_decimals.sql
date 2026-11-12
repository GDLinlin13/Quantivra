-- 055_item_decimals.sql — how many decimals an item uses.
--   weight_decimals  weights in kg (0–3): weight classes, piece weights, the weight on invoices and price lists
--   price_decimals   prices (2–4): list prices, supplier prices and the unit price on invoices
-- Idempotent.
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS weight_decimals smallint NOT NULL DEFAULT 3 CHECK (weight_decimals BETWEEN 0 AND 3);
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS price_decimals smallint NOT NULL DEFAULT 2 CHECK (price_decimals BETWEEN 2 AND 4);

SELECT 'migration 055 complete' AS status;
