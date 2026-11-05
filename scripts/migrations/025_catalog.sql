-- 025_catalog.sql — Catalog: the products and services a company sells and buys.
--
--   catalog_items              products and services (price, cost, GST, accounts, stock tracking)
--   catalog_stock_adjustments  stock counts, write-offs, stock received outside a bill…
--   fin_document_lines.item_id which catalog item an invoice / bill line is for
--
-- Every table has company_id and the standard tenant policy; links are checked
-- to stay inside one company. Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS catalog_items (
  id                 bigserial PRIMARY KEY,
  company_id         bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind               text NOT NULL DEFAULT 'product' CHECK (kind IN ('product', 'service')),
  code               text,
  name               text NOT NULL,
  description        text,
  unit               text,
  sale_price         numeric(16, 4) NOT NULL DEFAULT 0,
  purchase_price     numeric(16, 4) NOT NULL DEFAULT 0,
  tax_rate           numeric(6, 3),             -- empty = the company's GST rate
  income_account_id  bigint REFERENCES fin_accounts(id) ON DELETE SET NULL,
  expense_account_id bigint REFERENCES fin_accounts(id) ON DELETE SET NULL,
  track_stock        boolean NOT NULL DEFAULT false,
  opening_qty        numeric(14, 4) NOT NULL DEFAULT 0,
  reorder_level      numeric(14, 4),
  category           text,
  archived           boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalog_items_company ON catalog_items(company_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_items_code ON catalog_items(company_id, lower(code)) WHERE code IS NOT NULL AND code <> '';

CREATE TABLE IF NOT EXISTS catalog_stock_adjustments (
  id          bigserial PRIMARY KEY,
  company_id  bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id     bigint NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  adj_date    date NOT NULL DEFAULT current_date,
  quantity    numeric(14, 4) NOT NULL,          -- + received / found, − used / lost / written off
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalog_adj_item ON catalog_stock_adjustments(item_id, adj_date);

ALTER TABLE fin_document_lines ADD COLUMN IF NOT EXISTS item_id bigint REFERENCES catalog_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fin_lines_item ON fin_document_lines(item_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['catalog_items', 'catalog_stock_adjustments'] LOOP
    PERFORM public.app_apply_tenant_policy(t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated', t || '_id_seq');
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('GRANT ALL ON SEQUENCE public.%I TO service_role', t || '_id_seq');
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon', t || '_id_seq');
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_ref_company ON catalog_items;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON catalog_items FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('income_account_id', 'fin_accounts', 'expense_account_id', 'fin_accounts');
DROP TRIGGER IF EXISTS trg_ref_company ON catalog_stock_adjustments;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON catalog_stock_adjustments FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('item_id', 'catalog_items');
DROP TRIGGER IF EXISTS trg_ref_company ON fin_document_lines;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON fin_document_lines FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('document_id', 'fin_documents', 'account_id', 'fin_accounts', 'item_id', 'catalog_items');

SELECT 'migration 025 complete' AS status;
