import React, { useState } from 'react';
import { Layout, Menu, Typography, Button, Dropdown, Space, Avatar, Drawer, Tag } from 'antd';
import {
  DashboardOutlined, BankOutlined, TeamOutlined, CalendarOutlined,
  DollarOutlined, FileTextOutlined, UploadOutlined, BookOutlined,
  PieChartOutlined, ReconciliationOutlined, LogoutOutlined, MenuOutlined,
  UserOutlined, ControlOutlined, WalletOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { can } from '../utils/permissions';

const { Sider, Content, Header } = Layout;

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, company, signOut, isSuperAdmin } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  

  const selectedKey = location.pathname;
  const openKey = '/' + location.pathname.split('/')[1];

  const items = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
    ...(can('company.settings', user?.roles) ? [{ key: '/company', icon: <BankOutlined />, label: 'Company' }] : []),
    ...(can('employee.create', user?.roles) || can('employee.view_all', user?.roles)
      ? [{ key: '/employees', icon: <TeamOutlined />, label: 'Employees' }] : []),
    { key: '/leave', icon: <CalendarOutlined />, label: 'Leave' },
    { key: '/claims', icon: <WalletOutlined />, label: 'Claims' },
    ...(can('payroll.view', user?.roles) ? [{ key: '/payroll', icon: <DollarOutlined />, label: 'Payroll' }] : []),
    ...(can('invoice.view', user?.roles) ? [{
      key: 'invoicing', icon: <FileTextOutlined />, label: 'Invoicing',
      children: [
        { key: '/invoicing', icon: <ReconciliationOutlined />, label: 'Sales Invoices' },
        { key: '/invoicing/supplier', icon: <UploadOutlined />, label: 'Supplier Invoices' },
      ],
    }] : []),
    ...(can('accounting.view', user?.roles) ? [{
      key: 'accounting', icon: <BookOutlined />, label: 'Accounting',
      children: [
        { key: '/accounting/chart-of-accounts', icon: <PieChartOutlined />, label: 'Chart of Accounts' },
        { key: '/accounting/journal-entries', icon: <FileTextOutlined />, label: 'Journal Entries' },
        { key: '/accounting/reports', icon: <PieChartOutlined />, label: 'Reports' },
      ],
    }] : []),
  ];

  const roleDisplay = (roles: string[] | undefined) => {
    if (!roles?.length) return null;
    const colors: Record<string, string> = { superadmin: 'red', admin: 'blue', hr: 'cyan', accountant: 'purple', manager: 'orange', employee: 'green' };
    return roles.filter(r => r !== 'superadmin' && r !== 'employee').map(r => (
      <Tag key={r} color={colors[r]} style={{ margin: 0, fontSize: 10, lineHeight: '16px' }}>{r}</Tag>
    ));
  };

  const sidebarContent = (
    <>
      <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '0 16px', flexDirection: 'column' }}>
        <Typography.Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
          {collapsed ? 'Q' : 'Quantivra'}
        </Typography.Text>
        {!collapsed && company && <Typography.Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{company.name}</Typography.Text>}
      </div>
      {isSuperAdmin && (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <Button type="text" size="small" icon={<ControlOutlined />}
            onClick={() => navigate('/master')}
            style={{ color: '#ff4d4f', width: '100%', textAlign: 'left', paddingLeft: 8 }}>
            {collapsed ? '' : 'Master Control'}
          </Button>
        </div>
      )}
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[selectedKey]}
        defaultOpenKeys={[openKey]}
        items={items}
        onClick={({ key }) => { navigate(key); setMobileOpen(false); }}
      />
    </>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="dark"
        trigger={null} breakpoint="lg" collapsedWidth={0}
        style={{ display: 'none' }}
        className="desktop-sider"
      >
        {sidebarContent}
      </Sider>

      <Drawer placement="left" open={mobileOpen} onClose={() => setMobileOpen(false)} width={250}
        styles={{ body: { padding: 0 } }}>
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #f0f0f0' }}>
          <Typography.Title level={5} style={{ margin: 0 }}>Quantivra</Typography.Title>
        </div>
        <Menu mode="inline" selectedKeys={[selectedKey]} defaultOpenKeys={[openKey]}
          items={items}
          onClick={({ key }) => { navigate(key); setMobileOpen(false); }}
        />
      </Drawer>

      <Layout>
        <Header style={{
          background: '#fff', padding: '0 16px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 100,
        }}>
          <Space>
            <Button type="text" icon={<MenuOutlined />} onClick={() => setMobileOpen(true)} className="mobile-menu-btn" />
            <Typography.Title level={5} style={{ margin: 0 }}>{company?.name || 'Quantivra'}</Typography.Title>
          </Space>
          <Dropdown menu={{
            items: [
              { key: 'user', label: `${user?.full_name}`, disabled: true },
              { key: 'roles', label: <Space size={4}>{roleDisplay(user?.roles)}</Space>, disabled: true },
              { type: 'divider' },
              ...(isSuperAdmin ? [{ key: 'master', icon: <ControlOutlined />, label: 'Master Control Panel' }] : []),
              { type: 'divider' },
              { key: 'logout', icon: <LogoutOutlined />, label: 'Sign Out', danger: true },
            ],
            onClick: ({ key }) => {
              if (key === 'logout') signOut();
              if (key === 'master') navigate('/master');
            }
          }}>
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} size="small" />
              <span className="user-name">{user?.full_name}</span>
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ margin: 16, padding: 24, background: '#fff', borderRadius: 8, minHeight: 'calc(100vh - 112px)' }}>
          <Outlet />
        </Content>
      </Layout>

      <style>{`
        @media (max-width: 992px) {
          .desktop-sider { display: none !important; }
          .mobile-menu-btn { display: inline-flex !important; }
          .user-name { display: none; }
        }
        @media (min-width: 993px) {
          .mobile-menu-btn { display: none !important; }
          .desktop-sider { display: flex !important; }
          .user-name { display: inline; }
        }
      `}</style>
    </Layout>
  );
}
