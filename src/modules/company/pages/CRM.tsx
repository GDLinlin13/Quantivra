import { useEffect, useState } from 'react';
import { Typography, Tabs } from 'antd';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { ContactsManager } from './finance/ContactsManager';

const { Title } = Typography;

export function CompanyCRMPage() {
  const { companyId } = useAuth();
  const [currency, setCurrency] = useState('SGD');
  useEffect(() => {
    if (!companyId) return;
    supabase.from('companies').select('currency').eq('id', companyId).maybeSingle().then(({ data }) => setCurrency(data?.currency || 'SGD'));
  }, [companyId]);
  if (!companyId) return null;
  return (
    <div>
      <Title level={4} style={{ color: '#f0ede6' }}>CRM</Title>
      <Tabs items={[
        { key: 'customers', label: 'Customers & contacts', children: <ContactsManager companyId={companyId} kind="customer" currency={currency} /> },
      ]} />
    </div>
  );
}
