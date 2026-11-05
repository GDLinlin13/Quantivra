-- 022_pay_items.sql — overtime, allowances, bonuses, reimbursements and
-- deductions that go into a payroll run.
--
-- One table holds both kinds of item:
--   * fixed items (recurring = true): added to every month's payroll, e.g. a
--     $200 transport allowance or a monthly loan repayment;
--   * one-off items (recurring = false, with period_year / period_month): only
--     for that month, e.g. 10 hours of overtime in August.
-- quantity holds hours (overtime) or days (unpaid leave) when the amount was
-- worked out from them; the amount itself can be adjusted.
--
-- Pay data: only people with pay access can see or change these rows.
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS payroll_pay_items (
  id            bigserial PRIMARY KEY,
  company_id    bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id   bigint NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  item_code     text NOT NULL,
  label         text,
  quantity      numeric(10, 2),
  amount        numeric(14, 2) NOT NULL DEFAULT 0,
  note          text,
  recurring     boolean NOT NULL DEFAULT false,
  period_year   int,
  period_month  int,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_pay_items_period_check CHECK (
    (recurring AND period_year IS NULL AND period_month IS NULL)
    OR (NOT recurring AND period_year BETWEEN 2000 AND 2100 AND period_month BETWEEN 1 AND 12)
  ),
  CONSTRAINT payroll_pay_items_amount_check CHECK (amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_pay_items_period ON payroll_pay_items(company_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_pay_items_employee ON payroll_pay_items(employee_id);

ALTER TABLE payroll_pay_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN PERFORM public.app_drop_policies('payroll_pay_items'); END $$;
CREATE POLICY pay_rows ON payroll_pay_items FOR ALL TO authenticated
  USING ((SELECT public.app_is_platform_admin()) OR company_id IN (SELECT public.app_my_pay_company_ids()))
  WITH CHECK ((SELECT public.app_is_platform_admin()) OR company_id IN (SELECT public.app_my_pay_company_ids()));

-- The employee must belong to the row's company (RLS only checks company_id).
DROP TRIGGER IF EXISTS trg_guard_employee_company ON payroll_pay_items;
CREATE TRIGGER trg_guard_employee_company BEFORE INSERT OR UPDATE ON payroll_pay_items
  FOR EACH ROW EXECUTE FUNCTION public.app_guard_employee_company();

GRANT SELECT, INSERT, UPDATE, DELETE ON payroll_pay_items TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE payroll_pay_items_id_seq TO authenticated;
GRANT ALL ON payroll_pay_items TO service_role;
GRANT ALL ON SEQUENCE payroll_pay_items_id_seq TO service_role;
REVOKE ALL ON payroll_pay_items FROM anon;
REVOKE ALL ON SEQUENCE payroll_pay_items_id_seq FROM anon;

SELECT 'migration 022 complete' AS status;
