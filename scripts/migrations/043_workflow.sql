-- 043_workflow.sql — approval chains for leave and claims (Workflow in the menu).
--
-- A company can set, for leave and for claims, who approves and in which order, e.g.
--   1. the person's line manager       2. anyone with the Director role      (only for leave of 5 days or more)
-- With no chain set, nothing changes: anyone with Leave / Claims → approve decides.
-- With a chain, a request moves step by step; only the person whose turn it is (or an Admin / Director) can act,
-- a rejection at any step rejects the request, and the last approval approves it. Nobody approves their own.
--
--   approval_flows        one chain per company and kind ('leave' or 'claim'), on or off
--   approval_flow_steps   its steps in order: '@manager' (the employee's line manager) or a role name, and an optional
--                         minimum (leave days / claim amount) below which the step is skipped
--   approval_log          who approved or rejected what, at which step
--
-- Who may change chains: Roles → Workflow → create / edit (Admin / Director always).
-- Leave and claims are now decided only through workflow_decide (the old leave_decide calls it).
-- Needs 039, 040, 041 and 042. Idempotent.

CREATE TABLE IF NOT EXISTS approval_flows (
  id          bigserial PRIMARY KEY,
  company_id  bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('leave', 'claim')),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, kind)
);
CREATE TABLE IF NOT EXISTS approval_flow_steps (
  id          bigserial PRIMARY KEY,
  company_id  bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  flow_id     bigint NOT NULL REFERENCES approval_flows(id) ON DELETE CASCADE,
  position    int NOT NULL CHECK (position >= 1),
  approver    text NOT NULL,                                   -- '@manager' or a role name
  min_value   numeric(14,2) CHECK (min_value IS NULL OR min_value >= 0),
  UNIQUE (flow_id, position)
);
CREATE TABLE IF NOT EXISTS approval_log (
  id             bigserial PRIMARY KEY,
  company_id     bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('leave', 'claim')),
  request_id     bigint NOT NULL,
  step_position  int NOT NULL DEFAULT 0,
  actor_user_id  bigint REFERENCES company_users(id) ON DELETE SET NULL,
  actor_name     text,
  decision       text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_log_request ON approval_log(kind, request_id);

DROP TRIGGER IF EXISTS trg_ref_company ON approval_flow_steps;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON approval_flow_steps FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('flow_id', 'approval_flows');

-- chains: everyone in the company reads, Workflow create / edit writes
SELECT public.app_apply_module_policy('approval_flows', ARRAY['workflow']);
SELECT public.app_apply_module_policy('approval_flow_steps', ARRAY['workflow']);

-- the log: everyone in the company reads; rows are only written by workflow_decide
DO $$ BEGIN PERFORM public.app_drop_policies('approval_log'); END $$;
ALTER TABLE approval_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY approval_log_read ON approval_log FOR SELECT TO authenticated USING (
  (SELECT public.app_is_platform_admin()) OR company_id IN (SELECT public.app_my_company_ids()));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['approval_flows', 'approval_flow_steps', 'approval_log'] LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated', t || '_id_seq');
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('GRANT ALL ON SEQUENCE public.%I TO service_role', t || '_id_seq');
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon', t || '_id_seq');
  END LOOP;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_flows, public.approval_flow_steps TO authenticated;
  GRANT SELECT ON public.approval_log TO authenticated;
END $$;

-- ---- helpers --------------------------------------------------------------------------------------

-- does the signed-in person hold a role with this name in this company?
CREATE OR REPLACE FUNCTION public.app_has_role_named(p_company_id bigint, p_role text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM company_users cu
    JOIN companies c ON c.id = cu.company_id AND c.is_active
    JOIN company_user_roles ur ON ur.user_id = cu.id
    JOIN company_roles r ON r.id = ur.role_id AND r.company_id = cu.company_id
    WHERE cu.auth_user_id = auth.uid() AND cu.company_id = p_company_id AND cu.is_active AND r.name = p_role)
$$;
REVOKE ALL ON FUNCTION public.app_has_role_named(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_has_role_named(bigint, text) TO authenticated, service_role;

-- the steps that apply to a request of this size, in order
CREATE OR REPLACE FUNCTION public.app_flow_steps(p_company_id bigint, p_kind text, p_value numeric, p_foreign boolean)
RETURNS TABLE (step_position int, approver text) LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT s.position, s.approver
  FROM approval_flows f JOIN approval_flow_steps s ON s.flow_id = f.id
  WHERE f.company_id = p_company_id AND f.kind = p_kind AND f.is_active
    AND (s.min_value IS NULL OR p_foreign OR p_value >= s.min_value)
  ORDER BY s.position
$$;
REVOKE ALL ON FUNCTION public.app_flow_steps(bigint, text, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_flow_steps(bigint, text, numeric, boolean) TO authenticated, service_role;

-- may the signed-in person act at this step for this employee's request?
CREATE OR REPLACE FUNCTION public.app_can_act_step(p_company_id bigint, p_employee_id bigint, p_approver text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.app_can_view_pay(p_company_id)                                   -- Admin / Director act at any step
    OR (NOT public.app_is_my_employee(p_employee_id) AND (                  -- nobody else approves their own request
      (p_approver = '@manager' AND EXISTS (
         SELECT 1 FROM employees e WHERE e.id = p_employee_id AND e.company_id = p_company_id
           AND e.manager_id IS NOT NULL AND public.app_is_my_employee(e.manager_id)))
      OR (p_approver <> '@manager' AND public.app_has_role_named(p_company_id, p_approver)))))
$$;
REVOKE ALL ON FUNCTION public.app_can_act_step(bigint, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_can_act_step(bigint, bigint, text) TO authenticated, service_role;

-- may the signed-in person see this employee's request as one of its approvers?
CREATE OR REPLACE FUNCTION public.app_is_flow_approver(p_company_id bigint, p_kind text, p_employee_id bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM approval_flows f JOIN approval_flow_steps s ON s.flow_id = f.id
    WHERE f.company_id = p_company_id AND f.kind = p_kind AND f.is_active AND (
      (s.approver = '@manager' AND EXISTS (
         SELECT 1 FROM employees e WHERE e.id = p_employee_id AND e.company_id = p_company_id
           AND e.manager_id IS NOT NULL AND public.app_is_my_employee(e.manager_id)))
      OR (s.approver <> '@manager' AND public.app_has_role_named(p_company_id, s.approver))))
$$;
REVOKE ALL ON FUNCTION public.app_is_flow_approver(bigint, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_is_flow_approver(bigint, text, bigint) TO authenticated, service_role;

-- line managers and step approvers can read the claims they decide (and so their receipts)
DROP POLICY IF EXISTS claims_read ON claims;
CREATE POLICY claims_read ON claims FOR SELECT TO authenticated USING (
  (SELECT public.app_is_platform_admin())
  OR (company_id IN (SELECT public.app_my_company_ids()) AND (
    public.app_is_my_employee(employee_id)
    OR public.app_can_any(company_id, ARRAY['claims'], ARRAY['approve', 'create', 'edit', 'delete'])
    OR public.app_can_any(company_id, ARRAY['finance'], ARRAY['create', 'edit'])
    OR public.app_is_flow_approver(company_id, 'claim', employee_id))));

-- ---- deciding -------------------------------------------------------------------------------------

-- Approve or reject a leave request or a claim. Returns 'approved' or 'rejected' when it is final,
-- 'pending' when it moved on to the next step.
CREATE OR REPLACE FUNCTION public.workflow_decide(p_kind text, p_id bigint, p_decision text, p_note text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company bigint; v_emp bigint; v_status text; v_value numeric; v_foreign boolean := false;
  v_n int; v_done int; v_step_pos int := 0; v_step_who text; v_final text;
  v_user bigint; v_name text; v_year int; r leave_requests%ROWTYPE;
BEGIN
  IF p_kind NOT IN ('leave', 'claim') OR p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Unknown request or decision' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'leave' THEN
    SELECT * INTO r FROM leave_requests WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002'; END IF;
    v_company := r.company_id; v_emp := r.employee_id; v_status := r.status; v_value := r.days;
  ELSE
    SELECT c.company_id, c.employee_id, c.status, c.amount, c.currency IS DISTINCT FROM co.currency
      INTO v_company, v_emp, v_status, v_value, v_foreign
    FROM claims c JOIN companies co ON co.id = c.company_id WHERE c.id = p_id FOR UPDATE OF c;
    IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002'; END IF;
  END IF;
  PERFORM public.app_require_company(v_company);
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'This request has already been decided' USING ERRCODE = '22023'; END IF;

  SELECT count(*) INTO v_n FROM public.app_flow_steps(v_company, p_kind, v_value, v_foreign);
  SELECT count(*) INTO v_done FROM approval_log
    WHERE company_id = v_company AND kind = p_kind AND request_id = p_id AND decision = 'approved' AND step_position > 0;

  IF v_n = 0 THEN
    -- no chain for a request this size: anyone with the Approve tick decides
    IF NOT public.app_can_any(v_company, ARRAY[CASE p_kind WHEN 'leave' THEN 'leave' ELSE 'claims' END], ARRAY['approve']) THEN
      RAISE EXCEPTION 'Your role cannot approve or reject this' USING ERRCODE = '42501';
    END IF;
    v_final := p_decision;
  ELSE
    SELECT step_position, approver INTO v_step_pos, v_step_who
    FROM public.app_flow_steps(v_company, p_kind, v_value, v_foreign) ORDER BY step_position OFFSET LEAST(v_done, v_n - 1) LIMIT 1;
    IF NOT public.app_can_act_step(v_company, v_emp, v_step_who) THEN
      RAISE EXCEPTION 'It is not your turn: this request is waiting for %',
        CASE WHEN v_step_who = '@manager' THEN 'the line manager' ELSE 'the ' || v_step_who || ' role' END USING ERRCODE = '42501';
    END IF;
    v_final := CASE WHEN p_decision = 'rejected' THEN 'rejected' WHEN v_done + 1 >= v_n THEN 'approved' ELSE 'pending' END;
  END IF;

  SELECT cu.id, cu.full_name INTO v_user, v_name FROM company_users cu
    WHERE cu.auth_user_id = auth.uid() AND cu.company_id = v_company LIMIT 1;
  INSERT INTO approval_log (company_id, kind, request_id, step_position, actor_user_id, actor_name, decision, note)
    VALUES (v_company, p_kind, p_id, v_step_pos, v_user, v_name, p_decision, NULLIF(p_note, ''));
  IF v_final = 'pending' THEN RETURN 'pending'; END IF;

  PERFORM set_config('app.workflow', 'on', true);
  IF p_kind = 'leave' THEN
    v_year := EXTRACT(YEAR FROM r.start_date);
    UPDATE leave_requests SET status = v_final, decision_note = NULLIF(p_note, ''), decided_by = v_user, decided_at = now() WHERE id = p_id;
    IF v_final = 'approved' THEN
      UPDATE leave_balances SET pending_days = GREATEST(pending_days - r.days, 0), taken_days = taken_days + r.days
      WHERE employee_id = r.employee_id AND leave_type_id = r.leave_type_id AND year = v_year;
    ELSE
      UPDATE leave_balances SET pending_days = GREATEST(pending_days - r.days, 0)
      WHERE employee_id = r.employee_id AND leave_type_id = r.leave_type_id AND year = v_year;
    END IF;
  ELSE
    UPDATE claims SET status = v_final, decision_note = NULLIF(p_note, ''), decided_by = v_user, decided_at = now() WHERE id = p_id;
  END IF;
  PERFORM set_config('app.workflow', 'off', true);
  RETURN v_final;
END $$;
REVOKE ALL ON FUNCTION public.workflow_decide(text, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workflow_decide(text, bigint, text, text) TO authenticated, service_role;

-- the old entry point: same rules (the person deciding is whoever is signed in)
CREATE OR REPLACE FUNCTION public.leave_decide(p_request_id bigint, p_decision text, p_note text, p_decided_by bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company bigint; v_status text;
BEGIN
  SELECT company_id, status INTO v_company, v_status FROM leave_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM public.app_require_company(v_company);
  IF v_status <> 'pending' THEN RETURN; END IF;
  PERFORM public.workflow_decide('leave', p_request_id, p_decision, p_note);
END $$;

-- where is each request, and may I act on it now? (for the Approvals screens)
CREATE OR REPLACE FUNCTION public.workflow_status(p_kind text, p_ids bigint[])
RETURNS TABLE (request_id bigint, mode text, step_no int, steps_total int, waiting_for text, can_act boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i bigint; v_company bigint; v_emp bigint; v_status text; v_value numeric; v_foreign boolean;
  v_n int; v_done int; v_who text; r leave_requests%ROWTYPE;
BEGIN
  IF p_kind NOT IN ('leave', 'claim') THEN RAISE EXCEPTION 'Unknown kind' USING ERRCODE = '22023'; END IF;
  FOREACH i IN ARRAY p_ids LOOP
    v_foreign := false;
    IF p_kind = 'leave' THEN
      SELECT * INTO r FROM leave_requests WHERE id = i;
      IF NOT FOUND THEN CONTINUE; END IF;
      v_company := r.company_id; v_emp := r.employee_id; v_status := r.status; v_value := r.days;
    ELSE
      SELECT c.company_id, c.employee_id, c.status, c.amount, c.currency IS DISTINCT FROM co.currency
        INTO v_company, v_emp, v_status, v_value, v_foreign
      FROM claims c JOIN companies co ON co.id = c.company_id WHERE c.id = i;
      IF NOT FOUND THEN CONTINUE; END IF;
    END IF;
    PERFORM public.app_require_company(v_company);
    request_id := i;
    IF v_status <> 'pending' THEN
      mode := 'done'; step_no := 0; steps_total := 0; waiting_for := NULL; can_act := false; RETURN NEXT; CONTINUE;
    END IF;
    SELECT count(*) INTO v_n FROM public.app_flow_steps(v_company, p_kind, v_value, v_foreign);
    IF v_n = 0 THEN
      mode := 'tick'; step_no := 0; steps_total := 0; waiting_for := NULL;
      can_act := public.app_can_any(v_company, ARRAY[CASE p_kind WHEN 'leave' THEN 'leave' ELSE 'claims' END], ARRAY['approve']);
    ELSE
      SELECT count(*) INTO v_done FROM approval_log l
        WHERE l.company_id = v_company AND l.kind = p_kind AND l.request_id = i AND l.decision = 'approved' AND l.step_position > 0;
      SELECT s.approver INTO v_who FROM public.app_flow_steps(v_company, p_kind, v_value, v_foreign) s ORDER BY s.step_position OFFSET LEAST(v_done, v_n - 1) LIMIT 1;
      mode := 'flow'; step_no := LEAST(v_done, v_n - 1) + 1; steps_total := v_n;
      waiting_for := CASE WHEN v_who = '@manager' THEN 'Line manager' ELSE v_who END;
      can_act := public.app_can_act_step(v_company, v_emp, v_who);
    END IF;
    RETURN NEXT;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.workflow_status(text, bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workflow_status(text, bigint[]) TO authenticated, service_role;

-- which kinds of request does the signed-in person approve here ('leave', 'claim')? Decides which tabs show.
CREATE OR REPLACE FUNCTION public.workflow_approver_kinds(p_company_id bigint) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v text[] := ARRAY[]::text[]; k text;
BEGIN
  PERFORM public.app_require_company(p_company_id);
  FOREACH k IN ARRAY ARRAY['leave', 'claim'] LOOP
    IF public.app_can_any(p_company_id, ARRAY[CASE k WHEN 'leave' THEN 'leave' ELSE 'claims' END], ARRAY['approve'])
       OR EXISTS (
         SELECT 1 FROM approval_flows f JOIN approval_flow_steps s ON s.flow_id = f.id
         WHERE f.company_id = p_company_id AND f.kind = k AND f.is_active AND (
           (s.approver = '@manager' AND EXISTS (SELECT 1 FROM employees e WHERE e.company_id = p_company_id
              AND e.manager_id IS NOT NULL AND public.app_is_my_employee(e.manager_id)))
           OR (s.approver <> '@manager' AND public.app_has_role_named(p_company_id, s.approver)))) THEN
      v := v || k;
    END IF;
  END LOOP;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.workflow_approver_kinds(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workflow_approver_kinds(bigint) TO authenticated, service_role;

-- ---- decisions are only made through workflow_decide ------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_guard_leave_decision() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR current_setting('app.workflow', true) = 'on' THEN RETURN NEW; END IF;
  IF NEW.status IN ('approved', 'rejected') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    RAISE EXCEPTION 'Leave is approved or rejected from the Approvals screen' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.app_guard_claim_decision() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR current_setting('app.workflow', true) = 'on' THEN RETURN NEW; END IF;
  IF NEW.status IN ('approved', 'rejected') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    RAISE EXCEPTION 'Claims are approved or rejected from the Claims screen' USING ERRCODE = '42501';
  END IF;
  -- a decided claim keeps its amount and details (only Finance's link and the decision note change)
  IF TG_OP = 'UPDATE' AND OLD.status IN ('approved', 'rejected') AND NEW.status = OLD.status
     AND (NEW.amount, NEW.currency, NEW.claim_date, NEW.category, NEW.employee_id)
         IS DISTINCT FROM (OLD.amount, OLD.currency, OLD.claim_date, OLD.category, OLD.employee_id) THEN
    RAISE EXCEPTION 'This claim has been decided and can no longer be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

SELECT 'migration 043 complete' AS status;
