-- 046_weight_stock.sql — stock sold by weight.
--
--   catalog_items.stock_mode     normal | pieces (each piece has its own weight, sold once) | loose (any amount of a small unit)
--   catalog_items.price_basis    pieces: the class price is per KG (price x the piece's weight) or per piece
--   catalog_items.loose_unit     loose: the small unit ("g") and loose_factor how many make one item unit (1 kg = 1000 g)
--   catalog_weight_classes       weight classes of an item (2 - 2.99 kg …) with a selling and a buying price each
--   catalog_pieces               one row per piece bought: its weight and class; bought on a bill or received by hand
--   fin_document_lines.piece_id  the piece a bill line buys / an invoice line sells
--
-- A piece can be on one invoice only (checked by a trigger). Idempotent: safe to run more than once.

ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS stock_mode   text NOT NULL DEFAULT 'normal';
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS price_basis  text NOT NULL DEFAULT 'per_kg';
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS loose_unit   text;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS loose_factor numeric(14, 4);
ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_stock_mode_check;
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_stock_mode_check CHECK (stock_mode IN ('normal', 'pieces', 'loose'));
ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_price_basis_check;
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_price_basis_check CHECK (price_basis IN ('per_kg', 'per_piece'));

CREATE TABLE IF NOT EXISTS catalog_weight_classes (
  id             bigserial PRIMARY KEY,
  company_id     bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id        bigint NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  min_kg         numeric(12, 3) NOT NULL,
  max_kg         numeric(12, 3),                  -- empty = no upper limit ("10 >")
  sale_price     numeric(16, 4) NOT NULL DEFAULT 0,
  purchase_price numeric(16, 4) NOT NULL DEFAULT 0,
  CHECK (max_kg IS NULL OR max_kg >= min_kg)
);
CREATE INDEX IF NOT EXISTS idx_weight_classes_item ON catalog_weight_classes(item_id, min_kg);

CREATE TABLE IF NOT EXISTS catalog_pieces (
  id            bigserial PRIMARY KEY,
  company_id    bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id       bigint NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  weight        numeric(12, 3) NOT NULL CHECK (weight > 0),
  class_id      bigint REFERENCES catalog_weight_classes(id) ON DELETE SET NULL,
  document_id   bigint REFERENCES fin_documents(id) ON DELETE SET NULL,   -- the bill it came in on; empty = received by hand
  received_date date NOT NULL DEFAULT current_date,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalog_pieces_item ON catalog_pieces(item_id);
CREATE INDEX IF NOT EXISTS idx_catalog_pieces_doc ON catalog_pieces(document_id);

ALTER TABLE fin_document_lines ADD COLUMN IF NOT EXISTS piece_id bigint REFERENCES catalog_pieces(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fin_lines_piece ON fin_document_lines(piece_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['catalog_weight_classes', 'catalog_pieces'] LOOP
    PERFORM public.app_apply_tenant_policy(t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated', t || '_id_seq');
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('GRANT ALL ON SEQUENCE public.%I TO service_role', t || '_id_seq');
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon', t || '_id_seq');
  END LOOP;
END $$;

-- who may change them: the Catalog (inventory) and Finance people (bills and invoices create / sell pieces)
SELECT public.app_apply_module_policy('catalog_weight_classes', ARRAY['inventory']);
SELECT public.app_apply_module_policy('catalog_pieces', ARRAY['inventory', 'finance']);

DROP TRIGGER IF EXISTS trg_ref_company ON catalog_weight_classes;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON catalog_weight_classes FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('item_id', 'catalog_items');
DROP TRIGGER IF EXISTS trg_ref_company ON catalog_pieces;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON catalog_pieces FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('item_id', 'catalog_items', 'class_id', 'catalog_weight_classes', 'document_id', 'fin_documents');
DROP TRIGGER IF EXISTS trg_ref_company ON fin_document_lines;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON fin_document_lines FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('document_id', 'fin_documents', 'account_id', 'fin_accounts', 'item_id', 'catalog_items', 'piece_id', 'catalog_pieces');

-- a piece goes on one invoice only (void invoices and quotations don't count)
CREATE OR REPLACE FUNCTION public.app_guard_piece_sold_once() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE my_type text; clash text;
BEGIN
  IF NEW.piece_id IS NULL THEN RETURN NEW; END IF;
  SELECT doc_type INTO my_type FROM fin_documents WHERE id = NEW.document_id;
  IF my_type IS DISTINCT FROM 'invoice' THEN RETURN NEW; END IF;
  SELECT d.number INTO clash FROM fin_document_lines l JOIN fin_documents d ON d.id = l.document_id
   WHERE l.piece_id = NEW.piece_id AND d.doc_type = 'invoice' AND d.status <> 'void'
     AND l.document_id <> NEW.document_id LIMIT 1;
  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'This piece is already on invoice %', clash USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.app_guard_piece_sold_once() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_piece_sold_once ON fin_document_lines;
CREATE TRIGGER trg_piece_sold_once BEFORE INSERT OR UPDATE ON fin_document_lines FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_piece_sold_once();

SELECT 'migration 046 complete' AS status;
