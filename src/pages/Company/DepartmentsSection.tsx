import React, { useEffect, useState, useCallback } from 'react';
import { Checkbox, Select, Button, message, Spin } from 'antd';
import { supabase } from '../../utils/supabase';

export default function DepartmentsSection({ companyId }: { companyId: number }) {
  const [allDepts, setAllDepts] = useState<any[]>([]);
  const [enabled, setEnabled] = useState<Record<number, boolean>>({});
  const [managers, setManagers] = useState<Record<number, number | null>>({});
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [deptRes, cdRes, empRes] = await Promise.all([
      supabase.from('departments').select('*').order('name'),
      supabase.from('company_departments').select('*').eq('company_id', companyId),
      supabase.from('employees').select('id, full_name').eq('company_id', companyId).eq('status', 'active').order('full_name'),
    ]);
    setAllDepts(deptRes.data || []);
    setEmployees(empRes.data || []);

    const enabledMap: Record<number, boolean> = {};
    const mgrMap: Record<number, number | null> = {};
    (cdRes.data || []).forEach((cd: any) => {
      enabledMap[cd.department_id] = true;
      mgrMap[cd.department_id] = cd.manager_id || null;
    });
    setEnabled(enabledMap);
    setManagers(mgrMap);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    try {
      const existing = await supabase.from('company_departments').select('department_id').eq('company_id', companyId);
      const existingIds = new Set((existing.data || []).map((d: any) => d.department_id));

      const toInsert: any[] = [];
      const toDelete: number[] = [];

      for (const dept of allDepts) {
        const isEnabled = enabled[dept.id] || false;
        const wasEnabled = existingIds.has(dept.id);
        if (isEnabled && !wasEnabled) {
          toInsert.push({ company_id: companyId, department_id: dept.id, manager_id: managers[dept.id] || null });
        } else if (!isEnabled && wasEnabled) {
          toDelete.push(dept.id);
        }
      }

      if (toDelete.length > 0) {
        await supabase.from('company_departments').delete().eq('company_id', companyId).in('department_id', toDelete);
      }
      for (const item of toInsert) {
        await supabase.from('company_departments').insert(item);
      }
      // Update managers for existing enabled departments
      for (const dept of allDepts) {
        if (enabled[dept.id] && existingIds.has(dept.id)) {
          await supabase.from('company_departments').update({ manager_id: managers[dept.id] || null }).eq('company_id', companyId).eq('department_id', dept.id);
        }
      }
      message.success('Departments saved');
      load();
    } catch (err: any) { message.error(err.message); } finally { setSaving(false); }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 600 }}>Departments</span>
        <Button type="primary" size="small" loading={saving} onClick={handleSave}>Save</Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {allDepts.map(dept => {
          const isEnabled = enabled[dept.id] || false;
          return (
            <div key={dept.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
              <Checkbox checked={isEnabled} onChange={e => setEnabled(prev => ({ ...prev, [dept.id]: e.target.checked }))}>
                <span style={{ color: 'rgba(255,255,255,0.85)' }}>{dept.name}</span>
              </Checkbox>
              {isEnabled && (
                <Select
                  style={{ width: 220 }}
                  size="small"
                  placeholder="Department manager"
                  allowClear
                  value={managers[dept.id] || undefined}
                  onChange={val => setManagers(prev => ({ ...prev, [dept.id]: val || null }))}
                >
                  {employees.map(emp => (
                    <Select.Option key={emp.id} value={emp.id}>{emp.full_name}</Select.Option>
                  ))}
                </Select>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
