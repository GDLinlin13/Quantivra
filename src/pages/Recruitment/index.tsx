import React from 'react';
import { Typography, Card, Tabs } from 'antd';

export default function RecruitmentPage() {
  return (
    <div>
      <Typography.Title level={4}>Recruitment</Typography.Title>
      <Card>
        <Tabs items={[
          { key: 'vacancies', label: 'Job Vacancies', children: <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Vacancies module coming soon</div> },
          { key: 'applicants', label: 'Applicants', children: <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Applicants module coming soon</div> },
          { key: 'interviews', label: 'Interview Scheduling', children: <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Interviews module coming soon</div> },
        ]} />
      </Card>
    </div>
  );
}
