import { RouterProvider } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import { AuthProvider } from './contexts/AuthContext';
import { router } from './routes';

export default function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#c7ceea',
          colorBgContainer: '#151a1e',
          colorBgLayout: '#0b0f12',
          colorText: '#f0ede6',
          colorTextSecondary: 'rgba(240,237,230,0.6)',
          colorBorder: 'rgba(255,255,255,0.08)',
          borderRadius: 6,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
        components: {
          Table: { headerBg: '#111518', rowHoverBg: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' },
          Modal: { contentBg: '#151a1e', headerBg: '#151a1e' },
          Input: { colorBgContainer: '#0b0f12', colorBorder: 'rgba(255,255,255,0.1)', colorText: '#f0ede6' },
          Select: { colorBgContainer: '#0b0f12', colorBorder: 'rgba(255,255,255,0.1)', colorText: '#f0ede6', optionSelectedBg: 'rgba(199,206,234,0.15)' },
          Card: { colorBgContainer: '#151a1e' },
        },
      }}
    >
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ConfigProvider>
  );
}
