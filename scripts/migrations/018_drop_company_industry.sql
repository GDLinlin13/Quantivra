-- 018_drop_company_industry.sql — remove companies.industry and
-- companies.business_type. Both were always 'General' and nothing uses them
-- (the wizard no longer asks for a business type). Idempotent.
-- Run this BEFORE deploying the app version that stops sending them.

ALTER TABLE companies DROP COLUMN IF EXISTS industry;
ALTER TABLE companies DROP COLUMN IF EXISTS business_type;

SELECT 'migration 018 complete' AS status;
