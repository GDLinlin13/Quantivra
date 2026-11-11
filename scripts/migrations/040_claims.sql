-- 040_claims.sql — staff expense claims (HR → My Claims, Claims; Finance → Payables → Staff claims).
--
--   claims          one claim per receipt / expense, by the staff member whose login is linked to the employee
--   claim_receipts  pictures / PDFs of the receipts, in the private "fin-attachments" bucket under
--                   "<company id>/claims/<claim id>/…"
--
-- Who may do what:
--   Claims → view                    My Claims: submit, change and cancel your own claims while they are pending
--   Claims → approve                 see everyone's claims; approve or reject them
--   Claims → create / edit / delete  see everyone's claims; add, change or remove claims for anyone
--   Finance → create / edit          turn approved claims into staff-claim expenses to pay
-- Admin / Director roles, roles with "Can see pay & manage users" and platform admins can do everything.
-- Needs 039. Idempotent.

-- is this employee the signed-in person's own record?
CREATE OR REPLACE FUNCTION public.app_is_my_employee(p_employee_id bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM employees e
    JOIN company_users cu ON cu.id = e.user_id AND cu.company_id = e.company_id AND cu.is_active
    WHERE e.id = p_employee_id AND cu.auth_user_id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.app_is_my_employee(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_is_my_employee(bigint) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS claims (
  id             bigserial PRIMARY KEY,
  company_id     bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id    bigint NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  claim_date     date NOT NULL,
  category       text NOT NULL,
  description    text,
  amount         numeric(14,2) NOT NULL CHECK (amount > 0),
  currency       text NOT NULL,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by     bigint REFERENCES company_users(id) ON DELETE SET NULL,
  decided_at     timestamptz,
  decision_note  text,
  document_id    bigint REFERENCES fin_documents(id) ON DELETE SET NULL,   -- the staff-claim expense in Finance
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_claims_company ON claims(company_id, status);
CREATE INDEX IF NOT EXISTS idx_claims_employee ON claims(employee_id);

CREATE TABLE IF NOT EXISTS claim_receipts (
  id            bigserial PRIMARY KEY,
  company_id    bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  claim_id      bigint NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  path          text NOT NULL UNIQUE,
  file_name     text NOT NULL,
  content_type  text,
  size_bytes    bigint,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT claim_receipts_path_company CHECK (split_part(path, '/', 1) = company_id::text)
);
CREATE INDEX IF NOT EXISTS idx_claim_receipts_claim ON claim_receipts(claim_id);

-- links stay inside the company
DROP TRIGGER IF EXISTS trg_ref_company ON claims;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON claims FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('employee_id', 'employees', 'document_id', 'fin_documents');
DROP TRIGGER IF EXISTS trg_ref_company ON claim_receipts;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON claim_receipts FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('claim_id', 'claims');

-- ---- row rules --------------------------------------------------------------------------------
DO $$ BEGIN PERFORM public.app_drop_policies('claims'); PERFORM public.app_drop_policies('claim_receipts'); END $$;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY claims_read ON claims FOR SELECT TO authenticated USING (
  (SELECT public.app_is_platform_admin())
  OR (company_id IN (SELECT public.app_my_company_ids()) AND (
    public.app_is_my_employee(employee_id)
    OR public.app_can_any(company_id, ARRAY['claims'], ARRAY['approve', 'create', 'edit', 'delete'])
    OR public.app_can_any(company_id, ARRAY['finance'], ARRAY['create', 'edit']))));

CREATE POLICY claims_add ON claims FOR INSERT TO authenticated WITH CHECK (
  (SELECT public.app_is_platform_admin())
  OR (company_id IN (SELECT public.app_my_company_ids()) AND (
    (public.app_is_my_employee(employee_id) AND public.app_can_any(company_id, ARRAY['claims'], ARRAY['view', 'create', 'edit']) AND status = 'pending' AND document_id IS NULL)
    OR public.app_can_any(company_id, ARRAY['claims'], ARRAY['create', 'edit']))));

-- own pending claims; claim managers and approvers; Finance links the expense it made
CREATE POLICY claims_change ON claims FOR UPDATE TO authenticated
  USING (
    (SELECT public.app_is_platform_admin())
    OR (company_id IN (SELECT public.app_my_company_ids()) AND (
      (public.app_is_my_employee(employee_id) AND public.app_can_any(company_id, ARRAY['claims'], ARRAY['view', 'create', 'edit']) AND status = 'pending')
      OR public.app_can_any(company_id, ARRAY['claims'], ARRAY['edit', 'approve'])
      OR public.app_can_any(company_id, ARRAY['finance'], ARRAY['create', 'edit']))))
  WITH CHECK (
    (SELECT public.app_is_platform_admin())
    OR (company_id IN (SELECT public.app_my_company_ids()) AND (
      (public.app_is_my_employee(employee_id) AND public.app_can_any(company_id, ARRAY['claims'], ARRAY['view', 'create', 'edit']) AND status IN ('pending', 'cancelled') AND document_id IS NULL)
      OR public.app_can_any(company_id, ARRAY['claims'], ARRAY['edit', 'approve'])
      OR public.app_can_any(company_id, ARRAY['finance'], ARRAY['create', 'edit']))));

CREATE POLICY claims_remove ON claims FOR DELETE TO authenticated USING (
  (SELECT public.app_is_platform_admin())
  OR (company_id IN (SELECT public.app_my_company_ids()) AND (
    (public.app_is_my_employee(employee_id) AND public.app_can_any(company_id, ARRAY['claims'], ARRAY['view', 'create', 'edit']) AND status IN ('pending', 'cancelled'))
    OR public.app_can_any(company_id, ARRAY['claims'], ARRAY['delete', 'edit']))));

-- receipts follow their claim (the claims rules above apply inside these checks)
CREATE POLICY receipts_read ON claim_receipts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM claims c WHERE c.id = claim_id AND c.company_id = claim_receipts.company_id));
CREATE POLICY receipts_add ON claim_receipts FOR INSERT TO authenticated WITH CHECK (EXISTS (
  SELECT 1 FROM claims c WHERE c.id = claim_id AND c.company_id = claim_receipts.company_id AND (
    (SELECT public.app_is_platform_admin())
    OR (public.app_is_my_employee(c.employee_id) AND public.app_can_any(c.company_id, ARRAY['claims'], ARRAY['view', 'create', 'edit']) AND c.status = 'pending')
    OR public.app_can_any(c.company_id, ARRAY['claims'], ARRAY['create', 'edit']))));
CREATE POLICY receipts_remove ON claim_receipts FOR DELETE TO authenticated USING (EXISTS (
  SELECT 1 FROM claims c WHERE c.id = claim_id AND c.company_id = claim_receipts.company_id AND (
    (SELECT public.app_is_platform_admin())
    OR (public.app_is_my_employee(c.employee_id) AND public.app_can_any(c.company_id, ARRAY['claims'], ARRAY['view', 'create', 'edit']) AND c.status IN ('pending', 'cancelled'))
    OR public.app_can_any(c.company_id, ARRAY['claims'], ARRAY['delete', 'edit']))));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.claims, public.claim_receipts TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.claims_id_seq, public.claim_receipts_id_seq TO authenticated;
GRANT ALL ON public.claims, public.claim_receipts TO service_role;
GRANT ALL ON SEQUENCE public.claims_id_seq, public.claim_receipts_id_seq TO service_role;
REVOKE ALL ON public.claims, public.claim_receipts FROM anon;
REVOKE ALL ON SEQUENCE public.claims_id_seq, public.claim_receipts_id_seq FROM anon;

-- approving or rejecting needs Claims → approve; it records who decided and when
CREATE OR REPLACE FUNCTION public.app_guard_claim_decision() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.status IN ('approved', 'rejected') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NOT public.app_can_any(NEW.company_id, ARRAY['claims'], ARRAY['approve']) THEN
      RAISE EXCEPTION 'Your role cannot approve or reject claims' USING ERRCODE = '42501';
    END IF;
    NEW.decided_at := now();
    NEW.decided_by := (SELECT cu.id FROM company_users cu WHERE cu.auth_user_id = auth.uid() AND cu.company_id = NEW.company_id LIMIT 1);
  END IF;
  -- a decided claim keeps its amount and details (only Finance's link and the decision note change)
  IF TG_OP = 'UPDATE' AND OLD.status IN ('approved', 'rejected') AND NEW.status = OLD.status
     AND (NEW.amount, NEW.currency, NEW.claim_date, NEW.category, NEW.employee_id)
         IS DISTINCT FROM (OLD.amount, OLD.currency, OLD.claim_date, OLD.category, OLD.employee_id)
     AND NOT public.app_can_any(NEW.company_id, ARRAY['claims'], ARRAY['approve']) THEN
    RAISE EXCEPTION 'This claim has been decided and can no longer be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.app_guard_claim_decision() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_claim_decision ON claims;
CREATE TRIGGER trg_claim_decision BEFORE INSERT OR UPDATE ON claims
  FOR EACH ROW EXECUTE FUNCTION public.app_guard_claim_decision();

-- ---- receipt files: "<company>/claims/<claim id>/…" -------------------------------------------
-- Staff can't add Finance files (039), so receipts get their own rule: the person may add a receipt
-- when they may add one to that claim.
DO $$ BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS claim_receipts_add ON storage.objects;
    DROP POLICY IF EXISTS claim_receipts_remove ON storage.objects;
    CREATE POLICY claim_receipts_add ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'fin-attachments' AND (storage.foldername(name))[2] = 'claims'
        AND (storage.foldername(name))[3] ~ '^[0-9]+$'
        AND EXISTS (SELECT 1 FROM public.claims c
          WHERE c.id = ((storage.foldername(name))[3])::bigint
            AND c.company_id::text = (storage.foldername(name))[1]
            AND ((SELECT public.app_is_platform_admin())
              OR (public.app_is_my_employee(c.employee_id) AND public.app_can_any(c.company_id, ARRAY['claims'], ARRAY['view', 'create', 'edit']) AND c.status = 'pending')
              OR public.app_can_any(c.company_id, ARRAY['claims'], ARRAY['create', 'edit']))));
    CREATE POLICY claim_receipts_remove ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'fin-attachments' AND (storage.foldername(name))[2] = 'claims'
        AND (storage.foldername(name))[3] ~ '^[0-9]+$'
        AND EXISTS (SELECT 1 FROM public.claims c
          WHERE c.id = ((storage.foldername(name))[3])::bigint
            AND c.company_id::text = (storage.foldername(name))[1]
            AND ((SELECT public.app_is_platform_admin())
              OR (public.app_is_my_employee(c.employee_id) AND public.app_can_any(c.company_id, ARRAY['claims'], ARRAY['view', 'create', 'edit']) AND c.status IN ('pending', 'cancelled'))
              OR public.app_can_any(c.company_id, ARRAY['claims'], ARRAY['delete', 'edit']))));
  END IF;
END $$;

-- ---- leave: applying needs a Leave tick (view, create, edit or approve), like My Claims ----------
CREATE OR REPLACE FUNCTION public.app_guard_leave_apply() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NOT public.app_can_any(NEW.company_id, ARRAY['leave'], ARRAY['view', 'create', 'edit', 'approve']) THEN
    RAISE EXCEPTION 'Your role cannot apply for leave' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.app_guard_leave_apply() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_leave_apply_permission ON leave_requests;
CREATE TRIGGER trg_leave_apply_permission BEFORE INSERT ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.app_guard_leave_apply();

SELECT 'migration 040 complete' AS status;
