-- 009_leave_eligibility.sql — two-layer leave model.
-- Layer 1 (statutory template) stays on leave_types; Layer 2 (per-employee
-- entitlement) is computed from employee facts + dependents.

-- Employee facts that drive entitlement
ALTER TABLE employees ADD COLUMN IF NOT EXISTS marital_status text;  -- single | married | divorced | widowed

CREATE TABLE IF NOT EXISTS employee_dependents (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id    bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id   bigint NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  name          text,
  relationship  text NOT NULL DEFAULT 'child',   -- child | spouse | parent
  date_of_birth date,
  citizenship   text,                             -- SC | PR | FOREIGNER | ...
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dependents_employee ON employee_dependents(employee_id);
ALTER TABLE employee_dependents DISABLE ROW LEVEL SECURITY;

-- Layer 1: the statutory floor, separate from the "default" entitlement
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS statutory_min numeric(6,2) NOT NULL DEFAULT 0;

-- Layer 2: how each balance's entitlement was arrived at
ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS entitlement_source text NOT NULL DEFAULT 'auto'; -- auto | manual
ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS entitlement_basis text;   -- human-readable explanation
ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS below_statutory boolean NOT NULL DEFAULT false;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

SELECT 'migration 009 complete' AS status;
