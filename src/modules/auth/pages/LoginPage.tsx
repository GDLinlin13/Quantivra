import { useState } from 'react';
import { Card, Form, Input, Button, Checkbox } from 'antd';
import { UserOutlined, LockOutlined, BankOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { isPlatformUsername } from '../../../services/auth';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (values: { username: string; password: string; company_code?: string }) => {
    setError('');
    setLoading(true);
    try {
      // AEGIS (or no company code) → platform administrator sign-in.
      if (isPlatformUsername(values.username) || !values.company_code?.trim()) {
        await login(values.username, values.password, 'platform', remember);
        navigate('/platform');
      } else {
        await login(values.username, values.password, 'company', remember, values.company_code.trim().toLowerCase());
        navigate('/company');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0b0f12',
    }}>
      <style>{`
        @keyframes rainbowShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.3; transform: translate(-50%,-50%) scale(1); }
          50% { opacity: 0.7; transform: translate(-50%,-50%) scale(1.1); }
        }
        @keyframes letterShift {
          0%   { color: #ff9aa2; text-shadow: 0 0 20px #ff9aa2, 0 0 40px #ff9aa260; }
          14%  { color: #ffb7b2; text-shadow: 0 0 20px #ffb7b2, 0 0 40px #ffb7b260; }
          28%  { color: #ffdac1; text-shadow: 0 0 20px #ffdac1, 0 0 40px #ffdac160; }
          42%  { color: #e2f0cb; text-shadow: 0 0 20px #e2f0cb, 0 0 40px #e2f0cb60; }
          57%  { color: #b5ead7; text-shadow: 0 0 20px #b5ead7, 0 0 40px #b5ead760; }
          71%  { color: #c7ceea; text-shadow: 0 0 20px #c7ceea, 0 0 40px #c7ceea60; }
          85%  { color: #f0c7e8; text-shadow: 0 0 20px #f0c7e8, 0 0 40px #f0c7e860; }
          100% { color: #f6c445; text-shadow: 0 0 20px #f6c445, 0 0 40px #f6c44560; }
        }
        .quantivra-title {
          font-size: 34px;
          font-weight: 800;
          letter-spacing: 8px;
          display: flex;
          justify-content: center;
          gap: 2px;
        }
        .quantivra-title span {
          display: inline-block;
          animation: letterShift 3s ease-in-out infinite;
        }
        .quantivra-title span:nth-child(1) { animation-delay: 0.0s; }
        .quantivra-title span:nth-child(2) { animation-delay: 0.15s; }
        .quantivra-title span:nth-child(3) { animation-delay: 0.3s; }
        .quantivra-title span:nth-child(4) { animation-delay: 0.45s; }
        .quantivra-title span:nth-child(5) { animation-delay: 0.6s; }
        .quantivra-title span:nth-child(6) { animation-delay: 0.75s; }
        .quantivra-title span:nth-child(7) { animation-delay: 0.9s; }
        .quantivra-title span:nth-child(8) { animation-delay: 1.05s; }
        .quantivra-title span:nth-child(9) { animation-delay: 1.2s; }
        .quantivra-glow {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 280px;
          height: 280px;
          transform: translate(-50%, -50%);
          background: radial-gradient(ellipse, rgba(255,154,162,0.12), rgba(198,206,234,0.08), transparent 70%);
          pointer-events: none;
          animation: glowPulse 4s ease-in-out infinite;
        }
      `}</style>
      <Card style={{
        width: 400, background: '#151a1e', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12, padding: 8, position: 'relative', overflow: 'hidden',
      }}>
        <div className="quantivra-glow" />
        <div style={{ textAlign: 'center', marginBottom: 44, marginTop: 20, position: 'relative', zIndex: 1 }}>
          <div className="quantivra-title">
            {'QUANTIVRA'.split('').map((ch, i) => <span key={i}>{ch}</span>)}
          </div>
        </div>

        <Form form={form} layout="vertical" onFinish={handleLogin} autoComplete="off">
          <Form.Item name="company_code">
            <Input
              prefix={<BankOutlined style={{ color: 'rgba(240,237,230,0.3)' }} />}
              placeholder="COMPANY CODE"
              size="large"
              style={{ background: '#0b0f12', border: '1px solid rgba(255,255,255,0.1)', color: '#f0ede6', height: 46, textTransform: 'uppercase' }}
            />
          </Form.Item>
          <Form.Item name="username" rules={[{ required: true, message: 'Enter your username' }]}>
            <Input
              prefix={<UserOutlined style={{ color: 'rgba(240,237,230,0.3)' }} />}
              placeholder="USERNAME"
              autoComplete="username"
              size="large"
              style={{ background: '#0b0f12', border: '1px solid rgba(255,255,255,0.1)', color: '#f0ede6', height: 46 }}
            />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true }]}>
            <Input.Password
              prefix={<LockOutlined style={{ color: 'rgba(240,237,230,0.3)' }} />}
              placeholder="PASSWORD"
              size="large"
              autoComplete="current-password"
              style={{ background: '#0b0f12', border: '1px solid rgba(255,255,255,0.1)', color: '#f0ede6', height: 46 }}
            />
          </Form.Item>
          {error && (
            <div style={{ color: '#ff9aa2', textAlign: 'center', fontSize: 13, marginBottom: 12, padding: '6px 12px', background: 'rgba(255,154,162,0.1)', borderRadius: 6 }}>
              {error}
            </div>
          )}
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Checkbox checked={remember} onChange={e => setRemember(e.target.checked)}
              style={{ color: 'rgba(240,237,230,0.5)', fontSize: 13 }}>
              Remember me
            </Checkbox>
          </div>
          <Form.Item style={{ marginTop: 28 }}>
            <Button type="primary" htmlType="submit" loading={loading} block size="large"
              style={{
                background: 'linear-gradient(270deg, #ff9aa2, #ffdac1, #e2f0cb, #b5ead7, #c7ceea)',
                backgroundSize: '200% 200%',
                animation: 'rainbowShift 4s ease infinite',
                animationDelay: '0.5s',
                border: 'none', color: '#111', fontWeight: 700, height: 46, fontSize: 15,
                letterSpacing: 1, borderRadius: 8,
              }}>
              SIGN IN
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
