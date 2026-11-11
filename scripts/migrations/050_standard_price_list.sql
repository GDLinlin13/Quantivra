-- 050_standard_price_list.sql — selling prices live in price lists only.
--   Each company gets a "Standard prices" list holding what the catalog items' selling prices were (one price per
--   weight class for items stocked by weight). Customers with no list of their own buy at it.
--   company_settings (company / default_price_list) says which list is the standard one.
-- Idempotent.

DO $$
DECLARE c record; v_list bigint;
BEGIN
  FOR c IN SELECT DISTINCT company_id FROM catalog_items LOOP
    -- already set up (or the company chose its own standard list)
    CONTINUE WHEN EXISTS (SELECT 1 FROM company_settings s WHERE s.company_id = c.company_id AND s.category = 'company' AND s.key = 'default_price_list');
    SELECT id INTO v_list FROM price_lists WHERE company_id = c.company_id AND kind = 'sales' AND lower(name) = 'standard prices';
    IF v_list IS NULL THEN
      INSERT INTO price_lists (company_id, name, kind) VALUES (c.company_id, 'Standard prices', 'sales') RETURNING id INTO v_list;
    END IF;
    -- items sold as they are
    INSERT INTO price_list_items (company_id, price_list_id, item_id, class_id, price)
      SELECT c.company_id, v_list, i.id, NULL, i.sale_price FROM catalog_items i
      WHERE i.company_id = c.company_id AND i.used_for IS DISTINCT FROM 'purchases' AND coalesce(i.stock_mode, 'normal') <> 'pieces' AND i.sale_price > 0
        AND NOT EXISTS (SELECT 1 FROM price_list_items x WHERE x.price_list_id = v_list AND x.item_id = i.id AND x.class_id IS NULL);
    -- items stocked by weight: one price per class
    INSERT INTO price_list_items (company_id, price_list_id, item_id, class_id, price)
      SELECT c.company_id, v_list, w.item_id, w.id, w.sale_price FROM catalog_weight_classes w JOIN catalog_items i ON i.id = w.item_id
      WHERE w.company_id = c.company_id AND i.used_for IS DISTINCT FROM 'purchases' AND w.sale_price > 0
        AND NOT EXISTS (SELECT 1 FROM price_list_items x WHERE x.price_list_id = v_list AND x.item_id = w.item_id AND x.class_id = w.id);
    INSERT INTO company_settings (company_id, category, key, value)
      VALUES (c.company_id, 'company', 'default_price_list', jsonb_build_object('id', v_list));
  END LOOP;
END $$;

SELECT 'migration 050 complete' AS status;
