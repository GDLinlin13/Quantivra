-- 062_purchase_orders.sql — purchase orders (Finance → Payables → Purchase orders).
--
--   purchase_orders / purchase_order_lines   an order to a supplier: draft → pending approval → approved → sent → received,
--                                            or rejected / cancelled; an approved order can be turned into a bill
--   approval chains                          'po' joins 'leave' and 'claim' in Workflow: who approves, in which order, and
--                                            from what amount. With no chain, an Admin / Director (or anyone with
--                                            Finance → approve) approves.
--   po_decide / po_status                    approve or reject; where each order is and whether the signed-in person may act
-- Nobody approves their own order unless they are an Admin / Director. Needs 043. Idempotent.

CREATE TABLE IF NOT EXISTS purchase_orders (
  id             bigserial PRIMARY KEY,
  company_id     bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  number         text NOT NULL,
  contact_id     bigint REFERENCES contacts(id) ON DELETE SET NULL,
  issue_date     date NOT NULL,
  expected_date  date,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'sent', 'received', 'cancelled')),
  currency       text NOT NULL DEFAULT 'SGD',
  subtotal       numeric(16, 2) NOT NULL DEFAULT 0,
  tax_total      numeric(16, 2) NOT NULL DEFAULT 0,
  total          numeric(16, 2) NOT NULL DEFAULT 0,
  reference      text,
  deliver_to     text,
  notes          text,
  terms          text,
  document_id    bigint REFERENCES fin_documents(id) ON DELETE SET NULL,     -- the bill made from it
  created_by     bigint REFERENCES company_users(id) ON DELETE SET NULL,
  decided_by     bigint REFERENCES company_users(id) ON DELETE SET NULL,
  decided_at     timestamptz,
  decision_note  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, number)
);
CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id          bigserial PRIMARY KEY,
  company_id  bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  po_id       bigint NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  position    int NOT NULL DEFAULT 0,
  item_id     bigint REFERENCES catalog_items(id) ON DELETE SET NULL,
  description text,
  quantity    numeric(16, 4) NOT NULL DEFAULT 1,
  unit_price  numeric(16, 4) NOT NULL DEFAULT 0,
  tax_rate    numeric(6, 2) NOT NULL DEFAULT 0,
  amount      numeric(16, 2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_po_lines_po ON purchase_order_lines(po_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['purchase_orders', 'purchase_order_lines'] LOOP
    PERFORM public.app_apply_tenant_policy(t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated', t || '_id_seq');
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('GRANT ALL ON SEQUENCE public.%I TO service_role', t || '_id_seq');
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon', t || '_id_seq');
  END LOOP;
END $$;
SELECT public.app_apply_module_policy('purchase_orders', ARRAY['finance']);
SELECT public.app_apply_module_policy('purchase_order_lines', ARRAY['finance']);

DROP TRIGGER IF EXISTS trg_ref_company ON purchase_orders;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON purchase_orders FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('contact_id', 'contacts', 'document_id', 'fin_documents');
DROP TRIGGER IF EXISTS trg_ref_company ON purchase_order_lines;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON purchase_order_lines FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('po_id', 'purchase_orders', 'item_id', 'catalog_items');

-- the chains and the log accept the new kind
ALTER TABLE approval_flows DROP CONSTRAINT IF EXISTS approval_flows_kind_check;
ALTER TABLE approval_flows ADD CONSTRAINT approval_flows_kind_check CHECK (kind IN ('leave', 'claim', 'po'));
ALTER TABLE approval_log DROP CONSTRAINT IF EXISTS approval_log_kind_check;
ALTER TABLE approval_log ADD CONSTRAINT approval_log_kind_check CHECK (kind IN ('leave', 'claim', 'po'));

-- an order is approved or rejected only through po_decide
CREATE OR REPLACE FUNCTION public.app_guard_po_decision() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR current_setting('app.workflow', true) = 'on' THEN RETURN NEW; END IF;
  IF NEW.status IN ('approved', 'rejected') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    RAISE EXCEPTION 'A purchase order is approved or rejected from its Approve / Reject buttons' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('approved', 'sent', 'received') AND NEW.status = OLD.status
     AND (NEW.total, NEW.contact_id) IS DISTINCT FROM (OLD.total, OLD.contact_id) THEN
    RAISE EXCEPTION 'An approved purchase order cannot be changed; cancel it and make a new one' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.app_guard_po_decision() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_po_decision ON purchase_orders;
CREATE TRIGGER trg_po_decision BEFORE INSERT OR UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.app_guard_po_decision();

-- may the signed-in person act at this step of this order?
CREATE OR REPLACE FUNCTION public.app_can_act_po(p_company_id bigint, p_created_by bigint, p_approver text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.app_can_view_pay(p_company_id)                                    -- Admin / Director act at any step
    OR (NOT EXISTS (SELECT 1 FROM company_users cu WHERE cu.id = p_created_by AND cu.auth_user_id = auth.uid())    -- nobody else approves their own
        AND p_approver <> '@manager' AND public.app_has_role_named(p_company_id, p_approver)))
$$;
REVOKE ALL ON FUNCTION public.app_can_act_po(bigint, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_can_act_po(bigint, bigint, text) TO authenticated, service_role;

-- where is each order, and may I act on it now?
CREATE OR REPLACE FUNCTION public.po_status(p_ids bigint[])
RETURNS TABLE (request_id bigint, mode text, step_no int, steps_total int, waiting_for text, can_act boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE i bigint; o purchase_orders%ROWTYPE; v_n int; v_done int; v_who text;
BEGIN
  FOREACH i IN ARRAY coalesce(p_ids, ARRAY[]::bigint[]) LOOP
    SELECT * INTO o FROM purchase_orders WHERE id = i;
    IF NOT FOUND THEN CONTINUE; END IF;
    PERFORM public.app_require_company(o.company_id);
    request_id := i;
    IF o.status <> 'pending' THEN
      mode := 'done'; step_no := 0; steps_total := 0; waiting_for := NULL; can_act := false; RETURN NEXT; CONTINUE;
    END IF;
    SELECT count(*) INTO v_n FROM public.app_flow_steps(o.company_id, 'po', o.total, false);
    IF v_n = 0 THEN
      mode := 'tick'; step_no := 0; steps_total := 0; waiting_for := NULL;
      can_act := public.app_can_any(o.company_id, ARRAY['finance'], ARRAY['approve'])
        AND NOT EXISTS (SELECT 1 FROM company_users cu WHERE cu.id = o.created_by AND cu.auth_user_id = auth.uid() AND NOT public.app_can_view_pay(o.company_id));
    ELSE
      SELECT count(*) INTO v_done FROM approval_log l WHERE l.company_id = o.company_id AND l.kind = 'po' AND l.request_id = i AND l.decision = 'approved' AND l.step_position > 0;
      SELECT s.approver INTO v_who FROM public.app_flow_steps(o.company_id, 'po', o.total, false) s ORDER BY s.step_position OFFSET LEAST(v_done, v_n - 1) LIMIT 1;
      mode := 'flow'; step_no := LEAST(v_done, v_n - 1) + 1; steps_total := v_n; waiting_for := v_who;
      can_act := public.app_can_act_po(o.company_id, o.created_by, v_who);
    END IF;
    RETURN NEXT;
  END LOOP;
END $$;

-- approve or reject an order; returns 'approved' / 'rejected' when final, 'pending' when it moved to the next step
CREATE OR REPLACE FUNCTION public.po_decide(p_id bigint, p_decision text, p_note text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o purchase_orders%ROWTYPE; v_n int; v_done int; v_pos int := 0; v_who text; v_final text; v_user bigint; v_name text; v_ok boolean;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Unknown decision' USING ERRCODE = '22023'; END IF;
  SELECT * INTO o FROM purchase_orders WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.app_require_company(o.company_id);
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'This order is not waiting for approval' USING ERRCODE = '22023'; END IF;

  SELECT count(*) INTO v_n FROM public.app_flow_steps(o.company_id, 'po', o.total, false);
  SELECT count(*) INTO v_done FROM approval_log WHERE company_id = o.company_id AND kind = 'po' AND request_id = p_id AND decision = 'approved' AND step_position > 0;
  IF v_n = 0 THEN
    SELECT can_act INTO v_ok FROM public.po_status(ARRAY[p_id]);
    IF NOT coalesce(v_ok, false) THEN RAISE EXCEPTION 'You cannot approve or reject this order' USING ERRCODE = '42501'; END IF;
    v_final := p_decision;
  ELSE
    SELECT step_position, approver INTO v_pos, v_who
    FROM public.app_flow_steps(o.company_id, 'po', o.total, false) ORDER BY step_position OFFSET LEAST(v_done, v_n - 1) LIMIT 1;
    IF NOT public.app_can_act_po(o.company_id, o.created_by, v_who) THEN
      RAISE EXCEPTION 'It is not your turn: this order is waiting for the % role', v_who USING ERRCODE = '42501';
    END IF;
    v_final := CASE WHEN p_decision = 'rejected' THEN 'rejected' WHEN v_done + 1 >= v_n THEN 'approved' ELSE 'pending' END;
  END IF;

  SELECT cu.id, cu.full_name INTO v_user, v_name FROM company_users cu WHERE cu.auth_user_id = auth.uid() AND cu.company_id = o.company_id LIMIT 1;
  INSERT INTO approval_log (company_id, kind, request_id, step_position, actor_user_id, actor_name, decision, note)
    VALUES (o.company_id, 'po', p_id, v_pos, v_user, v_name, p_decision, NULLIF(p_note, ''));
  IF v_final = 'pending' THEN RETURN 'pending'; END IF;
  PERFORM set_config('app.workflow', 'on', true);
  UPDATE purchase_orders SET status = v_final, decision_note = NULLIF(p_note, ''), decided_by = v_user, decided_at = now() WHERE id = p_id;
  PERFORM set_config('app.workflow', 'off', true);
  RETURN v_final;
END $$;

REVOKE ALL ON FUNCTION public.po_status(bigint[]), public.po_decide(bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.po_status(bigint[]), public.po_decide(bigint, text, text) TO authenticated, service_role;

SELECT 'migration 062 complete' AS status;
