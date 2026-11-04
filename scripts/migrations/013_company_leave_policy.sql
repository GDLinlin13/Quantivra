-- 013_company_leave_policy.sql — company leave policy that grows with service.
-- A leave type's entitlement = default_days + increment_per_year × completed
-- years of service, capped at max_days (no cap when NULL). It never goes below
-- the country's statutory minimum. Idempotent. Paste into the Supabase SQL editor.

ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS increment_per_year numeric(6,2) NOT NULL DEFAULT 0;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS max_days numeric(6,2);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_types_policy_check') THEN
    ALTER TABLE leave_types ADD CONSTRAINT leave_types_policy_check
      CHECK (increment_per_year >= 0 AND (max_days IS NULL OR max_days >= 0));
  END IF;
END $$;

SELECT 'migration 013 complete' AS status;
