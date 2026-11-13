-- 063_audit_trail.sql — the platform audit trail (Platform → Audit Log).
--
-- What is recorded, with who did it and when:
--   company.provisioned / edited / deactivated / reinstated        (triggers on companies)
--   user.edited / suspended / reactivated                          (triggers on company_users)
--   user.created / deleted / password_reset, company.deleted,
--   platform_admin.created                                         (written by the server, which knows who asked)
--   audit.cleared                                                  (when the trail is cleared)
-- Only platform administrators read it. They can add to it and clear it (platform_audit_clear), but not edit a record.
-- Idempotent.

ALTER TABLE platform_audit_log ADD COLUMN IF NOT EXISTS actor_name text;
ALTER TABLE platform_audit_log ADD COLUMN IF NOT EXISTS actor_auth_id uuid;
ALTER TABLE platform_audit_log ADD COLUMN IF NOT EXISTS company_id bigint;
ALTER TABLE platform_audit_log ADD COLUMN IF NOT EXISTS summary text;
CREATE INDEX IF NOT EXISTS idx_platform_audit_company ON platform_audit_log(company_id, created_at DESC);

-- reading, adding and clearing; no editing of a record
DO $$ BEGIN PERFORM public.app_drop_policies('platform_audit_log'); END $$;
ALTER TABLE platform_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_read   ON platform_audit_log FOR SELECT TO authenticated USING ((SELECT public.app_is_platform_admin()));
CREATE POLICY audit_add    ON platform_audit_log FOR INSERT TO authenticated WITH CHECK ((SELECT public.app_is_platform_admin()));
CREATE POLICY audit_clear  ON platform_audit_log FOR DELETE TO authenticated USING ((SELECT public.app_is_platform_admin()));
REVOKE UPDATE ON platform_audit_log FROM authenticated;
GRANT SELECT, INSERT, DELETE ON platform_audit_log TO authenticated;

-- who is the signed-in person (platform administrator, else company user)
CREATE OR REPLACE FUNCTION public.app_actor_name() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT pu.full_name FROM platform_users pu WHERE pu.auth_user_id = auth.uid() LIMIT 1),
    (SELECT cu.full_name FROM company_users cu WHERE cu.auth_user_id = auth.uid() LIMIT 1))
$$;
REVOKE ALL ON FUNCTION public.app_actor_name() FROM PUBLIC, anon, authenticated;

-- write one record (called by the triggers below; not by the browser)
CREATE OR REPLACE FUNCTION public.app_audit(p_action text, p_entity_type text, p_entity_id text, p_company_id bigint, p_summary text, p_old jsonb, p_new jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO platform_audit_log (action, entity_type, entity_id, company_id, summary, actor_name, actor_auth_id, old_value, new_value)
  VALUES (p_action, p_entity_type, p_entity_id, p_company_id, p_summary, public.app_actor_name(), auth.uid(), p_old, p_new);
END $$;
REVOKE ALL ON FUNCTION public.app_audit(text, text, text, bigint, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- company changes
CREATE OR REPLACE FUNCTION public.app_audit_companies() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o jsonb; n jsonb; k text; diff_old jsonb := '{}'; diff_new jsonb := '{}';
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;          -- the server logs what it does itself
  o := to_jsonb(OLD) - 'updated_at'; n := to_jsonb(NEW) - 'updated_at';
  IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    PERFORM public.app_audit(CASE WHEN NEW.is_active THEN 'company.reinstated' ELSE 'company.deactivated' END, 'company', NEW.id::text, NEW.id, NEW.name, NULL, NULL);
  END IF;
  FOR k IN SELECT key FROM jsonb_each(n) LOOP
    IF k <> 'is_active' AND o -> k IS DISTINCT FROM n -> k THEN diff_old := diff_old || jsonb_build_object(k, o -> k); diff_new := diff_new || jsonb_build_object(k, n -> k); END IF;
  END LOOP;
  IF diff_new <> '{}'::jsonb THEN
    PERFORM public.app_audit('company.edited', 'company', NEW.id::text, NEW.id, NEW.name, diff_old, diff_new);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.app_audit_companies() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_audit_companies ON companies;
CREATE TRIGGER trg_audit_companies AFTER UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION public.app_audit_companies();

-- user changes made in the app
CREATE OR REPLACE FUNCTION public.app_audit_company_users() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    PERFORM public.app_audit(CASE WHEN NEW.is_active THEN 'user.reactivated' ELSE 'user.suspended' END, 'user', NEW.id::text, NEW.company_id, NEW.full_name, NULL, NULL);
  END IF;
  IF (OLD.full_name, OLD.email, OLD.job_title, OLD.phone) IS DISTINCT FROM (NEW.full_name, NEW.email, NEW.job_title, NEW.phone) THEN
    PERFORM public.app_audit('user.edited', 'user', NEW.id::text, NEW.company_id, NEW.full_name,
      jsonb_build_object('name', OLD.full_name, 'email', OLD.email, 'job_title', OLD.job_title, 'phone', OLD.phone),
      jsonb_build_object('name', NEW.full_name, 'email', NEW.email, 'job_title', NEW.job_title, 'phone', NEW.phone));
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.app_audit_company_users() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_audit_company_users ON company_users;
CREATE TRIGGER trg_audit_company_users AFTER UPDATE ON company_users FOR EACH ROW EXECUTE FUNCTION public.app_audit_company_users();

-- clear the trail (platform administrators only); one record is left saying so
CREATE OR REPLACE FUNCTION public.platform_audit_clear() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n bigint;
BEGIN
  PERFORM public.app_require_platform_admin();
  SELECT count(*) INTO n FROM platform_audit_log;
  DELETE FROM platform_audit_log WHERE true;
  PERFORM public.app_audit('audit.cleared', 'audit', NULL, NULL, n || ' records cleared', NULL, jsonb_build_object('records', n));
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.platform_audit_clear() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_audit_clear() TO authenticated, service_role;

SELECT 'migration 063 complete' AS status;
