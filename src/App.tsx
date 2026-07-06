import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin, Result, Button } from 'antd';
import { useAuth } from './contexts/AuthContext';
import AppLayout from './layouts/AppLayout';
import LoginPage from './pages/Auth/LoginPage';
import MasterAdminPage from './pages/MasterAdmin';
import DashboardPage from './pages/Dashboard';
import CompanyPage from './pages/Company';
import EmployeesPage from './pages/Employees';
import LeavePage from './pages/Leave';
import ClaimsPage from './pages/Claims';
import PayrollPage from './pages/Payroll';
import ChartOfAccountsPage from './pages/Accounting/ChartOfAccounts';
import JournalEntriesPage from './pages/Accounting/JournalEntries';
import ReportsPage from './pages/Accounting/Reports';
import InvoicesPage from './pages/Invoicing/Invoices';
import InvoiceFormPage from './pages/Invoicing/InvoiceForm';
import SupplierInvoicesPage from './pages/Invoicing/SupplierInvoices';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><Spin size="large" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function MasterRoute({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin, loading } = useAuth();
  if (loading) return <Spin size="large" />;
  if (!isSuperAdmin) return <Result status="403" title="Access Denied" subTitle="Only AEGIS master admin can access this panel" extra={<Button type="primary" onClick={() => window.location.href = '/dashboard'}>Go to Dashboard</Button>} />;
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><Spin size="large" /></div>;
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/master" element={<ProtectedRoute><MasterRoute><MasterAdminPage /></MasterRoute></ProtectedRoute>} />
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/" element={user?.roles?.includes('superadmin') ? <Navigate to="/master" replace /> : <Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/company" element={<CompanyPage />} />
        <Route path="/employees" element={<EmployeesPage />} />
        <Route path="/leave" element={<LeavePage />} />
        <Route path="/claims" element={<ClaimsPage />} />
        <Route path="/payroll" element={<PayrollPage />} />
        <Route path="/accounting/chart-of-accounts" element={<ChartOfAccountsPage />} />
        <Route path="/accounting/journal-entries" element={<JournalEntriesPage />} />
        <Route path="/accounting/reports" element={<ReportsPage />} />
        <Route path="/invoicing" element={<InvoicesPage />} />
        <Route path="/invoicing/new" element={<InvoiceFormPage />} />
        <Route path="/invoicing/edit/:id" element={<InvoiceFormPage />} />
        <Route path="/invoicing/supplier" element={<SupplierInvoicesPage />} />
      </Route>
    </Routes>
  );
}
