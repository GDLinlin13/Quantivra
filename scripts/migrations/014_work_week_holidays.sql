-- 014_work_week_holidays.sql — count leave against real working days.
--   * company_holidays: each company's public-holiday calendar (pre-filled
--     from the official list, editable).
--   * employee_work_patterns: an employee's own work week when it differs
--     from the company's (company default lives in company_settings
--     'work_pattern').
--   * leave_types.count_method: 'working_days' (skip rest days + holidays) or
--     'weeks' (whole 7-day blocks, weekends and holidays included), plus
--     allow_single_days for week-based leave taken flexibly by agreement.
--   * Singapore maternity / paternity / shared parental leave switch to weeks
--     (80 → 16, 20 → 4, 50 → 10), balances and requests converted with them.
-- Idempotent. Paste into the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS company_holidays (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id   bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  name         text NOT NULL,
  source       text NOT NULL DEFAULT 'company' CHECK (source IN ('official', 'company')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, holiday_date)
);
CREATE INDEX IF NOT EXISTS idx_company_holidays_company ON company_holidays(company_id, holiday_date);
SELECT public.app_apply_tenant_policy('company_holidays');

CREATE TABLE IF NOT EXISTS employee_work_patterns (
  employee_id bigint PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  company_id  bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pattern     jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
SELECT public.app_apply_tenant_policy('employee_work_patterns');

-- The employee must belong to the row's company (RLS only checks company_id).
CREATE OR REPLACE FUNCTION public.app_guard_employee_company() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM employees e WHERE e.id = NEW.employee_id AND e.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'Employee does not belong to this company' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_employee_company ON employee_work_patterns;
CREATE TRIGGER trg_guard_employee_company BEFORE INSERT OR UPDATE ON employee_work_patterns
  FOR EACH ROW EXECUTE FUNCTION public.app_guard_employee_company();

GRANT SELECT, INSERT, UPDATE, DELETE ON company_holidays, employee_work_patterns TO authenticated;
GRANT ALL ON company_holidays, employee_work_patterns TO service_role;
REVOKE ALL ON company_holidays, employee_work_patterns FROM anon;
GRANT EXECUTE ON FUNCTION public.app_guard_employee_company() TO authenticated;
REVOKE ALL ON FUNCTION public.app_guard_employee_company() FROM PUBLIC, anon;

ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS count_method text NOT NULL DEFAULT 'working_days';
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS allow_single_days boolean NOT NULL DEFAULT false;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_types_count_method_check') THEN
    ALTER TABLE leave_types ADD CONSTRAINT leave_types_count_method_check
      CHECK (count_method IN ('working_days', 'weeks'));
  END IF;
END $$;

-- Singapore: maternity / paternity / shared parental leave are counted in weeks.
-- Converts only types still counted in working days, so re-running is harmless.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT lt.id, lt.name FROM leave_types lt JOIN companies c ON c.id = lt.company_id
    WHERE c.country = 'SG' AND lt.count_method = 'working_days'
      AND lt.name IN ('Maternity Leave', 'Paternity Leave', 'Shared Parental Leave')
  LOOP
    UPDATE leave_balances SET
      entitled_days = round(entitled_days / 5, 2), carried_days = round(carried_days / 5, 2),
      taken_days = round(taken_days / 5, 2), pending_days = round(pending_days / 5, 2)
    WHERE leave_type_id = t.id;
    UPDATE leave_requests SET days = round(days / 5, 2) WHERE leave_type_id = t.id;
    UPDATE leave_types SET
      count_method = 'weeks',
      allow_single_days = (t.name <> 'Maternity Leave'),  -- paternity & shared parental: flexible by agreement
      default_days = round(default_days / 5, 2), statutory_min = round(statutory_min / 5, 2),
      max_days = CASE WHEN max_days IS NULL THEN NULL ELSE round(max_days / 5, 2) END
    WHERE id = t.id;
  END LOOP;
END $$;

SELECT 'migration 014 complete' AS status;
