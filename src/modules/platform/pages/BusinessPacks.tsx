import { Table, Tag, Typography } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { ALL_FEATURES_MODULES, moduleLabel, BUSINESS_PACK_PRESETS } from '../../../data/businessPacks';

const { Title, Text } = Typography;

/** The same packs the Create Company screen offers; the Dashboard, Company, Users and Settings are always on. */
export function BusinessPacksPage() {
  const packs = Object.entries(BUSINESS_PACK_PRESETS).map(([key, p]) => ({ key, ...p }));
  const columns = [
    {
      title: 'Section', dataIndex: 'module', key: 'module', fixed: 'left' as const,
      render: (v: string) => <Text style={{ color: '#f0ede6', fontWeight: 500 }}>{v}</Text>,
    },
    ...packs.map(pack => ({
      title: <Text style={{ color: '#f0ede6' }}>{pack.label}</Text>,
      dataIndex: pack.key, key: pack.key, align: 'center' as const,
      render: (included: boolean) => included
        ? <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
        : <CloseCircleOutlined style={{ color: 'rgba(240,237,230,0.2)', fontSize: 16 }} />,
    })),
  ];
  const dataSource = [
    { key: 'dashboard', module: 'Dashboard (always on)', ...Object.fromEntries(packs.map(p => [p.key, true])) },
    ...ALL_FEATURES_MODULES.map(m => ({ key: m, module: moduleLabel(m), ...Object.fromEntries(packs.map(p => [p.key, p.modules.includes(m)])) })),
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ color: '#f0ede6', margin: 0 }}>Business Packs</Title>
        <Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 13 }}>
          A pack switches on a set of sections when a company is created. Sections can be changed later from Companies → Edit.
        </Text>
      </div>
      <Table dataSource={dataSource} columns={columns} pagination={false} size="small" style={{ background: 'transparent' }} bordered />
      <div style={{ marginTop: 24 }}>
        <Title level={5} style={{ color: '#f0ede6', marginBottom: 12 }}>Pack Descriptions</Title>
        {packs.map(pack => (
          <div key={pack.key} style={{ marginBottom: 12 }}>
            <Text style={{ color: '#f0ede6', fontWeight: 500, display: 'block' }}>{pack.label}</Text>
            <Text style={{ color: 'rgba(240,237,230,0.6)', fontSize: 13 }}>{pack.desc}</Text>
            <div style={{ marginTop: 4 }}>
              {pack.modules.map(m => <Tag key={m} style={{ fontSize: 11, marginBottom: 2 }}>{moduleLabel(m)}</Tag>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
