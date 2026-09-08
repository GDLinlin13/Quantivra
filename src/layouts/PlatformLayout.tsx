import { Layout, Menu, Button, Typography } from 'antd';
import {
  DashboardOutlined, BuildOutlined, GlobalOutlined,
  AppstoreOutlined, AuditOutlined, SettingOutlined,
  LogoutOutlined, UserOutlined,
} from '@ant-design/icons';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const { Sider, Content } = Layout;
const { Text } = Typography;

export function PlatformLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const menuItems = [
    { key: '/platform', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/platform/companies', icon: <BuildOutlined />, label: 'Companies' },
    { key: '/platform/country-packs', icon: <GlobalOutlined />, label: 'Country Packs' },
    { key: '/platform/business-packs', icon: <AppstoreOutlined />, label: 'Business Packs' },
    { key: '/platform/users', icon: <UserOutlined />, label: 'Users' },
    { key: '/platform/audit', icon: <AuditOutlined />, label: 'Audit Log' },
    { key: '/platform/settings', icon: <SettingOutlined />, label: 'Settings' },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: '#0b0f12' }}>
      <style>{`
        @keyframes letterShift {
          0%   { color: #ff9aa2; text-shadow: 0 0 20px #ff9aa2, 0 0 40px #ff9aa260; }
          14%  { color: #ffb7b2; text-shadow: 0 0 20px #ffb7b2, 0 0 40px #ffb7b260; }
          28%  { color: #ffdac1; text-shadow: 0 0 20px #ffdac1, 0 0 40px #ffdac160; }
          42%  { color: #e2f0cb; text-shadow: 0 0 20px #e2f0cb, 0 0 40px #e2f0cb60; }
          57%  { color: #b5ead7; text-shadow: 0 0 20px #b5ead7, 0 0 40px #b5ead760; }
          71%  { color: #c7ceea; text-shadow: 0 0 20px #c7ceea, 0 0 40px #c7ceea60; }
          85%  { color: #f0c7e8; text-shadow: 0 0 20px #f0c7e8, 0 0 40px #f0c7e860; }
          100% { color: #f6c445; text-shadow: 0 0 20px #f6c445, 0 0 40px #f6c44560; }
        }
        .atlas-title span {
          display: inline-block;
          animation: letterShift 3s ease-in-out infinite;
        }
        .atlas-title span:nth-child(1) { animation-delay: 0s; }
        .atlas-title span:nth-child(2) { animation-delay: 0.1s; }
        .atlas-title span:nth-child(3) { animation-delay: 0.2s; }
        .atlas-title span:nth-child(4) { animation-delay: 0.3s; }
        .atlas-title span:nth-child(5) { animation-delay: 0.4s; }
        .atlas-title span:nth-child(6) { animation-delay: 0.5s; }
        .atlas-title span:nth-child(7) { animation-delay: 0.6s; }
        .atlas-title span:nth-child(8) { animation-delay: 0.7s; }
        .atlas-title span:nth-child(9) { animation-delay: 0.8s; }
        .atlas-title span:nth-child(10) { animation-delay: 0.9s; }
      `}</style>
      <Sider
        theme="dark"
        width={220}
        style={{ background: '#111518', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
          <div className="atlas-title" style={{ fontSize: 16, fontWeight: 800, letterSpacing: 4, display: 'flex', gap: 2 }}>
            {'ATLAS CORE'.split('').map((ch, i) => <span key={i}>{ch === ' ' ? '\u00A0' : ch}</span>)}
          </div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ background: 'transparent', borderRight: 'none', flex: 1 }}
        />
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px 16px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => { logout(); navigate('/login'); }}>
          <LogoutOutlined style={{ color: 'rgba(240,237,230,0.4)', fontSize: 14 }} />
          <Text style={{ color: 'rgba(240,237,230,0.4)', fontSize: 13, marginLeft: 10 }}>LOGOUT</Text>
        </div>
      </Sider>
      <Layout style={{ background: '#0b0f12' }}>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
