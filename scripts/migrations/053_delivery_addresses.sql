-- 053_delivery_addresses.sql — delivery addresses.
--   contact_addresses            a customer's saved delivery addresses (as many as they need, one can be the default)
--   fin_documents.delivery_address   the address printed on an invoice that has products (a copy, so later edits
--                                    to the customer's list never change an invoice already issued)
-- Idempotent.

CREATE TABLE IF NOT EXISTS contact_addresses (
  id          bigserial PRIMARY KEY,
  company_id  bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id  bigint NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  label       text,
  address     text NOT NULL,
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_addresses_contact ON contact_addresses(contact_id);

DO $$
BEGIN
  PERFORM public.app_apply_tenant_policy('contact_addresses');
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_addresses TO authenticated;
  GRANT USAGE, SELECT ON SEQUENCE public.contact_addresses_id_seq TO authenticated;
  GRANT ALL ON public.contact_addresses TO service_role;
  GRANT ALL ON SEQUENCE public.contact_addresses_id_seq TO service_role;
  REVOKE ALL ON public.contact_addresses FROM anon;
  REVOKE ALL ON SEQUENCE public.contact_addresses_id_seq FROM anon;
END $$;
-- the CRM and Finance people change them (invoices can add an address on the spot)
SELECT public.app_apply_module_policy('contact_addresses', ARRAY['crm', 'finance']);

DROP TRIGGER IF EXISTS trg_ref_company ON contact_addresses;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON contact_addresses FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('contact_id', 'contacts');

ALTER TABLE fin_documents ADD COLUMN IF NOT EXISTS delivery_address text;

SELECT 'migration 053 complete' AS status;
