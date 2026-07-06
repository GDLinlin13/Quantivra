import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, Alert } from 'antd';
import { UserOutlined, LockOutlined, BuildOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const letters = 'QUANTIVRA'.split('');

function RainbowTitle({ level = 2 }: { level?: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <Typography.Title level={level} style={{ margin: 0, letterSpacing: 6 }}>
      <span style={{ display: 'inline-flex', gap: 2 }}>
        {letters.map((ch, i) => (
          <span key={i} className="rainbow-letter" style={{ animationDelay: `${i * 0.3}s` }}>
            {ch}
          </span>
        ))}
      </span>
    </Typography.Title>
  );
}

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(values: { company_code: string; username: string; password: string }) {
    setLoading(true); setError('');
    const err = await signIn(values.company_code, values.username, values.password);
    if (err) setError(err);
    else navigate('/');
    setLoading(false);
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#0b0f12', padding: 24 }}>
      <Card style={{ width: 420, border: '1px solid rgba(120, 200, 255, 0.18)', boxShadow: '0 0 30px rgba(120, 200, 255, 0.08)' }}>
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
        `}</style>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <RainbowTitle />
        </div>

        <Form layout="vertical" onFinish={handleLogin} size="large">
          <Form.Item name="company_code" getValueFromEvent={(e) => e.target.value.toUpperCase()}>
            <Input prefix={<BuildOutlined />} placeholder="Company Code" style={{ height: 48, fontSize: 16, textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item name="username" rules={[{ required: true }]} getValueFromEvent={(e) => e.target.value.toUpperCase()}>
            <Input prefix={<UserOutlined />} placeholder="Username" style={{ height: 48, fontSize: 16, textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Password" style={{ height: 48, fontSize: 16 }} />
          </Form.Item>
          {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}
          <Button type="primary" htmlType="submit" loading={loading} block>Sign In</Button>
        </Form>
      </Card>
    </div>
  );
}
