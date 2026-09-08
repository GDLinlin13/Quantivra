import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Switch, message, Tag, Space } from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { leaveService, type LeaveType } from '../../../../services/hr';

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
    else form.setFieldsValue({ is_paid: true, requires_approval: true, active: true, default_days: 14, statutory_min: 7, carry_forward_cap: 0, encashable: false, color: '#4fc3f7' });
    setOpen(true);
  };

  const submit = async (v: any) => {
    try {
      await leaveService.saveType({ ...editing, ...v, company_id: companyId });
      message.success('Saved'); setOpen(false); load();
    } catch (e: any) { message.error(e.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit(null)}
          style={{ background: '#c7ceea', borderColor: '#c7ceea', color: '#111' }}>Add Leave Type</Button>
      </div>
      <Table dataSource={rows} rowKey="id" loading={loading} size="small" pagination={false} style={{ background: 'transparent' }}
        locale={{ emptyText: <span style={{ color: 'rgba(240,237,230,0.4)' }}>No leave types</span> }}
        columns={[
          { title: 'Name', dataIndex: 'name', key: 'n', render: (v: string, r: LeaveType) => <Space><span style={{ width: 10, height: 10, borderRadius: 3, background: r.color, display: 'inline-block' }} /><span style={{ color: '#f0ede6' }}>{v}</span></Space> },
          { title: 'Company default', dataIndex: 'default_days', key: 'd' },
          { title: 'Statutory min', dataIndex: 'statutory_min', key: 'sm', render: (v: number) => v || 0 },
          { title: 'Paid', dataIndex: 'is_paid', key: 'p', render: (v: boolean) => v ? <Tag color="green">Paid</Tag> : <Tag>Unpaid</Tag> },
          { title: 'Approval', dataIndex: 'requires_approval', key: 'a', render: (v: boolean) => v ? 'Required' : 'Auto' },
          { title: 'Carry Cap', dataIndex: 'carry_forward_cap', key: 'c' },
          { title: 'Encashable', dataIndex: 'encashable', key: 'e', render: (v: boolean) => v ? 'Yes' : 'No' },
          { title: 'Active', dataIndex: 'active', key: 'ac', render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Off'}</Tag> },
          { title: '', key: 'act', render: (_: any, r: LeaveType) => <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /> },
        ]}
      />
      <Modal title={editing ? 'Edit Leave Type' : 'Add Leave Type'} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Save">
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="default_days" label="Company default (days/yr)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
            <Form.Item name="statutory_min" label="Statutory minimum (days/yr)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
            <Form.Item name="carry_forward_cap" label="Carry-forward Cap"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
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
