-- 027_customer_prices.sql — Catalog: a different selling price for a particular customer.
--
--   catalog_customer_prices   one price per item per customer; used instead of the item's
--                             normal selling price on that customer's quotations and invoices
--
-- Standard tenant policy; the item and the customer must belong to the same company.
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS catalog_customer_prices (
  id          bigserial PRIMARY KEY,
  company_id  bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id     bigint NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  contact_id  bigint NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  price       numeric(16, 4) NOT NULL DEFAULT 0,
  note        text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, contact_id)
);
CREATE INDEX IF NOT EXISTS idx_customer_prices_company ON catalog_customer_prices(company_id, contact_id);

SELECT public.app_apply_tenant_policy('catalog_customer_prices');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_customer_prices TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.catalog_customer_prices_id_seq TO authenticated;
GRANT ALL ON public.catalog_customer_prices TO service_role;
GRANT ALL ON SEQUENCE public.catalog_customer_prices_id_seq TO service_role;
REVOKE ALL ON public.catalog_customer_prices FROM anon;
REVOKE ALL ON SEQUENCE public.catalog_customer_prices_id_seq FROM anon;

DROP TRIGGER IF EXISTS trg_ref_company ON catalog_customer_prices;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON catalog_customer_prices FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('item_id', 'catalog_items', 'contact_id', 'contacts');

SELECT 'migration 027 complete' AS status;
