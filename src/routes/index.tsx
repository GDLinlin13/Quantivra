import { createBrowserRouter, Navigate } from 'react-router-dom';
import { PlatformLayout } from '../layouts/PlatformLayout';
import { CompanyLayout } from '../layouts/CompanyLayout';
import { RequireAuth } from '../components/RequireAuth';
import { LoginPage } from '../modules/auth/pages/LoginPage';
import { PlatformDashboard } from '../modules/platform/pages/Dashboard';
import { CompaniesPage } from '../modules/platform/pages/Companies';
import { CountryPacksPage } from '../modules/platform/pages/CountryPacks';
import { BusinessPacksPage } from '../modules/platform/pages/BusinessPacks';
import { PlatformUsersPage } from '../modules/platform/pages/Users';
import { PlatformAuditPage } from '../modules/platform/pages/AuditLog';
import { PlatformSettingsPage } from '../modules/platform/pages/Settings';
import { CompanyDashboard } from '../modules/company/pages/Dashboard';
import { CompanyProfilePage } from '../modules/company/pages/Profile';
import { CompanyUsersPage } from '../modules/company/pages/Users';
import { CompanyRolesPage } from '../modules/company/pages/Roles';
import { CompanySettingsPage } from '../modules/company/pages/Settings';
import { CompanyHRPage } from '../modules/company/pages/HR';
import { CompanyFinancePage } from '../modules/company/pages/Finance';
import { CompanyCatalogPage } from '../modules/company/pages/Catalog';
import { CompanyDocumentsPage } from '../modules/company/pages/Documents';
import { CompanyCRMPage } from '../modules/company/pages/CRM';
import { CompanyProjectsPage } from '../modules/company/pages/Projects';
import { CompanyWorkflowPage } from '../modules/company/pages/Workflow';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/platform',
    element: <RequireAuth type="platform"><PlatformLayout /></RequireAuth>,
    children: [
      { index: true, element: <PlatformDashboard /> },
      { path: 'companies', element: <CompaniesPage /> },
      { path: 'country-packs', element: <CountryPacksPage /> },
      { path: 'business-packs', element: <BusinessPacksPage /> },
      { path: 'users', element: <PlatformUsersPage /> },
      { path: 'audit', element: <PlatformAuditPage /> },
      { path: 'settings', element: <PlatformSettingsPage /> },
    ],
  },
  {
    path: '/company',
    element: <RequireAuth type="company"><CompanyLayout /></RequireAuth>,
    children: [
      { index: true, element: <CompanyDashboard /> },
      { path: 'hr', element: <CompanyHRPage /> },
      { path: 'finance', element: <CompanyFinancePage /> },
      { path: 'catalog', element: <CompanyCatalogPage /> },
      { path: 'inventory', element: <Navigate to="/company/catalog" replace /> },
      { path: 'crm', element: <CompanyCRMPage /> },
      { path: 'projects', element: <CompanyProjectsPage /> },
      { path: 'workflow', element: <CompanyWorkflowPage /> },
      { path: 'reports', element: <Navigate to="/company/finance" replace /> },
      { path: 'profile', element: <CompanyProfilePage /> },
      { path: 'users', element: <CompanyUsersPage /> },
      { path: 'roles', element: <CompanyRolesPage /> },
      { path: 'settings', element: <CompanySettingsPage /> },
      { path: 'audit', element: <Navigate to="/company" replace /> },
      { path: 'files', element: <CompanyDocumentsPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
]);
