-- 023_pay_item_rates.sql — overtime can use its own hourly rate and multiplier.
--   rate:       hourly rate for this overtime line; empty = worked out from the
--               employee's basic salary (Singapore MOM formula).
--   multiplier: e.g. 1.5 (normal overtime), 2 (rest day / public holiday);
--               empty = 1.5.
-- Idempotent: safe to run more than once.

ALTER TABLE payroll_pay_items ADD COLUMN IF NOT EXISTS rate numeric(12, 4);
ALTER TABLE payroll_pay_items ADD COLUMN IF NOT EXISTS multiplier numeric(6, 2);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_pay_items_rate_check') THEN
    ALTER TABLE payroll_pay_items ADD CONSTRAINT payroll_pay_items_rate_check
      CHECK ((rate IS NULL OR rate >= 0) AND (multiplier IS NULL OR multiplier BETWEEN 0 AND 10));
  END IF;
END $$;

SELECT 'migration 023 complete' AS status;
