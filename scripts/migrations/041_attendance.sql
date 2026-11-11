-- 041_attendance.sql — clocking in and out (HR → My Attendance, Attendance).
--
--   attendance_logs   one row per shift: clock in, clock out, the working day it belongs to
--
-- Who may do what:
--   Attendance → view                    My Attendance: clock yourself in and out, see your own hours
--   Attendance → create / edit / delete  the Attendance tab: everyone's hours; add, correct or remove entries
-- Admin / Director roles, roles with "Can see pay & manage users" and platform admins can do everything.
-- People clocking themselves in can't choose the time: the database stamps it.
-- Also: applying leave for someone else (see the end of this file). Needs 039 and 040. Idempotent.

-- An empty table of the same name from an early draft is dropped; one with rows is kept as "<name>_legacy".
DO $$
DECLARE t text := 'attendance_logs'; n bigint; r record;
BEGIN
  IF to_regclass('public.' || t) IS NOT NULL AND (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name IN ('company_id', 'employee_id', 'work_date', 'clock_in', 'clock_out')) < 5 THEN
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n = 0 THEN
      EXECUTE format('DROP TABLE public.%I CASCADE', t);
    ELSE
      FOR r IN SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE i.indrelid = ('public.' || t)::regclass LOOP
        EXECUTE format('ALTER INDEX public.%I RENAME TO %I', r.relname, left('legacy_' || r.relname, 63));
      END LOOP;
      FOR r IN SELECT c.relname FROM pg_depend d JOIN pg_class c ON c.oid = d.objid AND c.relkind = 'S'
               WHERE d.refobjid = ('public.' || t)::regclass AND d.deptype IN ('a', 'i') LOOP
        EXECUTE format('ALTER SEQUENCE public.%I RENAME TO %I', r.relname, left('legacy_' || r.relname, 63));
      END LOOP;
      EXECUTE format('ALTER TABLE public.%I RENAME TO %I', t, t || '_legacy');
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS attendance_logs (
  id           bigserial PRIMARY KEY,
  company_id   bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id  bigint NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date    date NOT NULL,                       -- the day in the company's time zone
  clock_in     timestamptz NOT NULL,
  clock_out    timestamptz,
  note         text,
  source       text NOT NULL DEFAULT 'clock' CHECK (source IN ('clock', 'manual')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_out_after_in CHECK (clock_out IS NULL OR clock_out >= clock_in)
);
CREATE INDEX IF NOT EXISTS idx_attendance_company_date ON attendance_logs(company_id, work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance_logs(employee_id, work_date);
-- one open shift per person
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_open ON attendance_logs(employee_id) WHERE clock_out IS NULL;

DROP TRIGGER IF EXISTS trg_ref_company ON attendance_logs;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON attendance_logs FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('employee_id', 'employees');

-- ---- row rules --------------------------------------------------------------------------------
DO $$ BEGIN PERFORM public.app_drop_policies('attendance_logs'); END $$;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY attendance_read ON attendance_logs FOR SELECT TO authenticated USING (
  (SELECT public.app_is_platform_admin())
  OR (company_id IN (SELECT public.app_my_company_ids()) AND (
    public.app_is_my_employee(employee_id)
    OR public.app_can_any(company_id, ARRAY['attendance'], ARRAY['create', 'edit', 'delete']))));

CREATE POLICY attendance_add ON attendance_logs FOR INSERT TO authenticated WITH CHECK (
  (SELECT public.app_is_platform_admin())
  OR (company_id IN (SELECT public.app_my_company_ids()) AND (
    (public.app_is_my_employee(employee_id) AND public.app_can_any(company_id, ARRAY['attendance'], ARRAY['view', 'create', 'edit']))
    OR public.app_can_any(company_id, ARRAY['attendance'], ARRAY['create', 'edit']))));

-- yourself: only to clock out of your open shift (the trigger below allows nothing else)
CREATE POLICY attendance_change ON attendance_logs FOR UPDATE TO authenticated
  USING (
    (SELECT public.app_is_platform_admin())
    OR (company_id IN (SELECT public.app_my_company_ids()) AND (
      (public.app_is_my_employee(employee_id) AND clock_out IS NULL AND public.app_can_any(company_id, ARRAY['attendance'], ARRAY['view', 'create', 'edit']))
      OR public.app_can_any(company_id, ARRAY['attendance'], ARRAY['create', 'edit']))))
  WITH CHECK (
    (SELECT public.app_is_platform_admin())
    OR (company_id IN (SELECT public.app_my_company_ids()) AND (
      (public.app_is_my_employee(employee_id) AND public.app_can_any(company_id, ARRAY['attendance'], ARRAY['view', 'create', 'edit']))
      OR public.app_can_any(company_id, ARRAY['attendance'], ARRAY['create', 'edit']))));

CREATE POLICY attendance_remove ON attendance_logs FOR DELETE TO authenticated USING (
  (SELECT public.app_is_platform_admin())
  OR (company_id IN (SELECT public.app_my_company_ids())
      AND public.app_can_any(company_id, ARRAY['attendance'], ARRAY['delete', 'edit'])));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_logs TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.attendance_logs_id_seq TO authenticated;
GRANT ALL ON public.attendance_logs TO service_role;
GRANT ALL ON SEQUENCE public.attendance_logs_id_seq TO service_role;
REVOKE ALL ON public.attendance_logs FROM anon;
REVOKE ALL ON SEQUENCE public.attendance_logs_id_seq FROM anon;

-- People who only clock themselves get the database's time, never their own; managers enter what they like.
CREATE OR REPLACE FUNCTION public.app_guard_attendance() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_tz text;
BEGIN
  IF auth.uid() IS NULL OR public.app_can_any(NEW.company_id, ARRAY['attendance'], ARRAY['create', 'edit']) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT timezone INTO v_tz FROM companies WHERE id = NEW.company_id;
    NEW.clock_in := now();
    NEW.clock_out := NULL;
    NEW.source := 'clock';
    BEGIN
      NEW.work_date := (now() AT TIME ZONE COALESCE(NULLIF(v_tz, ''), 'UTC'))::date;
    EXCEPTION WHEN OTHERS THEN
      NEW.work_date := (now() AT TIME ZONE 'UTC')::date;
    END;
    RETURN NEW;
  END IF;
  -- clocking out: the time is now, and nothing else changes
  IF OLD.clock_out IS NOT NULL THEN
    RAISE EXCEPTION 'This shift is already closed' USING ERRCODE = '42501';
  END IF;
  NEW.company_id := OLD.company_id; NEW.employee_id := OLD.employee_id; NEW.work_date := OLD.work_date;
  NEW.clock_in := OLD.clock_in; NEW.source := OLD.source; NEW.created_at := OLD.created_at;
  NEW.clock_out := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.app_guard_attendance() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_attendance_guard ON attendance_logs;
CREATE TRIGGER trg_attendance_guard BEFORE INSERT OR UPDATE ON attendance_logs
  FOR EACH ROW EXECUTE FUNCTION public.app_guard_attendance();

-- ---- leave on behalf: yourself, people who report to you, or anyone for HR / Director ----------
-- (Leave or Employees create / edit counts as HR; Admin / Director roles can do everything.)
CREATE OR REPLACE FUNCTION public.app_can_act_for_employee(p_employee_id bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM employees e WHERE e.id = p_employee_id AND (
      public.app_is_my_employee(e.id)
      OR public.app_can_any(e.company_id, ARRAY['leave', 'employees'], ARRAY['create', 'edit'])
      OR (e.manager_id IS NOT NULL AND public.app_is_my_employee(e.manager_id))))
$$;
REVOKE ALL ON FUNCTION public.app_can_act_for_employee(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_can_act_for_employee(bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.app_guard_leave_apply() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NOT public.app_can_any(NEW.company_id, ARRAY['leave'], ARRAY['view', 'create', 'edit', 'approve'])
     AND NOT public.app_can_any(NEW.company_id, ARRAY['employees'], ARRAY['create', 'edit']) THEN
    RAISE EXCEPTION 'Your role cannot apply for leave' USING ERRCODE = '42501';
  END IF;
  IF NOT public.app_can_act_for_employee(NEW.employee_id) THEN
    RAISE EXCEPTION 'You can apply for leave for yourself or the people who report to you' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.app_guard_leave_apply() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_leave_apply_permission ON leave_requests;
CREATE TRIGGER trg_leave_apply_permission BEFORE INSERT ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.app_guard_leave_apply();

SELECT 'migration 041 complete' AS status;
