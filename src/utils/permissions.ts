import { UserRole } from '../types';

export function hasRole(userRoles: UserRole[] | undefined, role: UserRole): boolean {
  if (!userRoles) return false;
  return userRoles.includes(role);
}

export function hasAnyRole(userRoles: UserRole[] | undefined, roles: UserRole[]): boolean {
  if (!userRoles) return false;
  return roles.some(r => userRoles.includes(r));
}

export function can(permission: string, userRoles: UserRole[] | undefined, isSuperAdmin?: boolean): boolean {
  if (isSuperAdmin) return true;
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

    // Payroll (HR function)
    'payroll.run': ['hr'],
    'payroll.view': ['hr'],

    // Employee self-service
    'leave.apply': ['employee'],
    'claim.apply': ['employee'],
    'attendance.view': ['employee'],
    'performance.view': ['employee', 'hr'],
    'training.view': ['employee', 'hr'],
    'documents.view': ['employee'],

    // Accounting/Finance modules
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

  // Primary role check
  if (!allowedRoles.some(r => userRoles.includes(r))) return false;

  // Approval actions also require the 'employee' role (prevents outsourced-only users from approving)
  const approvalPermissions = ['leave.approve', 'claim.approve'];
  if (approvalPermissions.includes(permission) && !userRoles.includes('employee')) return false;

  // Granular sub-role checks
  // account:view_only → can view but not manage/create/edit/delete
  // hr:leave_approve → required for leave approval
  // hr:payroll → required for payroll access
  const viewOnlyExclude = ['accountant:view_only'] as UserRole[];
  const requireSubRole: Record<string, UserRole[]> = {
    'leave.approve': ['hr:leave_approve'],
    'payroll.run': ['hr:payroll'],
    'payroll.view': ['hr:payroll'],
  };
  const excludeSubRole: Record<string, UserRole[]> = {
    'accounting.manage': viewOnlyExclude,
    'invoice.create': viewOnlyExclude,
    'invoice.manage': viewOnlyExclude,
    'supplier_invoice.manage': viewOnlyExclude,
    'banking.manage': viewOnlyExclude,
    'tax.manage': viewOnlyExclude,
  };

  const required = requireSubRole[permission];
  if (required && !required.some(r => userRoles.includes(r))) return false;

  const excluded = excludeSubRole[permission];
  if (excluded && excluded.some(r => userRoles.includes(r))) return false;

  return true;
}

export function canApproveLeave(userRoles: UserRole[] | undefined, isManager: boolean, isSuperAdmin?: boolean): boolean {
  if (isSuperAdmin) return true;
  if (!userRoles) return false;
  if (userRoles.includes('master')) return true;
  if (isManager) return true;
  return can('leave.approve', userRoles);
}
