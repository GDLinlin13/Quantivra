import { useState, useEffect, useCallback } from 'react';
import { Typography, Tabs, Spin, Alert, Segmented } from 'antd';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { brandingService, type Branding } from '../../../services/branding';
import { contactService, docService, accountService, financeSettingsService, catalogService } from '../../../services/finance';
import { DEFAULT_FINANCE_SETTINGS, type FinanceSettings } from '../../../data/finance';
import { DocList, type FinanceData } from './finance/DocList';
import { hrService } from '../../../services/hr';
import { PaymentsList } from './finance/PaymentsList';
import { FinanceSettingsTab } from './finance/FinanceSettingsTab';
import { Accounting } from './finance/Accounting';
import { Bank } from './finance/Bank';
import { PayrollPayables } from './finance/PayrollPayables';

const { Title } = Typography;

export function CompanyFinancePage() {
  const { companyId } = useAuth();
  const [data, setData] = useState<Omit<FinanceData, 'reload'> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const remembered = (k: string, dflt: string) => { try { return localStorage.getItem(k) || dflt; } catch { return dflt; } };
  const [area, setArea] = useState(() => remembered('qv-finance-area', 'sales'));
  const [tab, setTab] = useState<Record<string, string>>(() => ({ sales: remembered('qv-finance-sales', 'invoices'), purchases: ((v: string) => (v === 'suppliers' ? 'bills' : v))(remembered('qv-finance-purchases', 'bills')) }));

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      const [{ data: company }, branding, settings, contacts, people, accounts, docs, employees, items] = await Promise.all([
        supabase.from('companies').select('*').eq('id', companyId).maybeSingle(),
        brandingService.get(companyId).catch(() => null as Branding | null),
        financeSettingsService.get(companyId).catch(() => DEFAULT_FINANCE_SETTINGS as FinanceSettings),
        contactService.list(companyId), contactService.peopleOf(companyId), accountService.list(companyId),
        docService.list(companyId, ['quote', 'invoice', 'credit_note', 'bill', 'expense']),
        hrService.listEmployees(companyId).then(l => l.map(e => ({ id: Number(e.id), full_name: e.full_name }))).catch(() => []),
        catalogService.list(companyId).catch(() => []),
      ]);
      setData({ companyId, company, currency: company?.currency || 'SGD', branding, settings, contacts, people, accounts, docs, employees, items });
      setError(null);
    } catch (e: any) {
      setError(/does not exist|contacts|fin_/i.test(e.message) ? 'Finance needs database update 024 — ask your administrator to run it in Supabase.' : e.message);
    }
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div><Title level={4} style={{ color: '#f0ede6' }}>Finance</Title><Alert type="warning" showIcon title={error} /></div>;
  if (!data) return <Spin />;
  const d: FinanceData = { ...data, reload: load };
  const keep = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
  const changeArea = (v: string) => { setArea(v); keep('qv-finance-area', v); };
  const change = (area: string, k: string) => { setTab(t => ({ ...t, [area]: k })); keep(`qv-finance-${area}`, k); };

  return (
    <div>
      <Title level={4} style={{ color: '#f0ede6' }}>Finance</Title>
      <Segmented value={area} onChange={v => changeArea(String(v))} style={{ marginBottom: 12 }}
        options={[{ value: 'sales', label: 'Receivables' }, { value: 'purchases', label: 'Payables' }, { value: 'bank', label: 'Bank' }, { value: 'accounting', label: 'Accounting & reports' }, { value: 'settings', label: 'GST & settings' }]} />
      {area === 'sales' && (
        <Tabs activeKey={tab.sales} onChange={k => change('sales', k)} items={[
          { key: 'invoices', label: 'Invoices', children: <DocList data={d} docType="invoice" /> },
          { key: 'quotes', label: 'Quotations', children: <DocList data={d} docType="quote" /> },
          { key: 'received', label: 'Payments received', children: <PaymentsList data={d} direction="in" /> },
        ]} />
      )}
      {area === 'purchases' && (
        <Tabs activeKey={tab.purchases} onChange={k => change('purchases', k)} items={[
          { key: 'bills', label: 'Bills', children: <DocList data={d} docType="bill" /> },
          { key: 'expenses', label: 'Expenses', children: <DocList data={d} docType="expense" /> },
          { key: 'payroll', label: 'Payroll', children: <PayrollPayables data={d} /> },
          { key: 'paid', label: 'Payments made', children: <PaymentsList data={d} direction="out" /> },
        ]} />
      )}
      {area === 'bank' && <Bank data={d} />}
      {area === 'accounting' && <Accounting data={d} />}
      {area === 'settings' && <FinanceSettingsTab companyId={data.companyId} settings={data.settings} onSaved={load} />}
    </div>
  );
}
