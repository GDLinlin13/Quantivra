import React from 'react';
import { Typography, Card, Tabs } from 'antd';

export default function PerformancePage() {
  return (
    <div>
      <Typography.Title level={4}>Performance</Typography.Title>
      <Card>
        <Tabs items={[
          { key: 'kpi', label: 'KPI Setup', children: <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>KPI module coming soon</div> },
          { key: 'reviews', label: 'Performance Reviews', children: <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Reviews module coming soon</div> },
          { key: 'feedback', label: 'Manager Feedback', children: <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Feedback module coming soon</div> },
        ]} />
      </Card>
    </div>
  );
}
