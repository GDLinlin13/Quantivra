import { SWITCHABLE_MODULES } from './permissionGuide';
import { MODULES } from '../types';

/** The sections a company can have (the Dashboard, Company, Users and Settings are always there). */
export const ALL_FEATURES_MODULES = SWITCHABLE_MODULES;
export const moduleLabel = (key: string) => (MODULES as Record<string, { label: string }>)[key]?.label || key;

/** The business packs offered when a company is created: what each switches on. */
export const BUSINESS_PACK_PRESETS: Record<string, { label: string; desc: string; modules: string[] }> = {
  starter: { label: 'Starter', desc: 'Employees, leave and expense claims', modules: ['employees', 'leave', 'claims'] },
  hr_payroll: { label: 'HR & Payroll', desc: 'Everything in Starter, plus payroll and attendance', modules: ['employees', 'payroll', 'leave', 'attendance', 'claims'] },
  finance: { label: 'Finance', desc: 'Invoices, bills, purchase orders, payments, banking, accounting, fixed assets and reports', modules: ['finance'] },
  trading: { label: 'Trading', desc: 'Finance, plus the product and price catalog with stock, and customers (CRM)', modules: ['finance', 'inventory', 'crm'] },
  enterprise: { label: 'Enterprise', desc: 'Every section, including Projects and Workflow (approval chains)', modules: ALL_FEATURES_MODULES },
};
