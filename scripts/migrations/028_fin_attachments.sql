-- 028_fin_attachments.sql — attach files (the supplier's invoice, a receipt…) to bills, expenses,
-- invoices and quotations.
--
--   storage bucket "fin-attachments"  private; files live under "<company id>/<document id>/…"
--   fin_attachments                    which file belongs to which document (name, type, size)
--
-- A company can only read and write files under its own company id. Idempotent.

CREATE TABLE IF NOT EXISTS fin_attachments (
  id            bigserial PRIMARY KEY,
  company_id    bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id   bigint NOT NULL REFERENCES fin_documents(id) ON DELETE CASCADE,
  path          text NOT NULL UNIQUE,
  file_name     text NOT NULL,
  content_type  text,
  size_bytes    bigint,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_attachments_doc ON fin_attachments(document_id);

SELECT public.app_apply_tenant_policy('fin_attachments');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_attachments TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.fin_attachments_id_seq TO authenticated;
GRANT ALL ON public.fin_attachments TO service_role;
GRANT ALL ON SEQUENCE public.fin_attachments_id_seq TO service_role;
REVOKE ALL ON public.fin_attachments FROM anon;
REVOKE ALL ON SEQUENCE public.fin_attachments_id_seq FROM anon;

DROP TRIGGER IF EXISTS trg_ref_company ON fin_attachments;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON fin_attachments FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('document_id', 'fin_documents');

-- the file's folder must be the row's own company
ALTER TABLE fin_attachments DROP CONSTRAINT IF EXISTS fin_attachments_path_company;
ALTER TABLE fin_attachments ADD CONSTRAINT fin_attachments_path_company CHECK (split_part(path, '/', 1) = company_id::text);

-- Private bucket: PDFs and pictures up to 10 MB
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fin-attachments', 'fin-attachments', false, 10485760,
        ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Signed-in users reach only the files in their own companies' folders (platform admins: all)
DROP POLICY IF EXISTS fin_attachments_read ON storage.objects;
DROP POLICY IF EXISTS fin_attachments_add ON storage.objects;
DROP POLICY IF EXISTS fin_attachments_change ON storage.objects;
DROP POLICY IF EXISTS fin_attachments_remove ON storage.objects;
CREATE POLICY fin_attachments_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fin-attachments' AND ((SELECT public.app_is_platform_admin())
    OR (storage.foldername(name))[1] IN (SELECT c::text FROM public.app_my_company_ids() c)));
CREATE POLICY fin_attachments_add ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fin-attachments' AND ((SELECT public.app_is_platform_admin())
    OR (storage.foldername(name))[1] IN (SELECT c::text FROM public.app_my_company_ids() c)));
CREATE POLICY fin_attachments_change ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'fin-attachments' AND ((SELECT public.app_is_platform_admin())
    OR (storage.foldername(name))[1] IN (SELECT c::text FROM public.app_my_company_ids() c)))
  WITH CHECK (bucket_id = 'fin-attachments' AND ((SELECT public.app_is_platform_admin())
    OR (storage.foldername(name))[1] IN (SELECT c::text FROM public.app_my_company_ids() c)));
CREATE POLICY fin_attachments_remove ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fin-attachments' AND ((SELECT public.app_is_platform_admin())
    OR (storage.foldername(name))[1] IN (SELECT c::text FROM public.app_my_company_ids() c)));

SELECT 'migration 028 complete' AS status;
