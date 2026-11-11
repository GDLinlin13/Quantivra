-- 048_price_lists.sql — price lists for customers.
--
--   price_lists        a named list ("Restaurants", "Wholesale"); one list can serve many customers
--   price_list_items   the price of an item on a list (for weight-class items, one price per class)
--   contacts.price_list_id   the list a customer buys at; invoices pick its prices automatically
--
-- The older per-item "customer prices" (catalog_customer_prices) are copied into one list per customer,
-- named "<customer> prices", and that list is assigned to the customer. Idempotent.

CREATE TABLE IF NOT EXISTS price_lists (
  id          bigserial PRIMARY KEY,
  company_id  bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  notes       text,
  archived    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_price_lists_name ON price_lists(company_id, lower(name));

CREATE TABLE IF NOT EXISTS price_list_items (
  id             bigserial PRIMARY KEY,
  company_id     bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  price_list_id  bigint NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  item_id        bigint NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  class_id       bigint REFERENCES catalog_weight_classes(id) ON DELETE CASCADE,   -- weight-class items: the class this price is for
  price          numeric(16, 4) NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_price_list_items ON price_list_items(price_list_id, item_id, coalesce(class_id, 0));
CREATE INDEX IF NOT EXISTS idx_price_list_items_company ON price_list_items(company_id, price_list_id);

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS price_list_id bigint REFERENCES price_lists(id) ON DELETE SET NULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['price_lists', 'price_list_items'] LOOP
    PERFORM public.app_apply_tenant_policy(t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated', t || '_id_seq');
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('GRANT ALL ON SEQUENCE public.%I TO service_role', t || '_id_seq');
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon', t || '_id_seq');
  END LOOP;
END $$;

-- everyone in the company reads (invoices need the prices); the Catalog (inventory) permission changes them
SELECT public.app_apply_module_policy('price_lists', ARRAY['inventory']);
SELECT public.app_apply_module_policy('price_list_items', ARRAY['inventory']);

DROP TRIGGER IF EXISTS trg_ref_company ON price_list_items;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON price_list_items FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('price_list_id', 'price_lists', 'item_id', 'catalog_items', 'class_id', 'catalog_weight_classes');
DROP TRIGGER IF EXISTS trg_ref_company ON contacts;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON contacts FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('price_list_id', 'price_lists');

-- the old customer prices become one list per customer
DO $$
DECLARE r record; v_list bigint; v_name text;
BEGIN
  IF to_regclass('public.catalog_customer_prices') IS NULL THEN RETURN; END IF;
  FOR r IN SELECT DISTINCT c.id AS contact_id, c.company_id, c.name FROM catalog_customer_prices p JOIN contacts c ON c.id = p.contact_id
           WHERE c.price_list_id IS NULL LOOP
    v_name := r.name || ' prices';
    SELECT id INTO v_list FROM price_lists WHERE company_id = r.company_id AND lower(name) = lower(v_name);
    IF v_list IS NULL THEN
      INSERT INTO price_lists (company_id, name) VALUES (r.company_id, v_name) RETURNING id INTO v_list;
      INSERT INTO price_list_items (company_id, price_list_id, item_id, price)
        SELECT r.company_id, v_list, p.item_id, p.price FROM catalog_customer_prices p WHERE p.contact_id = r.contact_id;
    END IF;
    UPDATE contacts SET price_list_id = v_list WHERE id = r.contact_id AND price_list_id IS NULL;
  END LOOP;
END $$;

SELECT 'migration 048 complete' AS status;
