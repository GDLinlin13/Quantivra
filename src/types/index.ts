export interface Company {
  id: number;
  name: string;
  address?: string;
  country: string;
  currency: string;
  tax_system?: string;
  fiscal_year_start?: string;
  fiscal_year_end?: string;
  phone?: string;
  email?: string;
  website?: string;
  registration_number?: string;
  tax_id?: string;
  logo_url?: string;
  is_active?: number;
  created_at?: string;
}

export type UserRole = 'superadmin' | 'admin' | 'hr' | 'accountant' | 'manager' | 'employee';

export interface User {
  id: number;
  company_id?: number;
  email: string;
  full_name: string;
  roles: UserRole[];
  is_super_admin?: number;
  phone?: string;
  is_active?: number;
  companies?: Company;
}

export interface Employee {
  id: number;
  company_id: number;
  user_id?: number;
  employee_code: string;
  full_name: string;
  email?: string;
  phone?: string;
  department?: string;
  position?: string;
  join_date?: string;
  salary?: number;
  bank_name?: string;
  bank_account?: string;
  tax_id?: string;
  address?: string;
  emergency_contact?: string;
  status: 'active' | 'inactive' | 'terminated';
}

export interface LeaveType {
  id: number;
  company_id: number;
  name: string;
  days_per_year: number;
  is_paid?: number;
  carry_forward?: number;
}

export interface LeaveRequest {
  id: number;
  employee_id: number;
  leave_type_id: number;
  start_date: string;
  end_date: string;
  days: number;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approved_by?: number;
  approved_at?: string;
  created_at?: string;
  employees?: { full_name: string; department?: string };
  leave_types?: { name: string };
}

export interface LeaveBalance {
  id: number;
  employee_id: number;
  leave_type_id: number;
  total_days: number;
  used_days: number;
  year: number;
}

export interface Claim {
  id: number;
  company_id: number;
  employee_id: number;
  claim_type: 'travel' | 'medical' | 'transport' | 'meals' | 'supplies' | 'other';
  title: string;
  description?: string;
  amount: number;
  receipt_url?: string;
  receipt_name?: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  approved_by?: number;
  approved_at?: string;
  created_at?: string;
  employees?: { full_name: string };
}

export interface Account {
  id: number;
  company_id: number;
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  subtype?: string;
  is_active?: number;
  description?: string;
}

export interface JournalEntry {
  id: number;
  company_id: number;
  entry_date: string;
  reference?: string;
  description: string;
  created_by?: number;
  created_at?: string;
  lines?: JournalLine[];
}

export interface JournalLine {
  id: number;
  journal_entry_id: number;
  account_id: number;
  debit?: number;
  credit?: number;
  description?: string;
  account?: Account;
}

export interface Invoice {
  id: number;
  company_id: number;
  invoice_number: string;
  client_name: string;
  client_email?: string;
  client_address?: string;
  client_tax_id?: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  notes?: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  created_at?: string;
  items?: InvoiceItem[];
}

export interface InvoiceItem {
  id: number;
  invoice_id: number;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface SupplierInvoice {
  id: number;
  company_id: number;
  supplier_name: string;
  invoice_number?: string;
  date: string;
  amount: number;
  tax_amount?: number;
  description?: string;
  file_url?: string;
  file_name?: string;
  status: 'pending' | 'approved' | 'paid' | 'cancelled';
  due_date?: string;
  category?: string;
}

export interface PayrollRecord {
  id: number;
  company_id: number;
  employee_id: number;
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  basic_pay: number;
  allowances: number;
  deductions: number;
  tax_deduction: number;
  other_deductions: number;
  net_pay: number;
  status: 'calculated' | 'paid' | 'cancelled';
  notes?: string;
  employee?: Employee;
}
