import { useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, Spin, message } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';

const { Title, Text } = Typography;

/**
 * Guards the platform and company areas: signed-out visitors go to the login
 * page, each side only opens for its own kind of login, and anyone signed in
 * with a temporary password must choose their own before going further.
 */
export function RequireAuth({ type, children }: { type: 'platform' | 'company'; children: ReactNode }) {
  const auth = useAuth();
  if (auth.loading) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b0f12' }}><Spin size="large" /></div>;
  }
  if (!auth.isAuthenticated) return <Navigate to="/login" replace />;
  if (auth.type !== type) return <Navigate to={auth.type === 'platform' ? '/platform' : '/company'} replace />;
  if (auth.mustChangePassword) return <FirstPasswordScreen />;
  return <>{children}</>;
}

function FirstPasswordScreen() {
  const { user, setFirstPassword, logout } = useAuth();
  const [saving, setSaving] = useState(false);

  const submit = async (v: { next: string }) => {
    setSaving(true);
    try {
      await setFirstPassword(v.next);
      message.success('Password set. Welcome to Quantivra!');
    } catch (e: any) {
      message.error(e.message);
    }
    setSaving(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b0f12', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 420, background: '#151a1e', border: '1px solid rgba(255,255,255,0.08)' }}>
        <Title level={4} style={{ color: '#f0ede6', marginTop: 0 }}>Choose your new password</Title>
        <Text style={{ color: 'rgba(240,237,230,0.6)', display: 'block', marginBottom: 20 }}>
          {user?.full_name ? `Hi ${user.full_name}. ` : ''}You signed in with a temporary password. Please choose your own before continuing.
        </Text>
        <Form layout="vertical" onFinish={submit} requiredMark={false}>
          <Form.Item name="next" label={<Text style={{ color: '#f0ede6' }}>New password</Text>}
            rules={[{ required: true, message: 'Enter a new password' }, { min: 8, message: 'At least 8 characters' }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="new-password" autoFocus />
          </Form.Item>
          <Form.Item name="confirm" label={<Text style={{ color: '#f0ede6' }}>Confirm new password</Text>} dependencies={['next']}
            rules={[{ required: true, message: 'Type the new password again' },
              ({ getFieldValue }) => ({ validator: (_, v) => (!v || v === getFieldValue('next') ? Promise.resolve() : Promise.reject(new Error('Passwords do not match'))) })]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={saving} style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>
            Set password and continue
          </Button>
          <Button type="link" block onClick={logout} style={{ marginTop: 8 }}>Sign out</Button>
        </Form>
      </Card>
    </div>
  );
}
