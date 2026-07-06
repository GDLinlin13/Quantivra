import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme, App as AntApp } from 'antd';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ConfigProvider
        theme={{
          algorithm: theme.darkAlgorithm,
          token: {
            colorPrimary: '#a78bfa',
            colorBgLayout: '#0b0f12',
            colorBgContainer: 'rgba(20, 25, 30, 0.85)',
            colorBgElevated: '#1a1d1f',
            colorBorder: 'rgba(120, 200, 255, 0.18)',
            colorText: '#f4f1e8',
            colorTextSecondary: '#b8b0a2',
            borderRadius: 8,
          },
          components: {
            Card: {
              colorBgContainer: 'rgba(20, 25, 30, 0.85)',
              borderRadiusLG: 8,
            },
            Table: {
              colorBgContainer: 'transparent',
            },
            Drawer: {
              colorBgElevated: '#0f172a',
            },
            Menu: {
              colorItemBgSelected: 'rgba(167, 139, 250, 0.15)',
              colorItemTextSelected: '#a78bfa',
            },
          },
        }}
      >
        <AntApp>
          <AuthProvider>
            <App />
          </AuthProvider>
        </AntApp>
      </ConfigProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
