import React from 'react';
import { Typography, Card, Tabs } from 'antd';

export default function AttendancePage() {
  return (
    <div>
      <Typography.Title level={4}>Attendance</Typography.Title>
      <Card>
        <Tabs items={[
          { key: 'clock', label: 'Clock In/Out', children: <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Clock in/out module coming soon</div> },
          { key: 'timesheet', label: 'Timesheets', children: <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Timesheets module coming soon</div> },
          { key: 'shifts', label: 'Shift Schedules', children: <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Shift scheduling coming soon</div> },
        ]} />
      </Card>
    </div>
  );
}
