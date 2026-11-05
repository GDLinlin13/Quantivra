import { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Typography } from 'antd';
import { BuildOutlined, GlobalOutlined, TeamOutlined, CrownOutlined } from '@ant-design/icons';
import { supabase } from '../../../utils/supabase';

const { Title, Text } = Typography;

export function PlatformDashboard() {
  const [stats, setStats] = useState({ companies: 0, countries: 0, users: 0 });

  useEffect(() => {
    Promise.all([
      supabase.from('companies').select('*', { count: 'exact', head: true }),
      supabase.from('country_profiles').select('*', { count: 'exact', head: true }),
      // Everyone who can sign in to a company, across all companies.
      supabase.from('company_users').select('*', { count: 'exact', head: true }),
    ]).then(([c, ct, u]) => {
      setStats({
        companies: c.count || 0,
        countries: ct.count || 0,
        users: u.count || 0,
      });
    });
  }, []);

  const cards = [
    { title: 'Companies', value: stats.companies, icon: <BuildOutlined />, color: '#4fc3f7' },
    { title: 'Countries', value: stats.countries, icon: <GlobalOutlined />, color: '#81c784' },
    { title: 'Users', value: stats.users, icon: <TeamOutlined />, color: '#e57373' },
  ];

  return (
    <div>
      <Title level={4} style={{ color: '#f0ede6', marginBottom: 24 }}>Platform Overview</Title>
      <Row gutter={[16, 16]}>
        {cards.map((card) => (
          <Col span={8} key={card.title}>
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
