-- 021_master_role.sql — the company's master role (Admin, or Director for
-- companies created later) always has full access and pay access. It can't
-- be switched off, renamed or deleted, so a company can never lock itself
-- out. Also restores it if it was switched off. Idempotent.

UPDATE company_roles SET can_view_pay = true
WHERE lower(name) IN ('admin', 'director') AND NOT can_view_pay;

CREATE OR REPLACE FUNCTION public.app_guard_master_role() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF lower(OLD.name) IN ('admin', 'director') AND NOT public.app_is_privileged_role()
       AND EXISTS (SELECT 1 FROM companies c WHERE c.id = OLD.company_id) THEN
      RAISE EXCEPTION 'The % role is the company''s master role and can''t be deleted', OLD.name USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND lower(OLD.name) IN ('admin', 'director') AND lower(NEW.name) <> lower(OLD.name) THEN
    RAISE EXCEPTION 'The % role is the company''s master role and can''t be renamed', OLD.name USING ERRCODE = '42501';
  END IF;
  IF lower(NEW.name) IN ('admin', 'director') THEN
    NEW.can_view_pay := true;   -- master role always has pay access
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_master_role ON company_roles;
CREATE TRIGGER trg_guard_master_role BEFORE INSERT OR UPDATE OR DELETE ON company_roles
  FOR EACH ROW EXECUTE FUNCTION public.app_guard_master_role();
GRANT EXECUTE ON FUNCTION public.app_guard_master_role() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.app_guard_master_role() FROM PUBLIC, anon;

SELECT 'migration 021 complete' AS status;
