import { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Typography } from 'antd';
import { TeamOutlined, UserSwitchOutlined, FileOutlined, SettingOutlined } from '@ant-design/icons';
import { supabase } from '../../../utils/supabase';
import { useAuth } from '../../../contexts/AuthContext';

const { Title, Text } = Typography;

export function CompanyDashboard() {
  const { companyId } = useAuth();
  const [stats, setStats] = useState({ users: 0, roles: 0, documents: 0 });

  useEffect(() => {
    if (!companyId) return;
    Promise.all([
      supabase.from('company_users').select('*', { count: 'exact', head: true }).eq('company_id', companyId),
      supabase.from('company_roles').select('*', { count: 'exact', head: true }).eq('company_id', companyId),
      supabase.from('documents').select('*', { count: 'exact', head: true }).eq('company_id', companyId),
    ]).then(([u, r, d]) => {
      setStats({ users: u.count || 0, roles: r.count || 0, documents: d.count || 0 });
    });
  }, [companyId]);

  const cards = [
    { title: 'Users', value: stats.users, icon: <TeamOutlined />, color: '#4fc3f7' },
    { title: 'Roles', value: stats.roles, icon: <UserSwitchOutlined />, color: '#81c784' },
    { title: 'Documents', value: stats.documents, icon: <FileOutlined />, color: '#ffb74d' },
    { title: 'Settings', value: '—', icon: <SettingOutlined />, color: '#e57373' },
  ];

  return (
    <div>
      <Title level={4} style={{ color: '#f0ede6', marginBottom: 24 }}>Company Overview</Title>
      <Row gutter={[16, 16]}>
        {cards.map((card) => (
          <Col span={6} key={card.title}>
            <Card style={{ background: '#151a1e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}>
              <Statistic
                title={<Text style={{ color: 'rgba(240,237,230,0.6)' }}>{card.title}</Text>}
                value={card.value}
                prefix={<span style={{ color: card.color, marginRight: 8 }}>{card.icon}</span>}
                valueStyle={{ color: '#f0ede6', fontSize: 28 }}
              />
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
