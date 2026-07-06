import { UserRole } from '../types';

const ROLE_HIERARCHY: Record<UserRole, number> = {
  superadmin: 100,
  admin: 80,
  manager: 60,
  hr: 50,
  accountant: 50,
  employee: 20,
};

export function hasRole(userRoles: UserRole[] | undefined, role: UserRole): boolean {
  if (!userRoles) return false;
  return userRoles.includes(role);
}

export function hasAnyRole(userRoles: UserRole[] | undefined, roles: UserRole[]): boolean {
  if (!userRoles) return false;
  return roles.some(r => userRoles.includes(r));
}

export function isSuperAdmin(userRoles: UserRole[] | undefined): boolean {
  return hasRole(userRoles, 'superadmin');
}

export function can(permission: string, userRoles: UserRole[] | undefined): boolean {
  if (!userRoles) return false;
  if (userRoles.includes('superadmin')) return true;

  const permissions: Record<string, UserRole[]> = {
    'leave.apply': ['employee', 'manager', 'hr', 'admin'],
    'leave.approve': ['hr', 'admin', 'manager'],
    'leave.view_all': ['hr', 'admin', 'manager'],
    'employee.create': ['hr', 'admin'],
    'employee.edit': ['hr', 'admin'],
    'employee.view_all': ['hr', 'admin', 'manager'],
    'employee.documents': ['hr', 'admin', 'employee'],
    'payroll.run': ['admin', 'accountant'],
    'payroll.view': ['admin', 'accountant', 'hr'],
    'accounting.manage': ['accountant', 'admin'],
    'accounting.view': ['accountant', 'admin', 'hr'],
    'invoice.create': ['accountant', 'admin'],
    'invoice.manage': ['accountant', 'admin'],
    'invoice.view': ['accountant', 'admin', 'hr', 'manager'],
    'supplier_invoice.manage': ['accountant', 'admin'],
    'supplier_invoice.view': ['accountant', 'admin', 'hr'],
    'claim.apply': ['employee', 'manager'],
    'claim.approve': ['admin', 'manager', 'hr'],
    'claim.view_all': ['admin', 'hr', 'accountant'],
    'company.settings': ['admin'],
    'reports.view': ['admin', 'accountant', 'hr', 'manager'],
  };

  const allowedRoles = permissions[permission];
  if (!allowedRoles) return false;
  return allowedRoles.some(r => userRoles.includes(r));
}
