import { createBrowserRouter, Navigate } from 'react-router-dom';
import { PlatformLayout } from '../layouts/PlatformLayout';
import { CompanyLayout } from '../layouts/CompanyLayout';
import { LoginPage } from '../modules/auth/pages/LoginPage';
import { PlatformDashboard } from '../modules/platform/pages/Dashboard';
import { CompaniesPage } from '../modules/platform/pages/Companies';
import { CountryPacksPage } from '../modules/platform/pages/CountryPacks';
import { BusinessPacksPage } from '../modules/platform/pages/BusinessPacks';
import { PlatformUsersPage } from '../modules/platform/pages/Users';
import { PlatformAuditPage } from '../modules/platform/pages/AuditLog';
import { CompanyDashboard } from '../modules/company/pages/Dashboard';
import { CompanyProfilePage } from '../modules/company/pages/Profile';
import { CompanyUsersPage } from '../modules/company/pages/Users';
import { CompanyRolesPage } from '../modules/company/pages/Roles';
import { CompanySettingsPage } from '../modules/company/pages/Settings';
import { CompanyHRPage } from '../modules/company/pages/HR';
import { CompanyFinancePage } from '../modules/company/pages/Finance';
import { CompanyInventoryPage } from '../modules/company/pages/Inventory';
import { CompanyCRMPage } from '../modules/company/pages/CRM';
import { CompanyReportsPage } from '../modules/company/pages/Reports';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/platform',
    element: <PlatformLayout />,
    children: [
      { index: true, element: <PlatformDashboard /> },
      { path: 'companies', element: <CompaniesPage /> },
      { path: 'country-packs', element: <CountryPacksPage /> },
      { path: 'business-packs', element: <BusinessPacksPage /> },
      { path: 'users', element: <PlatformUsersPage /> },
      { path: 'audit', element: <PlatformAuditPage /> },
      { path: 'settings', element: <div style={{ color: '#f0ede6' }}>Platform Settings</div> },
    ],
  },
  {
    path: '/company',
    element: <CompanyLayout />,
    children: [
      { index: true, element: <CompanyDashboard /> },
      { path: 'hr', element: <CompanyHRPage /> },
      { path: 'finance', element: <CompanyFinancePage /> },
      { path: 'inventory', element: <CompanyInventoryPage /> },
      { path: 'crm', element: <CompanyCRMPage /> },
      { path: 'reports', element: <CompanyReportsPage /> },
      { path: 'profile', element: <CompanyProfilePage /> },
      { path: 'users', element: <CompanyUsersPage /> },
      { path: 'roles', element: <CompanyRolesPage /> },
      { path: 'settings', element: <CompanySettingsPage /> },
      { path: 'audit', element: <PlatformAuditPage /> },
      { path: 'files', element: <div style={{ color: '#f0ede6' }}>Documents</div> },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
]);
