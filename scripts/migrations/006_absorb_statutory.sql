-- 006_absorb_statutory.sql — let a company pay the employee share of chosen
-- statutory schemes (e.g. CDAC, SDL) on the employee's behalf.
CREATE TABLE IF NOT EXISTS company_statutory_settings (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id   bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  scheme_code  text NOT NULL,
  absorb_employee boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, scheme_code)
);
ALTER TABLE company_statutory_settings DISABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

SELECT 'migration 006 complete' AS status;
