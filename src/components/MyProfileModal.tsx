import { useRef, useState } from 'react';
import { Modal, Tabs, Input, Button, Avatar, ColorPicker, Space, Typography, message } from 'antd';
import { UserOutlined, UploadOutlined } from '@ant-design/icons';
import { ChangePasswordCard } from './ChangePasswordCard';
import { avatarFromFile, DEFAULT_AVATAR_COLOR, type MyProfile } from '../services/profile';

const { Text } = Typography;
const PRESETS = ['#4fc3f7', '#81c784', '#ffb74d', '#e57373', '#ba68c8', '#7986cb', '#4db6ac', '#a1887f'];

/** My profile: the name shown at the top right, a picture or the colour of the head icon; and the password. */
export function MyProfileModal({ profile, fullName, onSave, onClose }: {
  profile: MyProfile; fullName: string; onSave: (p: MyProfile) => Promise<void>; onClose: () => void;
}) {
  const [name, setName] = useState(profile.display_name || '');
  const [color, setColor] = useState(profile.avatar_color || DEFAULT_AVATAR_COLOR);
  const [picture, setPicture] = useState<string | null>(profile.avatar_data);
  const [saving, setSaving] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const pick = async (f?: File) => {
    if (!f) return;
    try { setPicture(await avatarFromFile(f)); } catch { message.error('Could not read that picture'); }
  };
  const save = async () => {
    setSaving(true);
    try { await onSave({ display_name: name.trim() || null, avatar_color: color, avatar_data: picture }); message.success('Profile saved'); onClose(); }
    catch (e: any) { message.error(e.message); }
    setSaving(false);
  };

  return (
    <Modal open onCancel={onClose} footer={null} width={520} destroyOnHidden title="My Profile">
      <Tabs items={[
        { key: 'profile', label: 'Profile', children: (
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <div>
              <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>Display name</Text>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={fullName} maxLength={60} />
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <Avatar size={64} src={picture || undefined} icon={picture ? undefined : <UserOutlined />} style={{ background: picture ? undefined : color, color: '#111' }} />
              <Space orientation="vertical" size={8}>
                <Space>
                  <Button icon={<UploadOutlined />} onClick={() => file.current?.click()}>{picture ? 'Change picture' : 'Add picture'}</Button>
                  {picture && <Button onClick={() => setPicture(null)}>Remove picture</Button>}
                </Space>
                <input ref={file} type="file" accept="image/*" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
              </Space>
            </div>
            {!picture && (
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>Icon colour</Text>
                <Space wrap size={8}>
                  {PRESETS.map(c => (
                    <span key={c} onClick={() => setColor(c)} role="button"
                      style={{ width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer', outline: c.toLowerCase() === color.toLowerCase() ? '2px solid #f0ede6' : 'none', outlineOffset: 2 }} />
                  ))}
                  <ColorPicker value={color} onChange={c => setColor(c.toHexString())} disabledAlpha />
                </Space>
              </div>
            )}
            <Button type="primary" loading={saving} onClick={save}>Save</Button>
          </Space>
        ) },
        { key: 'password', label: 'Change password', children: <ChangePasswordCard /> },
      ]} />
    </Modal>
  );
}
