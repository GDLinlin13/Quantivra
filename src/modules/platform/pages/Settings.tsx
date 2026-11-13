import { Typography } from 'antd';
import { ChangePasswordCard } from '../../../components/ChangePasswordCard';

const { Title } = Typography;

export function PlatformSettingsPage() {
  return (
    <div>
      <Title level={4} style={{ color: '#f0ede6', marginBottom: 24 }}>Settings</Title>
      <ChangePasswordCard />
    </div>
  );
}
