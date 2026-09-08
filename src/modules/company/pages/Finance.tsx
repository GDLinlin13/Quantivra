import { Typography } from 'antd';
const { Title, Text } = Typography;
export function CompanyFinancePage() {
  return (
    <div>
      <Title level={4} style={{ color: '#f0ede6' }}>Finance</Title>
      <Text style={{ color: 'rgba(240,237,230,0.4)' }}>Chart of Accounts, Customers, Suppliers, Sales, Purchases, Banking</Text>
    </div>
  );
}
