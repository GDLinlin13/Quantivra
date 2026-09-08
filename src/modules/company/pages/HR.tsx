import { Typography, Tabs, Alert } from 'antd';
import { useAuth } from '../../../contexts/AuthContext';
import { EmployeesTab } from './hr/EmployeesTab';
import { LeaveTab } from './hr/LeaveTab';
import { ApprovalsTab } from './hr/ApprovalsTab';
import { LeaveTypesTab } from './hr/LeaveTypesTab';
import { PayrollTab } from './hr/PayrollTab';

const { Title } = Typography;

export function CompanyHRPage() {
  const { companyId } = useAuth();
  if (!companyId) return <Alert type="error" message="No company context" />;

  return (
    <div>
      <Title level={4} style={{ color: '#f0ede6', marginBottom: 16 }}>HR</Title>
      <Tabs
        items={[
          { key: 'leave', label: 'My Leave', children: <LeaveTab companyId={companyId} /> },
          { key: 'approvals', label: 'Approvals', children: <ApprovalsTab companyId={companyId} /> },
          { key: 'payroll', label: 'Payroll', children: <PayrollTab companyId={companyId} /> },
          { key: 'employees', label: 'Employees', children: <EmployeesTab companyId={companyId} /> },
          { key: 'types', label: 'Leave Types', children: <LeaveTypesTab companyId={companyId} /> },
        ]}
      />
    </div>
  );
}
