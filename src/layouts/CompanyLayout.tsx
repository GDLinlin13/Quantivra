import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { RainbowTitle } from '../components/RainbowTitle';
import { Layout, Menu, Typography } from 'antd';
import { UserMenu } from '../components/UserMenu';
import { NotificationBell } from '../components/NotificationBell';
import {
  DashboardOutlined, TeamOutlined, UserOutlined, SafetyOutlined,
  SettingOutlined, BankOutlined,
  FileOutlined, DollarOutlined, ShopOutlined,
  ContactsOutlined, PartitionOutlined, ProjectOutlined, } from '@ant-design/icons';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { CompanyAccessProvider, useCompanyAccess } from '../contexts/CompanyAccess';
import { DateFormatProvider } from '../contexts/DateFormat';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export function CompanyLayout() {
  return <CompanyAccessProvider><CompanyLayoutInner /></CompanyAccessProvider>;
}

function CompanyLayoutInner() {
  const access = useCompanyAccess();
  const navigate = useNavigate();
  const location = useLocation();
  const { companyId } = useAuth();
  const [companyName, setCompanyName] = useState<string>('');

  useEffect(() => {
    if (!companyId) return;
    supabase.from('companies').select('name').eq('id', companyId).maybeSingle()
      .then(({ data }) => setCompanyName(data?.name || ''));
  }, [companyId]);
  const [collapsed, setCollapsed] = useState(false);

  // Sections follow the person's roles (Roles page); pay/admin pages need pay access.
  // HR appears when at least one of its tabs would
  const showHR = access.can('leave') || access.can('leave', 'approve') || access.can('leave', 'edit')
    || ['view', 'approve', 'create', 'edit', 'delete'].some(a => access.can('claims', a))
    || (access.isOn('leave') && access.approves.includes('leave')) || (access.isOn('claims') && access.approves.includes('claim'))
    || ['view', 'create', 'edit', 'delete'].some(a => access.can('attendance', a))
    || access.can('employees') || access.can('employees', 'edit')
    || (access.canViewPay && access.isOn('payroll'));
  const mainMenu = [
    { key: '/company', icon: <DashboardOutlined />, label: 'Dashboard' },
    showHR && { key: '/company/hr', icon: <TeamOutlined />, label: 'HR' },
    access.can('finance') && { key: '/company/finance', icon: <DollarOutlined />, label: 'Finance' },
    access.can('inventory') && { key: '/company/catalog', icon: <ShopOutlined />, label: 'Catalog' },
    access.can('crm') && { key: '/company/crm', icon: <ContactsOutlined />, label: 'CRM' },
    access.can('projects') && { key: '/company/projects', icon: <ProjectOutlined />, label: 'Projects' },
    access.can('workflow') && { key: '/company/workflow', icon: <PartitionOutlined />, label: 'Workflow' },
  ].filter(Boolean) as { key: string; icon: React.ReactNode; label: string }[];

  const adminMenu = !access.canViewPay ? [] : [
    { key: '/company/settings', icon: <SettingOutlined />, label: 'Company Settings' },
    { key: '/company/profile', icon: <BankOutlined />, label: 'Document Templates' },
    { key: '/company/users', icon: <UserOutlined />, label: 'Users' },
    { key: '/company/roles', icon: <SafetyOutlined />, label: 'Roles' },
    { key: '/company/files', icon: <FileOutlined />, label: 'Documents' },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: '#0b0f12' }}>
      <Sider
        theme="dark"
        collapsible
        width={240}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{ background: '#111518', borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 12px' }}>
          {collapsed
            ? <RainbowTitle text={(companyName || 'Q').charAt(0)} maxWidth={40} maxFontSize={20} />
            : <RainbowTitle text={companyName || ''} maxWidth={216} />}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={mainMenu}
          onClick={({ key }) => navigate(key)}
          style={{ background: 'transparent', borderRight: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 8 }}
        />
        {!collapsed && adminMenu.length > 0 && <Text style={{ color: 'rgba(240,237,230,0.3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, padding: '8px 16px 4px', display: 'block' }}>Admin</Text>}
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
          {companyId && <NotificationBell companyId={companyId} />}
          <UserMenu />
        </Header>
        <Content style={{ padding: 24 }}>
          <DateFormatProvider><Outlet /></DateFormatProvider>
        </Content>
      </Layout>
    </Layout>
  );
}
