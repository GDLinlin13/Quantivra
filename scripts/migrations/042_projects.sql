-- 042_projects.sql — projects, tasks, milestones and timesheets (Projects in the menu).
--
--   projects            a piece of work: customer, manager, dates, budget hours, status
--   project_tasks       what has to be done, who does it, when it is due
--   project_milestones  dates that matter
--   project_timesheets  hours people spent on a project (and optionally a task), one row per entry
--
-- Who may do what (Roles → Projects):
--   view                      the Projects menu: see projects, and log your own hours (My Timesheet)
--   create / edit             add and change projects, tasks and milestones; see and fix everyone's timesheets
--   delete / edit             remove them
-- Admin / Director roles, roles with "Can see pay & manage users" and platform admins can do everything.
-- Needs 039, 040 and 041. Idempotent.

-- An empty table of the same name from an early draft is dropped; one with rows is kept as "<name>_legacy".
DO $$
DECLARE t text; n bigint; r record;
BEGIN
  FOREACH t IN ARRAY ARRAY['project_timesheets', 'project_milestones', 'project_tasks', 'projects'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t
          AND column_name IN ('company_id', CASE t WHEN 'projects' THEN 'budget_hours' WHEN 'project_tasks' THEN 'assignee_id'
                                                   WHEN 'project_milestones' THEN 'done' ELSE 'hours' END)) = 2 THEN CONTINUE; END IF;
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
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS projects (
  id            bigserial PRIMARY KEY,
  company_id    bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code          text,
  name          text NOT NULL,
  contact_id    bigint REFERENCES contacts(id) ON DELETE SET NULL,      -- the customer
  manager_id    bigint REFERENCES employees(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('planned', 'active', 'on_hold', 'done', 'cancelled')),
  start_date    date,
  end_date      date,
  budget_hours  numeric(10,2),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company_id, status);

CREATE TABLE IF NOT EXISTS project_tasks (
  id           bigserial PRIMARY KEY,
  company_id   bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id   bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title        text NOT NULL,
  assignee_id  bigint REFERENCES employees(id) ON DELETE SET NULL,
  due_date     date,
  status       text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks(project_id);

CREATE TABLE IF NOT EXISTS project_milestones (
  id           bigserial PRIMARY KEY,
  company_id   bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id   bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title        text NOT NULL,
  due_date     date,
  done         boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_milestones_project ON project_milestones(project_id);

CREATE TABLE IF NOT EXISTS project_timesheets (
  id           bigserial PRIMARY KEY,
  company_id   bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id   bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id      bigint REFERENCES project_tasks(id) ON DELETE SET NULL,
  employee_id  bigint NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date    date NOT NULL,
  hours        numeric(6,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_timesheets_project ON project_timesheets(project_id, work_date);
CREATE INDEX IF NOT EXISTS idx_project_timesheets_employee ON project_timesheets(employee_id, work_date);

-- links stay inside the company
DROP TRIGGER IF EXISTS trg_ref_company ON projects;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON projects FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('contact_id', 'contacts', 'manager_id', 'employees');
DROP TRIGGER IF EXISTS trg_ref_company ON project_tasks;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON project_tasks FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('project_id', 'projects', 'assignee_id', 'employees');
DROP TRIGGER IF EXISTS trg_ref_company ON project_milestones;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON project_milestones FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('project_id', 'projects');
DROP TRIGGER IF EXISTS trg_ref_company ON project_timesheets;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON project_timesheets FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('project_id', 'projects', 'task_id', 'project_tasks', 'employee_id', 'employees');

-- ---- row rules --------------------------------------------------------------------------------
-- projects, tasks, milestones: everyone in the company reads; create / edit writes; delete / edit removes
SELECT public.app_apply_module_policy('projects', ARRAY['projects']);
SELECT public.app_apply_module_policy('project_tasks', ARRAY['projects']);
SELECT public.app_apply_module_policy('project_milestones', ARRAY['projects']);

-- timesheets: everyone logs their own hours (Projects → view); managers see and fix everyone's
DO $$ BEGIN PERFORM public.app_drop_policies('project_timesheets'); END $$;
ALTER TABLE project_timesheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY timesheets_read ON project_timesheets FOR SELECT TO authenticated USING (
  (SELECT public.app_is_platform_admin())
  OR (company_id IN (SELECT public.app_my_company_ids()) AND (
    public.app_is_my_employee(employee_id)
    OR public.app_can_any(company_id, ARRAY['projects'], ARRAY['create', 'edit', 'delete']))));

CREATE POLICY timesheets_add ON project_timesheets FOR INSERT TO authenticated WITH CHECK (
  (SELECT public.app_is_platform_admin())
  OR (company_id IN (SELECT public.app_my_company_ids()) AND (
    (public.app_is_my_employee(employee_id) AND public.app_can_any(company_id, ARRAY['projects'], ARRAY['view', 'create', 'edit']))
    OR public.app_can_any(company_id, ARRAY['projects'], ARRAY['create', 'edit']))));

CREATE POLICY timesheets_change ON project_timesheets FOR UPDATE TO authenticated
  USING (
    (SELECT public.app_is_platform_admin())
    OR (company_id IN (SELECT public.app_my_company_ids()) AND (
      (public.app_is_my_employee(employee_id) AND public.app_can_any(company_id, ARRAY['projects'], ARRAY['view', 'create', 'edit']))
      OR public.app_can_any(company_id, ARRAY['projects'], ARRAY['create', 'edit']))))
  WITH CHECK (
    (SELECT public.app_is_platform_admin())
    OR (company_id IN (SELECT public.app_my_company_ids()) AND (
      (public.app_is_my_employee(employee_id) AND public.app_can_any(company_id, ARRAY['projects'], ARRAY['view', 'create', 'edit']))
      OR public.app_can_any(company_id, ARRAY['projects'], ARRAY['create', 'edit']))));

CREATE POLICY timesheets_remove ON project_timesheets FOR DELETE TO authenticated USING (
  (SELECT public.app_is_platform_admin())
  OR (company_id IN (SELECT public.app_my_company_ids()) AND (
    (public.app_is_my_employee(employee_id) AND public.app_can_any(company_id, ARRAY['projects'], ARRAY['view', 'create', 'edit']))
    OR public.app_can_any(company_id, ARRAY['projects'], ARRAY['delete', 'edit']))));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['projects', 'project_tasks', 'project_milestones', 'project_timesheets'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated', t || '_id_seq');
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('GRANT ALL ON SEQUENCE public.%I TO service_role', t || '_id_seq');
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon', t || '_id_seq');
  END LOOP;
END $$;

SELECT 'migration 042 complete' AS status;
