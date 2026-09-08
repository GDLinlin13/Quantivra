import { Typography } from 'antd';
const { Title, Text } = Typography;
export function CompanyInventoryPage() {
  return (
    <div>
      <Title level={4} style={{ color: '#f0ede6' }}>Inventory</Title>
      <Text style={{ color: 'rgba(240,237,230,0.4)' }}>Products, Stock, Warehouses, Transfers, Adjustments</Text>
    </div>
  );
}
