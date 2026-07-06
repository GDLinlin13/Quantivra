import React from 'react';
import { Typography, Card, Tabs } from 'antd';

export default function TaxPage() {
  return (
    <div>
      <Typography.Title level={4}>Tax</Typography.Title>
      <Card>
        <Tabs items={[
          { key: 'settings', label: 'Tax Settings', children: <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Tax settings module coming soon</div> },
          { key: 'reports', label: 'Tax Reports', children: <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Tax reports module coming soon</div> },
          { key: 'filing', label: 'Tax Filing', children: <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Tax filing module coming soon</div> },
        ]} />
      </Card>
    </div>
  );
}
