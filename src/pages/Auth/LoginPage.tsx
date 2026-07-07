import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Typography, Alert, Checkbox } from 'antd';
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
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remember, setRemember] = useState(() => localStorage.getItem('acchr_remember') === 'true');

  useEffect(() => {
    if (remember) {
      const savedCode = localStorage.getItem('acchr_company_code') || '';
      const savedUser = localStorage.getItem('acchr_username') || '';
      form.setFieldsValue({ company_code: savedCode, username: savedUser });
    }
  }, [remember, form]);

  async function handleLogin(values: { company_code: string; username: string; password: string }) {
    setLoading(true); setError('');
    const err = await signIn(values.company_code, values.username, values.password);
    if (err) setError(err);
    else {
      if (remember) {
        localStorage.setItem('acchr_company_code', values.company_code || '');
        localStorage.setItem('acchr_username', values.username);
        localStorage.setItem('acchr_remember', 'true');
      } else {
        localStorage.removeItem('acchr_company_code');
        localStorage.removeItem('acchr_username');
        localStorage.removeItem('acchr_remember');
      }
      navigate('/');
    }
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

        <Form form={form} layout="vertical" onFinish={handleLogin} size="large" autoComplete="off">
          {/* Hidden dummy inputs to prevent browser autofill from other sites */}
          <input type="text" style={{ display: 'none' }} />
          <input type="password" style={{ display: 'none' }} />
          <Form.Item name="company_code" getValueFromEvent={(e) => e.target.value.toUpperCase()}>
            <Input prefix={<BuildOutlined />} placeholder="Company Code" autoComplete="off" style={{ height: 48, fontSize: 16, textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item name="username" rules={[{ required: true }]} getValueFromEvent={(e) => e.target.value.toUpperCase()}>
            <Input prefix={<UserOutlined />} placeholder="Username" autoComplete="off" style={{ height: 48, fontSize: 16, textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Password" autoComplete="new-password" style={{ height: 48, fontSize: 16 }} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 16 }}>
            <Checkbox checked={remember} onChange={e => setRemember(e.target.checked)} style={{ color: 'rgba(255,255,255,0.6)' }}>Remember Me</Checkbox>
          </Form.Item>
          {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}
          <Button type="primary" htmlType="submit" loading={loading} block>Sign In</Button>
        </Form>
      </Card>
    </div>
  );
}
