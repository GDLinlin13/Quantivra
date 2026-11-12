import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { RainbowTitle } from '../components/RainbowTitle';
import { Layout, Menu, Button, Avatar, Dropdown, Typography } from 'antd';
import { MyProfileModal } from '../components/MyProfileModal';
import { profileService, NO_PROFILE, DEFAULT_AVATAR_COLOR, type MyProfile } from '../services/profile';
import {
  DashboardOutlined, TeamOutlined, UserOutlined, SafetyOutlined,
  SettingOutlined, LogoutOutlined, BankOutlined,
  FileOutlined, BellOutlined, DollarOutlined, ShopOutlined,
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState<MyProfile>(NO_PROFILE);
  const [authId, setAuthId] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, companyId } = useAuth();
  const [companyName, setCompanyName] = useState<string>('');
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id || null;
      setAuthId(id);
      if (id) profileService.get(id).then(setProfile).catch(() => null);
    });
  }, [companyId]);

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

  const userMenu = {
    items: [
      { key: 'profile', icon: <UserOutlined />, label: 'My Profile' },
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: 'Sign Out', danger: true },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'logout') { logout(); navigate('/login'); }
      if (key === 'profile') setProfileOpen(true);
    },
  };

  return (
    <Layout style={{ minHeight: '100vh', background: '#0b0f12' }}>
      {profileOpen && (
        <MyProfileModal profile={profile} fullName={user?.full_name || ''} onClose={() => setProfileOpen(false)}
          onSave={async p => { if (!authId) throw new Error('Not signed in'); await profileService.save(authId, p); setProfile(p); }} />
      )}
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
          <Button type="text" icon={<BellOutlined />} style={{ color: '#f0ede6' }} />
          <Dropdown menu={userMenu} placement="bottomRight">
            <Button type="text" style={{ color: '#f0ede6', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar size="small" src={profile.avatar_data || undefined} icon={profile.avatar_data ? undefined : <UserOutlined />} style={{ background: profile.avatar_data ? undefined : (profile.avatar_color || DEFAULT_AVATAR_COLOR), color: '#111' }} />
              {profile.display_name || user?.full_name}
            </Button>
          </Dropdown>
        </Header>
        <Content style={{ padding: 24 }}>
          <DateFormatProvider><Outlet /></DateFormatProvider>
        </Content>
      </Layout>
    </Layout>
  );
}
