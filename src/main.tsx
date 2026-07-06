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
          algorithm: theme.defaultAlgorithm,
          token: {
            colorPrimary: '#b8c9e8',
            colorBgLayout: '#f0ecec',
            colorBgContainer: '#ffffff',
            borderRadius: 8,
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
