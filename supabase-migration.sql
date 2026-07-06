-- Run this SQL in your Supabase project SQL editor
-- Creates all tables for the Accounting & HR app with multi-role, super admin, claims

-- Companies
CREATE TABLE IF NOT EXISTS companies (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  company_code TEXT UNIQUE,
  address TEXT,
  country TEXT NOT NULL DEFAULT 'US',
  currency TEXT NOT NULL DEFAULT 'USD',
  tax_system TEXT DEFAULT 'default',
  fiscal_year_start TEXT DEFAULT '01-01',
  fiscal_year_end TEXT DEFAULT '12-31',
  phone TEXT,
  email TEXT,
  website TEXT,
  registration_number TEXT,
  tax_id TEXT,
  logo_url TEXT,
  incorporation_date DATE,
  business_certificate_url TEXT,
  business_certificate_name TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (application users, linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT REFERENCES companies(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  full_name TEXT NOT NULL,
  roles TEXT[] NOT NULL DEFAULT '{employee}',
  is_super_admin INTEGER DEFAULT 0,
  phone TEXT,
  is_active INTEGER DEFAULT 1,
  password_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Employees (employee records, linked to users)
CREATE TABLE IF NOT EXISTS employees (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  employee_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  department TEXT,
  position TEXT,
  join_date DATE,
  salary REAL DEFAULT 0,
  bank_name TEXT,
  bank_account TEXT,
  tax_id TEXT,
  address TEXT,
  emergency_contact TEXT,
  employment_type TEXT DEFAULT 'full_time' CHECK(employment_type IN ('full_time','part_time')),
  status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive','terminated')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leave types
CREATE TABLE IF NOT EXISTS leave_types (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  days_per_year REAL NOT NULL DEFAULT 14,
  is_paid INTEGER DEFAULT 1,
  carry_forward INTEGER DEFAULT 0,
  carry_forward_max_days REAL,
  carry_forward_expiry_months INTEGER,
  include_weekends INTEGER DEFAULT 0
);

-- Leave requests
CREATE TABLE IF NOT EXISTS leave_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id BIGINT NOT NULL REFERENCES leave_types(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days REAL NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
  approved_by BIGINT REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leave balances
CREATE TABLE IF NOT EXISTS leave_balances (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id BIGINT NOT NULL REFERENCES leave_types(id),
  total_days REAL DEFAULT 0,
  used_days REAL DEFAULT 0,
  year INTEGER NOT NULL,
  is_carry_forward INTEGER DEFAULT 0,
  expiry_date DATE
);

-- Employee claims (expense reimbursement, travel claims, etc.)
CREATE TABLE IF NOT EXISTS claims (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES employees(id),
  claim_type TEXT NOT NULL CHECK(claim_type IN ('travel','medical','transport','meals','supplies','other')),
  title TEXT NOT NULL,
  description TEXT,
  amount REAL NOT NULL,
  receipt_url TEXT,
  receipt_name TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','paid')),
  approved_by BIGINT REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chart of accounts
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('asset','liability','equity','income','expense')),
  subtype TEXT,
  is_active INTEGER DEFAULT 1,
  description TEXT
);

-- Journal entries
CREATE TABLE IF NOT EXISTS journal_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  reference TEXT,
  description TEXT NOT NULL,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Journal lines
CREATE TABLE IF NOT EXISTS journal_lines (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  journal_entry_id BIGINT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id BIGINT NOT NULL REFERENCES chart_of_accounts(id),
  debit REAL DEFAULT 0,
  credit REAL DEFAULT 0,
  description TEXT
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_address TEXT,
  client_tax_id TEXT,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  subtotal REAL DEFAULT 0,
  tax_rate REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  notes TEXT,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','sent','paid','overdue','cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoice items
CREATE TABLE IF NOT EXISTS invoice_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity REAL DEFAULT 1,
  unit_price REAL DEFAULT 0,
  total REAL DEFAULT 0
);

-- Supplier invoices
CREATE TABLE IF NOT EXISTS supplier_invoices (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL,
  invoice_number TEXT,
  date DATE NOT NULL,
  amount REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  description TEXT,
  file_url TEXT,
  file_name TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','paid','cancelled')),
  due_date DATE,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Employee documents
CREATE TABLE IF NOT EXISTS employee_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK(document_type IN ('national_id','passport','driving_license','visa','certificate','contract','other')),
  document_name TEXT NOT NULL,
  document_number TEXT,
  issue_date DATE,
  expiry_date DATE,
  file_url TEXT,
  file_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoice attachments
CREATE TABLE IF NOT EXISTS invoice_attachments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payroll records
CREATE TABLE IF NOT EXISTS payroll_records (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES employees(id),
  pay_period_start DATE NOT NULL,
  pay_period_end DATE NOT NULL,
  pay_date DATE NOT NULL,
  basic_pay REAL DEFAULT 0,
  allowances REAL DEFAULT 0,
  deductions REAL DEFAULT 0,
  tax_deduction REAL DEFAULT 0,
  other_deductions REAL DEFAULT 0,
  net_pay REAL DEFAULT 0,
  status TEXT DEFAULT 'calculated' CHECK(status IN ('calculated','paid','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Statutory deductions (country-specific)
CREATE TABLE IF NOT EXISTS statutory_deductions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  country TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  employee_rate REAL NOT NULL DEFAULT 0,
  employer_rate REAL NOT NULL DEFAULT 0,
  cap_amount REAL
);

-- Company deduction overrides
CREATE TABLE IF NOT EXISTS company_statutory_deductions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  deduction_name TEXT NOT NULL,
  employee_rate REAL NOT NULL DEFAULT 0,
  employer_rate REAL NOT NULL DEFAULT 0,
  cap_amount REAL
);

-- Seed statutory deduction defaults by country
INSERT INTO statutory_deductions (country, name, description, employee_rate, employer_rate, cap_amount) VALUES
  ('Singapore', 'CPF', 'Central Provident Fund', 0.20, 0.17, NULL),
  ('Singapore', 'SD', 'Skills Development Levy', 0.0025, 0.0025, NULL),
  ('Singapore', 'SHG', 'Self-Help Group', 0.005, 0.005, NULL),
  ('Malaysia', 'EPF', 'Employees Provident Fund', 0.11, 0.13, NULL),
  ('Malaysia', 'SOCSO', 'Social Security Organization', 0.005, 0.0195, 4000),
  ('Malaysia', 'EIS', 'Employment Insurance System', 0.002, 0.004, 4000),
  ('Hong Kong', 'MPF', 'Mandatory Provident Fund', 0.05, 0.05, 30000),
  ('Dubai', 'Pension', 'UAE Pension Scheme (UAE nationals)', 0.05, 0.125, NULL),
  ('Australia', 'Super', 'Superannuation Guarantee', 0, 0.115, NULL),
  ('Australia', 'PAYG', 'PAYG Withholding', 0.15, 0, NULL),
  ('United Kingdom', 'NI', 'National Insurance', 0.08, 0.138, NULL),
  ('United Kingdom', 'PAYE', 'Income Tax', 0.20, 0, NULL),
  ('Canada', 'CPP', 'Canada Pension Plan', 0.0595, 0.0595, 66600),
  ('Canada', 'EI', 'Employment Insurance', 0.0166, 0.0232, 61500),
  ('India', 'PF', 'Provident Fund', 0.12, 0.13, 15000),
  ('India', 'ESI', 'Employee State Insurance', 0.0075, 0.0325, 21000),
  ('Philippines', 'SSS', 'Social Security System', 0.045, 0.085, NULL),
  ('Philippines', 'PhilHealth', 'Philippine Health Insurance', 0.03, 0.03, NULL),
  ('Philippines', 'HDMF', 'Pag-IBIG Fund', 0.02, 0.02, 5000),
  ('China', 'Pension', 'Basic Pension Insurance', 0.08, 0.16, NULL),
  ('China', 'Medical', 'Basic Medical Insurance', 0.02, 0.08, NULL),
  ('China', 'Unemployment', 'Unemployment Insurance', 0.005, 0.01, NULL),
  ('China', 'Housing', 'Housing Provident Fund', 0.05, 0.05, NULL),
  ('Japan', 'Pension', 'Employees Pension Insurance', 0.0915, 0.0915, NULL),
  ('Japan', 'Health', 'Health Insurance', 0.05, 0.05, NULL),
  ('Japan', 'Employment', 'Employment Insurance', 0.003, 0.006, NULL),
  ('South Korea', 'NPS', 'National Pension Service', 0.045, 0.045, NULL),
  ('South Korea', 'HI', 'Health Insurance', 0.0352, 0.0352, NULL),
  ('South Korea', 'EIC', 'Employment Insurance', 0.008, 0.008, NULL),
  ('Thailand', 'SSF', 'Social Security Fund', 0.05, 0.05, 15000),
  ('Vietnam', 'SI', 'Social Insurance', 0.08, 0.175, NULL),
  ('Vietnam', 'HI', 'Health Insurance', 0.015, 0.03, NULL),
  ('Vietnam', 'UI', 'Unemployment Insurance', 0.01, 0.01, NULL),
  ('Indonesia', 'BPJS Ketenagakerjaan', 'Employment BPJS', 0.02, 0.054, NULL),
  ('Indonesia', 'BPJS Kesehatan', 'Health BPJS', 0.01, 0.04, NULL);

-- Seed super admin (AEGIS) — username: AEGIS, password: 123456
INSERT INTO users (username, email, full_name, roles, is_super_admin, password_hash) 
SELECT 'AEGIS', 'aegis@master.admin', 'AEGIS', '{superadmin}', 1, '123456'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE is_super_admin = 1);

-- Enable RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE statutory_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_statutory_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;

-- Policies for full access
CREATE POLICY "Full access for all" ON companies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access for all" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access for all" ON employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access for all" ON leave_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access for all" ON leave_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access for all" ON leave_balances FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access for all" ON claims FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access for all" ON chart_of_accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access for all" ON journal_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access for all" ON journal_lines FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access for all" ON invoices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access for all" ON invoice_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access for all" ON supplier_invoices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access for all" ON employee_documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access for all" ON invoice_attachments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access for all" ON statutory_deductions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access for all" ON company_statutory_deductions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access for all" ON payroll_records FOR ALL USING (true) WITH CHECK (true);

-- ALTER existing tables for new columns (run once on existing DBs)
ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS is_carry_forward INTEGER DEFAULT 0;
ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS include_weekends INTEGER DEFAULT 0;

-- Seed default leave types for a company (call via SQL or API)
CREATE OR REPLACE FUNCTION seed_default_leave_types(p_company_id BIGINT)
RETURNS void AS $$
BEGIN
  INSERT INTO leave_types (company_id, name, days_per_year, is_paid, carry_forward, carry_forward_max_days, carry_forward_expiry_months, include_weekends)
  VALUES
    (p_company_id, 'Annual Leave', 14, 1, 1, 5, 6, 0),
    (p_company_id, 'Birthday Leave', 1, 1, 0, NULL, NULL, 0),
    (p_company_id, 'Childcare Leave', 6, 1, 0, NULL, NULL, 0),
    (p_company_id, 'Maternity Leave', 112, 1, 0, NULL, NULL, 1),
    (p_company_id, 'Off in Lieu', 0, 1, 0, NULL, NULL, 0),
    (p_company_id, 'Condolence Leave (Direct)', 7, 1, 0, NULL, NULL, 0),
    (p_company_id, 'Condolence Leave (Indirect)', 3, 1, 0, NULL, NULL, 0),
    (p_company_id, 'Hospitalisation Leave', 60, 1, 0, NULL, NULL, 1),
    (p_company_id, 'Unpaid Leave', 0, 0, 0, NULL, NULL, 0)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Public holidays per country
CREATE TABLE IF NOT EXISTS public_holidays (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  country TEXT NOT NULL,
  date DATE NOT NULL,
  name TEXT NOT NULL
);

ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Full access for all" ON public_holidays FOR ALL USING (true) WITH CHECK (true);

-- Seed public holidays for supported countries (2025-2026)
INSERT INTO public_holidays (country, date, name) VALUES
  -- Singapore
  ('Singapore', '2025-01-01', 'New Year''s Day'),
  ('Singapore', '2025-01-29', 'Chinese New Year'),
  ('Singapore', '2025-01-30', 'Chinese New Year'),
  ('Singapore', '2025-03-31', 'Hari Raya Puasa'),
  ('Singapore', '2025-04-18', 'Good Friday'),
  ('Singapore', '2025-05-01', 'Labour Day'),
  ('Singapore', '2025-05-12', 'Vesak Day'),
  ('Singapore', '2025-06-07', 'Hari Raya Haji'),
  ('Singapore', '2025-08-09', 'National Day'),
  ('Singapore', '2025-10-20', 'Deepavali'),
  ('Singapore', '2025-12-25', 'Christmas Day'),
  ('Singapore', '2026-01-01', 'New Year''s Day'),
  ('Singapore', '2026-02-17', 'Chinese New Year'),
  ('Singapore', '2026-02-18', 'Chinese New Year'),
  ('Singapore', '2026-03-20', 'Hari Raya Puasa'),
  ('Singapore', '2026-04-03', 'Good Friday'),
  ('Singapore', '2026-05-01', 'Labour Day'),
  ('Singapore', '2026-05-01', 'Vesak Day'),
  ('Singapore', '2026-05-27', 'Hari Raya Haji'),
  ('Singapore', '2026-08-09', 'National Day'),
  ('Singapore', '2026-11-08', 'Deepavali'),
  ('Singapore', '2026-12-25', 'Christmas Day'),
  -- Malaysia
  ('Malaysia', '2025-01-01', 'New Year''s Day'),
  ('Malaysia', '2025-01-29', 'Chinese New Year'),
  ('Malaysia', '2025-01-30', 'Chinese New Year'),
  ('Malaysia', '2025-03-31', 'Hari Raya Puasa'),
  ('Malaysia', '2025-05-01', 'Labour Day'),
  ('Malaysia', '2025-06-02', 'Agong''s Birthday'),
  ('Malaysia', '2025-06-07', 'Hari Raya Haji'),
  ('Malaysia', '2025-08-31', 'National Day'),
  ('Malaysia', '2025-09-16', 'Malaysia Day'),
  ('Malaysia', '2025-12-25', 'Christmas Day'),
  ('Malaysia', '2026-01-01', 'New Year''s Day'),
  ('Malaysia', '2026-02-17', 'Chinese New Year'),
  ('Malaysia', '2026-02-18', 'Chinese New Year'),
  ('Malaysia', '2026-03-20', 'Hari Raya Puasa'),
  ('Malaysia', '2026-05-01', 'Labour Day'),
  ('Malaysia', '2026-05-27', 'Hari Raya Haji'),
  ('Malaysia', '2026-06-01', 'Agong''s Birthday'),
  ('Malaysia', '2026-08-31', 'National Day'),
  ('Malaysia', '2026-09-16', 'Malaysia Day'),
  ('Malaysia', '2026-12-25', 'Christmas Day'),
  -- Philippines
  ('Philippines', '2025-01-01', 'New Year''s Day'),
  ('Philippines', '2025-04-09', 'Araw ng Kagitingan'),
  ('Philippines', '2025-04-17', 'Maundy Thursday'),
  ('Philippines', '2025-04-18', 'Good Friday'),
  ('Philippines', '2025-05-01', 'Labour Day'),
  ('Philippines', '2025-06-12', 'Independence Day'),
  ('Philippines', '2025-08-25', 'National Heroes Day'),
  ('Philippines', '2025-11-30', 'Bonifacio Day'),
  ('Philippines', '2025-12-08', 'Feast of Immaculate Conception'),
  ('Philippines', '2025-12-25', 'Christmas Day'),
  ('Philippines', '2025-12-30', 'Rizal Day'),
  ('Philippines', '2026-01-01', 'New Year''s Day'),
  ('Philippines', '2026-04-09', 'Araw ng Kagitingan'),
  ('Philippines', '2026-04-02', 'Maundy Thursday'),
  ('Philippines', '2026-04-03', 'Good Friday'),
  ('Philippines', '2026-05-01', 'Labour Day'),
  ('Philippines', '2026-06-12', 'Independence Day'),
  ('Philippines', '2026-08-31', 'National Heroes Day'),
  ('Philippines', '2026-11-30', 'Bonifacio Day'),
  ('Philippines', '2026-12-08', 'Feast of Immaculate Conception'),
  ('Philippines', '2026-12-25', 'Christmas Day'),
  ('Philippines', '2026-12-30', 'Rizal Day'),
  -- India
  ('India', '2025-01-26', 'Republic Day'),
  ('India', '2025-03-14', 'Holi'),
  ('India', '2025-03-31', 'Eid ul-Fitr'),
  ('India', '2025-04-10', 'Good Friday'),
  ('India', '2025-04-14', 'Vaisakhi'),
  ('India', '2025-08-15', 'Independence Day'),
  ('India', '2025-10-02', 'Gandhi Jayanti'),
  ('India', '2025-10-20', 'Diwali'),
  ('India', '2025-10-21', 'Diwali'),
  ('India', '2025-12-25', 'Christmas Day'),
  ('India', '2026-01-26', 'Republic Day'),
  ('India', '2026-03-03', 'Holi'),
  ('India', '2026-03-20', 'Eid ul-Fitr'),
  ('India', '2026-04-03', 'Good Friday'),
  ('India', '2026-04-14', 'Vaisakhi'),
  ('India', '2026-08-15', 'Independence Day'),
  ('India', '2026-10-02', 'Gandhi Jayanti'),
  ('India', '2026-11-08', 'Diwali'),
  ('India', '2026-12-25', 'Christmas Day'),
  -- Indonesia
  ('Indonesia', '2025-01-01', 'New Year''s Day'),
  ('Indonesia', '2025-01-29', 'Chinese New Year'),
  ('Indonesia', '2025-03-31', 'Eid ul-Fitr'),
  ('Indonesia', '2025-04-01', 'Eid ul-Fitr'),
  ('Indonesia', '2025-04-18', 'Good Friday'),
  ('Indonesia', '2025-05-01', 'Labour Day'),
  ('Indonesia', '2025-05-12', 'Vesak Day'),
  ('Indonesia', '2025-06-07', 'Eid al-Adha'),
  ('Indonesia', '2025-08-17', 'Independence Day'),
  ('Indonesia', '2025-12-25', 'Christmas Day'),
  ('Indonesia', '2026-01-01', 'New Year''s Day'),
  ('Indonesia', '2026-02-17', 'Chinese New Year'),
  ('Indonesia', '2026-03-20', 'Eid ul-Fitr'),
  ('Indonesia', '2026-04-03', 'Good Friday'),
  ('Indonesia', '2026-05-01', 'Labour Day'),
  ('Indonesia', '2026-05-01', 'Vesak Day'),
  ('Indonesia', '2026-05-27', 'Eid al-Adha'),
  ('Indonesia', '2026-08-17', 'Independence Day'),
  ('Indonesia', '2026-12-25', 'Christmas Day'),
  -- Hong Kong
  ('Hong Kong', '2025-01-01', 'New Year''s Day'),
  ('Hong Kong', '2025-01-29', 'Chinese New Year'),
  ('Hong Kong', '2025-01-30', 'Chinese New Year'),
  ('Hong Kong', '2025-04-04', 'Ching Ming Festival'),
  ('Hong Kong', '2025-04-18', 'Good Friday'),
  ('Hong Kong', '2025-04-21', 'Easter Monday'),
  ('Hong Kong', '2025-05-01', 'Labour Day'),
  ('Hong Kong', '2025-05-05', 'Buddha''s Birthday'),
  ('Hong Kong', '2025-06-07', 'Tuen Ng Festival'),
  ('Hong Kong', '2025-07-01', 'HKSAR Establishment Day'),
  ('Hong Kong', '2025-10-01', 'National Day'),
  ('Hong Kong', '2025-10-07', 'Mid-Autumn Festival'),
  ('Hong Kong', '2025-12-25', 'Christmas Day'),
  ('Hong Kong', '2026-01-01', 'New Year''s Day'),
  ('Hong Kong', '2026-02-17', 'Chinese New Year'),
  ('Hong Kong', '2026-02-18', 'Chinese New Year'),
  ('Hong Kong', '2026-04-04', 'Ching Ming Festival'),
  ('Hong Kong', '2026-04-03', 'Good Friday'),
  ('Hong Kong', '2026-04-06', 'Easter Monday'),
  ('Hong Kong', '2026-05-01', 'Labour Day'),
  ('Hong Kong', '2026-05-25', 'Buddha''s Birthday'),
  ('Hong Kong', '2026-06-07', 'Tuen Ng Festival'),
  ('Hong Kong', '2026-07-01', 'HKSAR Establishment Day'),
  ('Hong Kong', '2026-10-01', 'National Day'),
  ('Hong Kong', '2026-10-07', 'Mid-Autumn Festival'),
  ('Hong Kong', '2026-12-25', 'Christmas Day'),
  -- United Kingdom
  ('United Kingdom', '2025-01-01', 'New Year''s Day'),
  ('United Kingdom', '2025-04-18', 'Good Friday'),
  ('United Kingdom', '2025-04-21', 'Easter Monday'),
  ('United Kingdom', '2025-05-05', 'Early May Bank Holiday'),
  ('United Kingdom', '2025-05-26', 'Spring Bank Holiday'),
  ('United Kingdom', '2025-08-25', 'Summer Bank Holiday'),
  ('United Kingdom', '2025-12-25', 'Christmas Day'),
  ('United Kingdom', '2025-12-26', 'Boxing Day'),
  ('United Kingdom', '2026-01-01', 'New Year''s Day'),
  ('United Kingdom', '2026-04-03', 'Good Friday'),
  ('United Kingdom', '2026-04-06', 'Easter Monday'),
  ('United Kingdom', '2026-05-04', 'Early May Bank Holiday'),
  ('United Kingdom', '2026-05-25', 'Spring Bank Holiday'),
  ('United Kingdom', '2026-08-31', 'Summer Bank Holiday'),
  ('United Kingdom', '2026-12-25', 'Christmas Day'),
  ('United Kingdom', '2026-12-26', 'Boxing Day'),
  -- United States
  ('United States', '2025-01-01', 'New Year''s Day'),
  ('United States', '2025-01-20', 'Martin Luther King Jr. Day'),
  ('United States', '2025-02-17', 'Presidents'' Day'),
  ('United States', '2025-05-26', 'Memorial Day'),
  ('United States', '2025-07-04', 'Independence Day'),
  ('United States', '2025-09-01', 'Labour Day'),
  ('United States', '2025-10-13', 'Columbus Day'),
  ('United States', '2025-11-11', 'Veterans Day'),
  ('United States', '2025-11-27', 'Thanksgiving Day'),
  ('United States', '2025-12-25', 'Christmas Day'),
  ('United States', '2026-01-01', 'New Year''s Day'),
  ('United States', '2026-01-19', 'Martin Luther King Jr. Day'),
  ('United States', '2026-02-16', 'Presidents'' Day'),
  ('United States', '2026-05-25', 'Memorial Day'),
  ('United States', '2026-07-04', 'Independence Day'),
  ('United States', '2026-09-07', 'Labour Day'),
  ('United States', '2026-10-12', 'Columbus Day'),
  ('United States', '2026-11-11', 'Veterans Day'),
  ('United States', '2026-11-26', 'Thanksgiving Day'),
  ('United States', '2026-12-25', 'Christmas Day'),
  -- Australia
  ('Australia', '2025-01-01', 'New Year''s Day'),
  ('Australia', '2025-01-27', 'Australia Day'),
  ('Australia', '2025-04-18', 'Good Friday'),
  ('Australia', '2025-04-21', 'Easter Monday'),
  ('Australia', '2025-04-25', 'Anzac Day'),
  ('Australia', '2025-12-25', 'Christmas Day'),
  ('Australia', '2025-12-26', 'Boxing Day'),
  ('Australia', '2026-01-01', 'New Year''s Day'),
  ('Australia', '2026-01-26', 'Australia Day'),
  ('Australia', '2026-04-03', 'Good Friday'),
  ('Australia', '2026-04-06', 'Easter Monday'),
  ('Australia', '2026-04-25', 'Anzac Day'),
  ('Australia', '2026-12-25', 'Christmas Day'),
  ('Australia', '2026-12-26', 'Boxing Day'),
  -- China
  ('China', '2025-01-01', 'New Year''s Day'),
  ('China', '2025-01-28', 'Spring Festival'),
  ('China', '2025-01-29', 'Spring Festival'),
  ('China', '2025-01-30', 'Spring Festival'),
  ('China', '2025-04-04', 'Qingming Festival'),
  ('China', '2025-05-01', 'Labour Day'),
  ('China', '2025-05-31', 'Dragon Boat Festival'),
  ('China', '2025-10-01', 'National Day'),
  ('China', '2025-10-02', 'National Day'),
  ('China', '2025-10-06', 'Mid-Autumn Festival'),
  ('China', '2026-01-01', 'New Year''s Day'),
  ('China', '2026-02-17', 'Spring Festival'),
  ('China', '2026-02-18', 'Spring Festival'),
  ('China', '2026-02-19', 'Spring Festival'),
  ('China', '2026-04-04', 'Qingming Festival'),
  ('China', '2026-05-01', 'Labour Day'),
  ('China', '2026-06-19', 'Dragon Boat Festival'),
  ('China', '2026-10-01', 'National Day'),
  ('China', '2026-10-02', 'National Day'),
  ('China', '2026-10-06', 'Mid-Autumn Festival'),
  -- Japan
  ('Japan', '2025-01-01', 'New Year''s Day'),
  ('Japan', '2025-01-13', 'Coming of Age Day'),
  ('Japan', '2025-02-11', 'National Foundation Day'),
  ('Japan', '2025-02-23', 'Emperor''s Birthday'),
  ('Japan', '2025-03-20', 'Vernal Equinox Day'),
  ('Japan', '2025-04-29', 'Showa Day'),
  ('Japan', '2025-05-03', 'Constitution Day'),
  ('Japan', '2025-05-05', 'Children''s Day'),
  ('Japan', '2025-07-21', 'Marine Day'),
  ('Japan', '2025-08-11', 'Mountain Day'),
  ('Japan', '2025-09-15', 'Respect for the Aged Day'),
  ('Japan', '2025-09-23', 'Autumnal Equinox Day'),
  ('Japan', '2025-10-13', 'Health and Sports Day'),
  ('Japan', '2025-11-03', 'Culture Day'),
  ('Japan', '2025-11-23', 'Labour Thanksgiving Day'),
  ('Japan', '2026-01-01', 'New Year''s Day'),
  ('Japan', '2026-01-12', 'Coming of Age Day'),
  ('Japan', '2026-02-11', 'National Foundation Day'),
  ('Japan', '2026-02-23', 'Emperor''s Birthday'),
  ('Japan', '2026-03-20', 'Vernal Equinox Day'),
  ('Japan', '2026-04-29', 'Showa Day'),
  ('Japan', '2026-05-03', 'Constitution Day'),
  ('Japan', '2026-05-05', 'Children''s Day'),
  ('Japan', '2026-07-20', 'Marine Day'),
  ('Japan', '2026-08-11', 'Mountain Day'),
  ('Japan', '2026-09-21', 'Respect for the Aged Day'),
  ('Japan', '2026-09-23', 'Autumnal Equinox Day'),
  ('Japan', '2026-10-12', 'Health and Sports Day'),
  ('Japan', '2026-11-03', 'Culture Day'),
  ('Japan', '2026-11-23', 'Labour Thanksgiving Day'),
  -- South Korea
  ('South Korea', '2025-01-01', 'New Year''s Day'),
  ('South Korea', '2025-01-28', 'Seollal'),
  ('South Korea', '2025-01-29', 'Seollal'),
  ('South Korea', '2025-03-01', 'Independence Movement Day'),
  ('South Korea', '2025-05-05', 'Children''s Day'),
  ('South Korea', '2025-05-05', 'Buddha''s Birthday'),
  ('South Korea', '2025-06-06', 'Memorial Day'),
  ('South Korea', '2025-08-15', 'Liberation Day'),
  ('South Korea', '2025-09-15', 'Chuseok'),
  ('South Korea', '2025-09-16', 'Chuseok'),
  ('South Korea', '2025-10-03', 'National Foundation Day'),
  ('South Korea', '2025-10-09', 'Hangeul Day'),
  ('South Korea', '2025-12-25', 'Christmas Day'),
  ('South Korea', '2026-01-01', 'New Year''s Day'),
  ('South Korea', '2026-02-17', 'Seollal'),
  ('South Korea', '2026-02-18', 'Seollal'),
  ('South Korea', '2026-03-01', 'Independence Movement Day'),
  ('South Korea', '2026-05-05', 'Children''s Day'),
  ('South Korea', '2026-05-25', 'Buddha''s Birthday'),
  ('South Korea', '2026-06-06', 'Memorial Day'),
  ('South Korea', '2026-08-15', 'Liberation Day'),
  ('South Korea', '2026-09-15', 'Chuseok'),
  ('South Korea', '2026-09-16', 'Chuseok'),
  ('South Korea', '2026-10-03', 'National Foundation Day'),
  ('South Korea', '2026-10-09', 'Hangeul Day'),
  ('South Korea', '2026-12-25', 'Christmas Day'),
  -- Vietnam
  ('Vietnam', '2025-01-01', 'New Year''s Day'),
  ('Vietnam', '2025-01-28', 'Tet Holiday'),
  ('Vietnam', '2025-01-29', 'Tet Holiday'),
  ('Vietnam', '2025-01-30', 'Tet Holiday'),
  ('Vietnam', '2025-04-07', 'Hung Kings Festival'),
  ('Vietnam', '2025-04-30', 'Reunification Day'),
  ('Vietnam', '2025-05-01', 'Labour Day'),
  ('Vietnam', '2025-09-01', 'National Day'),
  ('Vietnam', '2026-01-01', 'New Year''s Day'),
  ('Vietnam', '2026-02-17', 'Tet Holiday'),
  ('Vietnam', '2026-02-18', 'Tet Holiday'),
  ('Vietnam', '2026-02-19', 'Tet Holiday'),
  ('Vietnam', '2026-04-07', 'Hung Kings Festival'),
  ('Vietnam', '2026-04-30', 'Reunification Day'),
  ('Vietnam', '2026-05-01', 'Labour Day'),
  ('Vietnam', '2026-09-01', 'National Day'),
  -- Thailand
  ('Thailand', '2025-01-01', 'New Year''s Day'),
  ('Thailand', '2025-04-06', 'Chakri Day'),
  ('Thailand', '2025-04-13', 'Songkran'),
  ('Thailand', '2025-04-14', 'Songkran'),
  ('Thailand', '2025-04-15', 'Songkran'),
  ('Thailand', '2025-05-01', 'Labour Day'),
  ('Thailand', '2025-05-12', 'Royal Ploughing Ceremony'),
  ('Thailand', '2025-06-03', 'Queen''s Birthday'),
  ('Thailand', '2025-07-28', 'King''s Birthday'),
  ('Thailand', '2025-08-12', 'Mother''s Day'),
  ('Thailand', '2025-10-23', 'Chulalongkorn Day'),
  ('Thailand', '2025-12-05', 'Father''s Day'),
  ('Thailand', '2025-12-10', 'Constitution Day'),
  ('Thailand', '2025-12-25', 'Christmas Day'),
  ('Thailand', '2026-01-01', 'New Year''s Day'),
  ('Thailand', '2026-04-06', 'Chakri Day'),
  ('Thailand', '2026-04-13', 'Songkran'),
  ('Thailand', '2026-04-14', 'Songkran'),
  ('Thailand', '2026-04-15', 'Songkran'),
  ('Thailand', '2026-05-01', 'Labour Day'),
  ('Thailand', '2026-06-03', 'Queen''s Birthday'),
  ('Thailand', '2026-07-28', 'King''s Birthday'),
  ('Thailand', '2026-08-12', 'Mother''s Day'),
  ('Thailand', '2026-10-23', 'Chulalongkorn Day'),
  ('Thailand', '2026-12-05', 'Father''s Day'),
  ('Thailand', '2026-12-10', 'Constitution Day'),
  ('Thailand', '2026-12-25', 'Christmas Day'),
  -- Taiwan
  ('Taiwan', '2025-01-01', 'Foundation Day'),
  ('Taiwan', '2025-01-28', 'Spring Festival'),
  ('Taiwan', '2025-01-29', 'Spring Festival'),
  ('Taiwan', '2025-02-28', 'Peace Memorial Day'),
  ('Taiwan', '2025-04-04', 'Children''s Day'),
  ('Taiwan', '2025-04-04', 'Tomb Sweeping Day'),
  ('Taiwan', '2025-05-01', 'Labour Day'),
  ('Taiwan', '2025-05-31', 'Dragon Boat Festival'),
  ('Taiwan', '2025-10-01', 'Mid-Autumn Festival'),
  ('Taiwan', '2025-10-10', 'National Day'),
  ('Taiwan', '2026-01-01', 'Foundation Day'),
  ('Taiwan', '2026-02-17', 'Spring Festival'),
  ('Taiwan', '2026-02-18', 'Spring Festival'),
  ('Taiwan', '2026-02-28', 'Peace Memorial Day'),
  ('Taiwan', '2026-04-04', 'Children''s Day'),
  ('Taiwan', '2026-04-04', 'Tomb Sweeping Day'),
  ('Taiwan', '2026-05-01', 'Labour Day'),
  ('Taiwan', '2026-06-19', 'Dragon Boat Festival'),
  ('Taiwan', '2026-10-10', 'National Day'),
  -- Canada
  ('Canada', '2025-01-01', 'New Year''s Day'),
  ('Canada', '2025-02-17', 'Family Day'),
  ('Canada', '2025-04-18', 'Good Friday'),
  ('Canada', '2025-05-19', 'Victoria Day'),
  ('Canada', '2025-07-01', 'Canada Day'),
  ('Canada', '2025-09-01', 'Labour Day'),
  ('Canada', '2025-10-13', 'Thanksgiving'),
  ('Canada', '2025-11-11', 'Remembrance Day'),
  ('Canada', '2025-12-25', 'Christmas Day'),
  ('Canada', '2025-12-26', 'Boxing Day'),
  ('Canada', '2026-01-01', 'New Year''s Day'),
  ('Canada', '2026-02-16', 'Family Day'),
  ('Canada', '2026-04-03', 'Good Friday'),
  ('Canada', '2026-05-18', 'Victoria Day'),
  ('Canada', '2026-07-01', 'Canada Day'),
  ('Canada', '2026-09-07', 'Labour Day'),
  ('Canada', '2026-10-12', 'Thanksgiving'),
  ('Canada', '2026-11-11', 'Remembrance Day'),
  ('Canada', '2026-12-25', 'Christmas Day'),
  ('Canada', '2026-12-26', 'Boxing Day'),
  -- New Zealand
  ('New Zealand', '2025-01-01', 'New Year''s Day'),
  ('New Zealand', '2025-01-02', 'Day after New Year'),
  ('New Zealand', '2025-02-06', 'Waitangi Day'),
  ('New Zealand', '2025-04-18', 'Good Friday'),
  ('New Zealand', '2025-04-21', 'Easter Monday'),
  ('New Zealand', '2025-04-25', 'Anzac Day'),
  ('New Zealand', '2025-06-02', 'King''s Birthday'),
  ('New Zealand', '2025-10-27', 'Labour Day'),
  ('New Zealand', '2025-12-25', 'Christmas Day'),
  ('New Zealand', '2025-12-26', 'Boxing Day'),
  ('New Zealand', '2026-01-01', 'New Year''s Day'),
  ('New Zealand', '2026-01-02', 'Day after New Year'),
  ('New Zealand', '2026-02-06', 'Waitangi Day'),
  ('New Zealand', '2026-04-03', 'Good Friday'),
  ('New Zealand', '2026-04-06', 'Easter Monday'),
  ('New Zealand', '2026-04-25', 'Anzac Day'),
  ('New Zealand', '2026-06-01', 'King''s Birthday'),
  ('New Zealand', '2026-10-26', 'Labour Day'),
  ('New Zealand', '2026-12-25', 'Christmas Day'),
  ('New Zealand', '2026-12-26', 'Boxing Day'),
  -- Sri Lanka
  ('Sri Lanka', '2025-01-01', 'New Year''s Day'),
  ('Sri Lanka', '2025-01-14', 'Tamil Thai Pongal'),
  ('Sri Lanka', '2025-02-04', 'Independence Day'),
  ('Sri Lanka', '2025-03-31', 'Eid ul-Fitr'),
  ('Sri Lanka', '2025-04-11', 'Good Friday'),
  ('Sri Lanka', '2025-04-13', 'Sinhala & Tamil New Year'),
  ('Sri Lanka', '2025-04-14', 'Sinhala & Tamil New Year'),
  ('Sri Lanka', '2025-05-01', 'Labour Day'),
  ('Sri Lanka', '2025-05-12', 'Vesak Full Moon'),
  ('Sri Lanka', '2025-06-07', 'Eid al-Adha'),
  ('Sri Lanka', '2025-12-25', 'Christmas Day'),
  ('Sri Lanka', '2026-01-01', 'New Year''s Day'),
  ('Sri Lanka', '2026-01-14', 'Tamil Thai Pongal'),
  ('Sri Lanka', '2026-02-04', 'Independence Day'),
  ('Sri Lanka', '2026-03-20', 'Eid ul-Fitr'),
  ('Sri Lanka', '2026-04-03', 'Good Friday'),
  ('Sri Lanka', '2026-04-13', 'Sinhala & Tamil New Year'),
  ('Sri Lanka', '2026-04-14', 'Sinhala & Tamil New Year'),
  ('Sri Lanka', '2026-05-01', 'Labour Day'),
  ('Sri Lanka', '2026-05-01', 'Vesak Full Moon'),
  ('Sri Lanka', '2026-05-27', 'Eid al-Adha'),
  ('Sri Lanka', '2026-12-25', 'Christmas Day'),
  -- Myanmar
  ('Myanmar', '2025-01-04', 'Independence Day'),
  ('Myanmar', '2025-02-12', 'Union Day'),
  ('Myanmar', '2025-03-02', 'Peasants Day'),
  ('Myanmar', '2025-03-27', 'Armed Forces Day'),
  ('Myanmar', '2025-04-13', 'Thingyan'),
  ('Myanmar', '2025-04-14', 'Thingyan'),
  ('Myanmar', '2025-04-15', 'Thingyan'),
  ('Myanmar', '2025-04-16', 'Thingyan'),
  ('Myanmar', '2025-05-01', 'Labour Day'),
  ('Myanmar', '2025-07-19', 'Martyrs Day'),
  ('Myanmar', '2025-12-25', 'Christmas Day'),
  ('Myanmar', '2026-01-04', 'Independence Day'),
  ('Myanmar', '2026-02-12', 'Union Day'),
  ('Myanmar', '2026-03-02', 'Peasants Day'),
  ('Myanmar', '2026-03-27', 'Armed Forces Day'),
  ('Myanmar', '2026-04-13', 'Thingyan'),
  ('Myanmar', '2026-04-14', 'Thingyan'),
  ('Myanmar', '2026-04-15', 'Thingyan'),
  ('Myanmar', '2026-04-16', 'Thingyan'),
  ('Myanmar', '2026-05-01', 'Labour Day'),
  ('Myanmar', '2026-07-19', 'Martyrs Day'),
  ('Myanmar', '2026-12-25', 'Christmas Day'),
  -- Saudi Arabia
  ('Saudi Arabia', '2025-03-30', 'Eid al-Fitr'),
  ('Saudi Arabia', '2025-03-31', 'Eid al-Fitr'),
  ('Saudi Arabia', '2025-04-01', 'Eid al-Fitr'),
  ('Saudi Arabia', '2025-06-06', 'Eid al-Adha'),
  ('Saudi Arabia', '2025-06-07', 'Eid al-Adha'),
  ('Saudi Arabia', '2025-06-08', 'Eid al-Adha'),
  ('Saudi Arabia', '2025-09-22', 'Saudi National Day'),
  ('Saudi Arabia', '2026-03-19', 'Eid al-Fitr'),
  ('Saudi Arabia', '2026-03-20', 'Eid al-Fitr'),
  ('Saudi Arabia', '2026-03-21', 'Eid al-Fitr'),
  ('Saudi Arabia', '2026-05-26', 'Eid al-Adha'),
  ('Saudi Arabia', '2026-05-27', 'Eid al-Adha'),
  ('Saudi Arabia', '2026-05-28', 'Eid al-Adha'),
  ('Saudi Arabia', '2026-09-22', 'Saudi National Day'),
  -- Dubai (UAE)
  ('Dubai', '2025-01-01', 'New Year''s Day'),
  ('Dubai', '2025-03-30', 'Eid al-Fitr'),
  ('Dubai', '2025-03-31', 'Eid al-Fitr'),
  ('Dubai', '2025-04-01', 'Eid al-Fitr'),
  ('Dubai', '2025-06-06', 'Eid al-Adha'),
  ('Dubai', '2025-06-07', 'Eid al-Adha'),
  ('Dubai', '2025-06-08', 'Eid al-Adha'),
  ('Dubai', '2025-12-01', 'National Day'),
  ('Dubai', '2025-12-02', 'National Day'),
  ('Dubai', '2025-12-03', 'National Day'),
  ('Dubai', '2026-01-01', 'New Year''s Day'),
  ('Dubai', '2026-03-19', 'Eid al-Fitr'),
  ('Dubai', '2026-03-20', 'Eid al-Fitr'),
  ('Dubai', '2026-03-21', 'Eid al-Fitr'),
  ('Dubai', '2026-05-26', 'Eid al-Adha'),
  ('Dubai', '2026-05-27', 'Eid al-Adha'),
  ('Dubai', '2026-05-28', 'Eid al-Adha'),
  ('Dubai', '2026-12-01', 'National Day'),
  ('Dubai', '2026-12-02', 'National Day'),
  ('Dubai', '2026-12-03', 'National Day')
ON CONFLICT DO NOTHING;

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  manager_id BIGINT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Full access for all" ON departments FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON departments TO anon, authenticated;
GRANT USAGE ON SEQUENCE departments_id_seq TO anon, authenticated;

ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_id BIGINT REFERENCES departments(id) ON DELETE SET NULL;

-- Seed default departments for existing companies (run manually if needed)
-- INSERT INTO departments (company_id, name) SELECT id, 'General' FROM companies;

-- Company code for login
ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_company_code ON companies(company_code);

-- Username unique per company
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_company_unique;
ALTER TABLE users ADD CONSTRAINT users_username_company_unique UNIQUE (username, company_id);

-- Storage bucket policies (run in Supabase SQL editor under Storage tab)
-- Create the company-files bucket first in Supabase dashboard or via:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('company-files', 'company-files', true) ON CONFLICT DO NOTHING;
-- Then run these policies:
CREATE POLICY "Allow all on company-files" ON storage.objects FOR ALL TO public USING (bucket_id = 'company-files') WITH CHECK (bucket_id = 'company-files');
