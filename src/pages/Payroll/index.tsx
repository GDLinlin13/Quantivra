import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Select, DatePicker, InputNumber, Input, message, Space, Tag, Typography, Row, Col, Card, Statistic } from 'antd';
import { PlusOutlined, DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { supabase } from '../../utils/supabase';
import { useCompanyId } from '../../utils/useCompany';

const { RangePicker } = DatePicker;

export default function PayrollPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [totalPay, setTotalPay] = useState(0);

  useEffect(() => { loadData(); }, []);

  const companyId = useCompanyId();

  async function loadData() {
    try {
      const [recRes, empRes] = await Promise.all([
        supabase.from('payroll_records').select('*, employees(full_name, department)').eq('company_id', companyId).order('created_at', { ascending: false }),
        supabase.from('employees').select('id, full_name, salary').eq('company_id', companyId).eq('status', 'active'),
      ]);
      setRecords(recRes.data || []);
      setEmployees(empRes.data || []);
      setTotalPay((recRes.data || []).reduce((s: number, r: any) => s + (r.net_pay || 0), 0));
    } catch {} finally { setLoading(false); }
  }

  async function handleRunPayroll(values: any) {
    setSaving(true);
    try {
      const [start, end] = values.period;
      const payDate = values.pay_date.format('YYYY-MM-DD');
      const periodStart = start.format('YYYY-MM-DD');
      const periodEnd = end.format('YYYY-MM-DD');

      const { data: activeEmps } = await supabase.from('employees').select('id, salary').eq('company_id', companyId).eq('status', 'active');

      const records = (activeEmps || []).map((emp: any) => ({
        company_id: companyId,
        employee_id: emp.id,
        pay_period_start: periodStart,
        pay_period_end: periodEnd,
        pay_date: payDate,
        basic_pay: emp.salary / 26,
        allowances: 0,
        deductions: 0,
        tax_deduction: emp.salary / 26 * 0.1,
        other_deductions: 0,
        net_pay: emp.salary / 26 * 0.9,
        status: 'calculated',
      }));

      const { error } = await supabase.from('payroll_records').insert(records);
      if (error) throw error;
      message.success(`Payroll run for ${records.length} employees`);
      setModalOpen(false);
      loadData();
    } catch (err: any) { message.error(err.message); } finally { setSaving(false); }
  }

  const columns = [
    { title: 'Employee', dataIndex: ['employees', 'full_name'], key: 'emp' },
    { title: 'Dept', dataIndex: ['employees', 'department'], key: 'dept' },
    { title: 'Period', key: 'period', render: (_: any, r: any) => `${r.pay_period_start} to ${r.pay_period_end}` },
    { title: 'Basic', dataIndex: 'basic_pay', key: 'basic', render: (v: number) => `$${v?.toFixed(2)}` },
    { title: 'Allowances', dataIndex: 'allowances', key: 'allow', render: (v: number) => `$${v?.toFixed(2)}` },
    { title: 'Deductions', dataIndex: 'deductions', key: 'ded', render: (v: number) => `$${v?.toFixed(2)}` },
    { title: 'Tax', dataIndex: 'tax_deduction', key: 'tax', render: (v: number) => `$${v?.toFixed(2)}` },
    { title: 'Net Pay', dataIndex: 'net_pay', key: 'net', render: (v: number) => <strong>${v?.toFixed(2)}</strong> },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'paid' ? 'green' : 'blue'}>{s}</Tag> },
    { title: 'Pay Date', dataIndex: 'pay_date', key: 'date' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Payroll</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>Run Payroll</Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}><Card><Statistic title="Total Net Pay" value={totalPay} precision={2} prefix="$" /></Card></Col>
        <Col span={8}><Card><Statistic title="Payroll Runs" value={records.length} /></Card></Col>
        <Col span={8}><Card><Statistic title="Employees" value={employees.length} /></Card></Col>
      </Row>

      <Table dataSource={records} columns={columns} rowKey="id" loading={loading} />

      <Modal title="Run Payroll" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleRunPayroll}>
          <Form.Item name="period" label="Pay Period" rules={[{ required: true }]}>
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="pay_date" label="Pay Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>Calculate & Run Payroll</Button>
        </Form>
      </Modal>
    </div>
  );
}
