import { Typography, Tabs, Alert } from 'antd';
import { useAuth } from '../../../contexts/AuthContext';
import { EmployeesTab } from './hr/EmployeesTab';
import { LeaveTab } from './hr/LeaveTab';
import { ApprovalsTab } from './hr/ApprovalsTab';
import { LeaveTypesTab } from './hr/LeaveTypesTab';
import { BalancesTab } from './hr/BalancesTab';
import { PayrollTab } from './hr/PayrollTab';
import { useCompanyAccess } from '../../../contexts/CompanyAccess';

const { Title } = Typography;

export function CompanyHRPage() {
  const { companyId } = useAuth();
  const access = useCompanyAccess();
  const canViewPay = access.canViewPay;
  const canManageStaff = access.can('employees', 'edit');
  const canApprove = access.can('leave', 'approve');
  const canSeeStaff = canManageStaff || access.can('employees');
  if (!companyId) return <Alert type="error" message="No company context" />;

  return (
    <div>
      <Title level={4} style={{ color: '#f0ede6', marginBottom: 16 }}>HR</Title>
      <Tabs
        items={[
          { key: 'leave', label: 'My Leave', children: <LeaveTab companyId={companyId} /> },
          ...(canApprove ? [{ key: 'approvals', label: 'Approvals', children: <ApprovalsTab companyId={companyId} /> }] : []),
          ...(canViewPay ? [{ key: 'payroll', label: 'Payroll', children: <PayrollTab companyId={companyId} /> }] : []),
          ...(canSeeStaff ? [{ key: 'employees', label: 'Employees', children: <EmployeesTab companyId={companyId} /> }] : []),
          ...(canManageStaff ? [
            { key: 'balances', label: 'Leave Balances', children: <BalancesTab companyId={companyId} /> },
            { key: 'types', label: 'Leave Types', children: <LeaveTypesTab companyId={companyId} /> },
          ] : []),
        ]}
      />
    </div>
  );
}
