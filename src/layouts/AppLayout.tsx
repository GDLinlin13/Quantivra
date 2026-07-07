import React, { useState, useMemo, useEffect } from 'react';
import { Layout, Menu, Button, Drawer } from 'antd';
import { LogoutOutlined, MenuOutlined, ControlOutlined } from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { can } from '../utils/permissions';

const { Sider, Content, Header } = Layout;

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, company, signOut, isSuperAdmin } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const selectedKey = location.pathname;

  // Redirect if company doesn't have access to current section
  useEffect(() => {
    if (isSuperAdmin || !company) return;
    const financePaths = ['/payroll', '/accounting', '/invoicing', '/banking', '/tax'];
    const hrPaths = ['/employees', '/payroll', '/leave', '/claims', '/attendance', '/performance', '/training', '/recruitment', '/documents'];
    const path = location.pathname;
    if (!company.access_hr && hrPaths.some(p => path.startsWith(p))) {
      navigate('/dashboard', { replace: true });
    } else if (!company.access_accounting && financePaths.some(p => path.startsWith(p))) {
      navigate('/dashboard', { replace: true });
    }
  }, [company, isSuperAdmin, location.pathname, navigate]);

  const items = useMemo(() => {
    const hasHRAccess = isSuperAdmin || company?.access_hr;
    const hasFinanceAccess = isSuperAdmin || company?.access_accounting;
    const enabled = (key: string) => isSuperAdmin || (company as any)?.[key] !== false;

    const showLeave = isSuperAdmin || can('leave.apply', user?.roles) || can('leave.view_all', user?.roles);
    const showClaims = isSuperAdmin || can('claim.apply', user?.roles) || can('claim.view_all', user?.roles);
    const showAttendance = (isSuperAdmin || can('attendance.view', user?.roles) || can('attendance.manage', user?.roles)) && enabled('enable_attendance');
    const showPerformance = (isSuperAdmin || can('performance.view', user?.roles) || can('performance.manage', user?.roles)) && enabled('enable_performance');
    const showTraining = (isSuperAdmin || can('training.view', user?.roles) || can('training.manage', user?.roles)) && enabled('enable_training');
    const showRecruitment = (isSuperAdmin || can('recruitment.view', user?.roles)) && enabled('enable_recruitment');
    const showDocuments = (isSuperAdmin || can('documents.view', user?.roles) || can('documents.manage', user?.roles)) && enabled('enable_documents');

    const people = hasHRAccess ? [
      ...(isSuperAdmin || can('employee.view_all', user?.roles) ? [{ key: '/employees', label: 'Employees' }] : []),
      ...(showLeave ? [{ key: '/leave', label: 'Leave' }] : []),
      ...(showClaims ? [{ key: '/claims', label: 'Claims' }] : []),
      ...(showAttendance ? [{ key: '/attendance', label: 'Attendance' }] : []),
      ...(showPerformance ? [{ key: '/performance', label: 'Performance' }] : []),
      ...(showTraining ? [{ key: '/training', label: 'Training' }] : []),
      ...(showRecruitment ? [{ key: '/recruitment', label: 'Recruitment' }] : []),
      ...(showDocuments ? [{ key: '/documents', label: 'Documents' }] : []),
      ...(isSuperAdmin || can('payroll.view', user?.roles) ? [{ key: '/payroll', label: 'Payroll' }] : []),
    ] : [];

    const showFinance = hasFinanceAccess && (isSuperAdmin || can('accounting.view', user?.roles) ||
      can('invoice.view', user?.roles) || can('banking.view', user?.roles) ||
      can('tax.view', user?.roles) || can('reports.view', user?.roles));

    const finance = showFinance ? [
      ...(isSuperAdmin || can('accounting.view', user?.roles) ? [{
        key: '/accounting', label: 'Chart of Accounts',
        children: [
          { key: '/accounting/chart-of-accounts', label: 'Chart of Accounts' },
          { key: '/accounting/journal-entries', label: 'Journal Entries' },
          { key: '/accounting/standing-instructions', label: 'Standing Instructions' },
          { key: '/accounting/loans', label: 'Loans' },
        ],
      }] : []),
      ...(isSuperAdmin || can('invoice.view', user?.roles) ? [{
        key: '/invoicing', label: 'Invoicing',
        children: [
          { key: '/invoicing', label: 'Sales Invoices' },
          { key: '/invoicing/supplier', label: 'Supplier Invoices' },
        ],
      }] : []),
      ...(isSuperAdmin || can('banking.view', user?.roles) ? [{ key: '/banking', label: 'Banking' }] : []),
      ...(isSuperAdmin || can('tax.view', user?.roles) ? [{ key: '/tax', label: 'Tax' }] : []),
      ...(isSuperAdmin || can('reports.view', user?.roles) ? [{ key: '/accounting/reports', label: 'Reports' }] : []),
    ] : [];

    const settings = [
      ...(isSuperAdmin || can('company.settings', user?.roles) ? [{ key: '/company', label: 'Company' }] : []),
      ...(hasHRAccess ? [{ key: '/hr-settings', label: 'HR Settings' }] : []),
      ...(isSuperAdmin || can('user.manage', user?.roles) || user?.roles?.includes('master')
        ? [{ key: '/users', label: 'User Management' }] : []),
    ];

    const result: any[] = [
      { key: '/dashboard', label: 'Dashboard' },
    ];
    if (people.length > 0) result.push({ key: 'people', label: 'PEOPLE', children: people });
    if (finance.length > 0) result.push({ key: 'finance', label: 'FINANCE', children: finance });
    if (settings.length > 0) result.push({ key: 'settings', label: 'SETTINGS', children: settings });
    return result;
  }, [user?.roles, company?.access_hr, company?.access_accounting, company?.enable_attendance, company?.enable_training, company?.enable_recruitment, company?.enable_performance, company?.enable_documents, isSuperAdmin]);

  const defaultOpenKeys = useMemo(() => {
    const keys: string[] = ['people', 'finance', 'settings'];
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts.length > 0) {
      const section = '/' + parts[0];
      if (section.startsWith('/accounting')) keys.push('/accounting');
      if (section.startsWith('/invoicing')) keys.push('/invoicing');
    }
    return keys;
  }, [location.pathname]);

  const sidebarContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#0b0f12', borderRight: '1px solid rgba(120,200,255,0.18)' }}>
      <style>{`
        @keyframes rainbow-letter {
          0% { color: #7dd3fc; text-shadow: 0 0 8px #7dd3fc; }
          14% { color: #a78bfa; text-shadow: 0 0 8px #a78bfa; }
          28% { color: #f9a8d4; text-shadow: 0 0 8px #f9a8d4; }
          42% { color: #34d399; text-shadow: 0 0 8px #34d399; }
          57% { color: #60a5fa; text-shadow: 0 0 8px #60a5fa; }
          71% { color: #c084fc; text-shadow: 0 0 8px #c084fc; }
          85% { color: #f472b6; text-shadow: 0 0 8px #f472b6; }
          100% { color: #2dd4bf; text-shadow: 0 0 8px #2dd4bf; }
        }
        .rainbow-letter {
          animation: rainbow-letter 4s ease-in-out infinite;
        }
        .ant-menu-dark, .ant-menu-sub {
          background: transparent !important;
        }
        .ant-menu-item:hover {
          background: rgba(120,200,255,0.08) !important;
        }
        .ant-menu-item-selected {
          background: rgba(167,139,250,0.15) !important;
        }
        .ant-menu-submenu-title {
          font-size: 10px !important;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.25) !important;
          padding-top: 12px !important;
          padding-bottom: 4px !important;
          margin: 0 !important;
          height: auto !important;
          line-height: 1.4 !important;
          cursor: pointer !important;
        }
        .ant-menu-submenu-title:hover {
          color: rgba(255,255,255,0.45) !important;
        }
        .ant-menu-submenu-arrow {
          color: rgba(255,255,255,0.2) !important;
        }
        .ant-menu-item {
          margin: 0 !important;
          height: 36px !important;
          line-height: 36px !important;
          border-radius: 0 !important;
        }
        .ant-menu-item:not(.ant-menu-submenu):hover .ant-menu-title-content { color: #7dd3fc !important; }
        .ant-menu-submenu .ant-menu-item:nth-child(1):hover .ant-menu-title-content { color: #7dd3fc !important; }
        .ant-menu-submenu .ant-menu-item:nth-child(2):hover .ant-menu-title-content { color: #a78bfa !important; }
        .ant-menu-submenu .ant-menu-item:nth-child(3):hover .ant-menu-title-content { color: #f9a8d4 !important; }
        .ant-menu-submenu .ant-menu-item:nth-child(4):hover .ant-menu-title-content { color: #fb923c !important; }
        .ant-menu-submenu .ant-menu-item:nth-child(5):hover .ant-menu-title-content { color: #34d399 !important; }
        .ant-menu-submenu .ant-menu-item:nth-child(6):hover .ant-menu-title-content { color: #60a5fa !important; }
        .ant-menu-submenu .ant-menu-item:nth-child(7):hover .ant-menu-title-content { color: #f472b6 !important; }
        .ant-menu-submenu .ant-menu-item:nth-child(8):hover .ant-menu-title-content { color: #c084fc !important; }
        .ant-menu-submenu .ant-menu-item:nth-child(9):hover .ant-menu-title-content { color: #2dd4bf !important; }
        .sidebar-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .sidebar-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .sidebar-scroll::-webkit-scrollbar-thumb {
          background: rgba(120,200,255,0.15);
          border-radius: 2px;
        }
        .sidebar-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(120,200,255,0.3);
        }
      `}</style>

      <div style={{ padding: '20px 16px 14px', borderBottom: '1px solid rgba(120,200,255,0.18)', flexShrink: 0, textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 6, marginBottom: 8 }}>
          {'QUANTIVRA'.split('').map((ch, i) => (
            <span key={i} className="rainbow-letter" style={{ animationDelay: `${i * 0.3}s` }}>{ch}</span>
          ))}
        </div>
        <div style={{ fontSize: company?.name ? (company.name.length > 20 ? 13 : company.name.length > 14 ? 14 : 15) : 15, fontWeight: 600, color: '#f0abfc', marginBottom: 6, letterSpacing: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 250 }}>{company?.name || '—'}</div>
        <div style={{ fontSize: 13, color: '#7dd3fc', fontWeight: 500 }}>
          {user?.full_name || user?.email}
        </div>
      </div>

      {isSuperAdmin && (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(120,200,255,0.18)', flexShrink: 0 }}>
          <Button type="text" size="small" icon={<ControlOutlined />}
            onClick={() => navigate('/master')}
            style={{ color: '#ff4d4f', width: '100%', textAlign: 'left', paddingLeft: 8, fontSize: 12 }}>
            Master Control
          </Button>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={defaultOpenKeys}
          items={items}
          className="sidebar-scroll"
          style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', background: 'transparent', paddingBottom: 8 }}
          onClick={({ key }) => { navigate(key); setMobileOpen(false); }}
        />
      </div>

      <div style={{ borderTop: '1px solid rgba(120,200,255,0.18)', padding: 8, flexShrink: 0 }}>
        <Button type="text" icon={<LogoutOutlined />} onClick={signOut}
          style={{ color: 'rgba(255,255,255,0.5)', width: '100%', textAlign: 'left', paddingLeft: 8, fontSize: 12 }}>
          Sign Out
        </Button>
      </div>
    </div>
  );

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Sider theme="dark"
        trigger={null} breakpoint="lg"
        width={280}
        style={{ height: '100vh', position: 'sticky', top: 0, overflow: 'hidden', background: '#0b0f12' }}
        className="desktop-sider"
      >
        {sidebarContent}
      </Sider>

      <Drawer placement="left" open={mobileOpen} onClose={() => setMobileOpen(false)} width={250}
        styles={{ body: { padding: 0, background: '#0b0f12' } }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0b0f12' }}>
          <div style={{ padding: '20px 16px 14px', textAlign: 'center', borderBottom: '1px solid rgba(120,200,255,0.18)' }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 6, marginBottom: 8 }}>
              {'QUANTIVRA'.split('').map((ch, i) => (
                <span key={i} className="rainbow-letter" style={{ animationDelay: `${i * 0.3}s` }}>{ch}</span>
              ))}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#f0abfc', marginBottom: 6 }}>{company?.name || '—'}</div>
            <div style={{ fontSize: 13, color: '#7dd3fc' }}>{user?.full_name || user?.email}</div>
          </div>
          <Menu mode="inline" selectedKeys={[selectedKey]} defaultOpenKeys={defaultOpenKeys}
            items={items}
            className="sidebar-scroll"
            style={{ flex: 1, overflowY: 'auto', background: 'transparent' }}
            onClick={({ key }) => { navigate(key); setMobileOpen(false); }}
          />
          <div style={{ borderTop: '1px solid rgba(120,200,255,0.18)', padding: 8 }}>
            <Button type="text" icon={<LogoutOutlined />} onClick={signOut}
              style={{ color: 'rgba(255,255,255,0.5)', width: '100%', textAlign: 'left', paddingLeft: 8 }}>
              Sign Out
            </Button>
          </div>
        </div>
      </Drawer>

      <Layout style={{ overflow: 'hidden' }}>
        <Header style={{
          background: 'rgba(11,15,18,0.9)', padding: '0 16px',
          borderBottom: '1px solid rgba(120,200,255,0.15)',
          display: 'flex', alignItems: 'center',
          zIndex: 100, backdropFilter: 'blur(10px)', height: 48, lineHeight: '48px',
        }}>
          <Button type="text" icon={<MenuOutlined />} onClick={() => setMobileOpen(true)} className="mobile-menu-btn"
            style={{ color: 'rgba(255,255,255,0.6)' }} />
        </Header>
        <Content style={{
          margin: 16, padding: 24,
          background: 'rgba(20,25,30,0.85)',
          borderRadius: 8,
          border: '1px solid rgba(120,200,255,0.18)',
          minHeight: 'calc(100vh - 80px)',
          overflowY: 'auto',
          color: '#f4f1e8',
        }}>
          <Outlet />
        </Content>
      </Layout>

      <style>{`
        @media (max-width: 992px) {
          .desktop-sider { display: none !important; }
          .mobile-menu-btn { display: inline-flex !important; }
        }
        @media (min-width: 993px) {
          .mobile-menu-btn { display: none !important; }
          .desktop-sider { display: flex !important; }
        }
      `}</style>
    </Layout>
  );
}