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
  company_code?: string;
  incorporation_date?: string;
  business_certificate_url?: string;
  business_certificate_name?: string;
  access_hr?: boolean;
  access_accounting?: boolean;
  enable_attendance?: boolean;
  enable_training?: boolean;
  enable_recruitment?: boolean;
  enable_performance?: boolean;
  enable_documents?: boolean;
  is_active?: number;
  created_at?: string;
}

export type UserRole = 'master' | 'hr' | 'accountant' | 'employee' | 'hr:leave_approve' | 'hr:payroll' | 'accountant:view_only';

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

export interface Department {
  id: number;
  name: string;
  created_at?: string;
}

export interface CompanyDepartment {
  company_id: number;
  department_id: number;
  manager_id?: number;
  created_at?: string;
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
  department_id?: number;
  position?: string;
  join_date?: string;
  salary?: number;
  bank_name?: string;
  bank_account?: string;
  tax_id?: string;
  address?: string;
  emergency_contact?: string;
  employment_type?: 'full_time' | 'part_time';
  status: 'active' | 'inactive' | 'terminated';
}

export interface LeaveType {
  id: number;
  company_id: number;
  name: string;
  days_per_year: number;
  is_paid?: number;
  carry_forward?: number;
  carry_forward_max_days?: number;
  carry_forward_expiry_months?: number;
  include_weekends?: number;
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
  is_carry_forward?: number;
  expiry_date?: string;
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

export interface PublicHoliday {
  id: number;
  country: string;
  date: string;
  name: string;
}

export interface StatutoryDeduction {
  id: number;
  country: string;
  name: string;
  description?: string;
  employee_rate: number;
  employer_rate: number;
  cap_amount?: number;
}

export interface CompanyStatutoryDeduction {
  id: number;
  company_id: number;
  deduction_name: string;
  employee_rate: number;
  employer_rate: number;
  cap_amount?: number;
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
