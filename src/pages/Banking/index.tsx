import React from 'react';
import { Typography, Card, Tabs } from 'antd';

export default function BankingPage() {
  return (
    <div>
      <Typography.Title level={4}>Banking</Typography.Title>
      <Card>
        <Tabs items={[
          { key: 'accounts', label: 'Bank Accounts', children: <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Bank accounts module coming soon</div> },
          { key: 'reconciliation', label: 'Reconciliation', children: <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Reconciliation module coming soon</div> },
          { key: 'transfers', label: 'Transfers', children: <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Transfers module coming soon</div> },
        ]} />
      </Card>
    </div>
  );
}
