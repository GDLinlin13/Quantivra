-- 047_sale_basis.sql — a by-weight item can be bought per KG and sold per piece (or the other way round).
--   catalog_items.price_basis   how the buying (cost) prices of the weight classes work: per_kg | per_piece
--   catalog_items.sale_basis    how the selling prices work; empty = the same as price_basis
-- Idempotent.

ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS sale_basis text;
ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_sale_basis_check;
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_sale_basis_check CHECK (sale_basis IS NULL OR sale_basis IN ('per_kg', 'per_piece'));

SELECT 'migration 047 complete' AS status;
