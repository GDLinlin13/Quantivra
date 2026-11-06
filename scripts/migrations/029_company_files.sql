-- 029_company_files.sql — Documents: files kept for the company that don't belong to one invoice or bill.
--
--   company_files   bank statements (saved when a statement is imported) and other uploaded files.
--                   Stored in the private "fin-attachments" bucket under "<company id>/files/…".
--
-- Payslips, invoices and quotations are not stored: Documents makes their PDFs from the records.
-- Also lets the bucket hold CSV / Excel bank statements. Idempotent.

CREATE TABLE IF NOT EXISTS company_files (
  id            bigserial PRIMARY KEY,
  company_id    bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  folder        text NOT NULL DEFAULT 'other' CHECK (folder IN ('bank', 'other')),
  account_id    bigint REFERENCES fin_accounts(id) ON DELETE SET NULL,   -- the bank, for statements
  period        text,                                                    -- 'YYYY-MM' the statement covers
  path          text NOT NULL UNIQUE,
  file_name     text NOT NULL,
  content_type  text,
  size_bytes    bigint,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_company_files_company ON company_files(company_id, folder);

SELECT public.app_apply_tenant_policy('company_files');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_files TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.company_files_id_seq TO authenticated;
GRANT ALL ON public.company_files TO service_role;
GRANT ALL ON SEQUENCE public.company_files_id_seq TO service_role;
REVOKE ALL ON public.company_files FROM anon;
REVOKE ALL ON SEQUENCE public.company_files_id_seq FROM anon;

DROP TRIGGER IF EXISTS trg_ref_company ON company_files;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON company_files FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('account_id', 'fin_accounts');

ALTER TABLE company_files DROP CONSTRAINT IF EXISTS company_files_path_company;
ALTER TABLE company_files ADD CONSTRAINT company_files_path_company CHECK (split_part(path, '/', 1) = company_id::text);

-- bank statements can also be CSV or Excel
UPDATE storage.buckets SET allowed_mime_types = ARRAY[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif',
  'text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
] WHERE id = 'fin-attachments';

SELECT 'migration 029 complete' AS status;
