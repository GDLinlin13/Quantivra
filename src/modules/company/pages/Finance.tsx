import { useState, useEffect, useCallback } from 'react';
import { Typography, Tabs, Spin, Alert } from 'antd';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { brandingService, type Branding } from '../../../services/branding';
import { contactService, docService, accountService, financeSettingsService } from '../../../services/finance';
import { DEFAULT_FINANCE_SETTINGS, type FinanceSettings } from '../../../data/finance';
import { DocList, type FinanceData } from './finance/DocList';
import { PaymentsList } from './finance/PaymentsList';
import { FinanceSettingsTab } from './finance/FinanceSettingsTab';

const { Title } = Typography;

export function CompanyFinancePage() {
  const { companyId } = useAuth();
  const [data, setData] = useState<Omit<FinanceData, 'reload'> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('qv-finance-tab') || 'invoices'; } catch { return 'invoices'; } });

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      const [{ data: company }, branding, settings, contacts, people, accounts, docs] = await Promise.all([
        supabase.from('companies').select('*').eq('id', companyId).maybeSingle(),
        brandingService.get(companyId).catch(() => null as Branding | null),
        financeSettingsService.get(companyId).catch(() => DEFAULT_FINANCE_SETTINGS as FinanceSettings),
        contactService.list(companyId), contactService.peopleOf(companyId), accountService.list(companyId),
        docService.list(companyId, ['quote', 'invoice', 'credit_note', 'bill', 'expense']),
      ]);
      setData({ companyId, company, currency: company?.currency || 'SGD', branding, settings, contacts, people, accounts, docs });
      setError(null);
    } catch (e: any) {
      setError(/does not exist|contacts|fin_/i.test(e.message) ? 'Finance needs database update 024 — ask your administrator to run it in Supabase.' : e.message);
    }
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div><Title level={4} style={{ color: '#f0ede6' }}>Finance</Title><Alert type="warning" showIcon title={error} /></div>;
  if (!data) return <Spin />;
  const d: FinanceData = { ...data, reload: load };
  const change = (k: string) => { setTab(k); try { localStorage.setItem('qv-finance-tab', k); } catch { /* ignore */ } };

  return (
    <div>
      <Title level={4} style={{ color: '#f0ede6' }}>Finance</Title>
      <Tabs activeKey={tab} onChange={change} items={[
        { key: 'invoices', label: 'Invoices', children: <DocList data={d} docType="invoice" /> },
        { key: 'quotes', label: 'Quotations', children: <DocList data={d} docType="quote" /> },
        { key: 'received', label: 'Payments received', children: <PaymentsList data={d} direction="in" /> },
        { key: 'settings', label: 'GST & settings', children: <FinanceSettingsTab companyId={data.companyId} settings={data.settings} onSaved={load} /> },
      ]} />
    </div>
  );
}
