import React from 'react';
import { Typography, Card, Tabs } from 'antd';

export default function DocumentsPage() {
  return (
    <div>
      <Typography.Title level={4}>Documents</Typography.Title>
      <Card>
        <Tabs items={[
          { key: 'contracts', label: 'Employment Contracts', children: <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Documents module coming soon</div> },
          { key: 'letters', label: 'Official Letters', children: <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Letters module coming soon</div> },
          { key: 'exit', label: 'Exit Documents', children: <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Exit documents coming soon</div> },
        ]} />
      </Card>
    </div>
  );
}
