import { Typography } from 'antd';
const { Title, Text } = Typography;
export function CompanyCRMPage() {
  return (
    <div>
      <Title level={4} style={{ color: '#f0ede6' }}>CRM</Title>
      <Text style={{ color: 'rgba(240,237,230,0.4)' }}>Contacts, Leads, Opportunities, Activities</Text>
    </div>
  );
}
