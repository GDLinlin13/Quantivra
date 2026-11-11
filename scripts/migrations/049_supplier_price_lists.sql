-- 049_supplier_price_lists.sql — price lists for suppliers (what each supplier charges).
--   price_lists.kind                    sales (customers' prices, as before) | purchase (a supplier's cost prices)
--   contacts.purchase_price_list_id     the list a supplier's prices come from; bills pick them automatically
-- Idempotent.

ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'sales';
ALTER TABLE price_lists DROP CONSTRAINT IF EXISTS price_lists_kind_check;
ALTER TABLE price_lists ADD CONSTRAINT price_lists_kind_check CHECK (kind IN ('sales', 'purchase'));
-- the same name may be used once for customers and once for suppliers
DROP INDEX IF EXISTS uq_price_lists_name;
CREATE UNIQUE INDEX IF NOT EXISTS uq_price_lists_name ON price_lists(company_id, kind, lower(name));

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS purchase_price_list_id bigint REFERENCES price_lists(id) ON DELETE SET NULL;

DROP TRIGGER IF EXISTS trg_ref_company ON contacts;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON contacts FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('price_list_id', 'price_lists', 'purchase_price_list_id', 'price_lists');

SELECT 'migration 049 complete' AS status;
