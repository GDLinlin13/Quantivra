import { UserRole } from '../types';

export function hasRole(userRoles: UserRole[] | undefined, role: UserRole): boolean {
  if (!userRoles) return false;
  return userRoles.includes(role);
}

export function hasAnyRole(userRoles: UserRole[] | undefined, roles: UserRole[]): boolean {
  if (!userRoles) return false;
  return roles.some(r => userRoles.includes(r));
}

export function can(permission: string, userRoles: UserRole[] | undefined): boolean {
  if (!userRoles) return false;
  if (userRoles.includes('master')) return true;

  const permissions: Record<string, UserRole[]> = {
    // HR modules
    'employee.create': ['hr'],
    'employee.edit': ['hr'],
    'employee.view_all': ['hr'],
    'employee.documents': ['hr', 'employee'],
    'leave.approve': ['hr'],
    'leave.view_all': ['hr'],
    'claim.approve': ['hr'],
    'claim.view_all': ['hr'],
    'attendance.manage': ['hr'],
    'performance.manage': ['hr'],
    'training.manage': ['hr'],
    'recruitment.manage': ['hr'],
    'recruitment.view': ['hr'],
    'documents.manage': ['hr'],
    'user.manage': ['hr'],

    // Employee self-service
    'leave.apply': ['employee'],
    'claim.apply': ['employee'],
    'attendance.view': ['employee'],
    'performance.view': ['employee', 'hr'],
    'training.view': ['employee', 'hr'],
    'documents.view': ['employee'],

    // Accounting/Finance modules
    'payroll.run': ['accountant'],
    'payroll.view': ['accountant'],
    'accounting.manage': ['accountant'],
    'accounting.view': ['accountant'],
    'invoice.create': ['accountant'],
    'invoice.manage': ['accountant'],
    'invoice.view': ['accountant'],
    'supplier_invoice.manage': ['accountant'],
    'supplier_invoice.view': ['accountant'],
    'banking.view': ['accountant'],
    'banking.manage': ['accountant'],
    'tax.view': ['accountant'],
    'tax.manage': ['accountant'],
    'reports.view': ['accountant'],

    // Master only
    'company.settings': ['master'],
  };

  const allowedRoles = permissions[permission];
  if (!allowedRoles) return false;
  return allowedRoles.some(r => userRoles.includes(r));
}

export function canApproveLeave(userRoles: UserRole[] | undefined, isManager: boolean): boolean {
  if (!userRoles) return false;
  if (userRoles.includes('master')) return true;
  if (isManager) return true;
  return can('leave.approve', userRoles);
}
