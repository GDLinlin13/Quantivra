import { useState, useEffect, useCallback } from 'react';
import { Typography, Card, Switch, Button, Select, InputNumber, Space, Alert, Empty, message } from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { useAuth } from '../../../contexts/AuthContext';
import { useCompanyAccess } from '../../../contexts/CompanyAccess';
import { supabase } from '../../../utils/supabase';
import { workflowService, MANAGER, type Flow, type FlowKind } from '../../../services/workflow';

const { Title, Text } = Typography;

const KINDS: { kind: FlowKind; title: string; what: string; unit: string; minLabel: string }[] = [
  { kind: 'leave', title: 'Leave', what: 'leave requests', unit: 'days', minLabel: 'Only for leave of at least' },
  { kind: 'claim', title: 'Claims', what: 'expense claims', unit: 'in the claim’s amount', minLabel: 'Only for claims of at least' },
  { kind: 'po', title: 'Purchase orders', what: 'purchase orders', unit: 'in the order’s total', minLabel: 'Only for orders of at least' },
];

function FlowCard({ meta, flow, roles, canEdit, onSave }: {
  meta: (typeof KINDS)[number]; flow: Flow; roles: string[]; canEdit: boolean; onSave: (f: Flow) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Flow>(flow);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(flow), [flow]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(flow);
  const options = [
    ...(meta.kind === 'po' ? [] : [{ value: MANAGER, label: 'The person’s line manager' }]),
    ...[...new Set([...roles, ...draft.steps.map(s => s.approver).filter(a => a !== MANAGER)])].map(r => ({ value: r, label: `Anyone with the ${r} role` })),
  ];
  const setStep = (i: number, patch: Partial<Flow['steps'][number]>) => setDraft(d => ({ ...d, steps: d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const move = (i: number, by: number) => setDraft(d => {
    const steps = [...d.steps]; const [x] = steps.splice(i, 1); steps.splice(i + by, 0, x); return { ...d, steps };
  });
  const save = async () => {
    setSaving(true);
    try { await onSave(draft); message.success(`${meta.title} approval saved`); } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };

  return (
    <Card style={{ marginBottom: 20, maxWidth: 820 }}
      title={<Space size={12}><span>{meta.title}</span>
        <Switch checked={draft.is_active} disabled={!canEdit} checkedChildren="Chain on" unCheckedChildren="No chain" onChange={v => setDraft(d => ({ ...d, is_active: v }))} /></Space>}
      extra={canEdit && <Button type="primary" disabled={!dirty} loading={saving} onClick={save}>Save</Button>}>
      {!draft.is_active ? (
        <Text type="secondary">No chain: anyone with the {meta.title} → Approve tick decides {meta.what}.</Text>
      ) : (
        <>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            {meta.what[0].toUpperCase() + meta.what.slice(1)} go through these steps in order. A rejection at any step rejects the request; the last approval approves it.
            Admin and Director roles can act at any step. Nobody approves their own.
          </Text>
          {draft.steps.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No steps yet: add the first approver" />}
          {draft.steps.map((s, i) => (
            <Space key={i} wrap style={{ display: 'flex', marginBottom: 8 }}>
              <Text strong style={{ width: 56, display: 'inline-block' }}>Step {i + 1}</Text>
              <Select style={{ width: 260 }} disabled={!canEdit} value={s.approver} options={options} onChange={v => setStep(i, { approver: v })} />
              <Space size={6}>
                <Text type="secondary">{meta.minLabel}</Text>
                <InputNumber style={{ width: 100 }} min={0} disabled={!canEdit} placeholder="any" value={s.min_value ?? undefined}
                  onChange={v => setStep(i, { min_value: v == null || v === ('' as any) ? null : Number(v) })} />
                {meta.kind === 'leave' && <Text type="secondary">days</Text>}
              </Space>
              {canEdit && (
                <Space size={4}>
                  <Button size="small" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} />
                  <Button size="small" icon={<ArrowDownOutlined />} disabled={i === draft.steps.length - 1} onClick={() => move(i, 1)} />
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setDraft(d => ({ ...d, steps: d.steps.filter((_, j) => j !== i) }))} />
                </Space>
              )}
            </Space>
          ))}
          {canEdit && (
            <Button icon={<PlusOutlined />} style={{ marginTop: 4 }}
              onClick={() => setDraft(d => ({ ...d, steps: [...d.steps, { approver: meta.kind === 'po' ? (roles[0] || '') : d.steps.length ? (roles[0] || MANAGER) : MANAGER, min_value: null }] }))}>Add a step</Button>
          )}
          {meta.kind === 'claim' && (
            <Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
              A claim in a foreign currency always goes through every step, whatever its amount.
            </Text>
          )}
          {draft.is_active && draft.steps.length === 0 && (
            <Alert style={{ marginTop: 12 }} type="info" showIcon title="With no steps, the chain does nothing: the Approve tick decides." />
          )}
        </>
      )}
    </Card>
  );
}

export function CompanyWorkflowPage() {
  const { companyId } = useAuth();
  const access = useCompanyAccess();
  const canEdit = access.canWrite('workflow');
  const [flows, setFlows] = useState<Record<FlowKind, Flow> | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      const [f, r] = await Promise.all([
        workflowService.flows(companyId),
        supabase.from('company_roles').select('name').eq('company_id', companyId).order('name'),
      ]);
      setFlows(f); setRoles((r.data || []).map((x: any) => x.name)); setError(null);
    } catch (e: any) { setError(e.message); }
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  if (!companyId) return <Alert type="error" title="No company context" />;
  return (
    <div>
      <Title level={4} style={{ color: '#f0ede6', marginBottom: 8 }}>Workflow</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
        Who approves leave, claims and purchase orders, and in what order. For example: the person’s line manager first, then the Director for leave of 5 days or more.
        A line manager is the person set as manager on the employee’s record.
      </Text>
      {error && <Alert type="warning" showIcon title={error} style={{ marginBottom: 16 }} />}
      {flows && KINDS.map(m => (
        <FlowCard key={m.kind} meta={m} flow={flows[m.kind]} roles={roles} canEdit={canEdit}
          onSave={async f => { await workflowService.saveFlow(companyId, f); await load(); access.reload(); }} />
      ))}
    </div>
  );
}
