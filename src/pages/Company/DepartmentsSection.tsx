import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Input, message, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { supabase } from '../../utils/supabase';


export default function DepartmentsSection({ companyId }: { companyId: number }) {
  const [departments, setDepartments] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data, error } = await supabase.from('departments').select('*').eq('company_id', companyId).order('name');
    if (error) { message.error(error.message); return; }
    setDepartments(data || []);
  }

  async function handleSave() {
    if (!name.trim()) { message.warning('Enter a department name'); return; }
    setSaving(true);
    try {
      let result;
      if (editing) {
        result = await supabase.from('departments').update({ name: name.trim() }).eq('id', editing.id);
      } else {
        result = await supabase.from('departments').insert({ company_id: companyId, name: name.trim() });
      }
      if (result.error) throw result.error;
      message.success('Department saved');
      setModalOpen(false);
      load();
    } catch (err: any) { message.error(err.message || String(err)); } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    const { error } = await supabase.from('departments').delete().eq('id', id);
    if (error) { message.error(error.message); return; }
    message.success('Department deleted');
    load();
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>Departments</span>
        <Button size="small" icon={<PlusOutlined />} onClick={() => { setEditing(null); setName(''); setModalOpen(true); }}>Add Department</Button>
      </div>
      <Table dataSource={departments} rowKey="id" pagination={false} size="small"
        columns={[
          { title: 'Name', dataIndex: 'name', key: 'name' },
          { title: 'Manager', key: 'mgr', render: () => '—' },
          {
            title: 'Actions', key: 'actions', width: 140,
            render: (_: any, row: any) => (
              <Space>
                <Button size="small" onClick={() => { setEditing(row); setName(row.name); setModalOpen(true); }}>Edit</Button>
                <Button size="small" danger onClick={() => handleDelete(row.id)}>Delete</Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal title={editing ? 'Edit Department' : 'Add Department'} open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Department name" />
        <Button type="primary" block style={{ marginTop: 12 }} loading={saving} onClick={handleSave}>Save</Button>
      </Modal>
    </div>
  );
}
