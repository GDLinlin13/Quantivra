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
-- staff may edit employees here (their Employees tick), which still never reaches pay or ID numbers
BEGIN; :as_service
INSERT INTO company_permissions (role_id, module, feature, action) VALUES (3, 'employees', '*', 'edit');
COMMIT;
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
BEGIN; :as_service
DELETE FROM company_permissions WHERE role_id = 3;
COMMIT;

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
  -- a payment's bank charges can only go to an account of its own company
  INSERT INTO fin_accounts (company_id, code, name, type) VALUES (1, '6900', 'Alpha bank charges', 'expense') RETURNING id INTO v_a;
  BEGIN INSERT INTO fin_payments (company_id, direction, payment_date, amount, charges, charges_account_id) VALUES (2, 'out', current_date, 10, 1, v_a);
    RAISE EXCEPTION 'FAIL: payment in B booked charges to an account of A';
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

\echo '9k. every section follows role permissions: view only reads, create / edit writes, approve decides leave'
BEGIN; :as_service
UPDATE employees SET user_id = 5 WHERE id = 2;
INSERT INTO company_permissions (role_id, module, feature, action) VALUES
  (3, 'finance', '*', 'view'), (3, 'crm', '*', 'view'), (3, 'inventory', '*', 'view'), (3, 'employees', '*', 'view');
:as_staff
DO $$
DECLARE v bigint;
BEGIN
  PERFORM 1 FROM fin_accounts WHERE company_id = 1;
  BEGIN INSERT INTO fin_accounts (company_id, code, name, type) VALUES (1, '9990', 'Sneaky', 'expense');
    RAISE EXCEPTION 'FAIL: view-only staff added a Finance account';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO contacts (company_id, name) VALUES (1, 'Sneaky');
    RAISE EXCEPTION 'FAIL: view-only staff added a CRM contact';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO catalog_items (company_id, name) VALUES (1, 'Sneaky');
    RAISE EXCEPTION 'FAIL: view-only staff added a Catalog item';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO leave_types (company_id, name) VALUES (1, 'Sneaky');
    RAISE EXCEPTION 'FAIL: view-only staff added a leave type';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM hr_upsert_employee('{"company_id":1,"employee_code":"S9","full_name":"Sneaky"}');
    RAISE EXCEPTION 'FAIL: view-only staff added an employee';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM hr_delete_employee(2);
    RAISE EXCEPTION 'FAIL: view-only staff removed an employee';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE companies SET name = 'Sneaky' WHERE id = 1;
    IF FOUND THEN RAISE EXCEPTION 'FAIL: staff changed company details'; END IF;
  END;
  -- without a Leave tick they cannot apply
  BEGIN PERFORM leave_apply('{"company_id":1,"employee_id":2,"leave_type_id":1,"start_date":"2026-02-02","end_date":"2026-02-02","days":1}');
    RAISE EXCEPTION 'FAIL: staff without a Leave tick applied for leave';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
:as_service
INSERT INTO company_permissions (role_id, module, feature, action) VALUES (3, 'leave', '*', 'view');
:as_staff
DO $$
DECLARE v bigint;
BEGIN
  -- with Leave view, staff apply for leave themselves, but cannot approve it
  v := leave_apply('{"company_id":1,"employee_id":2,"leave_type_id":1,"start_date":"2026-02-02","end_date":"2026-02-02","days":1}');
  BEGIN PERFORM leave_decide(v, 'approved', 'ok', 5);
    RAISE EXCEPTION 'FAIL: staff without Leave approve approved leave';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE leave_requests SET status = 'approved' WHERE id = v;
    RAISE EXCEPTION 'FAIL: staff approved leave directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN; :as_service
UPDATE employees SET user_id = 5 WHERE id = 2;
INSERT INTO company_permissions (role_id, module, feature, action) VALUES
  (3, 'finance', '*', 'create'), (3, 'crm', '*', 'edit'), (3, 'leave', '*', 'approve');
:as_staff
DO $$
DECLARE v bigint;
BEGIN
  INSERT INTO fin_accounts (company_id, code, name, type) VALUES (1, '9991', 'Allowed', 'expense');
  INSERT INTO contacts (company_id, name) VALUES (1, 'Allowed');
  BEGIN INSERT INTO fin_accounts (company_id, code, name, type) VALUES (2, '9992', 'Other company', 'expense');
    RAISE EXCEPTION 'FAIL: staff added a Finance account to another company';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO catalog_items (company_id, name) VALUES (1, 'No catalog tick');
    RAISE EXCEPTION 'FAIL: Finance permission let staff change the Catalog';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  DELETE FROM fin_accounts WHERE code = '9991';
  ASSERT FOUND = false, 'FAIL: create-only staff deleted a Finance account';
  v := leave_apply('{"company_id":1,"employee_id":2,"leave_type_id":1,"start_date":"2026-02-03","end_date":"2026-02-03","days":1}');
  PERFORM leave_decide(v, 'approved', 'ok', 5);
  ASSERT (SELECT status FROM leave_requests WHERE id = v) = 'approved', 'FAIL: staff with Leave approve cannot approve';
END $$;
ROLLBACK;
\echo '9l. claims: staff submit their own, approvers decide, nobody touches another company'
BEGIN; :as_service
UPDATE employees SET user_id = 5 WHERE id = 2;            -- Sam Staff is employee A2
INSERT INTO company_permissions (role_id, module, feature, action) VALUES (3, 'claims', '*', 'view');
:as_staff
DO $$
DECLARE v bigint; n int;
BEGIN
  INSERT INTO claims (company_id, employee_id, claim_date, category, amount, currency)
    VALUES (1, 2, '2026-03-01', 'Transport', 25, 'SGD') RETURNING id INTO v;
  INSERT INTO claim_receipts (company_id, claim_id, path, file_name) VALUES (1, v, '1/claims/' || v || '/taxi.jpg', 'taxi.jpg');
  ASSERT (SELECT count(*) FROM claims) = 1, 'FAIL: staff cannot see own claim';
  BEGIN INSERT INTO claims (company_id, employee_id, claim_date, category, amount, currency) VALUES (1, 1, '2026-03-01', 'Meals', 99, 'SGD');
    RAISE EXCEPTION 'FAIL: staff claimed for a colleague';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO claims (company_id, employee_id, claim_date, category, amount, currency) VALUES (2, 3, '2026-03-01', 'Meals', 99, 'SGD');
    RAISE EXCEPTION 'FAIL: staff claimed in another company';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE claims SET status = 'approved' WHERE id = v;
    RAISE EXCEPTION 'FAIL: staff approved own claim';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE claims SET amount = 30 WHERE id = v;
  ASSERT (SELECT amount FROM claims WHERE id = v) = 30, 'FAIL: staff cannot change own pending claim';
END $$;
:as_a
DO $$
DECLARE v bigint := (SELECT id FROM claims WHERE employee_id = 2);
BEGIN
  INSERT INTO claims (company_id, employee_id, claim_date, category, amount, currency) VALUES (1, 1, '2026-03-02', 'Meals', 40, 'SGD');
  PERFORM workflow_decide('claim', v, 'approved', NULL);
  ASSERT (SELECT decided_by FROM claims WHERE id = v) = 1, 'FAIL: decision not recorded';
END $$;
:as_staff
DO $$
DECLARE n int;
BEGIN
  ASSERT (SELECT count(*) FROM claims) = 1, 'FAIL: staff sees colleagues'' claims';
  UPDATE claims SET amount = 999 WHERE employee_id = 2;
  GET DIAGNOSTICS n = ROW_COUNT; ASSERT n = 0, 'FAIL: staff changed an approved claim';
  DELETE FROM claims WHERE employee_id = 2;
  GET DIAGNOSTICS n = ROW_COUNT; ASSERT n = 0, 'FAIL: staff deleted an approved claim';
END $$;
:as_b
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM claims) = 0 AND (SELECT count(*) FROM claim_receipts) = 0, 'FAIL: B sees A claims';
END $$;
ROLLBACK;
BEGIN; :as_service
UPDATE employees SET user_id = 5 WHERE id = 2;
INSERT INTO claims (company_id, employee_id, claim_date, category, amount, currency) VALUES (1, 1, '2026-03-02', 'Meals', 40, 'SGD');
:as_staff
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM claims) = 0, 'FAIL: staff without Claims ticks see colleagues'' claims';
  BEGIN INSERT INTO claims (company_id, employee_id, claim_date, category, amount, currency) VALUES (1, 2, '2026-03-01', 'Transport', 25, 'SGD');
    RAISE EXCEPTION 'FAIL: staff without the Claims view tick submitted a claim';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE claims SET status = 'rejected';
  ASSERT NOT FOUND, 'FAIL: staff without Claims ticks rejected a claim';
END $$;
ROLLBACK;
BEGIN; :as_service
INSERT INTO company_permissions (role_id, module, feature, action) VALUES (3, 'claims', '*', 'approve');
INSERT INTO claims (company_id, employee_id, claim_date, category, amount, currency) VALUES (1, 1, '2026-03-02', 'Meals', 40, 'SGD');
:as_staff
DO $$
BEGIN
  PERFORM workflow_decide('claim', (SELECT id FROM claims), 'rejected', 'no receipt');
  ASSERT (SELECT status FROM claims) = 'rejected', 'FAIL: approver cannot reject';
END $$;
ROLLBACK;
\echo '9m. attendance: staff clock themselves with the database time, managers see and fix everyone'
BEGIN; :as_service
UPDATE employees SET user_id = 5 WHERE id = 2;            -- Sam Staff is employee A2
:as_staff
DO $$
BEGIN
  BEGIN INSERT INTO attendance_logs (company_id, employee_id, work_date, clock_in) VALUES (1, 2, '2026-03-01', now());
    RAISE EXCEPTION 'FAIL: staff without an Attendance tick clocked in';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN; :as_service
UPDATE employees SET user_id = 5 WHERE id = 2;
INSERT INTO company_permissions (role_id, module, feature, action) VALUES (3, 'attendance', '*', 'view');
INSERT INTO attendance_logs (company_id, employee_id, work_date, clock_in, clock_out) VALUES (1, 1, '2026-03-02', '2026-03-02 01:00+00', '2026-03-02 09:00+00');
:as_staff
DO $$
DECLARE v bigint; n int;
BEGIN
  -- clocks in: a made-up time is replaced by now
  INSERT INTO attendance_logs (company_id, employee_id, work_date, clock_in) VALUES (1, 2, '2020-01-01', '2020-01-01 01:00+00') RETURNING id INTO v;
  ASSERT (SELECT clock_in FROM attendance_logs WHERE id = v) > now() - interval '1 minute', 'FAIL: staff chose their own clock-in time';
  ASSERT (SELECT work_date FROM attendance_logs WHERE id = v) > '2025-01-01', 'FAIL: staff chose their own work date';
  ASSERT (SELECT count(*) FROM attendance_logs) = 1, 'FAIL: staff see colleagues'' hours';
  BEGIN INSERT INTO attendance_logs (company_id, employee_id, work_date, clock_in) VALUES (1, 1, '2026-03-01', now());
    RAISE EXCEPTION 'FAIL: staff clocked a colleague in';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO attendance_logs (company_id, employee_id, work_date, clock_in) VALUES (2, 3, '2026-03-01', now());
    RAISE EXCEPTION 'FAIL: staff clocked in at another company';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- clocks out: the time is now; nothing else changes
  UPDATE attendance_logs SET clock_out = '2020-01-01 09:00+00', clock_in = '2020-01-01 01:00+00', note = 'x' WHERE id = v;
  ASSERT (SELECT clock_out FROM attendance_logs WHERE id = v) > now() - interval '1 minute', 'FAIL: staff chose their own clock-out time';
  ASSERT (SELECT clock_in FROM attendance_logs WHERE id = v) > now() - interval '1 minute', 'FAIL: staff changed their clock-in';
  -- a closed shift can't be edited or removed
  UPDATE attendance_logs SET clock_out = now() + interval '1 hour' WHERE id = v;
  GET DIAGNOSTICS n = ROW_COUNT; ASSERT n = 0, 'FAIL: staff changed a closed shift';
  DELETE FROM attendance_logs WHERE id = v;
  GET DIAGNOSTICS n = ROW_COUNT; ASSERT n = 0, 'FAIL: staff deleted a shift';
END $$;
:as_b
DO $$ BEGIN ASSERT (SELECT count(*) FROM attendance_logs) = 0, 'FAIL: B sees A attendance'; END $$;
ROLLBACK;
BEGIN; :as_service
INSERT INTO company_permissions (role_id, module, feature, action) VALUES (3, 'attendance', '*', 'edit');
INSERT INTO attendance_logs (company_id, employee_id, work_date, clock_in, clock_out) VALUES (1, 1, '2026-03-02', '2026-03-02 01:00+00', '2026-03-02 09:00+00');
:as_staff
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM attendance_logs) = 1, 'FAIL: Attendance edit does not show everyone''s hours';
  UPDATE attendance_logs SET clock_out = '2026-03-02 10:00+00';
  ASSERT (SELECT clock_out FROM attendance_logs) = '2026-03-02 10:00+00', 'FAIL: Attendance edit cannot correct a shift';
  INSERT INTO attendance_logs (company_id, employee_id, work_date, clock_in, clock_out, source) VALUES (1, 1, '2026-03-03', '2026-03-03 01:00+00', '2026-03-03 09:00+00', 'manual');
  BEGIN INSERT INTO attendance_logs (company_id, employee_id, work_date, clock_in) VALUES (2, 3, '2026-03-03', now());
    RAISE EXCEPTION 'FAIL: manager added hours in another company';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
\echo '9n. applying leave on behalf: yourself, people you manage, or anyone for HR'
BEGIN; :as_service
UPDATE employees SET user_id = 5 WHERE id = 2;            -- Sam Staff is employee A2
INSERT INTO company_permissions (role_id, module, feature, action) VALUES (3, 'leave', '*', 'view');
:as_staff
DO $$
BEGIN
  PERFORM leave_apply('{"company_id":1,"employee_id":2,"leave_type_id":1,"start_date":"2026-04-01","end_date":"2026-04-01","days":1}');
  BEGIN PERFORM leave_apply('{"company_id":1,"employee_id":1,"leave_type_id":1,"start_date":"2026-04-02","end_date":"2026-04-02","days":1}');
    RAISE EXCEPTION 'FAIL: staff applied leave for a colleague who is not their report';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN; :as_service
UPDATE employees SET user_id = 5 WHERE id = 2;
UPDATE employees SET manager_id = 2 WHERE id = 1;          -- A1 now reports to Sam
INSERT INTO company_permissions (role_id, module, feature, action) VALUES (3, 'leave', '*', 'view');
:as_staff
DO $$
BEGIN
  PERFORM leave_apply('{"company_id":1,"employee_id":1,"leave_type_id":1,"start_date":"2026-04-02","end_date":"2026-04-02","days":1}');
  ASSERT (SELECT count(*) FROM leave_requests WHERE employee_id = 1 AND start_date = '2026-04-02') = 1, 'FAIL: manager cannot apply for their report';
  BEGIN PERFORM leave_apply('{"company_id":2,"employee_id":3,"leave_type_id":2,"start_date":"2026-04-02","end_date":"2026-04-02","days":1}');
    RAISE EXCEPTION 'FAIL: manager applied for another company';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN; :as_service
INSERT INTO company_permissions (role_id, module, feature, action) VALUES (3, 'employees', '*', 'edit');
:as_staff
DO $$
BEGIN
  PERFORM leave_apply('{"company_id":1,"employee_id":1,"leave_type_id":1,"start_date":"2026-04-03","end_date":"2026-04-03","days":1}');
  ASSERT (SELECT count(*) FROM leave_requests WHERE employee_id = 1 AND start_date = '2026-04-03') = 1, 'FAIL: HR (Employees edit) cannot apply for anyone';
END $$;
ROLLBACK;
\echo '9o. projects: view reads and logs own hours, create / edit manages, nothing crosses companies'
BEGIN; :as_service
UPDATE employees SET user_id = 5 WHERE id = 2;            -- Sam Staff is employee A2
INSERT INTO projects (company_id, name) VALUES (1, 'Alpha project'), (2, 'Beta project');
INSERT INTO project_tasks (company_id, project_id, title) VALUES (1, (SELECT id FROM projects WHERE name = 'Alpha project'), 'Design');
INSERT INTO project_timesheets (company_id, project_id, employee_id, work_date, hours) VALUES (1, (SELECT id FROM projects WHERE name = 'Alpha project'), 1, '2026-05-01', 3);
INSERT INTO company_permissions (role_id, module, feature, action) VALUES (3, 'projects', '*', 'view');
:as_staff
DO $$
DECLARE v bigint;
BEGIN
  ASSERT (SELECT count(*) FROM projects) = 1 AND (SELECT count(*) FROM project_tasks) = 1, 'FAIL: staff cannot see their company projects';
  BEGIN INSERT INTO projects (company_id, name) VALUES (1, 'Sneaky');
    RAISE EXCEPTION 'FAIL: view-only staff added a project';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO project_tasks (company_id, project_id, title) VALUES (1, (SELECT id FROM projects WHERE name = 'Alpha project'), 'Sneaky');
    RAISE EXCEPTION 'FAIL: view-only staff added a task';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- their own hours
  INSERT INTO project_timesheets (company_id, project_id, employee_id, work_date, hours) VALUES (1, (SELECT id FROM projects WHERE name = 'Alpha project'), 2, '2026-05-02', 2.5) RETURNING id INTO v;
  ASSERT (SELECT count(*) FROM project_timesheets) = 1, 'FAIL: staff see colleagues'' hours';
  UPDATE project_timesheets SET hours = 3 WHERE id = v;
  ASSERT (SELECT hours FROM project_timesheets WHERE id = v) = 3, 'FAIL: staff cannot change their own hours';
  BEGIN INSERT INTO project_timesheets (company_id, project_id, employee_id, work_date, hours) VALUES (1, (SELECT id FROM projects WHERE name = 'Alpha project'), 1, '2026-05-02', 2);
    RAISE EXCEPTION 'FAIL: staff logged hours for a colleague';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO project_timesheets (company_id, project_id, employee_id, work_date, hours) VALUES (1, (SELECT id FROM projects WHERE name = 'Beta project'), 2, '2026-05-02', 2);
    RAISE EXCEPTION 'FAIL: staff logged hours on another company''s project';
  EXCEPTION WHEN insufficient_privilege OR not_null_violation THEN NULL; END;
  BEGIN INSERT INTO project_timesheets (company_id, project_id, employee_id, work_date, hours) VALUES (1, (SELECT id FROM projects WHERE name = 'Alpha project'), 2, '2026-05-02', 30);
    RAISE EXCEPTION 'FAIL: 30 hours in one entry accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  DELETE FROM project_timesheets WHERE id = v;
  ASSERT NOT EXISTS (SELECT 1 FROM project_timesheets WHERE id = v), 'FAIL: staff cannot remove their own hours';
END $$;
:as_b
DO $$ BEGIN ASSERT (SELECT count(*) FROM projects) = 1 AND (SELECT count(*) FROM project_timesheets) = 0, 'FAIL: B sees A projects or hours'; END $$;
ROLLBACK;
BEGIN; :as_service
INSERT INTO projects (company_id, name) VALUES (1, 'Alpha project'), (2, 'Beta project');
INSERT INTO project_timesheets (company_id, project_id, employee_id, work_date, hours) VALUES (1, (SELECT id FROM projects WHERE name = 'Alpha project'), 1, '2026-05-01', 3);
INSERT INTO company_permissions (role_id, module, feature, action) VALUES (3, 'projects', '*', 'create');
:as_staff
DO $$
DECLARE v bigint; n int;
BEGIN
  INSERT INTO projects (company_id, name, status) VALUES (1, 'New one', 'planned') RETURNING id INTO v;
  INSERT INTO project_tasks (company_id, project_id, title) VALUES (1, v, 'Kick-off');
  INSERT INTO project_milestones (company_id, project_id, title, due_date) VALUES (1, v, 'Launch', '2026-06-30');
  UPDATE projects SET status = 'active' WHERE id = v;
  ASSERT (SELECT status FROM projects WHERE id = v) = 'active', 'FAIL: create cannot change a project';
  ASSERT (SELECT count(*) FROM project_timesheets) = 1, 'FAIL: Projects create does not show everyone''s hours';
  BEGIN INSERT INTO projects (company_id, name) VALUES (2, 'Planted in B');
    RAISE EXCEPTION 'FAIL: staff added a project to another company';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO project_tasks (company_id, project_id, title) VALUES (1, (SELECT id FROM projects WHERE name = 'Beta project'), 'Cross-company');
    RAISE EXCEPTION 'FAIL: task linked to another company''s project';
  EXCEPTION WHEN insufficient_privilege OR not_null_violation THEN NULL; END;
  DELETE FROM projects WHERE id = v;
  GET DIAGNOSTICS n = ROW_COUNT; ASSERT n = 0, 'FAIL: create-only staff deleted a project';
END $$;
ROLLBACK;
\echo '9p. approval chains: steps in order, only the right person acts, nobody approves their own'
BEGIN; :as_service
UPDATE employees SET user_id = 5 WHERE id = 2;              -- Sam Staff is employee A2
UPDATE employees SET manager_id = 2 WHERE id = 1;           -- A1 reports to Sam
INSERT INTO approval_flows (company_id, kind) VALUES (1, 'leave');
INSERT INTO approval_flow_steps (company_id, flow_id, position, approver, min_value)
  VALUES (1, (SELECT id FROM approval_flows WHERE company_id = 1 AND kind = 'leave'), 1, '@manager', NULL),
         (1, (SELECT id FROM approval_flows WHERE company_id = 1 AND kind = 'leave'), 2, 'Admin', 5);
INSERT INTO leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, days) VALUES
  (1, 1, 1, '2026-06-01', '2026-06-01', 1),      -- one day: the manager alone decides
  (1, 1, 1, '2026-06-08', '2026-06-15', 6),      -- six days: the manager, then an Admin
  (1, 2, 1, '2026-06-22', '2026-06-22', 1);      -- Sam's own, no manager set
SELECT set_config('test.six', (SELECT id::text FROM leave_requests WHERE start_date = '2026-06-08'), false);
:as_staff
DO $$
DECLARE one bigint; six bigint; own bigint; res text;
BEGIN
  SELECT id INTO one FROM leave_requests WHERE start_date = '2026-06-01';
  SELECT id INTO six FROM leave_requests WHERE start_date = '2026-06-08';
  SELECT id INTO own FROM leave_requests WHERE start_date = '2026-06-22';
  -- the manager, with no Leave tick at all, decides a short request
  res := workflow_decide('leave', one, 'approved', 'ok');
  ASSERT res = 'approved' AND (SELECT status FROM leave_requests WHERE id = one) = 'approved', 'FAIL: manager cannot approve a short request';
  -- a long one only moves on
  res := workflow_decide('leave', six, 'approved', NULL);
  ASSERT res = 'pending' AND (SELECT status FROM leave_requests WHERE id = six) = 'pending', 'FAIL: long request did not wait for the second step';
  BEGIN PERFORM workflow_decide('leave', six, 'approved', NULL);
    RAISE EXCEPTION 'FAIL: the manager approved the second step too';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- nobody approves their own
  BEGIN PERFORM workflow_decide('leave', own, 'approved', NULL);
    RAISE EXCEPTION 'FAIL: staff approved their own leave';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- the table cannot be changed around the chain
  BEGIN UPDATE leave_requests SET status = 'approved' WHERE id = six;
    RAISE EXCEPTION 'FAIL: staff approved leave directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- and chains are not theirs to change without a Workflow tick
  BEGIN INSERT INTO approval_flows (company_id, kind) VALUES (1, 'claim');
    RAISE EXCEPTION 'FAIL: staff without a Workflow tick created a chain';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO approval_log (company_id, kind, request_id, decision) VALUES (1, 'leave', 1, 'approved');
    RAISE EXCEPTION 'FAIL: staff wrote the approval log';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
:as_a
DO $$
DECLARE six bigint; res text;
BEGIN
  SELECT id INTO six FROM leave_requests WHERE start_date = '2026-06-08';
  BEGIN UPDATE leave_requests SET status = 'approved' WHERE id = six;
    RAISE EXCEPTION 'FAIL: admin approved leave directly, around the chain';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  res := workflow_decide('leave', six, 'approved', 'fine');
  ASSERT res = 'approved' AND (SELECT status FROM leave_requests WHERE id = six) = 'approved', 'FAIL: admin cannot finish the chain';
  ASSERT (SELECT count(*) FROM approval_log WHERE request_id = six AND kind = 'leave') = 2, 'FAIL: approvals not logged';
END $$;
:as_b
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM approval_flows) = 0 AND (SELECT count(*) FROM approval_log) = 0, 'FAIL: B sees A chains or log';
  BEGIN PERFORM workflow_decide('leave', current_setting('test.six')::bigint, 'approved', NULL);
    RAISE EXCEPTION 'FAIL: B decided an A request';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN; :as_service
UPDATE employees SET user_id = 5 WHERE id = 2;
UPDATE employees SET manager_id = 2 WHERE id = 1;
INSERT INTO company_permissions (role_id, module, feature, action) VALUES (3, 'workflow', '*', 'edit');
:as_staff
DO $$
BEGIN
  INSERT INTO approval_flows (company_id, kind) VALUES (1, 'claim');
  INSERT INTO approval_flow_steps (company_id, flow_id, position, approver) VALUES (1, (SELECT id FROM approval_flows WHERE kind = 'claim'), 1, '@manager');
  BEGIN INSERT INTO approval_flows (company_id, kind) VALUES (2, 'claim');
    RAISE EXCEPTION 'FAIL: chain created for another company';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN; :as_service
UPDATE employees SET user_id = 5 WHERE id = 2;
UPDATE employees SET manager_id = 2 WHERE id = 1;
INSERT INTO approval_flows (company_id, kind) VALUES (1, 'claim');
INSERT INTO approval_flow_steps (company_id, flow_id, position, approver) VALUES (1, (SELECT id FROM approval_flows WHERE kind = 'claim'), 1, '@manager');
INSERT INTO claims (company_id, employee_id, claim_date, category, amount, currency) VALUES (1, 1, '2026-06-01', 'Meals', 40, 'SGD'), (1, 1, '2026-06-02', 'Meals', 9, 'SGD');
:as_staff
DO $$
DECLARE c1 bigint; c2 bigint; res text;
BEGIN
  -- the line manager reads their report's claims with no Claims tick, and decides them
  ASSERT (SELECT count(*) FROM claims) = 2, 'FAIL: manager cannot read their report''s claims';
  SELECT id INTO c1 FROM claims WHERE claim_date = '2026-06-01';
  SELECT id INTO c2 FROM claims WHERE claim_date = '2026-06-02';
  res := workflow_decide('claim', c1, 'approved', NULL);
  ASSERT res = 'approved' AND (SELECT status FROM claims WHERE id = c1) = 'approved', 'FAIL: manager cannot approve a claim';
  res := workflow_decide('claim', c2, 'rejected', 'no receipt');
  ASSERT res = 'rejected' AND (SELECT decision_note FROM claims WHERE id = c2) = 'no receipt', 'FAIL: manager cannot reject a claim';
  BEGIN UPDATE claims SET status = 'approved' WHERE id = c2; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  ASSERT (SELECT status FROM claims WHERE id = c2) = 'rejected', 'FAIL: a decided claim was changed directly';
END $$;
ROLLBACK;
BEGIN; :as_service
UPDATE employees SET user_id = 5 WHERE id = 2;           -- Sam is NOT A1's manager here
INSERT INTO approval_flows (company_id, kind) VALUES (1, 'claim');
INSERT INTO approval_flow_steps (company_id, flow_id, position, approver) VALUES (1, (SELECT id FROM approval_flows WHERE kind = 'claim'), 1, '@manager');
INSERT INTO claims (company_id, employee_id, claim_date, category, amount, currency) VALUES (1, 1, '2026-06-01', 'Meals', 40, 'SGD');
SELECT set_config('test.claim', (SELECT id::text FROM claims), false);
:as_staff
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM claims) = 0, 'FAIL: a colleague who is not the manager sees the claim';
  BEGIN PERFORM workflow_decide('claim', current_setting('test.claim')::bigint, 'approved', NULL);
    RAISE EXCEPTION 'FAIL: a colleague who is not the manager approved the claim';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
\echo '9q. leave policy: notice, quota, people off, people at work, HR override, time off by the hour, time off in lieu'
BEGIN; :as_service
UPDATE employees SET user_id = 5 WHERE id = 2;                      -- Sam Staff is employee A2
INSERT INTO company_permissions (role_id, module, feature, action) VALUES (3, 'leave', '*', 'view');
UPDATE leave_types SET min_notice_days = 3 WHERE id = 1;           -- Annual: 3 working days ahead
INSERT INTO leave_types (company_id, name, counts_as_absence, quota_days, quota_period) VALUES (1, 'Work from home', false, 2, 'week');
:as_staff
DO $$
DECLARE mon date := date_trunc('week', current_date)::date + 14; wfh bigint;
BEGIN
  SELECT id INTO wfh FROM leave_types WHERE name = 'Work from home';
  -- notice
  BEGIN PERFORM leave_apply(jsonb_build_object('company_id',1,'employee_id',2,'leave_type_id',1,'start_date',current_date + 1,'end_date',current_date + 1,'days',1));
    RAISE EXCEPTION 'FAIL: short notice accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'POLICY:%' THEN RAISE; END IF; END;
  PERFORM leave_apply(jsonb_build_object('company_id',1,'employee_id',2,'leave_type_id',1,'start_date',mon,'end_date',mon,'days',1));
  -- staff cannot give themselves an override
  BEGIN PERFORM leave_apply(jsonb_build_object('company_id',1,'employee_id',2,'leave_type_id',1,'start_date',current_date + 1,'end_date',current_date + 1,'days',1,'override_reason','pls'));
    RAISE EXCEPTION 'FAIL: staff overrode the rules';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- work from home: two days a week
  PERFORM leave_apply(jsonb_build_object('company_id',1,'employee_id',2,'leave_type_id',wfh,'start_date',mon + 1,'end_date',mon + 1,'days',1));
  PERFORM leave_apply(jsonb_build_object('company_id',1,'employee_id',2,'leave_type_id',wfh,'start_date',mon + 2,'end_date',mon + 2,'days',1));
  BEGIN PERFORM leave_apply(jsonb_build_object('company_id',1,'employee_id',2,'leave_type_id',wfh,'start_date',mon + 3,'end_date',mon + 3,'days',1));
    RAISE EXCEPTION 'FAIL: third work-from-home day in a week accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'POLICY:%' THEN RAISE; END IF; END;
  PERFORM leave_apply(jsonb_build_object('company_id',1,'employee_id',2,'leave_type_id',wfh,'start_date',mon + 7,'end_date',mon + 7,'days',1));
END $$;
:as_a
DO $$
DECLARE mon date := date_trunc('week', current_date)::date + 14;
BEGIN
  -- HR applies for someone around the notice rule, with a reason that is kept
  PERFORM leave_apply(jsonb_build_object('company_id',1,'employee_id',1,'leave_type_id',1,'start_date',current_date + 1,'end_date',current_date + 1,'days',1,'override_reason','urgent'));
  ASSERT (SELECT policy_override FROM leave_requests WHERE employee_id = 1 AND start_date = current_date + 1) = 'urgent', 'FAIL: override reason not kept';
  -- but not without one
  BEGIN PERFORM leave_apply(jsonb_build_object('company_id',1,'employee_id',1,'leave_type_id',1,'start_date',current_date + 1,'end_date',current_date + 1,'days',1));
    RAISE EXCEPTION 'FAIL: HR skipped a rule without giving a reason';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'POLICY:%' THEN RAISE; END IF; END;
END $$;
ROLLBACK;
BEGIN; :as_service
UPDATE employees SET user_id = 5 WHERE id = 2;
INSERT INTO company_permissions (role_id, module, feature, action) VALUES (3, 'leave', '*', 'view');
INSERT INTO hr_departments (company_id, name) VALUES (1, 'Ops');
UPDATE employees SET department_id = (SELECT id FROM hr_departments WHERE name = 'Ops') WHERE company_id = 1;
INSERT INTO leave_policy (company_id, max_off_per_day, max_off_scope, min_at_work_per_department) VALUES (1, 1, 'company', 1);
INSERT INTO leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, days)
  VALUES (1, 1, 1, date_trunc('week', current_date)::date + 21, date_trunc('week', current_date)::date + 21, 1);   -- A1 off on a Monday
:as_staff
DO $$
DECLARE mon date := date_trunc('week', current_date)::date + 21;
BEGIN
  BEGIN PERFORM leave_apply(jsonb_build_object('company_id',1,'employee_id',2,'leave_type_id',1,'start_date',mon,'end_date',mon,'days',1));
    RAISE EXCEPTION 'FAIL: two people off the same day accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'POLICY:%' THEN RAISE; END IF; END;
  -- another day is fine
  PERFORM leave_apply(jsonb_build_object('company_id',1,'employee_id',2,'leave_type_id',1,'start_date',mon + 1,'end_date',mon + 1,'days',1));
END $$;
:as_a
DO $$
DECLARE mon date := date_trunc('week', current_date)::date + 21;
BEGIN
  -- Ops would have nobody at work on mon + 1 (A2 is off, A1 would be too)
  BEGIN PERFORM leave_apply(jsonb_build_object('company_id',1,'employee_id',1,'leave_type_id',1,'start_date',mon + 1,'end_date',mon + 1,'days',1));
    RAISE EXCEPTION 'FAIL: department left with nobody at work';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'POLICY:%' THEN RAISE; END IF; END;
  PERFORM leave_apply(jsonb_build_object('company_id',1,'employee_id',1,'leave_type_id',1,'start_date',mon + 1,'end_date',mon + 1,'days',1,'override_reason','cover arranged'));
END $$;
ROLLBACK;
BEGIN; :as_service
UPDATE employees SET user_id = 5 WHERE id = 2;
INSERT INTO company_permissions (role_id, module, feature, action) VALUES (3, 'leave', '*', 'view');
INSERT INTO leave_types (company_id, name, count_method) VALUES (1, 'Hourly time off', 'hours');
INSERT INTO leave_types (company_id, name, is_toil) VALUES (1, 'Time off in lieu', true);
:as_staff
DO $$
DECLARE mon date := date_trunc('week', current_date)::date + 28; toil bigint; hourly bigint;
BEGIN
  SELECT id INTO toil FROM leave_types WHERE name = 'Time off in lieu';
  SELECT id INTO hourly FROM leave_types WHERE name = 'Hourly time off';
  -- time off by the hour: within one day
  PERFORM leave_apply(jsonb_build_object('company_id',1,'employee_id',2,'leave_type_id',hourly,'start_date',mon + 1,'end_date',mon + 1,'days',2));
  BEGIN PERFORM leave_apply(jsonb_build_object('company_id',1,'employee_id',2,'leave_type_id',hourly,'start_date',mon + 2,'end_date',mon + 3,'days',2));
    RAISE EXCEPTION 'FAIL: time off by the hour over two days accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  -- time off in lieu is added by HR, not by the employee
  BEGIN PERFORM toil_grant(2, toil, 1, current_date, 'worked Saturday');
    RAISE EXCEPTION 'FAIL: staff added time off in lieu for themselves';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO toil_credits (company_id, employee_id, leave_type_id, amount, worked_date) VALUES (1, 2, toil, 5, current_date);
    RAISE EXCEPTION 'FAIL: staff wrote a credit directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
:as_a
DO $$
DECLARE toil bigint; hourly bigint; g bigint;
BEGIN
  SELECT id INTO toil FROM leave_types WHERE name = 'Time off in lieu';
  SELECT id INTO hourly FROM leave_types WHERE name = 'Hourly time off';
  g := toil_grant(2, toil, 1.5, current_date, 'worked Saturday');
  ASSERT (SELECT entitled_days FROM leave_balances WHERE employee_id = 2 AND leave_type_id = toil) = 1.5, 'FAIL: time off in lieu not added to the balance';
  g := toil_grant(2, toil, 1, current_date, 'public holiday');
  ASSERT (SELECT entitled_days FROM leave_balances WHERE employee_id = 2 AND leave_type_id = toil) = 2.5, 'FAIL: second grant not added';
  BEGIN PERFORM toil_grant(2, hourly, 1, current_date, NULL);
    RAISE EXCEPTION 'FAIL: time off in lieu added to a leave type that is not one';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  -- a grant made by mistake can be taken back while the time is unused
  PERFORM toil_revoke(g);
  ASSERT (SELECT entitled_days FROM leave_balances WHERE employee_id = 2 AND leave_type_id = toil) = 1.5, 'FAIL: revoked grant not taken off';
END $$;
:as_staff
DO $$
DECLARE toil bigint;
BEGIN
  SELECT id INTO toil FROM leave_types WHERE name = 'Time off in lieu';
  ASSERT (SELECT count(*) FROM toil_credits) = 1, 'FAIL: staff cannot see their own time off in lieu';
  BEGIN PERFORM toil_revoke((SELECT id FROM toil_credits LIMIT 1));
    RAISE EXCEPTION 'FAIL: staff removed their own time off in lieu';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- and they use it like any other leave
  PERFORM leave_apply(jsonb_build_object('company_id',1,'employee_id',2,'leave_type_id',toil,'start_date',date_trunc('week', current_date)::date + 35,'end_date',date_trunc('week', current_date)::date + 35,'days',1));
END $$;
:as_b
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM toil_credits) = 0 AND (SELECT count(*) FROM leave_policy) = 0, 'FAIL: B sees A leave policy data';
END $$;
ROLLBACK;
\echo '9r. stock by weight: classes and pieces stay inside their company, a piece is sold once'
BEGIN; :as_a
DO $$
DECLARE v_i bigint; v_c bigint; v_p bigint; v_d1 bigint; v_d2 bigint;
BEGIN
  INSERT INTO catalog_items (company_id, name, track_stock, stock_mode, price_basis) VALUES (1, 'Patin', true, 'pieces', 'per_kg') RETURNING id INTO v_i;
  INSERT INTO catalog_weight_classes (company_id, item_id, min_kg, max_kg, sale_price, purchase_price) VALUES (1, v_i, 2, 2.99, 260, 200) RETURNING id INTO v_c;
  INSERT INTO catalog_pieces (company_id, item_id, weight, class_id) VALUES (1, v_i, 2.5, v_c) RETURNING id INTO v_p;
  PERFORM set_config('qv.alpha_item', v_i::text, false);
  BEGIN INSERT INTO catalog_pieces (company_id, item_id, weight) VALUES (2, v_i, 1); RAISE EXCEPTION 'FAIL: A added a piece to B';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- the same piece on two invoices is refused
  INSERT INTO fin_documents (company_id, doc_type, number, status, issue_date) VALUES (1, 'invoice', 'PC-1', 'approved', current_date) RETURNING id INTO v_d1;
  INSERT INTO fin_documents (company_id, doc_type, number, status, issue_date) VALUES (1, 'invoice', 'PC-2', 'approved', current_date) RETURNING id INTO v_d2;
  INSERT INTO fin_document_lines (company_id, document_id, description, quantity, unit_price, item_id, piece_id) VALUES (1, v_d1, 'Patin', 2.5, 260, v_i, v_p);
  BEGIN INSERT INTO fin_document_lines (company_id, document_id, description, quantity, unit_price, item_id, piece_id) VALUES (1, v_d2, 'Patin', 2.5, 260, v_i, v_p);
    RAISE EXCEPTION 'FAIL: a piece went on two invoices';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  -- a void invoice frees it
  UPDATE fin_documents SET status = 'void' WHERE id = v_d1;
  INSERT INTO fin_document_lines (company_id, document_id, description, quantity, unit_price, item_id, piece_id) VALUES (1, v_d2, 'Patin', 2.5, 260, v_i, v_p);
END $$;
COMMIT;
BEGIN; :as_b
DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM catalog_weight_classes WHERE company_id = 1), 'FAIL: B sees A weight classes';
  ASSERT NOT EXISTS (SELECT 1 FROM catalog_pieces WHERE company_id = 1), 'FAIL: B sees A pieces';
  BEGIN INSERT INTO catalog_weight_classes (company_id, item_id, min_kg) VALUES (2, current_setting('qv.alpha_item')::bigint, 1);
    RAISE EXCEPTION 'FAIL: B added a class to an A item';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN; :as_a
DELETE FROM fin_documents WHERE number IN ('PC-1', 'PC-2');
DELETE FROM catalog_items WHERE name = 'Patin';
COMMIT;

\echo '9s. price lists: lists and prices stay inside their company, a customer only takes a list of their own company'
BEGIN; :as_a
DO $$
DECLARE v_i bigint; v_l bigint; v_c bigint;
BEGIN
  INSERT INTO catalog_items (company_id, name, sale_price) VALUES (1, 'Pl item', 10) RETURNING id INTO v_i;
  INSERT INTO price_lists (company_id, name) VALUES (1, 'Restaurants') RETURNING id INTO v_l;
  INSERT INTO price_list_items (company_id, price_list_id, item_id, price) VALUES (1, v_l, v_i, 8);
  INSERT INTO contacts (company_id, name, is_customer, price_list_id) VALUES (1, 'Pl customer', true, v_l) RETURNING id INTO v_c;
  PERFORM set_config('qv.alpha_list', v_l::text, false);
  PERFORM set_config('qv.alpha_item', v_i::text, false);
  -- a supplier's price list (migration 049): same name allowed once per kind
  INSERT INTO price_lists (company_id, name, kind) VALUES (1, 'Restaurants', 'purchase');
  BEGIN INSERT INTO price_lists (company_id, name, kind) VALUES (1, 'restaurants', 'purchase'); RAISE EXCEPTION 'FAIL: duplicate supplier list name allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO price_lists (company_id, name, kind) VALUES (1, 'Odd', 'banana'); RAISE EXCEPTION 'FAIL: unknown price list kind allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO price_lists (company_id, name) VALUES (2, 'Planted'); RAISE EXCEPTION 'FAIL: A added a price list to B';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO price_lists (company_id, name) VALUES (1, 'restaurants'); RAISE EXCEPTION 'FAIL: duplicate list name allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO price_list_items (company_id, price_list_id, item_id, price) VALUES (1, v_l, v_i, 9); RAISE EXCEPTION 'FAIL: one item twice on a list';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
COMMIT;
BEGIN; :as_b
DO $$
DECLARE v_c bigint;
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM price_lists WHERE company_id = 1), 'FAIL: B sees A price lists';
  ASSERT NOT EXISTS (SELECT 1 FROM price_list_items WHERE company_id = 1), 'FAIL: B sees A prices';
  INSERT INTO contacts (company_id, name, is_customer) VALUES (2, 'Beta buyer 2', true) RETURNING id INTO v_c;
  BEGIN UPDATE contacts SET purchase_price_list_id = current_setting('qv.alpha_list')::bigint WHERE id = v_c;
    RAISE EXCEPTION 'FAIL: B put a supplier on an A price list';
  EXCEPTION WHEN insufficient_privilege OR foreign_key_violation OR check_violation THEN NULL; END;
  BEGIN UPDATE contacts SET price_list_id = current_setting('qv.alpha_list')::bigint WHERE id = v_c;
    RAISE EXCEPTION 'FAIL: B put a customer on an A price list';
  EXCEPTION WHEN insufficient_privilege OR foreign_key_violation OR check_violation THEN NULL; END;
  BEGIN INSERT INTO price_list_items (company_id, price_list_id, item_id, price) VALUES (2, current_setting('qv.alpha_list')::bigint, current_setting('qv.alpha_item')::bigint, 1);
    RAISE EXCEPTION 'FAIL: B priced an A item on an A list';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN; :as_a
DELETE FROM contacts WHERE name = 'Pl customer';
DELETE FROM price_lists WHERE name = 'Restaurants';
DELETE FROM catalog_items WHERE name = 'Pl item';
COMMIT;

\echo '9t. delivery addresses: a customer's addresses stay inside their company'
BEGIN; :as_a
DO $$
DECLARE v_c bigint;
BEGIN
  INSERT INTO contacts (company_id, name, is_customer) VALUES (1, 'Addr customer', true) RETURNING id INTO v_c;
  INSERT INTO contact_addresses (company_id, contact_id, label, address, is_default) VALUES (1, v_c, 'Warehouse', '2 Warehouse Lane', true);
  PERFORM set_config('qv.alpha_contact', v_c::text, false);
  BEGIN INSERT INTO contact_addresses (company_id, contact_id, address) VALUES (2, v_c, 'planted'); RAISE EXCEPTION 'FAIL: A added an address to B';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
COMMIT;
BEGIN; :as_b
DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM contact_addresses WHERE company_id = 1), 'FAIL: B sees A delivery addresses';
  BEGIN INSERT INTO contact_addresses (company_id, contact_id, address) VALUES (2, current_setting('qv.alpha_contact')::bigint, 'x');
    RAISE EXCEPTION 'FAIL: B put an address on an A customer';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN; :as_a
DELETE FROM contacts WHERE name = 'Addr customer';
COMMIT;

\echo '9u. my profile: everyone reads and changes only their own'
BEGIN; :as_a
DO $$
BEGIN
  INSERT INTO user_profiles (auth_user_id, display_name, avatar_color) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Alpha Person', '#ff0000');
  BEGIN INSERT INTO user_profiles (auth_user_id, display_name) VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'planted'); RAISE EXCEPTION 'FAIL: A wrote B profile';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
END $$;
COMMIT;
BEGIN; :as_b
DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM user_profiles WHERE display_name = 'Alpha Person'), 'FAIL: B sees A profile';
  UPDATE user_profiles SET display_name = 'hijacked' WHERE auth_user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  ASSERT NOT FOUND, 'FAIL: B changed A profile';
END $$;
ROLLBACK;
BEGIN; :as_a
DELETE FROM user_profiles WHERE auth_user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
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
