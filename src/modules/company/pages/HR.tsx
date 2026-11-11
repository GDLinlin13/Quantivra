import { Typography, Tabs, Alert } from 'antd';
import { useAuth } from '../../../contexts/AuthContext';
import { EmployeesTab } from './hr/EmployeesTab';
import { LeaveTab } from './hr/LeaveTab';
import { ApprovalsTab } from './hr/ApprovalsTab';
import { LeaveTypesTab } from './hr/LeaveTypesTab';
import { BalancesTab } from './hr/BalancesTab';
import { LeavePolicyTab } from './hr/LeavePolicyTab';
import { PayrollTab } from './hr/PayrollTab';
import { MyClaimsTab, ClaimsTab } from './hr/ClaimsTab';
import { MyAttendanceTab, AttendanceTab } from './hr/AttendanceTab';
import { useCompanyAccess } from '../../../contexts/CompanyAccess';

const { Title } = Typography;

export function CompanyHRPage() {
  const { companyId } = useAuth();
  const access = useCompanyAccess();
  const canViewPay = access.canViewPay;
  const canManageStaff = access.can('employees', 'edit');
  const canManageLeave = (canManageStaff || access.can('leave', 'edit')) && access.isOn('leave');
  const canPayroll = canViewPay && access.isOn('payroll');
  // by tick, or as a line manager / step approver in a Workflow chain
  const canApprove = access.isOn('leave') && (access.can('leave', 'approve') || access.approves.includes('leave'));
  const canSeeStaff = canManageStaff || access.can('employees');
  const canClock = access.can('attendance');
  const canSeeAttendance = ['create', 'edit', 'delete'].some(a => access.can('attendance', a));
  const canClaim = ['view', 'create', 'edit'].some(a => access.can('claims', a));
  const canSeeClaims = ['approve', 'create', 'edit', 'delete'].some(a => access.can('claims', a)) || (access.isOn('claims') && access.approves.includes('claim'));
  if (!companyId) return <Alert type="error" message="No company context" />;

  return (
    <div>
      <Title level={4} style={{ color: '#f0ede6', marginBottom: 16 }}>HR</Title>
      <Tabs
        items={[
          ...(access.can('leave') ? [{ key: 'leave', label: 'My Leave', children: <LeaveTab companyId={companyId} /> }] : []),
          ...(canClock ? [{ key: 'myattendance', label: 'My Attendance', children: <MyAttendanceTab companyId={companyId} /> }] : []),
          ...(canSeeAttendance ? [{ key: 'attendance', label: 'Attendance', children: <AttendanceTab companyId={companyId} /> }] : []),
          ...(canClaim ? [{ key: 'myclaims', label: 'My Claims', children: <MyClaimsTab companyId={companyId} /> }] : []),
          ...(canSeeClaims ? [{ key: 'claims', label: 'Claims', children: <ClaimsTab companyId={companyId} /> }] : []),
          ...(canApprove ? [{ key: 'approvals', label: 'Approvals', children: <ApprovalsTab companyId={companyId} /> }] : []),
          ...(canPayroll ? [{ key: 'payroll', label: 'Payroll', children: <PayrollTab companyId={companyId} /> }] : []),
          ...(canSeeStaff ? [{ key: 'employees', label: 'Employees', children: <EmployeesTab companyId={companyId} /> }] : []),
          ...(canManageLeave ? [
            { key: 'balances', label: 'Leave Balances', children: <BalancesTab companyId={companyId} /> },
            { key: 'types', label: 'Leave Types', children: <LeaveTypesTab companyId={companyId} /> },
            { key: 'policy', label: 'Leave Policy', children: <LeavePolicyTab companyId={companyId} /> },
          ] : []),
        ]}
      />
    </div>
  );
}
