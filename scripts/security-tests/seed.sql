-- Test fixtures for tests.sql. Runs as the database owner BEFORE 011, so the
-- legacy-password move is exercised too.
\set ON_ERROR_STOP 1
\set QUIET 1

INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@alpha.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@beta.test'),
  ('cccccccc-0000-0000-0000-000000000003', 'c@gamma.test'),
  ('dddddddd-0000-0000-0000-000000000004', 'admin@quantivra.test'),
  ('eeeeeeee-0000-0000-0000-000000000005', 'stranger@nowhere.test'),
  ('ffffffff-0000-0000-0000-000000000006', 'staff@alpha.test');

INSERT INTO country_profiles (code, name, currency, phone_code) VALUES ('SG', 'Singapore', 'SGD', '+65') ON CONFLICT DO NOTHING;

-- ids 1, 2, 3 (inactive)
INSERT INTO companies (name, company_code, country) VALUES
  ('Alpha', 'alpha', 'SG'), ('Beta', 'beta', 'SG'), ('Gamma', 'gamma', 'SG');
UPDATE companies SET is_active = false WHERE company_code = 'gamma';

INSERT INTO company_users (company_id, email, password_hash, full_name, is_active) VALUES
  (1, 'a@alpha.test', 'x', 'Alice A', true),
  (2, 'b@beta.test',  'x', 'Bob B',   true),
  (3, 'c@gamma.test', 'x', 'Cara C',  false);
-- a legacy (pre-Supabase-Auth) login with a real bcrypt hash
INSERT INTO company_users (company_id, email, password_hash, full_name, is_active)
VALUES (1, 'legacy@alpha.test', extensions.crypt('old-password', extensions.gen_salt('bf', 4)), 'Leg Acy', true);

INSERT INTO platform_users (username, email, password_hash, full_name)
VALUES ('admin', 'admin@quantivra.test', 'x', 'Admin');

INSERT INTO company_roles (company_id, name) VALUES (1, 'Admin'), (2, 'Admin'), (1, 'Employee');
INSERT INTO company_permissions (role_id, module, feature, action) VALUES (1, 'hr', 'employees', 'read'), (2, 'hr', 'employees', 'read');
-- a staff member of Alpha with no pay access (company_users id 5, role 3)
INSERT INTO company_users (company_id, email, password_hash, full_name, is_active) VALUES (1, 'staff@alpha.test', 'x', 'Sam Staff', true);
INSERT INTO company_user_roles (user_id, role_id) VALUES (1, 1), (2, 2), (5, 3);
INSERT INTO platform_subscriptions (company_id) VALUES (1), (2);

-- employees 1, 2 in Alpha; 3 in Beta
INSERT INTO employees (company_id, employee_code, full_name, base_salary, national_id_enc) VALUES
  (1, 'A1', 'Alpha One', 5000, private.enc('S1234567A')),
  (1, 'A2', 'Alpha Two', 4000, NULL),
  (2, 'B1', 'Beta One',  6000, private.enc('S7654321B'));
INSERT INTO leave_types (company_id, name) VALUES (1, 'Annual'), (2, 'Annual');
INSERT INTO leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, days) VALUES
  (1, 1, 1, '2026-02-02', '2026-02-02', 1),
  (2, 3, 2, '2026-02-02', '2026-02-02', 1);
INSERT INTO payroll_runs (company_id, period_year, period_month, pay_date) VALUES (1, 2026, 1, '2026-01-31'), (2, 2026, 1, '2026-01-31');
INSERT INTO payslips (run_id, company_id, employee_id, employee_name) VALUES (1, 1, 1, 'Alpha One'), (2, 2, 3, 'Beta One');
INSERT INTO company_settings (company_id, category, key, value) VALUES (1, 'company', 'tz', '"SG"'), (2, 'company', 'tz', '"SG"');

-- a leftover table from before the rebuild, with plain-text passwords
CREATE TABLE public.legacy_staff (id int PRIMARY KEY, company_id bigint, username text, password_hash text);
INSERT INTO public.legacy_staff VALUES (1, 1, 'old-admin', '861341');
