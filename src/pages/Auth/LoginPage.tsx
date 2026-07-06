import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, Alert } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(values: { username: string; password: string }) {
    setLoading(true); setError('');
    const err = await signIn(values.username, values.password);
    if (err) setError(err);
    else navigate('/');
    setLoading(false);
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f0f2f5', padding: 24 }}>
      <Card style={{ width: 420 }}>
        <style>{`
          @keyframes rainbow-glow {
            0% { text-shadow: 0 0 10px #ff0000, 0 0 20px #ff0000; }
            16% { text-shadow: 0 0 10px #ff8800, 0 0 20px #ff8800; }
            33% { text-shadow: 0 0 10px #ffff00, 0 0 20px #ffff00; }
            50% { text-shadow: 0 0 10px #00ff00, 0 0 20px #00ff00; }
            66% { text-shadow: 0 0 10px #0088ff, 0 0 20px #0088ff; }
            83% { text-shadow: 0 0 10px #8800ff, 0 0 20px #8800ff; }
            100% { text-shadow: 0 0 10px #ff0000, 0 0 20px #ff0000; }
          }
          .rainbow-title { animation: rainbow-glow 3s linear infinite; letter-spacing: 4px; }
        `}</style>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Typography.Title level={2} className="rainbow-title" style={{ margin: 0 }}>QUANTIVRA</Typography.Title>
        </div>

        <Form layout="vertical" onFinish={handleLogin} size="large">
          <Form.Item name="username" label="Username" rules={[{ required: true }]}>
            <Input prefix={<UserOutlined />} placeholder="Enter username" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Enter password" />
          </Form.Item>
          {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}
          <Button type="primary" htmlType="submit" loading={loading} block>Sign In</Button>
        </Form>
      </Card>
    </div>
  );
}
