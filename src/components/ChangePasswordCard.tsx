import { useState } from 'react';
import { Card, Form, Input, Button, Typography, message } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { authService } from '../services/auth';
import { useAuth } from '../contexts/AuthContext';

const { Title, Text } = Typography;

/** Lets the signed-in person change their own password. */
export function ChangePasswordCard() {
  const { user } = useAuth();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const submit = async (v: { current: string; next: string }) => {
    setSaving(true);
    try {
      await authService.changePassword(v.current, v.next);
      message.success('Password changed. Use the new password next time you sign in.');
      form.resetFields();
    } catch (e: any) {
      message.error(e.message);
    }
    setSaving(false);
  };

  return (
    <Card style={{ background: '#151a1e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, maxWidth: 480 }}>
      <Title level={5} style={{ color: '#f0ede6', marginTop: 0 }}>Change my password</Title>
      {user?.email && <Text style={{ color: 'rgba(240,237,230,0.6)', display: 'block', marginBottom: 16 }}>Signed in as {user.email}</Text>}
      <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
        <Form.Item name="current" label={<Text style={{ color: '#f0ede6' }}>Current password</Text>} rules={[{ required: true, message: 'Enter your current password' }]}>
          <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
        </Form.Item>
        <Form.Item name="next" label={<Text style={{ color: '#f0ede6' }}>New password</Text>}
          rules={[{ required: true, message: 'Enter a new password' }, { min: 8, message: 'At least 8 characters' }]}>
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="confirm" label={<Text style={{ color: '#f0ede6' }}>Confirm new password</Text>} dependencies={['next']}
          rules={[{ required: true, message: 'Type the new password again' },
            ({ getFieldValue }) => ({ validator: (_, v) => (!v || v === getFieldValue('next') ? Promise.resolve() : Promise.reject(new Error('Passwords do not match'))) })]}>
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={saving} style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>
          Change password
        </Button>
      </Form>
    </Card>
  );
}
