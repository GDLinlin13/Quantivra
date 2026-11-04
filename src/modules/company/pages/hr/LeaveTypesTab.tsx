import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Switch, message, Tag, Space, Alert, Typography, Select } from 'antd';
import { unitLabel } from '../../../../utils/workdays';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { leaveService, type LeaveType } from '../../../../services/hr';

function policyText(r: LeaveType) {
  const inc = Number(r.increment_per_year || 0);
  const u = unitLabel(r.count_method, Number(r.default_days));
  if (!inc) return `${r.default_days} ${u}`;
  return (
    <span>
      {r.default_days} {u}, +{inc}/year{r.max_days != null ? `, up to ${r.max_days}` : ''}
      <Typography.Text type="secondary" style={{ display: 'block', fontSize: 11 }}>grows with service</Typography.Text>
    </span>
  );
}

export function LeaveTypesTab({ companyId }: { companyId: number }) {
  const [rows, setRows] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    setRows(await leaveService.types(companyId));
    setLoading(false);
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  const openEdit = (r: LeaveType | null) => {
    setEditing(r);
    form.resetFields();
    if (r) form.setFieldsValue(r);
    else form.setFieldsValue({ is_paid: true, requires_approval: true, active: true, default_days: 14, statutory_min: 7, carry_forward_cap: 0, encashable: false, color: '#4fc3f7', increment_per_year: 0, max_days: null, count_method: 'working_days', allow_single_days: false });
    setOpen(true);
  };

  const submit = async (v: any) => {
    try {
      await leaveService.saveType({
        ...editing, ...v, company_id: companyId,
        increment_per_year: v.increment_per_year || 0,
        max_days: v.max_days === undefined || v.max_days === '' ? null : v.max_days,
      });
      message.success('Saved'); setOpen(false); load();
    } catch (e: any) { message.error(e.message); }
  };

  return (
    <div>
      <Alert type="info" showIcon style={{ marginBottom: 12 }}
        message="These are your company's own leave policies. The law sets the minimum; employees always get at least that, even if a policy here is lower." />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit(null)}
          style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>Add Leave Type</Button>
      </div>
      <Table dataSource={rows} rowKey="id" loading={loading} size="small" pagination={false} style={{ background: 'transparent' }}
        locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No leave types</span> }}
        columns={[
          { title: 'Name', dataIndex: 'name', key: 'n', render: (v: string, r: LeaveType) => <Space><span style={{ width: 10, height: 10, borderRadius: 3, background: r.color, display: 'inline-block' }} /><span style={{ color: '#f0ede6' }}>{v}</span></Space> },
          { title: 'Company policy', key: 'd', render: (_: any, r: LeaveType) => policyText(r) },
          { title: 'Statutory min', dataIndex: 'statutory_min', key: 'sm', render: (v: number) => v || 0 },
          { title: 'Counted in', key: 'cm', render: (_: any, r: LeaveType) => r.count_method === 'weeks'
            ? <span>Whole weeks{r.allow_single_days ? <Typography.Text type="secondary" style={{ display: 'block', fontSize: 11 }}>single days allowed</Typography.Text> : null}</span>
            : 'Working days' },
          { title: 'Paid', dataIndex: 'is_paid', key: 'p', render: (v: boolean) => v ? <Tag color="green">Paid</Tag> : <Tag>Unpaid</Tag> },
          { title: 'Approval', dataIndex: 'requires_approval', key: 'a', render: (v: boolean) => v ? 'Required' : 'Auto' },
          { title: 'Carry over (max)', dataIndex: 'carry_forward_cap', key: 'c' },
          { title: 'Encashable', dataIndex: 'encashable', key: 'e', render: (v: boolean) => v ? 'Yes' : 'No' },
          { title: 'Active', dataIndex: 'active', key: 'ac', render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Off'}</Tag> },
          { title: '', key: 'act', render: (_: any, r: LeaveType) => <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /> },
        ]}
      />
      <Modal title={editing ? 'Edit Leave Type' : 'Add Leave Type'} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Save">
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="count_method" label="Count this leave in">
            <Select options={[
              { value: 'working_days', label: 'Working days — skips rest days and public holidays' },
              { value: 'weeks', label: 'Whole weeks — 7-day blocks, weekends and holidays included' },
            ]} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(a, b) => a.count_method !== b.count_method}>
            {({ getFieldValue }) => getFieldValue('count_method') === 'weeks' && (
              <Form.Item name="allow_single_days" valuePropName="checked"
                label="Also allow single days (by agreement with the employee)"
                tooltip="Part-weeks are converted from working days, e.g. 3 working days of a 5-day week = 0.6 weeks.">
                <Switch />
              </Form.Item>
            )}
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="default_days" label="Per year (starting) — days, or weeks if counted in weeks"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
            <Form.Item name="statutory_min" label="Statutory minimum (days/yr)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
            <Form.Item name="increment_per_year" label="Extra days per completed year of service"
              tooltip="Added on top of the starting days for each full year the employee has worked here. 0 = same for everyone.">
              <InputNumber style={{ width: '100%' }} min={0} step={0.5} />
            </Form.Item>
            <Form.Item name="max_days" label="Up to a maximum of (days)" tooltip="Leave empty for no maximum.">
              <InputNumber style={{ width: '100%' }} min={0} placeholder="No maximum" />
            </Form.Item>
            <Form.Item name="carry_forward_cap" label="Unused days carried to next year (max)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
            <Form.Item name="color" label="Colour"><Input type="color" style={{ width: '100%', height: 32 }} /></Form.Item>
          </div>
          <Space size="large">
            <Form.Item name="is_paid" label="Paid" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="requires_approval" label="Requires Approval" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="encashable" label="Encashable" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="active" label="Active" valuePropName="checked"><Switch /></Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
