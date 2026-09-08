-- 007_branding.sql — per-company branding + document template settings.
-- Logo is stored as a base64 data URI (small, and inlines cleanly into printed PDFs).
CREATE TABLE IF NOT EXISTS company_branding (
  company_id       bigint PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  logo_data_uri    text,
  legal_name       text,
  registration_no  text,
  address          text,
  phone            text,
  email            text,
  website          text,
  accent_color     text NOT NULL DEFAULT '#1677ff',
  footer_note      text,
  templates        jsonb NOT NULL DEFAULT '{}',
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE company_branding DISABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

SELECT 'migration 007 complete' AS status;
