import { Typography } from 'antd';
const { Title, Text } = Typography;
export function CompanyReportsPage() {
  return (
    <div>
      <Title level={4} style={{ color: '#f0ede6' }}>Reports</Title>
      <Text style={{ color: 'rgba(240,237,230,0.4)' }}>Financial, HR, Payroll, Inventory, Sales reports</Text>
    </div>
  );
}
