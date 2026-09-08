import { Table, Tag, Typography } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const ALL_MODULES = ['Dashboard', 'HR', 'Payroll', 'Leave', 'Attendance', 'Claims', 'Finance', 'Accounting', 'Inventory', 'Purchasing', 'Sales', 'CRM', 'Projects', 'Assets', 'Procurement'];

const PACKS: { key: string; name: string; description: string; modules: string[] }[] = [
  { key: 'starter', name: 'Starter', description: 'Essential HR operations including employee management, leave tracking, and expense claims', modules: ['Dashboard', 'HR', 'Leave', 'Claims'] },
  { key: 'hr-payroll', name: 'HR & Payroll', description: 'Complete HR suite with payroll processing, attendance tracking, and leave management', modules: ['Dashboard', 'HR', 'Payroll', 'Leave', 'Attendance', 'Claims'] },
  { key: 'finance', name: 'Finance', description: 'Financial management including accounting, banking operations, and fixed assets tracking', modules: ['Dashboard', 'Finance', 'Accounting', 'Assets'] },
  { key: 'trading', name: 'Trading', description: 'Trading operations with finance, inventory management, purchasing, and sales modules', modules: ['Dashboard', 'Finance', 'Inventory', 'Purchasing', 'Sales'] },
  { key: 'enterprise', name: 'Enterprise', description: 'Full enterprise suite covering all modules', modules: ALL_MODULES },
];

export function BusinessPacksPage() {
  const columns = [
    {
      title: 'Module',
      dataIndex: 'module',
      key: 'module',
      fixed: 'left' as const,
      render: (v: string) => <Text style={{ color: '#f0ede6', fontWeight: 500 }}>{v}</Text>,
    },
    ...PACKS.map(pack => ({
      title: <Text style={{ color: '#f0ede6' }}>{pack.name}</Text>,
      dataIndex: pack.key,
      key: pack.key,
      align: 'center' as const,
      render: (included: boolean) => included
        ? <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
        : <CloseCircleOutlined style={{ color: 'rgba(240,237,230,0.2)', fontSize: 16 }} />,
    })),
  ];

  const dataSource = ALL_MODULES.map(mod => {
    const row: any = { key: mod, module: mod };
    PACKS.forEach(pack => { row[pack.key] = pack.modules.includes(mod); });
    return row;
  });

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ color: '#f0ede6', margin: 0 }}>Business Packs</Title>
        <Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 13 }}>
          Each business pack enables a specific set of modules. Select a pack during company creation to pre-configure your system.
        </Text>
      </div>
      <Table
        dataSource={dataSource}
        columns={columns}
        pagination={false}
        size="small"
        style={{ background: 'transparent' }}
        bordered
      />
      <div style={{ marginTop: 24 }}>
        <Title level={5} style={{ color: '#f0ede6', marginBottom: 12 }}>Pack Descriptions</Title>
        {PACKS.map(pack => (
          <div key={pack.key} style={{ marginBottom: 12 }}>
            <Text style={{ color: '#f0ede6', fontWeight: 500, display: 'block' }}>{pack.name}</Text>
            <Text style={{ color: 'rgba(240,237,230,0.6)', fontSize: 13 }}>{pack.description}</Text>
            <div style={{ marginTop: 4 }}>
              {pack.modules.map(m => (
                <Tag key={m} style={{ fontSize: 11, marginBottom: 2 }}>{m}</Tag>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
