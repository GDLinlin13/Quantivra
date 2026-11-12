import { useEffect, useState } from 'react';
import { Avatar, Button, Dropdown } from 'antd';
import { UserOutlined, LogoutOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';
import { MyProfileModal } from './MyProfileModal';
import { profileService, NO_PROFILE, DEFAULT_AVATAR_COLOR, type MyProfile } from '../services/profile';

/** The name and round icon at the top right, with My Profile and Sign Out. */
export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<MyProfile>(NO_PROFILE);
  const [authId, setAuthId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id || null;
      setAuthId(id);
      if (id) profileService.get(id).then(setProfile).catch(() => null);
    });
  }, []);

  const menu = {
    items: [
      { key: 'profile', icon: <UserOutlined />, label: 'My Profile' },
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: 'Sign Out', danger: true },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'logout') { logout(); navigate('/login'); }
      if (key === 'profile') setOpen(true);
    },
  };

  return (
    <>
      {open && (
        <MyProfileModal profile={profile} fullName={user?.full_name || ''} onClose={() => setOpen(false)}
          onSave={async p => { if (!authId) throw new Error('Not signed in'); await profileService.save(authId, p); setProfile(p); }} />
      )}
      <Dropdown menu={menu} placement="bottomRight">
        <Button type="text" style={{ color: '#f0ede6', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar size="small" src={profile.avatar_data || undefined} icon={profile.avatar_data ? undefined : <UserOutlined />}
            style={{ background: profile.avatar_data ? undefined : (profile.avatar_color || DEFAULT_AVATAR_COLOR), color: '#111' }} />
          {profile.display_name || user?.full_name}
        </Button>
      </Dropdown>
    </>
  );
}
