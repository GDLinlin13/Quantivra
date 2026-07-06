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
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f0ecec', padding: 24 }}>
      <Card style={{ width: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Typography.Title level={2} style={{ margin: 0, color: '#b8c9e8', letterSpacing: 4 }}>QUANTIVRA</Typography.Title>
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
