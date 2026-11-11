-- 044_leave_policy.sql — leave policy: rules, time off by the hour, time off in lieu.
--
-- Per leave type (HR → Leave Types):
--   min_notice_days   apply at least this many working days ahead
--   quota_days        most days a person may take of this type per week or month (e.g. work from home 2 a week)
--   counts_as_absence does being on this leave mean being away? (off for work from home)
--   is_toil           time off in lieu: HR adds it to an employee's balance when they have earned it
--   count_method 'hours'   time off by the hour, within one day
-- For the company (HR → Leave Policy):
--   max people off on the same day (whole company or the same department)
--   least people from a department who must be at work
-- A request that breaks a rule is refused, with the reason. HR (Leave or Employees create / edit, Admin / Director)
-- can apply anyway, giving a reason that is kept with the request.
-- Time off in lieu: people with Leave or Employees create / edit add it for an employee (days or hours, as the leave
-- type counts), with the date worked and a reason; it becomes part of the employee's balance. Employees see it.
-- Needs 039–043. Idempotent.

ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS min_notice_days   int NOT NULL DEFAULT 0 CHECK (min_notice_days >= 0);
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS quota_days        numeric(6,2) CHECK (quota_days IS NULL OR quota_days > 0);
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS quota_period      text;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS counts_as_absence boolean NOT NULL DEFAULT true;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS is_toil           boolean NOT NULL DEFAULT false;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_types_quota_period_check') THEN
    ALTER TABLE leave_types ADD CONSTRAINT leave_types_quota_period_check CHECK (quota_period IS NULL OR quota_period IN ('week', 'month'));
  END IF;
  ALTER TABLE leave_types DROP CONSTRAINT IF EXISTS leave_types_count_method_check;
  ALTER TABLE leave_types ADD CONSTRAINT leave_types_count_method_check
    CHECK (count_method IN ('working_days', 'weeks', 'calendar_days', 'hours'));
END $$;

ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS policy_override text;       -- HR's reason for applying around a rule

CREATE TABLE IF NOT EXISTS leave_policy (
  company_id                     bigint PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  max_off_per_day                int CHECK (max_off_per_day IS NULL OR max_off_per_day >= 1),
  max_off_scope                  text NOT NULL DEFAULT 'company' CHECK (max_off_scope IN ('company', 'department')),
  min_at_work_per_department     int CHECK (min_at_work_per_department IS NULL OR min_at_work_per_department >= 1),
  updated_at                     timestamptz NOT NULL DEFAULT now()
);

-- time off in lieu added by HR (days or hours, as the leave type counts)
CREATE TABLE IF NOT EXISTS toil_credits (
  id             bigserial PRIMARY KEY,
  company_id     bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id    bigint NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id  bigint NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  amount         numeric(6,2) NOT NULL CHECK (amount > 0),
  worked_date    date NOT NULL,                  -- the day the extra work was done
  reason         text,
  granted_by     bigint REFERENCES company_users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_toil_credits_company ON toil_credits(company_id, employee_id);

DROP TRIGGER IF EXISTS trg_ref_company ON toil_credits;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON toil_credits FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('employee_id', 'employees', 'leave_type_id', 'leave_types');

SELECT public.app_apply_module_policy('leave_policy', ARRAY['leave']);

-- credits: read your own, or all with an HR / approver tick; written only through toil_grant / toil_revoke
DO $$ BEGIN PERFORM public.app_drop_policies('toil_credits'); END $$;
ALTER TABLE toil_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY toil_read ON toil_credits FOR SELECT TO authenticated USING (
  (SELECT public.app_is_platform_admin())
  OR (company_id IN (SELECT public.app_my_company_ids()) AND (
    public.app_is_my_employee(employee_id)
    OR public.app_can_any(company_id, ARRAY['leave'], ARRAY['approve', 'create', 'edit'])
    OR public.app_can_any(company_id, ARRAY['employees'], ARRAY['create', 'edit']))));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leave_policy', 'toil_credits'] LOOP
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_policy TO authenticated;
  GRANT SELECT ON public.toil_credits TO authenticated;
  GRANT ALL ON SEQUENCE public.toil_credits_id_seq TO service_role;
  REVOKE ALL ON SEQUENCE public.toil_credits_id_seq FROM anon;
END $$;

-- ---- working days -----------------------------------------------------------------------------------

-- how much of a day this employee works on a date: 0 rest day or public holiday, 0.5 half day, 1 full day
CREATE OR REPLACE FUNCTION public.app_work_weight(p_employee_id bigint, p_date date) RETURNS numeric
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH k AS (SELECT (ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])[EXTRACT(isodow FROM p_date)::int] AS key)
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM company_holidays h JOIN employees e ON e.id = p_employee_id AND e.company_id = h.company_id
                 WHERE h.holiday_date = p_date) THEN 0
    ELSE COALESCE(
      (SELECT (p.pattern ->> k.key)::numeric FROM employee_work_patterns p WHERE p.employee_id = p_employee_id),
      (SELECT (s.value ->> k.key)::numeric FROM company_settings s JOIN employees e ON e.id = p_employee_id AND e.company_id = s.company_id
        WHERE s.category = 'company' AND s.key = 'work_pattern'),
      CASE WHEN EXTRACT(isodow FROM p_date) <= 5 THEN 1 ELSE 0 END)
  END FROM k
$$;
REVOKE ALL ON FUNCTION public.app_work_weight(bigint, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_work_weight(bigint, date) TO authenticated, service_role;

-- working days of a leave request that fall between two dates (a half day takes half off the last day)
CREATE OR REPLACE FUNCTION public.app_leave_days_in(p_employee_id bigint, p_start date, p_end date, p_half boolean, p_from date, p_to date)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(sum(public.app_work_weight(p_employee_id, g::date)
           - CASE WHEN p_half AND g::date = p_end THEN LEAST(0.5, public.app_work_weight(p_employee_id, g::date)) ELSE 0 END), 0)
  FROM generate_series(GREATEST(p_start, p_from), LEAST(p_end, p_to), interval '1 day') g
$$;
REVOKE ALL ON FUNCTION public.app_leave_days_in(bigint, date, date, boolean, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_leave_days_in(bigint, date, date, boolean, date, date) TO authenticated, service_role;

-- ---- the rules ----------------------------------------------------------------------------------------

-- Raises 'POLICY: …' when a new request breaks a rule. Counts pending and approved requests.
CREATE OR REPLACE FUNCTION public.app_check_leave_rules(r leave_requests) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t leave_types%ROWTYPE; pol leave_policy%ROWTYPE; e employees%ROWTYPE;
  v_tz text; v_today date; d date; n int; v_used numeric; v_mine numeric; v_from date; v_to date; v_label text;
BEGIN
  PERFORM public.app_require_company(r.company_id);
  SELECT * INTO t FROM leave_types WHERE id = r.leave_type_id AND company_id = r.company_id;
  SELECT * INTO e FROM employees WHERE id = r.employee_id AND company_id = r.company_id;
  IF t.id IS NULL OR e.id IS NULL THEN RETURN; END IF;

  -- 1. notice: working days between today and the first day of leave
  IF t.min_notice_days > 0 THEN
    SELECT timezone INTO v_tz FROM companies WHERE id = r.company_id;
    BEGIN v_today := (now() AT TIME ZONE COALESCE(NULLIF(v_tz, ''), 'UTC'))::date;
    EXCEPTION WHEN OTHERS THEN v_today := (now() AT TIME ZONE 'UTC')::date; END;
    SELECT count(*) INTO n FROM generate_series(v_today + 1, r.start_date, interval '1 day') g
      WHERE public.app_work_weight(r.employee_id, g::date) > 0;
    IF n < t.min_notice_days THEN
      RAISE EXCEPTION 'POLICY: % has to be applied for at least % working day(s) in advance', t.name, t.min_notice_days;
    END IF;
  END IF;

  -- 2. how many people are away / at work (only for leave that means being away)
  IF t.counts_as_absence THEN
    SELECT * INTO pol FROM leave_policy WHERE company_id = r.company_id;
    IF pol.company_id IS NOT NULL AND (pol.max_off_per_day IS NOT NULL OR pol.min_at_work_per_department IS NOT NULL) THEN
      FOR d IN SELECT g::date FROM generate_series(r.start_date, r.end_date, interval '1 day') g LOOP
        CONTINUE WHEN public.app_work_weight(r.employee_id, d) <= 0;
        IF pol.max_off_per_day IS NOT NULL THEN
          SELECT count(DISTINCT o.employee_id) INTO n FROM leave_requests o
            JOIN leave_types ot ON ot.id = o.leave_type_id AND ot.counts_as_absence
            JOIN employees oe ON oe.id = o.employee_id AND oe.company_id = r.company_id AND oe.status = 'active'
            WHERE o.company_id = r.company_id AND o.status IN ('pending', 'approved') AND o.employee_id <> r.employee_id
              AND d BETWEEN o.start_date AND o.end_date AND public.app_work_weight(o.employee_id, d) > 0
              AND (pol.max_off_scope = 'company' OR oe.department_id IS NOT DISTINCT FROM e.department_id);
          IF n + 1 > pol.max_off_per_day THEN
            RAISE EXCEPTION 'POLICY: Too many people are already off on % (at most % may be off at the same time%)',
              to_char(d, 'DD Mon YYYY'), pol.max_off_per_day, CASE WHEN pol.max_off_scope = 'department' THEN ' in a department' ELSE '' END;
          END IF;
        END IF;
        IF pol.min_at_work_per_department IS NOT NULL AND e.department_id IS NOT NULL THEN
          SELECT count(*) INTO n FROM employees m
            WHERE m.company_id = r.company_id AND m.department_id = e.department_id AND m.status = 'active' AND m.id <> r.employee_id
              AND public.app_work_weight(m.id, d) > 0
              AND NOT EXISTS (SELECT 1 FROM leave_requests o JOIN leave_types ot ON ot.id = o.leave_type_id AND ot.counts_as_absence
                              WHERE o.employee_id = m.id AND o.status IN ('pending', 'approved') AND d BETWEEN o.start_date AND o.end_date);
          IF n < pol.min_at_work_per_department THEN
            RAISE EXCEPTION 'POLICY: At least % people from your department must be at work on % (only % would be)',
              pol.min_at_work_per_department, to_char(d, 'DD Mon YYYY'), n;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- 3. the most days a person may take of this type per week or month
  IF t.quota_days IS NOT NULL AND t.quota_period IS NOT NULL AND t.count_method IN ('working_days', 'calendar_days') THEN
    FOR v_from IN SELECT DISTINCT date_trunc(t.quota_period, g)::date FROM generate_series(r.start_date, r.end_date, interval '1 day') g
                  WHERE public.app_work_weight(r.employee_id, g::date) > 0 LOOP
      v_to := (v_from + CASE t.quota_period WHEN 'week' THEN interval '6 days' ELSE interval '1 month - 1 day' END)::date;
      v_mine := public.app_leave_days_in(r.employee_id, r.start_date, r.end_date, r.half_day, v_from, v_to);
      SELECT COALESCE(sum(public.app_leave_days_in(o.employee_id, o.start_date, o.end_date, o.half_day, v_from, v_to)), 0) INTO v_used
        FROM leave_requests o
        WHERE o.employee_id = r.employee_id AND o.leave_type_id = r.leave_type_id AND o.status IN ('pending', 'approved')
          AND o.start_date <= v_to AND o.end_date >= v_from;
      IF v_used + v_mine > t.quota_days THEN
        v_label := CASE t.quota_period WHEN 'week' THEN 'week of ' || to_char(v_from, 'DD Mon') ELSE to_char(v_from, 'Mon YYYY') END;
        RAISE EXCEPTION 'POLICY: % is limited to % day(s) a % — % already used in the %',
          t.name, trim(trailing '.' FROM trim(trailing '0' FROM t.quota_days::text)), t.quota_period, v_used, v_label;
      END IF;
    END LOOP;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.app_check_leave_rules(leave_requests) FROM PUBLIC, anon, authenticated;

-- the checks every new leave request goes through
CREATE OR REPLACE FUNCTION public.app_guard_leave_apply() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE t leave_types%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NOT public.app_can_any(NEW.company_id, ARRAY['leave'], ARRAY['view', 'create', 'edit', 'approve'])
     AND NOT public.app_can_any(NEW.company_id, ARRAY['employees'], ARRAY['create', 'edit']) THEN
    RAISE EXCEPTION 'Your role cannot apply for leave' USING ERRCODE = '42501';
  END IF;
  IF NOT public.app_can_act_for_employee(NEW.employee_id) THEN
    RAISE EXCEPTION 'You can apply for leave for yourself or the people who report to you' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO t FROM leave_types WHERE id = NEW.leave_type_id AND company_id = NEW.company_id;
  IF t.id IS NULL THEN RETURN NEW; END IF;
  IF t.count_method = 'hours' AND NEW.start_date <> NEW.end_date THEN
    RAISE EXCEPTION 'Time off by the hour is taken within one day' USING ERRCODE = '22023';
  END IF;
  -- HR can apply around the rules, with a reason; nobody else can
  IF NULLIF(NEW.policy_override, '') IS NOT NULL THEN
    IF NOT (public.app_can_any(NEW.company_id, ARRAY['leave', 'employees'], ARRAY['create', 'edit'])) THEN
      RAISE EXCEPTION 'Only HR can apply around the leave rules' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  NEW.policy_override := NULL;
  PERFORM public.app_check_leave_rules(NEW);
  RETURN NEW;
END $$;

-- applying for leave (the same as before, plus HR's reason for applying around a rule)
CREATE OR REPLACE FUNCTION public.leave_apply(p jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company_id bigint := (p->>'company_id')::bigint;
  v_emp bigint := (p->>'employee_id')::bigint;
  v_type bigint := (p->>'leave_type_id')::bigint;
  v_days numeric := (p->>'days')::numeric;
  v_year int := EXTRACT(YEAR FROM (p->>'start_date')::date);
  v_id bigint;
BEGIN
  PERFORM public.app_require_company(v_company_id);
  IF NOT EXISTS (SELECT 1 FROM employees WHERE id = v_emp AND company_id = v_company_id)
     OR NOT EXISTS (SELECT 1 FROM leave_types WHERE id = v_type AND company_id = v_company_id) THEN
    RAISE EXCEPTION 'Employee and leave type must belong to the company' USING ERRCODE = '42501';
  END IF;

  INSERT INTO leave_requests (company_id, employee_id, leave_type_id, start_date, end_date,
    half_day, days, reason, policy_override)
  VALUES (v_company_id, v_emp, v_type, (p->>'start_date')::date, (p->>'end_date')::date,
    COALESCE((p->>'half_day')::boolean,false), v_days, p->>'reason', NULLIF(p->>'override_reason', ''))
  RETURNING id INTO v_id;

  INSERT INTO leave_balances (company_id, employee_id, leave_type_id, year, pending_days)
  VALUES (v_company_id, v_emp, v_type, v_year, v_days)
  ON CONFLICT (employee_id, leave_type_id, year)
  DO UPDATE SET pending_days = leave_balances.pending_days + v_days;

  RETURN v_id;
END $$;

-- ---- time off in lieu -----------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_credit_toil(p_employee_id bigint, p_type_id bigint, p_company_id bigint, p_amount numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.app_require_company(p_company_id);
  INSERT INTO leave_balances (company_id, employee_id, leave_type_id, year, entitled_days, entitlement_source, entitlement_basis)
  VALUES (p_company_id, p_employee_id, p_type_id, EXTRACT(YEAR FROM now())::int, p_amount, 'manual', 'Time off in lieu earned')
  ON CONFLICT (employee_id, leave_type_id, year)
  DO UPDATE SET entitled_days = leave_balances.entitled_days + p_amount, entitlement_source = 'manual',
                entitlement_basis = 'Time off in lieu earned';
END $$;
REVOKE ALL ON FUNCTION public.app_credit_toil(bigint, bigint, bigint, numeric) FROM PUBLIC, anon, authenticated;

-- Add time off in lieu to an employee's balance (Leave or Employees create / edit).
CREATE OR REPLACE FUNCTION public.toil_grant(p_employee_id bigint, p_type_id bigint, p_amount numeric, p_worked_date date, p_reason text DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company bigint; v_id bigint; v_user bigint;
BEGIN
  SELECT company_id INTO v_company FROM employees WHERE id = p_employee_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Employee not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.app_require_company(v_company);
  IF NOT public.app_can_any(v_company, ARRAY['leave', 'employees'], ARRAY['create', 'edit']) THEN
    RAISE EXCEPTION 'Your role cannot add time off in lieu' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM leave_types WHERE id = p_type_id AND company_id = v_company AND is_toil AND active) THEN
    RAISE EXCEPTION 'This is not a time-off-in-lieu leave type' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 365 THEN RAISE EXCEPTION 'Enter how much time off was earned' USING ERRCODE = '22023'; END IF;
  SELECT cu.id INTO v_user FROM company_users cu WHERE cu.auth_user_id = auth.uid() AND cu.company_id = v_company LIMIT 1;
  INSERT INTO toil_credits (company_id, employee_id, leave_type_id, amount, worked_date, reason, granted_by)
  VALUES (v_company, p_employee_id, p_type_id, p_amount, p_worked_date, NULLIF(p_reason, ''), v_user)
  RETURNING id INTO v_id;
  PERFORM public.app_credit_toil(p_employee_id, p_type_id, v_company, p_amount);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.toil_grant(bigint, bigint, numeric, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toil_grant(bigint, bigint, numeric, date, text) TO authenticated, service_role;

-- Take back a grant made by mistake (only while the time off has not been used up).
CREATE OR REPLACE FUNCTION public.toil_revoke(p_id bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c toil_credits%ROWTYPE; b leave_balances%ROWTYPE;
BEGIN
  SELECT * INTO c FROM toil_credits WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.app_require_company(c.company_id);
  IF NOT public.app_can_any(c.company_id, ARRAY['leave', 'employees'], ARRAY['create', 'edit']) THEN
    RAISE EXCEPTION 'Your role cannot remove time off in lieu' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO b FROM leave_balances WHERE employee_id = c.employee_id AND leave_type_id = c.leave_type_id AND year = EXTRACT(YEAR FROM c.created_at)::int FOR UPDATE;
  IF b.id IS NULL OR b.entitled_days + COALESCE(b.carried_days, 0) - b.taken_days - b.pending_days < c.amount THEN
    RAISE EXCEPTION 'Part of this time off has already been used, so it cannot be taken back' USING ERRCODE = '22023';
  END IF;
  UPDATE leave_balances SET entitled_days = entitled_days - c.amount WHERE id = b.id;
  DELETE FROM toil_credits WHERE id = p_id;
END $$;
REVOKE ALL ON FUNCTION public.toil_revoke(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toil_revoke(bigint) TO authenticated, service_role;

SELECT 'migration 044 complete' AS status;
