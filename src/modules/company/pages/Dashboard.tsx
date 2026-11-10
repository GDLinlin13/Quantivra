import { useState, useEffect } from 'react';
import { Card, Statistic, Typography } from 'antd';
import { TeamOutlined, IdcardOutlined, CalendarOutlined, ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { supabase } from '../../../utils/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useCompanyAccess } from '../../../contexts/CompanyAccess';
import { hrService } from '../../../services/hr';
import { balanceDue, inBase } from '../../../data/finance';
import { money } from '../../../data/documentLayouts';

const { Title, Text } = Typography;

interface Outstanding { count: number; total: number }

export function CompanyDashboard() {
  const { companyId } = useAuth();
  const access = useCompanyAccess();
  const canFinance = access.can('finance');
  const [users, setUsers] = useState(0);
  const [employees, setEmployees] = useState<number | null>(null);
  const [onLeave, setOnLeave] = useState<string[]>([]);
  const [currency, setCurrency] = useState('SGD');
  const [receivable, setReceivable] = useState<Outstanding>({ count: 0, total: 0 });
  const [payable, setPayable] = useState<Outstanding>({ count: 0, total: 0 });

  useEffect(() => {
    if (!companyId) return;
    supabase.from('company_users').select('*', { count: 'exact', head: true }).eq('company_id', companyId)
      .then(r => setUsers(r.count || 0));
    // headcount: active employees
    hrService.listEmployees(companyId).then(list => setEmployees(list.filter(e => e.status !== 'terminated').length)).catch(() => setEmployees(null));
    supabase.from('companies').select('currency').eq('id', companyId).maybeSingle().then(r => setCurrency(r.data?.currency || 'SGD'));
    // Approved leave covering today (local date).
    const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    supabase.from('leave_requests').select('employees(full_name)')
      .eq('company_id', companyId).eq('status', 'approved').lte('start_date', today).gte('end_date', today)
      .then(({ data }) => setOnLeave(Array.from(new Set((data || []).map((x: any) => x.employees?.full_name).filter(Boolean)))));
  }, [companyId]);

  // what customers still owe (invoices) and what we still owe (bills, expenses)
  useEffect(() => {
    if (!companyId || !canFinance) return;
    supabase.from('fin_documents').select('*').eq('company_id', companyId)
      .in('doc_type', ['invoice', 'bill', 'expense']).not('status', 'in', '(draft,void,paid)')
      .then(({ data }) => {
        const sum = (types: string[]): Outstanding => {
          const open = (data || []).filter((d: any) => types.includes(d.doc_type) && balanceDue(d) > 0);
          return { count: open.length, total: open.reduce((s: number, d: any) => s + inBase(d, balanceDue(d)), 0) };
        };
        setReceivable(sum(['invoice'])); setPayable(sum(['bill', 'expense']));
      });
  }, [companyId, canFinance]);

  const cards: { title: string; value: string | number; icon: React.ReactNode; color: string; note?: string }[] = [
    { title: 'Users', value: users, icon: <TeamOutlined />, color: '#4fc3f7' },
    ...(employees != null ? [{ title: 'Employees', value: employees, icon: <IdcardOutlined />, color: '#81c784' }] : []),
    { title: 'On leave today', value: onLeave.length, icon: <CalendarOutlined />, color: '#e57373', note: onLeave.length ? onLeave.join(', ') : 'Everyone is in' },
    ...(canFinance ? [
      { title: 'Outstanding receivables', value: money(receivable.total, currency), icon: <ArrowDownOutlined />, color: '#73d13d',
        note: `${receivable.count} invoice${receivable.count === 1 ? '' : 's'}` },
      { title: 'Outstanding payables', value: money(payable.total, currency), icon: <ArrowUpOutlined />, color: '#ffb74d',
        note: `${payable.count} bill${payable.count === 1 ? '' : 's'}` },
    ] : []),
  ];

  return (
    <div>
      <Title level={4} style={{ color: '#f0ede6', marginBottom: 24 }}>Company Overview</Title>
      {/* every card the same width and height, as many per row as fit */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, alignItems: 'stretch' }}>
        {cards.map((card) => (
          <div key={card.title}>
            <Card style={{ background: '#151a1e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, height: '100%' }}>
              <Statistic
                title={<Text style={{ color: 'rgba(240,237,230,0.6)' }}>{card.title}</Text>}
                value={card.value}
                prefix={<span style={{ color: card.color, marginRight: 8 }}>{card.icon}</span>}
                styles={{ content: { color: '#f0ede6', fontSize: 28 } }}
              />
              {card.note && <Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12 }}>{card.note}</Text>}
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
