-- Security tests for migration 011 (tenant isolation, anon lockout, RPC
-- checks). Run through scripts/security-tests/run.sh, which connects as
-- "authenticator" — the same login PostgREST uses on Supabase — and switches
-- roles per test, so RLS and grants behave as they do in production.
\set ON_ERROR_STOP 1
\set QUIET 1

-- Act as a signed-in user (or anon / service key) for the current transaction.
\set as_a     'SELECT set_config(''request.jwt.claims'', ''{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}'', true); SET LOCAL ROLE authenticated;'
\set as_b     'SELECT set_config(''request.jwt.claims'', ''{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}'', true); SET LOCAL ROLE authenticated;'
\set as_c     'SELECT set_config(''request.jwt.claims'', ''{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}'', true); SET LOCAL ROLE authenticated;'
\set as_admin 'SELECT set_config(''request.jwt.claims'', ''{"sub":"dddddddd-0000-0000-0000-000000000004","role":"authenticated"}'', true); SET LOCAL ROLE authenticated;'
\set as_stranger 'SELECT set_config(''request.jwt.claims'', ''{"sub":"eeeeeeee-0000-0000-0000-000000000005","role":"authenticated"}'', true); SET LOCAL ROLE authenticated;'
\set as_staff 'SELECT set_config(''request.jwt.claims'', ''{"sub":"ffffffff-0000-0000-0000-000000000006","role":"authenticated"}'', true); SET LOCAL ROLE authenticated;'
\set as_anon  'SELECT set_config(''request.jwt.claims'', ''{"role":"anon"}'', true); SET LOCAL ROLE anon;'
\set as_service 'SELECT set_config(''request.jwt.claims'', ''{"role":"service_role"}'', true); SET LOCAL ROLE service_role;'

\o /dev/null

\echo '1. anon (the public key in the web app) can read and change nothing'
BEGIN; :as_anon
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['companies','company_users','employees','payslips','platform_users','country_profiles','company_settings'] LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', t);
      RAISE EXCEPTION 'FAIL: anon can read %', t;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  BEGIN PERFORM * FROM public.hr_list_employees(1); RAISE EXCEPTION 'FAIL: anon can list employees';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.company_delete(1); RAISE EXCEPTION 'FAIL: anon can delete a company';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.app_sign_in_company('alpha'); RAISE EXCEPTION 'FAIL: anon can call sign-in lookup';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;

\echo '2. a company user sees only their own company'
BEGIN; :as_a
DO $$
BEGIN
  ASSERT (SELECT array_agg(company_code ORDER BY company_code) FROM companies) = ARRAY['alpha'], 'FAIL: A sees other companies';
  ASSERT (SELECT count(*) FROM employees) = 2 AND NOT EXISTS (SELECT 1 FROM employees WHERE company_id <> 1), 'FAIL: A sees other employees';
  ASSERT (SELECT count(*) FROM company_users) = 3, 'FAIL: A sees other companies'' users';
  ASSERT NOT EXISTS (SELECT 1 FROM company_permissions p WHERE p.role_id NOT IN (SELECT id FROM company_roles WHERE company_id = 1)), 'FAIL: A sees other companies'' permissions';
  ASSERT (SELECT count(*) FROM company_permissions) > 0, 'FAIL: A cannot see own permissions';
  ASSERT (SELECT count(*) FROM company_user_roles) = 2, 'FAIL: A sees other companies'' role links';
  ASSERT (SELECT count(*) FROM payslips) = 1, 'FAIL: A sees other companies'' payslips';
  ASSERT (SELECT count(*) FROM platform_users) = 0, 'FAIL: A sees platform users';
  ASSERT (SELECT count(*) FROM platform_subscriptions) = 1, 'FAIL: A subscription visibility';
  ASSERT (SELECT count(*) FROM country_profiles) > 0, 'FAIL: A cannot read reference data';
  ASSERT (SELECT count(*) FROM hr_list_employees(1)) = 2, 'FAIL: A cannot list own employees';
  ASSERT (SELECT national_id FROM hr_list_employees(1) WHERE employee_code = 'A1') = 'S1234567A', 'FAIL: A cannot read own decrypted PII';
END $$;
ROLLBACK;

\echo '3. a company user cannot reach another company through RPCs'
BEGIN; :as_a
DO $$
BEGIN
  BEGIN PERFORM * FROM hr_list_employees(2); RAISE EXCEPTION 'FAIL: A listed B employees';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM hr_upsert_employee('{"company_id":2,"employee_code":"X","full_name":"Intruder"}'); RAISE EXCEPTION 'FAIL: A added employee to B';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM hr_upsert_employee(jsonb_build_object('id', (SELECT id FROM employees WHERE employee_code='B1' LIMIT 1), 'employee_code','B1','full_name','Hacked'));
    RAISE EXCEPTION 'FAIL: A edited B employee';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM hr_upsert_employee('{"company_id":1,"employee_code":"A9","full_name":"New","manager_id":3}');
    RAISE EXCEPTION 'FAIL: A linked a manager from B';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM hr_delete_employee(3); RAISE EXCEPTION 'FAIL: A deleted B employee';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM leave_apply('{"company_id":2,"employee_id":3,"leave_type_id":2,"start_date":"2026-01-05","end_date":"2026-01-05","days":1}');
    RAISE EXCEPTION 'FAIL: A applied leave in B';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM leave_apply('{"company_id":1,"employee_id":3,"leave_type_id":1,"start_date":"2026-01-05","end_date":"2026-01-05","days":1}');
    RAISE EXCEPTION 'FAIL: A applied leave for a B employee';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM leave_decide(2, 'approved', 'x', 1); RAISE EXCEPTION 'FAIL: A decided B leave';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM company_set_active(2, false); RAISE EXCEPTION 'FAIL: A deactivated B';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM company_delete(1); RAISE EXCEPTION 'FAIL: A deleted a company';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;

\echo '4. a company user cannot reach another company through tables'
BEGIN; :as_a
DO $$
DECLARE n int;
BEGIN
  BEGIN UPDATE employees SET full_name = 'Hacked' WHERE company_id = 2; RAISE EXCEPTION 'FAIL: employees table writable directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  DELETE FROM payslips WHERE company_id = 2;
  GET DIAGNOSTICS n = ROW_COUNT; ASSERT n = 0, 'FAIL: A deleted B payslips';
  UPDATE companies SET name = 'Hacked' WHERE id = 2;
  GET DIAGNOSTICS n = ROW_COUNT; ASSERT n = 0, 'FAIL: A renamed B';
  BEGIN INSERT INTO company_settings (company_id, category, key, value) VALUES (2, 'x', 'y', '{}');
    RAISE EXCEPTION 'FAIL: A wrote B settings';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE company_settings SET company_id = 2 WHERE company_id = 1;
    RAISE EXCEPTION 'FAIL: A moved a row into B';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO company_permissions (role_id, module, feature, action) VALUES (2, 'hr', 'x', 'y');
    RAISE EXCEPTION 'FAIL: A added a permission to a B role';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO companies (name, company_code, country) VALUES ('New', 'new', 'SG');
    RAISE EXCEPTION 'FAIL: A created a company';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO country_profiles (code, name, currency, phone_code) VALUES ('ZZ', 'Z', 'ZZZ', '+0');
    RAISE EXCEPTION 'FAIL: A changed reference data';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO platform_audit_log (action, entity_type) VALUES ('x', 'y');
    RAISE EXCEPTION 'FAIL: A wrote the platform audit log';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;

\echo '5. a company user can work inside their own company, but not change status, code or logins'
BEGIN; :as_a
DO $$
DECLARE n int; v bigint;
BEGIN
  UPDATE companies SET name = 'Alpha Renamed' WHERE id = 1;
  GET DIAGNOSTICS n = ROW_COUNT; ASSERT n = 1, 'FAIL: A cannot edit own company';
  BEGIN UPDATE companies SET is_active = false WHERE id = 1; RAISE EXCEPTION 'FAIL: A changed own status';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE companies SET company_code = 'beta2' WHERE id = 1; RAISE EXCEPTION 'FAIL: A changed own code';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE company_users SET auth_user_id = 'bbbbbbbb-0000-0000-0000-000000000002' WHERE company_id = 1;
    RAISE EXCEPTION 'FAIL: A re-pointed a login';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  INSERT INTO company_settings (company_id, category, key, value) VALUES (1, 'x', 'y', '{}');
  v := hr_upsert_employee('{"company_id":1,"employee_code":"A3","full_name":"New Hire","manager_id":1}');
  ASSERT v IS NOT NULL, 'FAIL: A cannot add own employee';
  v := leave_apply('{"company_id":1,"employee_id":1,"leave_type_id":1,"start_date":"2026-01-05","end_date":"2026-01-05","days":1}');
  PERFORM leave_decide(v, 'approved', 'ok', 1);
  ASSERT (SELECT status FROM leave_requests WHERE id = v) = 'approved', 'FAIL: A cannot approve own leave';
  INSERT INTO audit_log (company_id, user_id, action, entity_type) VALUES (1, 1, 'test', 'x');
  DELETE FROM audit_log WHERE company_id = 1;
  GET DIAGNOSTICS n = ROW_COUNT; ASSERT n = 0, 'FAIL: A deleted audit entries';
END $$;
ROLLBACK;

\echo '6. sign-in lookup only matches your own membership'
BEGIN; :as_a
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM app_sign_in_company('ALPHA')) = 1, 'FAIL: A cannot sign in to alpha';
  ASSERT (SELECT count(*) FROM app_sign_in_company('beta')) = 0, 'FAIL: A signed in to beta';
  ASSERT (SELECT count(*) FROM app_sign_in_platform()) = 0, 'FAIL: A signed in to platform';
END $$;
ROLLBACK;
BEGIN; :as_stranger
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM companies) = 0, 'FAIL: stranger sees companies';
  ASSERT (SELECT count(*) FROM app_sign_in_company('alpha')) = 0, 'FAIL: stranger signed in';
  BEGIN PERFORM * FROM hr_list_employees(1); RAISE EXCEPTION 'FAIL: stranger listed employees';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;

\echo '7. users of a deactivated company are locked out'
BEGIN; :as_c
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM companies) = 0, 'FAIL: C sees its inactive company';
  ASSERT (SELECT count(*) FROM employees) = 0, 'FAIL: C sees employees';
  ASSERT (SELECT count(*) FROM app_sign_in_company('gamma')) = 0, 'FAIL: C signed in to inactive company';
END $$;
ROLLBACK;

\echo '8. a platform admin sees and manages every company'
BEGIN; :as_admin
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM companies) = 3, 'FAIL: admin does not see all companies';
  ASSERT (SELECT count(*) FROM employees) >= 3, 'FAIL: admin does not see all employees';
  ASSERT (SELECT count(*) FROM hr_list_employees(2)) = 1, 'FAIL: admin cannot list B employees';
  ASSERT (SELECT count(*) FROM app_sign_in_platform()) = 1, 'FAIL: admin cannot sign in to platform';
  INSERT INTO country_profiles (code, name, currency, phone_code) VALUES ('ZZ', 'Z', 'ZZZ', '+0');
  INSERT INTO companies (name, company_code, country) VALUES ('New', 'new', 'SG');
  PERFORM company_set_active(2, false);
  ASSERT NOT (SELECT is_active FROM companies WHERE id = 2), 'FAIL: admin cannot deactivate';
  ASSERT NOT EXISTS (SELECT 1 FROM company_users WHERE company_id = 2 AND is_active), 'FAIL: deactivate did not lock users';
  PERFORM company_delete(2);
  ASSERT NOT EXISTS (SELECT 1 FROM employees WHERE company_id = 2), 'FAIL: delete did not cascade';
END $$;
ROLLBACK;

\echo '9. server-only functions: service key yes, browser no'
BEGIN; :as_a
DO $$
BEGIN
  BEGIN PERFORM app_find_auth_user('b@beta.test'); RAISE EXCEPTION 'FAIL: browser looked up auth users';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM app_legacy_password_hashes(); RAISE EXCEPTION 'FAIL: browser read legacy hashes';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM grant_platform_admin('a@alpha.test'); RAISE EXCEPTION 'FAIL: browser granted platform admin';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM count(*) FROM private.legacy_password_hashes; RAISE EXCEPTION 'FAIL: browser read private schema';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM private.dec(national_id_enc) FROM employees; RAISE EXCEPTION 'FAIL: browser decrypted PII directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN; :as_service
DO $$
BEGIN
  ASSERT app_find_auth_user('B@Beta.test') = 'bbbbbbbb-0000-0000-0000-000000000002', 'FAIL: service cannot look up auth users';
  ASSERT (SELECT count(*) FROM app_legacy_password_hashes()) = 1, 'FAIL: service cannot read legacy hashes';
  ASSERT (SELECT count(*) FROM hr_list_employees(2)) = 1, 'FAIL: service key cannot use employee RPCs';
  UPDATE company_users SET auth_user_id = 'eeeeeeee-0000-0000-0000-000000000005' WHERE email = 'legacy@alpha.test';
  PERFORM app_clear_legacy_password((SELECT id FROM company_users WHERE email = 'legacy@alpha.test'));
END $$;
ROLLBACK;

\echo '9b. work weeks and holidays stay inside their company'
BEGIN; :as_a
DO $$
BEGIN
  INSERT INTO company_holidays (company_id, holiday_date, name) VALUES (1, '2026-12-31', 'Alpha day');
  BEGIN INSERT INTO company_holidays (company_id, holiday_date, name) VALUES (2, '2026-12-31', 'Beta day');
    RAISE EXCEPTION 'FAIL: A added a holiday to B';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  INSERT INTO employee_work_patterns (employee_id, company_id, pattern) VALUES (1, 1, '{"sat":1}');
  BEGIN INSERT INTO employee_work_patterns (employee_id, company_id, pattern) VALUES (3, 1, '{"sat":1}');
    RAISE EXCEPTION 'FAIL: A set the work week of a B employee';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN; :as_b
DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM company_holidays WHERE company_id = 1), 'FAIL: B sees A holidays';
END $$;
ROLLBACK;

\echo '9c. leftover password columns are hashed and hidden from company users'
BEGIN; :as_a
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM legacy_staff) = 0, 'FAIL: company user can read a leftover password table (even of their own company)';
END $$;
ROLLBACK;

\echo '9d. pay access: staff without it see no salaries, ID numbers or payroll, and cannot grant it to themselves'
BEGIN; :as_staff
DO $$
DECLARE n int;
BEGIN
  ASSERT (SELECT count(*) FROM hr_list_employees(1)) = 2, 'FAIL: staff cannot list colleagues';
  ASSERT NOT EXISTS (SELECT 1 FROM hr_list_employees(1) WHERE base_salary IS NOT NULL OR national_id IS NOT NULL),
    'FAIL: staff sees salary or ID numbers';
  ASSERT (SELECT count(*) FROM payslips) = 0 AND (SELECT count(*) FROM payroll_runs) = 0, 'FAIL: staff sees payroll';
  BEGIN PERFORM base_salary FROM employees; RAISE EXCEPTION 'FAIL: staff read salary from the table';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO company_user_roles (user_id, role_id) VALUES (5, 1); RAISE EXCEPTION 'FAIL: staff gave themselves the Admin role';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE company_roles SET can_view_pay = true WHERE id = 3;
  GET DIAGNOSTICS n = ROW_COUNT; ASSERT n = 0, 'FAIL: staff turned on pay access for their role';
  UPDATE company_users SET full_name = 'Renamed' WHERE id = 1;
  GET DIAGNOSTICS n = ROW_COUNT; ASSERT n = 0, 'FAIL: staff edited another login';
  -- editing an employee without pay access leaves salary and ID untouched
  PERFORM hr_upsert_employee(jsonb_build_object('id', 1, 'employee_code', 'A1', 'full_name', 'Alpha One',
    'base_salary', 1, 'national_id', 'X0000000X'));
END $$;
ROLLBACK;
BEGIN; :as_staff
SELECT hr_upsert_employee(jsonb_build_object('id', 1, 'employee_code', 'A1', 'full_name', 'Alpha One', 'base_salary', 1, 'national_id', 'X0000000X'));
COMMIT;
BEGIN; :as_a
DO $$
BEGIN
  ASSERT (SELECT base_salary FROM hr_list_employees(1) WHERE employee_code = 'A1') = 5000, 'FAIL: staff edit changed the salary';
  ASSERT (SELECT national_id FROM hr_list_employees(1) WHERE employee_code = 'A1') = 'S1234567A', 'FAIL: staff edit changed the ID number';
  ASSERT (SELECT count(*) FROM payslips) = 1, 'FAIL: admin with pay access cannot see payslips';
  UPDATE company_roles SET can_view_pay = true WHERE id = 3;
END $$;
ROLLBACK;

\echo '9e. the master role (Admin / Director) always keeps full access'
BEGIN; :as_a
DO $$
BEGIN
  UPDATE company_roles SET can_view_pay = false WHERE id = 1;
  ASSERT (SELECT can_view_pay FROM company_roles WHERE id = 1), 'FAIL: master role lost pay access';
  BEGIN DELETE FROM company_roles WHERE id = 1; RAISE EXCEPTION 'FAIL: master role deleted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE company_roles SET name = 'Boss' WHERE id = 1; RAISE EXCEPTION 'FAIL: master role renamed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;

\echo '9f. pay items (overtime, allowances, deductions) are pay data and stay inside their company'
BEGIN; :as_a
DO $$
BEGIN
  INSERT INTO payroll_pay_items (company_id, employee_id, item_code, amount, recurring) VALUES (1, 1, 'ALLOWANCE_TRANSPORT', 200, true);
  INSERT INTO payroll_pay_items (company_id, employee_id, item_code, quantity, amount, period_year, period_month)
    VALUES (1, 1, 'OVERTIME', 10, 300, 2026, 8);
  BEGIN INSERT INTO payroll_pay_items (company_id, employee_id, item_code, amount, recurring) VALUES (2, 3, 'BONUS', 1, true);
    RAISE EXCEPTION 'FAIL: A added a pay item to company B';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO payroll_pay_items (company_id, employee_id, item_code, amount, recurring) VALUES (1, 3, 'BONUS', 1, true);
    RAISE EXCEPTION 'FAIL: A added a pay item for a B employee';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  ASSERT (SELECT count(*) FROM payroll_pay_items) = 2, 'FAIL: A cannot see own pay items';
END $$;
COMMIT;
BEGIN; :as_staff
DO $$
DECLARE n int;
BEGIN
  ASSERT (SELECT count(*) FROM payroll_pay_items) = 0, 'FAIL: staff without pay access sees pay items';
  BEGIN INSERT INTO payroll_pay_items (company_id, employee_id, item_code, amount, recurring) VALUES (1, 1, 'BONUS', 9999, true);
    RAISE EXCEPTION 'FAIL: staff without pay access added a pay item';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE payroll_pay_items SET amount = 9999;
  GET DIAGNOSTICS n = ROW_COUNT; ASSERT n = 0, 'FAIL: staff changed a pay item';
END $$;
ROLLBACK;
BEGIN; :as_b
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM payroll_pay_items) = 0, 'FAIL: B sees A pay items';
END $$;
ROLLBACK;
BEGIN; :as_a
DELETE FROM payroll_pay_items;
COMMIT;

\echo '9g. finance and CRM data stay inside their company; numbers come from Settings'
BEGIN; :as_a
DO $$
DECLARE v_c bigint; v_d bigint; v_n1 text; v_n2 text;
BEGIN
  INSERT INTO contacts (company_id, name) VALUES (1, 'Alpha customer') RETURNING id INTO v_c;
  v_n1 := fin_next_number(1, 'invoice', '2026-05-01');
  v_n2 := fin_next_number(1, 'invoice', '2026-05-02');
  ASSERT v_n1 = 'INV-2026-0001' AND v_n2 = 'INV-2026-0002', 'FAIL: invoice numbers ' || v_n1 || ' ' || v_n2;
  ASSERT fin_next_number(1, 'invoice', '2027-01-03') = 'INV-2027-0001', 'FAIL: yearly reset';
  INSERT INTO fin_documents (company_id, doc_type, number, contact_id) VALUES (1, 'invoice', v_n1, v_c) RETURNING id INTO v_d;
  INSERT INTO fin_document_lines (company_id, document_id, description, quantity, unit_price, amount) VALUES (1, v_d, 'Design', 1, 100, 100);
  PERFORM set_config('qv.alpha_invoice', v_d::text, false);
  BEGIN INSERT INTO contacts (company_id, name) VALUES (2, 'Planted in B'); RAISE EXCEPTION 'FAIL: A added a contact to B';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM fin_next_number(2, 'invoice'); RAISE EXCEPTION 'FAIL: A took a number from B';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
COMMIT;
BEGIN; :as_b
DO $$
DECLARE v_c bigint;
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM contacts WHERE company_id = 1), 'FAIL: B sees A contacts';
  ASSERT NOT EXISTS (SELECT 1 FROM fin_documents WHERE company_id = 1), 'FAIL: B sees A invoices';
  ASSERT NOT EXISTS (SELECT 1 FROM fin_document_lines WHERE company_id = 1), 'FAIL: B sees A invoice lines';
  -- B cannot hang a line on A's invoice (B can't see it, so the link check refuses it)
  INSERT INTO contacts (company_id, name) VALUES (2, 'Beta customer') RETURNING id INTO v_c;
  BEGIN INSERT INTO fin_document_lines (company_id, document_id, description)
          VALUES (2, current_setting('qv.alpha_invoice')::bigint, 'sneaky');
    RAISE EXCEPTION 'FAIL: B added a line to an A invoice';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN; :as_service
DO $$
DECLARE v_a bigint;
BEGIN
  SELECT id INTO v_a FROM contacts WHERE name = 'Alpha customer';
  -- as the service key RLS is off, so the link check itself must stop a cross-company link
  BEGIN INSERT INTO fin_documents (company_id, doc_type, number, contact_id) VALUES (2, 'invoice', 'X-3', v_a);
    RAISE EXCEPTION 'FAIL: invoice in B linked to a customer of A';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN; :as_a
DELETE FROM fin_documents; DELETE FROM contacts;
COMMIT;

\echo '9h. catalog items and stock stay inside their company'
BEGIN; :as_a
DO $$
DECLARE v_i bigint;
BEGIN
  INSERT INTO catalog_items (company_id, name, code, sale_price, track_stock) VALUES (1, 'Logo design', 'SVC-1', 800, false);
  INSERT INTO catalog_items (company_id, name, code, sale_price, track_stock, opening_qty) VALUES (1, 'Tote bag', 'TOTE', 25, true, 100) RETURNING id INTO v_i;
  INSERT INTO catalog_stock_adjustments (company_id, item_id, quantity, reason) VALUES (1, v_i, -2, 'damaged');
  PERFORM set_config('qv.alpha_item', v_i::text, false);
  -- a special price for one of A's customers
  DECLARE v_c bigint;
  BEGIN
    INSERT INTO contacts (company_id, name, is_customer) VALUES (1, 'Price customer', true) RETURNING id INTO v_c;
    INSERT INTO catalog_customer_prices (company_id, item_id, contact_id, price) VALUES (1, v_i, v_c, 20);
  END;
  BEGIN INSERT INTO catalog_items (company_id, name) VALUES (2, 'Planted'); RAISE EXCEPTION 'FAIL: A added an item to B';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO catalog_items (company_id, name, code) VALUES (1, 'Dup', 'tote'); RAISE EXCEPTION 'FAIL: duplicate item code allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
COMMIT;
BEGIN; :as_b
DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM catalog_items WHERE company_id = 1), 'FAIL: B sees A catalog';
  ASSERT NOT EXISTS (SELECT 1 FROM catalog_stock_adjustments WHERE company_id = 1), 'FAIL: B sees A stock';
  ASSERT NOT EXISTS (SELECT 1 FROM catalog_customer_prices WHERE company_id = 1), 'FAIL: B sees A customer prices';
  DECLARE v_c bigint;
  BEGIN
    INSERT INTO contacts (company_id, name) VALUES (2, 'Beta buyer') RETURNING id INTO v_c;
    BEGIN INSERT INTO catalog_customer_prices (company_id, item_id, contact_id, price) VALUES (2, current_setting('qv.alpha_item')::bigint, v_c, 1);
      RAISE EXCEPTION 'FAIL: B set a price on an A item';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END;
  BEGIN INSERT INTO catalog_stock_adjustments (company_id, item_id, quantity) VALUES (2, current_setting('qv.alpha_item')::bigint, 5);
    RAISE EXCEPTION 'FAIL: B adjusted stock of an A item';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN; :as_a
DELETE FROM catalog_items;
DELETE FROM contacts WHERE name = 'Price customer';
COMMIT;

\echo '9i. attachments (files on bills / invoices) stay inside their company'
BEGIN; :as_a
DO $$
DECLARE v_d bigint;
BEGIN
  INSERT INTO fin_documents (company_id, doc_type, number, status, issue_date) VALUES (1, 'bill', 'ATT-1', 'draft', current_date) RETURNING id INTO v_d;
  PERFORM set_config('qv.alpha_bill', v_d::text, false);
  INSERT INTO storage.objects (bucket_id, name) VALUES ('fin-attachments', '1/' || v_d || '/supplier-invoice.pdf');
  INSERT INTO fin_attachments (company_id, document_id, path, file_name) VALUES (1, v_d, '1/' || v_d || '/supplier-invoice.pdf', 'supplier-invoice.pdf');
  BEGIN INSERT INTO storage.objects (bucket_id, name) VALUES ('fin-attachments', '2/1/planted.pdf'); RAISE EXCEPTION 'FAIL: A stored a file in B''s folder';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO fin_attachments (company_id, document_id, path, file_name) VALUES (1, v_d, '2/' || v_d || '/x.pdf', 'x.pdf');
    RAISE EXCEPTION 'FAIL: attachment row pointing into B''s folder';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
COMMIT;
BEGIN; :as_b
DO $$
DECLARE v_d bigint;
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'fin-attachments' AND name LIKE '1/%'), 'FAIL: B sees A files';
  ASSERT NOT EXISTS (SELECT 1 FROM fin_attachments WHERE company_id = 1), 'FAIL: B sees A attachments';
  BEGIN INSERT INTO storage.objects (bucket_id, name) VALUES ('fin-attachments', '1/9/planted.pdf'); RAISE EXCEPTION 'FAIL: B stored a file in A''s folder';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  INSERT INTO fin_documents (company_id, doc_type, number, status, issue_date) VALUES (2, 'bill', 'ATT-B', 'draft', current_date) RETURNING id INTO v_d;
  BEGIN INSERT INTO fin_attachments (company_id, document_id, path, file_name) VALUES (2, current_setting('qv.alpha_bill')::bigint, '2/x/y.pdf', 'y.pdf');
    RAISE EXCEPTION 'FAIL: B attached a file to an A bill';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE storage.objects SET name = '2/stolen.pdf' WHERE name LIKE '1/%';
  DELETE FROM storage.objects WHERE name LIKE '1/%';
END $$;
ROLLBACK;
BEGIN; :as_anon
DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'fin-attachments'), 'FAIL: anon sees attachments';
END $$;
ROLLBACK;
BEGIN; :as_a
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM storage.objects WHERE name LIKE '1/%') = 1, 'FAIL: B changed or removed A''s file';
  DELETE FROM storage.objects WHERE bucket_id = 'fin-attachments';
  DELETE FROM fin_documents WHERE number = 'ATT-1';
END $$;
COMMIT;

\echo '9j. company files (bank statements, other documents) stay inside their company'
BEGIN; :as_a
DO $$
DECLARE v_bank bigint;
BEGIN
  SELECT id INTO v_bank FROM fin_accounts WHERE company_id = 1 LIMIT 1;
  IF v_bank IS NULL THEN
    INSERT INTO fin_accounts (company_id, code, name, type, subtype) VALUES (1, '1000', 'Bank', 'asset', 'bank') RETURNING id INTO v_bank;
  END IF;
  PERFORM set_config('qv.alpha_bank', v_bank::text, false);
  INSERT INTO company_files (company_id, folder, account_id, period, path, file_name) VALUES (1, 'bank', v_bank, '2026-05', '1/files/may.pdf', 'may.pdf');
  DECLARE v_j bigint;
  BEGIN
    INSERT INTO fin_journals (company_id, journal_date, memo) VALUES (1, current_date, 'Share capital') RETURNING id INTO v_j;
    INSERT INTO company_files (company_id, folder, journal_id, path, file_name) VALUES (1, 'journal', v_j, '1/files/cap.pdf', 'cap.pdf');
  END;
  BEGIN INSERT INTO company_files (company_id, folder, path, file_name) VALUES (1, 'other', '2/files/x.pdf', 'x.pdf');
    RAISE EXCEPTION 'FAIL: file row pointing into B''s folder';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO company_files (company_id, folder, path, file_name) VALUES (2, 'other', '2/files/y.pdf', 'y.pdf');
    RAISE EXCEPTION 'FAIL: A added a file row to B';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
COMMIT;
BEGIN; :as_b
DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM company_files WHERE company_id = 1), 'FAIL: B sees A files';
  -- B can't hang a supporting document on an A journal entry
  DECLARE v_j bigint;
  BEGIN
    SELECT id INTO v_j FROM fin_journals WHERE company_id = 1 LIMIT 1;
    IF v_j IS NOT NULL THEN
      BEGIN INSERT INTO company_files (company_id, folder, journal_id, path, file_name) VALUES (2, 'journal', v_j, '2/files/j.pdf', 'j.pdf');
        RAISE EXCEPTION 'FAIL: B attached a file to an A journal';
      EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    END IF;
  END;
  BEGIN INSERT INTO company_files (company_id, folder, account_id, path, file_name) VALUES (2, 'bank', current_setting('qv.alpha_bank')::bigint, '2/files/z.pdf', 'z.pdf');
    RAISE EXCEPTION 'FAIL: B filed a statement under an A bank';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN; :as_a
DELETE FROM company_files;
COMMIT;

\echo '10. structure: no readable passwords, RLS on everywhere, no anon grants'
DO $$
DECLARE v text;
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'password_hash'), 'FAIL: password_hash column still public';
  SELECT string_agg(relname, ', ') INTO v FROM pg_class
  WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND NOT relrowsecurity;
  ASSERT v IS NULL, 'FAIL: tables without RLS: ' || coalesce(v, '');
  SELECT string_agg(DISTINCT table_name, ', ') INTO v FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee = 'anon';
  ASSERT v IS NULL, 'FAIL: anon still has table grants: ' || coalesce(v, '');
  DECLARE col record; bad bigint;
  BEGIN
    FOR col IN SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type IN ('text', 'character varying', 'character')
        AND column_name ~* '(pass(word)?|passwd|pwd|pin_code|^pin$|secret)'
    LOOP
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I IS NOT NULL AND %I <> '''' AND %I !~ ''^\$2[aby]\$''',
        col.table_name, col.column_name, col.column_name, col.column_name) INTO bad;
      ASSERT bad = 0, format('FAIL: %s.%s holds %s readable password(s)', col.table_name, col.column_name, bad);
    END LOOP;
  END;
  SELECT string_agg(p.proname, ', ') INTO v FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND has_function_privilege('anon', p.oid, 'EXECUTE');
  ASSERT v IS NULL, 'FAIL: anon can execute: ' || coalesce(v, '');
  SELECT string_agg(p.proname, ', ') INTO v FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
    AND p.prosrc !~ 'app_require_(company|platform_admin)|app_is_privileged_role|auth\.uid\(\)'
    AND p.proname NOT IN ('app_is_platform_admin', 'app_my_company_ids', 'app_can_access_company',
                          'app_require_company', 'app_require_platform_admin');
  ASSERT v IS NULL, 'FAIL: SECURITY DEFINER functions without a caller check: ' || coalesce(v, '');
END $$;

\o
\echo 'ALL SECURITY TESTS PASSED'
