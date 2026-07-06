-- Run this SQL in your Supabase project SQL editor
-- Creates all tables for the Accounting & HR app with multi-role, super admin, claims

-- Companies
CREATE TABLE IF NOT EXISTS companies (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
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
  carry_forward INTEGER DEFAULT 0
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
  year INTEGER NOT NULL
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
CREATE POLICY "Full access for all" ON payroll_records FOR ALL USING (true) WITH CHECK (true);
