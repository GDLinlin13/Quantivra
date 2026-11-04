import { useEffect, useState, useCallback } from 'react';
import { Card, Select, Button, Space, Typography, message, Table, DatePicker, Input, Tag, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { calendarService } from '../../../../services/hr';
import { officialHolidays } from '../../../../data/public-holidays';
import { DAY_KEYS, DAY_LABELS, workDaysPerWeek, type WorkPattern } from '../../../../utils/workdays';

const { Text, Title } = Typography;
const THIS_YEAR = new Date().getFullYear();

/** Company work week + public holiday calendar: what leave counting skips. */
export function WorkWeekHolidaysCard({ companyId, country }: { companyId: number; country: string }) {
  const [pattern, setPattern] = useState<WorkPattern | null>(null);
  const [year, setYear] = useState(THIS_YEAR);
  const [holidays, setHolidays] = useState<{ id: number; holiday_date: string; name: string; source: string }[]>([]);
  const [newDate, setNewDate] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const loadHolidays = useCallback(async () => {
    try { setHolidays(await calendarService.holidays(companyId, `${year}-01-01`, `${year}-12-31`)); }
    catch (e: any) { message.error(e.message); }
  }, [companyId, year]);

  useEffect(() => { calendarService.companyPattern(companyId).then(setPattern); }, [companyId]);
  useEffect(() => { loadHolidays(); }, [loadHolidays]);

  const savePattern = async () => {
    if (!pattern) return;
    try { await calendarService.saveCompanyPattern(companyId, pattern); message.success('Work week saved'); }
    catch (e: any) { message.error(e.message); }
  };

  const importOfficial = async () => {
    setBusy(true);
    try {
      const n = await calendarService.importOfficial(companyId, country, year);
      message.success(n ? `Added ${country} public holidays for ${year}` : `No official list for ${country} ${year} yet — add them below`);
      loadHolidays();
    } catch (e: any) { message.error(e.message); }
    setBusy(false);
  };

  const add = async () => {
    if (!newDate || !newName.trim()) { message.info('Pick a date and enter a name'); return; }
    try { await calendarService.addHoliday(companyId, newDate, newName.trim()); setNewDate(null); setNewName(''); loadHolidays(); }
    catch (e: any) { message.error(e.message); }
  };

  const hasOfficial = officialHolidays(country, year).length > 0;

  return (
    <Card style={{ background: '#151a1e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, maxWidth: 900, marginTop: 24 }}>
      <Title level={5} style={{ color: '#f0ede6', marginTop: 0 }}>Work week &amp; public holidays</Title>
      <Text style={{ color: 'rgba(240,237,230,0.6)', display: 'block', marginBottom: 12 }}>
        Leave counted in working days skips rest days and the holidays below. Employees who work a different week can be set under HR → Employees.
      </Text>

      {pattern && (
        <Space wrap style={{ marginBottom: 8 }}>
          {DAY_KEYS.map(k => (
            <div key={k} style={{ textAlign: 'center' }}>
              <div style={{ color: 'rgba(240,237,230,0.6)', fontSize: 12 }}>{DAY_LABELS[k]}</div>
              <Select size="small" value={pattern[k]} style={{ width: 82 }}
                onChange={v => setPattern({ ...pattern, [k]: v })}
                options={[{ value: 1, label: 'Full' }, { value: 0.5, label: 'Half' }, { value: 0, label: 'Off' }]} />
            </div>
          ))}
          <div>
            <div style={{ fontSize: 12 }}>&nbsp;</div>
            <Button size="small" type="primary" onClick={savePattern} style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>
              Save work week ({workDaysPerWeek(pattern)} days)
            </Button>
          </div>
        </Space>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '16px 0 8px' }}>
        <Text style={{ color: '#f0ede6' }}>Public holidays</Text>
        <Select value={year} onChange={setYear} style={{ width: 90 }} size="small"
          options={[THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1].map(y => ({ value: y, label: String(y) }))} />
        {hasOfficial && (
          <Button size="small" icon={<CloudDownloadOutlined />} loading={busy} onClick={importOfficial}>
            Add official {country} holidays for {year}
          </Button>
        )}
      </div>
      <Table
        dataSource={holidays} rowKey="id" size="small" pagination={false} style={{ background: 'transparent' }}
        locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No holidays for {year} yet{hasOfficial ? ' — use "Add official holidays"' : ''}</span> }}
        columns={[
          { title: 'Date', dataIndex: 'holiday_date', key: 'd', render: (v: string) => dayjs(v).format('ddd D MMM YYYY') },
          { title: 'Holiday', dataIndex: 'name', key: 'n' },
          { title: '', dataIndex: 'source', key: 's', render: (v: string) => <Tag color={v === 'official' ? 'blue' : 'gold'}>{v === 'official' ? 'Official' : 'Company'}</Tag> },
          {
            title: '', key: 'x', render: (_: any, r: any) => (
              <Popconfirm title="Remove this holiday?" onConfirm={() => calendarService.deleteHoliday(r.id).then(loadHolidays).catch(e => message.error(e.message))}>
                <Button size="small" icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]}
      />
      <Space wrap style={{ marginTop: 8 }}>
        <DatePicker value={newDate ? dayjs(newDate) : null} onChange={d => setNewDate(d ? d.format('YYYY-MM-DD') : null)} />
        <Input placeholder="e.g. Company retreat" value={newName} onChange={e => setNewName(e.target.value)} style={{ width: 220 }} />
        <Button icon={<PlusOutlined />} onClick={add}>Add company holiday</Button>
      </Space>
    </Card>
  );
}
