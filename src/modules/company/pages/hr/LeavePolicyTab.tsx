import { useState, useEffect, useCallback } from 'react';
import { Card, Form, InputNumber, Select, Button, message } from 'antd';
import { leaveService, type LeavePolicy } from '../../../../services/hr';
import { useCompanyAccess } from '../../../../contexts/CompanyAccess';

/** HR → Leave Policy: rules for the whole company. Rules for one kind of leave (notice, limits) are on its Leave Type. */
export function LeavePolicyTab({ companyId }: { companyId: number }) {
  const access = useCompanyAccess();
  const canEdit = access.canWrite('leave') || access.canWrite('employees');
  const [form] = Form.useForm<LeavePolicy>();
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    form.setFieldsValue(await leaveService.policy(companyId));
    setLoaded(true);
  }, [companyId, form]);
  useEffect(() => { load(); }, [load]);

  const save = async (v: LeavePolicy) => {
    setSaving(true);
    try {
      await leaveService.savePolicy(companyId, {
        max_off_per_day: v.max_off_per_day || null, max_off_scope: v.max_off_scope || 'company',
        min_at_work_per_department: v.min_at_work_per_department || null,
      });
      message.success('Leave policy saved');
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <Card loading={!loaded}>
        <Form form={form} layout="vertical" onFinish={save} disabled={!canEdit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
            <Form.Item name="max_off_per_day" label="Most people off on the same day">
              <InputNumber style={{ width: '100%' }} min={1} placeholder="No limit" />
            </Form.Item>
            <Form.Item name="max_off_scope" label="Counted across">
              <Select options={[{ value: 'company', label: 'The whole company' }, { value: 'department', label: 'Each department' }]} />
            </Form.Item>
          </div>
          <Form.Item name="min_at_work_per_department" label="Fewest people from a department who must be at work">
            <InputNumber style={{ width: '100%' }} min={1} placeholder="No minimum" />
          </Form.Item>
          {canEdit && <Button type="primary" htmlType="submit" loading={saving}>Save</Button>}
        </Form>
      </Card>
    </div>
  );
}
