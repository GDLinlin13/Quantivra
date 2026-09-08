import { useState } from 'react';
import { Layout, Menu, Button, Avatar, Dropdown, Typography } from 'antd';
import {
  DashboardOutlined, TeamOutlined, UserOutlined, SafetyOutlined,
  SettingOutlined, LogoutOutlined, BankOutlined, AuditOutlined,
  FileOutlined, BellOutlined, DollarOutlined, ShopOutlined,
  ContactsOutlined, BarChartOutlined, PartitionOutlined,
} from '@ant-design/icons';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export function CompanyLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, companyId } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const mainMenu = [
    { key: '/company', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/company/hr', icon: <TeamOutlined />, label: 'HR' },
    { key: '/company/finance', icon: <DollarOutlined />, label: 'Finance' },
    { key: '/company/inventory', icon: <ShopOutlined />, label: 'Inventory' },
    { key: '/company/crm', icon: <ContactsOutlined />, label: 'CRM' },
    { key: '/company/reports', icon: <BarChartOutlined />, label: 'Reports' },
  ];

  const adminMenu = [
    { key: '/company/settings', icon: <SettingOutlined />, label: 'Settings' },
    { key: '/company/profile', icon: <BankOutlined />, label: 'Company Profile' },
    { key: '/company/users', icon: <UserOutlined />, label: 'Users' },
    { key: '/company/roles', icon: <SafetyOutlined />, label: 'Roles' },
    { key: '/company/audit', icon: <AuditOutlined />, label: 'Audit' },
    { key: '/company/files', icon: <FileOutlined />, label: 'Documents' },
  ];

  const userMenu = {
    items: [
      { key: 'profile', icon: <UserOutlined />, label: 'My Profile' },
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: 'Sign Out', danger: true },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'logout') { logout(); navigate('/login'); }
    },
  };

  return (
    <Layout style={{ minHeight: '100vh', background: '#0b0f12' }}>
      <Sider
        theme="dark"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{ background: '#111518', borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <BankOutlined style={{ fontSize: 24, color: '#4fc3f7' }} />
          {!collapsed && <Text style={{ color: '#f0ede6', fontSize: 16, fontWeight: 600 }}>Portal</Text>}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={mainMenu}
          onClick={({ key }) => navigate(key)}
          style={{ background: 'transparent', borderRight: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 8 }}
        />
        {!collapsed && <Text style={{ color: 'rgba(240,237,230,0.3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, padding: '8px 16px 4px', display: 'block' }}>Admin</Text>}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={adminMenu}
          onClick={({ key }) => navigate(key)}
          style={{ background: 'transparent', borderRight: 'none' }}
        />
      </Sider>
      <Layout style={{ background: '#0b0f12' }}>
        <Header style={{
          background: '#111518', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '0 24px', height: 64, gap: 16,
        }}>
          <Button type="text" icon={<BellOutlined />} style={{ color: '#f0ede6' }} />
          <Dropdown menu={userMenu} placement="bottomRight">
            <Button type="text" style={{ color: '#f0ede6', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar size="small" icon={<UserOutlined />} style={{ background: '#4fc3f7', color: '#111' }} />
              {user?.full_name}
            </Button>
          </Dropdown>
        </Header>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
