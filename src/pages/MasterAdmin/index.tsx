import React, { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';

const COLORS = {
  bg: '#0b0f12', panel: 'rgba(20,25,30,0.85)', border: 'rgba(120,200,255,0.18)',
  text: '#f4f1e8', muted: '#b8b0a2', primary: '#a78bfa', cyan: '#7dd3fc',
};

function Popup({ open, title, children, onClose }: { open: boolean; title: string; children: React.ReactNode; onClose: () => void }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 200 }}>
      <div style={{ background: 'linear-gradient(135deg,#2a2d35,#1e2128)', border: '1px solid rgba(200,180,255,0.25)', borderRadius: 14, padding: 28, width: 'min(400px,90vw)', display: 'grid', gap: 14, boxShadow: '0 0 40px rgba(167,139,250,0.15)' }}>
        <h3 style={{ textAlign: 'center', color: '#c4b5fd', fontSize: 18, margin: 0 }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function AegisInput(props: any) {
  return <input {...props} style={{ width: '100%', border: `1px solid ${COLORS.border}`, borderRadius: 6, background: 'rgba(10,14,18,0.7)', color: COLORS.text, padding: '10px 11px', outline: 'none', boxSizing: 'border-box', ...props.style }} />;
}

function AegisSelect(props: any) {
  return <select {...props} style={{ width: '100%', border: `1px solid ${COLORS.border}`, borderRadius: 6, background: 'rgba(10,14,18,0.7)', color: COLORS.text, padding: '10px 11px', outline: 'none', boxSizing: 'border-box', ...props.style }} />;
}

function AegisBtn({ children, variant, style, ...props }: any) {
  const base: React.CSSProperties = { border: 'none', borderRadius: 6, padding: '10px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer', textTransform: 'uppercase' };
  if (variant === 'primary') {
    base.background = 'linear-gradient(135deg,#7dd3fc,#a78bfa)'; base.color = '#111';
  } else if (variant === 'ghost') {
    base.background = 'transparent'; base.color = COLORS.text; base.border = `1px solid ${COLORS.border}`;
  } else if (variant === 'gradient') {
    Object.assign(base, style);
  } else {
    base.background = 'rgba(25,30,36,0.7)'; base.color = COLORS.text; base.border = `1px solid ${COLORS.border}`;
  }
  return <button {...props} style={{ ...base, ...style }}>{children}</button>;
}

const gradBtn = (from: string, to: string): React.CSSProperties => ({ background: `linear-gradient(135deg,${from},${to})`, border: 'none', color: '#1e2128', textTransform: 'uppercase', fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '6px 12px', cursor: 'pointer' });

export default function MasterAdminPage() {
  const { user: currentUser } = useAuth();
  const [tab, setTab] = useState<'NEXUS' | 'IDENTITY' | 'BACKUP'>('NEXUS');
  const [companies, setCompanies] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCompany, setExpandedCompany] = useState<number | null>(null);
  const [initOpen, setInitOpen] = useState(true);

  const [projectName, setProjectName] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [masterUsername, setMasterUsername] = useState('');
  const [masterPassword, setMasterPassword] = useState('');

  const [showCreateUser, setShowCreateUser] = useState<number | null>(null);
  const [cuRole, setCuRole] = useState('employee');
  const [cuUsername, setCuUsername] = useState('');
  const [cuPassword, setCuPassword] = useState('');

  const [resetPwTarget, setResetPwTarget] = useState<number | null>(null);
  const [resetPwValue, setResetPwValue] = useState('');

  const [editRolesTarget, setEditRolesTarget] = useState<any | null>(null);
  const [editRolesHR, setEditRolesHR] = useState(false);
  const [editRolesAcct, setEditRolesAcct] = useState(false);

  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameCode, setRenameCode] = useState('');

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [identityMsg, setIdentityMsg] = useState('');

  const [backupMsg, setBackupMsg] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [compRes, userRes] = await Promise.all([
        supabase.from('companies').select('*').order('name'),
        supabase.from('users').select('*, companies(name)').order('full_name'),
      ]);
      setCompanies(compRes.data || []);
      setUsers(userRes.data || []);
    } catch {} finally { setLoading(false); }
  }

  function getCompanyUsers(cid: number) { return users.filter((u) => u.company_id === cid && !u.is_super_admin); }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!projectName || !masterUsername || !masterPassword) return;
    const internalEmail = `${masterUsername.toLowerCase().replace(/[^a-z0-9]/g, '_')}@acchr.internal`;
    const code = projectCode || projectName.replace(/[^A-Z0-9]/gi, '').substring(0, 6).toUpperCase();
    const { data: newCompany } = await supabase.from('companies').insert({ name: projectName, company_code: code, country: 'US', currency: 'USD' }).select().single();
    if (!newCompany) return;
    await supabase.from('users').insert({
      company_id: newCompany.id, username: masterUsername, email: internalEmail,
      full_name: masterUsername, password_hash: masterPassword,
      roles: ['master'], is_active: 1,
    });
    setProjectName(''); setProjectCode(''); setMasterUsername(''); setMasterPassword('');
    loadData();
  }

  async function handleCreateUser() {
    if (!showCreateUser || !cuUsername || !cuPassword) return;
    const internalEmail = `${cuUsername.toLowerCase().replace(/[^a-z0-9]/g, '_')}@acchr.internal`;
    await supabase.from('users').insert({
      company_id: showCreateUser, username: cuUsername, email: internalEmail,
      full_name: cuUsername, password_hash: cuPassword,
      roles: [cuRole], is_active: 1,
    });
    setShowCreateUser(null); setCuUsername(''); setCuPassword('');
    loadData();
  }

  async function handleSuspendCompany(cid: number) {
    const c = companies.find((x) => x.id === cid);
    if (!c) return;
    const newStatus = c.is_active ? 0 : 1;
    await supabase.from('companies').update({ is_active: newStatus }).eq('id', cid);
    await supabase.from('users').update({ is_active: newStatus }).eq('company_id', cid).neq('is_super_admin', 1);
    loadData();
  }

  async function handleSuspendUser(uid: number) {
    const u = users.find((x) => x.id === uid);
    if (!u) return;
    await supabase.from('users').update({ is_active: u.is_active ? 0 : 1 }).eq('id', uid);
    loadData();
  }

  async function handleRename() {
    if (!renameTarget) return;
    const [type, id] = renameTarget.split('-');
    if (type === 'company') {
      await supabase.from('companies').update({ name: renameValue, company_code: renameCode || null }).eq('id', parseInt(id));
    } else {
      await supabase.from('users').update({ username: renameValue, full_name: renameValue }).eq('id', parseInt(id));
    }
    setRenameTarget(null); loadData();
  }

  async function handleDeleteCompany(cid: number) {
    if (!confirm('Delete this company and all its data?')) return;
    await supabase.from('users').delete().eq('company_id', cid);
    await supabase.from('companies').delete().eq('id', cid);
    loadData();
  }

  async function handleResetPw() {
    if (resetPwTarget && resetPwValue) {
      await supabase.from('users').update({ password_hash: resetPwValue }).eq('id', resetPwTarget);
      setResetPwTarget(null); setResetPwValue('');
    }
  }

  async function handleEditRoles() {
    if (!editRolesTarget) return;
    const baseRole = editRolesTarget.roles?.includes('master') ? 'master' : 'employee';
    const roles = [baseRole];
    if (editRolesHR) roles.push('hr');
    if (editRolesAcct) roles.push('accountant');
    await supabase.from('users').update({ roles }).eq('id', editRolesTarget.id);
    setEditRolesTarget(null);
    loadData();
  }

  async function handleIdentity(e: React.FormEvent) {
    e.preventDefault(); setIdentityMsg('');
    if (!currentUser) return;
    if (newUsername) {
      await supabase.from('users').update({ username: newUsername, full_name: newUsername }).eq('id', currentUser.id);
    }
    if (newPassword) {
      await supabase.from('users').update({ password_hash: newPassword }).eq('id', currentUser.id);
    }
    setNewUsername(''); setNewPassword(''); setIdentityMsg('Updated.');
  }

  function handleBackup() {
    const data = { companies, users, backedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `quantivra-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    setBackupMsg('Backup downloaded.');
  }

  function handleRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.companies) {
          for (const c of data.companies) {
            const { id, created_at, ...rest } = c;
            await supabase.from('companies').upsert(rest);
          }
        }
        if (data.users) {
          for (const u of data.users) {
            const { id, companies, created_at, ...rest } = u;
            await supabase.from('users').upsert(rest);
          }
        }
        setBackupMsg('Restore complete.');
        loadData();
      } catch { setBackupMsg('Invalid backup file.'); }
    };
    reader.readAsText(file);
  }

  if (loading) return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', background: COLORS.bg, color: COLORS.text }}>Loading...</div>;

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.text }}>
      <header style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '16px 24px', borderBottom: `1px solid ${COLORS.border}`, background: '#0f1215' }}>
        <div />
        <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: 4, margin: 0, background: 'linear-gradient(135deg,#7dd3fc,#a78bfa,#f9a8d4,#34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ATLAS CORE</h1>
        <div style={{ justifySelf: 'end' }}>
          <AegisBtn variant="primary" onClick={() => { localStorage.removeItem('acchr_session'); window.location.href = '/login'; }}>Logout</AegisBtn>
        </div>
      </header>

      <main style={{ width: 'min(960px,calc(100vw - 32px))', margin: '0 auto', padding: '24px 0', display: 'grid', gap: 20, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          {(['NEXUS', 'IDENTITY', 'BACKUP'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              borderRadius: 6,
              background: tab === t ? 'linear-gradient(135deg,#7dd3fc,#34d399)' : '#171a1c',
              color: tab === t ? '#071018' : '#d8d1c6', padding: '8px 10px', fontWeight: 800,
              cursor: 'pointer', border: tab === t ? 'none' : `1px solid ${COLORS.border}`,
            }}>{t}</button>
          ))}
        </div>

        {tab === 'NEXUS' && (
          <div style={{ display: 'grid', gap: 20 }}>
            <section style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: 'hidden' }}>
              <button onClick={() => setInitOpen(!initOpen)} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: initOpen ? '16px 16px 0' : '16px', display: 'grid', gap: 14 }}>
                <h2 style={{ fontSize: 24, fontWeight: 900, textAlign: 'center', letterSpacing: 3, margin: 0, background: 'linear-gradient(135deg,#7dd3fc,#a78bfa,#f9a8d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {initOpen ? '▼' : '▶'} INITIALIZE
                </h2>
              </button>
              {initOpen && (
                <form onSubmit={handleCreateProject} style={{ display: 'grid', gap: 14, padding: '8px 16px 16px' }}>
                  <label style={{ display: 'grid', gap: 6 }}><span style={{ color: COLORS.muted, fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>Project Name</span>
                    <AegisInput value={projectName} onChange={(e: any) => setProjectName(e.target.value.toUpperCase())} /></label>
                  <label style={{ display: 'grid', gap: 6 }}><span style={{ color: COLORS.muted, fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>Company Code</span>
                    <AegisInput value={projectCode} onChange={(e: any) => setProjectCode(e.target.value.toUpperCase())} placeholder="Auto-generated if blank" /></label>
                  <label style={{ display: 'grid', gap: 6 }}><span style={{ color: COLORS.muted, fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>Master Username</span>
                    <AegisInput value={masterUsername} onChange={(e: any) => setMasterUsername(e.target.value.toUpperCase())} /></label>
                  <label style={{ display: 'grid', gap: 6 }}><span style={{ color: COLORS.muted, fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>Master Password</span>
                    <AegisInput type="password" value={masterPassword} onChange={(e: any) => setMasterPassword(e.target.value)} /></label>
                  <AegisBtn variant="primary" style={{ padding: 12 }}>Create Project</AegisBtn>
                </form>
              )}
            </section>

            <section style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                  <thead>
                    <tr style={{ background: '#202427' }}>
                      <th style={{ color: COLORS.muted, fontSize: 12, textTransform: 'uppercase', padding: '11px 18px', textAlign: 'left', borderBottom: `1px solid ${COLORS.border}` }}>MATRIX</th>
                      <th style={{ color: COLORS.muted, fontSize: 12, textTransform: 'uppercase', padding: '11px 18px', textAlign: 'left', borderBottom: `1px solid ${COLORS.border}` }}>CLEARANCE</th>
                      <th style={{ color: COLORS.muted, fontSize: 12, textTransform: 'uppercase', padding: '11px 18px', textAlign: 'left', borderBottom: `1px solid ${COLORS.border}` }}>Status</th>
                      <th style={{ color: COLORS.muted, fontSize: 12, textTransform: 'uppercase', padding: '11px 18px', textAlign: 'left', borderBottom: `1px solid ${COLORS.border}` }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map((c) => (
                      <React.Fragment key={c.id}>
                        <tr style={{ background: '#1e2327' }}>
                          <td style={{ padding: '11px 18px', borderBottom: `1px solid ${COLORS.border}` }}>
                            <button onClick={() => setExpandedCompany(expandedCompany === c.id ? null : c.id)} style={{ background: 'none', border: 'none', color: COLORS.text, fontWeight: 900, cursor: 'pointer', fontSize: 16 }}>
                              {expandedCompany === c.id ? '▼' : '▶'} {c.name}
                            </button>
                          </td>
                          <td style={{ padding: '11px 18px', borderBottom: `1px solid ${COLORS.border}`, color: '#7dd3fc', fontSize: 13, letterSpacing: 1 }}>{c.company_code || '—'}</td>
                          <td style={{ padding: '11px 18px', borderBottom: `1px solid ${COLORS.border}` }}>{c.is_active ? 'Active' : 'Suspended'}</td>
                          <td style={{ padding: '11px 18px', borderBottom: `1px solid ${COLORS.border}` }}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button onClick={() => handleSuspendCompany(c.id)} style={gradBtn('#fde68a','#fcd34d')}>{c.is_active ? 'Suspend' : 'Unsuspend'}</button>
                              <button onClick={() => { setShowCreateUser(c.id); setCuUsername(''); setCuPassword(''); }} style={gradBtn('#a5f3fc','#67e8f9')}>Add User</button>
                              <button onClick={() => { setRenameTarget(`company-${c.id}`); setRenameValue(c.name); setRenameCode(c.company_code || ''); }} style={gradBtn('#c7d2fe','#a5b4fc')}>Rename</button>
                              <button onClick={() => handleDeleteCompany(c.id)} style={gradBtn('#fecaca','#fca5a5')}>Delete</button>
                            </div>
                          </td>
                        </tr>
                        {expandedCompany === c.id && getCompanyUsers(c.id).map((u) => {
                          const roles = u.roles || [];
                          return (
                          <tr key={u.id}>
                            <td style={{ padding: '11px 18px', paddingLeft: 44, borderBottom: `1px solid ${COLORS.border}` }}>{u.username}</td>
                            <td style={{ padding: '11px 18px', borderBottom: `1px solid ${COLORS.border}`, textTransform: 'uppercase' }}>
                              <span style={{ color: roles.includes('master') ? '#f87171' : roles.includes('hr') || roles.includes('accountant') ? '#7dd3fc' : '#9ca3af' }}>
                                {roles.filter((r: string) => r !== 'master' || roles.length === 1).join(', ') || 'employee'}
                              </span>
                            </td>
                            <td style={{ padding: '11px 18px', borderBottom: `1px solid ${COLORS.border}` }}>{u.is_active ? 'Active' : 'Suspended'}</td>
                            <td style={{ padding: '11px 18px', borderBottom: `1px solid ${COLORS.border}` }}>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <button onClick={() => handleSuspendUser(u.id)} style={gradBtn('#fde68a','#fcd34d')}>{u.is_active ? 'Suspend' : 'Unsuspend'}</button>
                                <button onClick={() => { setRenameTarget(`user-${u.id}`); setRenameValue(u.username); }} style={gradBtn('#a5f3fc','#67e8f9')}>Rename</button>
                                <button onClick={() => { setResetPwTarget(u.id); setResetPwValue(''); }} style={gradBtn('#e9d5ff','#d8b4fe')}>Reset PW</button>
                                {!roles.includes('master') && (
                                  <button onClick={() => {
                                    setEditRolesTarget(u);
                                    setEditRolesHR(roles.includes('hr'));
                                    setEditRolesAcct(roles.includes('accountant'));
                                  }} style={gradBtn('#a78bfa','#c084fc')}>Roles</button>
                                )}
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {tab === 'IDENTITY' && (
          <form onSubmit={handleIdentity} style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 20, display: 'grid', gap: 14, maxWidth: 500, justifySelf: 'center', width: '100%' }}>
            <h2 style={{ fontSize: 24, fontWeight: 900, textAlign: 'center', letterSpacing: 3, margin: 0, background: 'linear-gradient(135deg,#7dd3fc,#a78bfa,#f9a8d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>COMMAND PROFILE</h2>
            <label style={{ display: 'grid', gap: 6 }}><span style={{ color: COLORS.muted, fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>New Username</span>
              <AegisInput value={newUsername} onChange={(e: any) => setNewUsername(e.target.value.toUpperCase())} /></label>
            <label style={{ display: 'grid', gap: 6 }}><span style={{ color: COLORS.muted, fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>New Password</span>
              <AegisInput type="password" value={newPassword} onChange={(e: any) => setNewPassword(e.target.value)} /></label>
            {identityMsg && <p style={{ color: '#c4b5fd', textAlign: 'center', margin: 0 }}>{identityMsg}</p>}
            <AegisBtn variant="primary" style={{ justifySelf: 'center', minWidth: 200 }}>Update</AegisBtn>
          </form>
        )}

        {tab === 'BACKUP' && (
          <div style={{ display: 'grid', gap: 20, maxWidth: 500, justifySelf: 'center', width: '100%' }}>
            <section style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 20, display: 'grid', gap: 14 }}>
              <h2 style={{ fontSize: 24, fontWeight: 900, textAlign: 'center', letterSpacing: 3, margin: 0, background: 'linear-gradient(135deg,#34d399,#a78bfa,#f9a8d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>BACKUP & RESTORE</h2>
              <AegisBtn onClick={handleBackup} style={{ justifySelf: 'center', minWidth: 200, background: 'linear-gradient(135deg,#7dd3fc,#a78bfa)', border: 'none', color: '#111', fontWeight: 700, borderRadius: 6, padding: '10px 12px', cursor: 'pointer', fontSize: 13 }}>Download Backup File</AegisBtn>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />
              <label style={{ display: 'grid', gap: 6 }}><span style={{ color: COLORS.muted, fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>Restore from file</span>
                <input type="file" accept=".json" onChange={handleRestore} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 6, background: 'rgba(10,14,18,0.7)', color: COLORS.text, padding: '10px 11px', fontSize: 13, width: '100%', boxSizing: 'border-box' }} /></label>
              {backupMsg && <p style={{ color: '#c4b5fd', textAlign: 'center', fontSize: 13, margin: 0 }}>{backupMsg}</p>}
            </section>
          </div>
        )}
      </main>

      <Popup open={!!showCreateUser} title="Create User" onClose={() => setShowCreateUser(null)}>
        <label style={{ display: 'grid', gap: 6 }}><span style={{ color: COLORS.muted, fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>Role</span>
          <AegisSelect value={cuRole} onChange={(e: any) => setCuRole(e.target.value)}>
            <option value="employee">Employee</option><option value="master">Master</option>
          </AegisSelect></label>
        <label style={{ display: 'grid', gap: 6 }}><span style={{ color: COLORS.muted, fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>Username</span>
          <AegisInput value={cuUsername} onChange={(e: any) => setCuUsername(e.target.value.toUpperCase())} /></label>
        <label style={{ display: 'grid', gap: 6 }}><span style={{ color: COLORS.muted, fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>Password</span>
          <AegisInput type="password" value={cuPassword} onChange={(e: any) => setCuPassword(e.target.value)} /></label>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <AegisBtn variant="ghost" onClick={() => setShowCreateUser(null)}>Cancel</AegisBtn>
          <AegisBtn variant="primary" onClick={handleCreateUser}>Create</AegisBtn>
        </div>
      </Popup>

      <Popup open={!!renameTarget} title={renameTarget?.startsWith('company') ? 'Rename Company' : 'Rename User'} onClose={() => setRenameTarget(null)}>
        <label style={{ display: 'grid', gap: 6 }}><span style={{ color: COLORS.muted, fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>{renameTarget?.startsWith('company') ? 'Company Name' : 'Username'}</span>
          <AegisInput value={renameValue} onChange={(e: any) => setRenameValue(e.target.value.toUpperCase())} autoFocus /></label>
        {renameTarget?.startsWith('company') && (
          <label style={{ display: 'grid', gap: 6 }}><span style={{ color: COLORS.muted, fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>Company Code</span>
            <AegisInput value={renameCode} onChange={(e: any) => setRenameCode(e.target.value.toUpperCase())} /></label>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <AegisBtn variant="ghost" onClick={() => setRenameTarget(null)}>Cancel</AegisBtn>
          <AegisBtn variant="primary" onClick={handleRename}>Save</AegisBtn>
        </div>
      </Popup>

      <Popup open={!!resetPwTarget} title="Reset Password" onClose={() => setResetPwTarget(null)}>
        <label style={{ display: 'grid', gap: 6 }}><span style={{ color: COLORS.muted, fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>New Password</span>
          <AegisInput type="password" value={resetPwValue} onChange={(e: any) => setResetPwValue(e.target.value)} autoFocus /></label>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <AegisBtn variant="ghost" onClick={() => setResetPwTarget(null)}>Cancel</AegisBtn>
          <AegisBtn variant="primary" onClick={handleResetPw}>Save</AegisBtn>
        </div>
      </Popup>

      <Popup open={!!editRolesTarget} title={`Roles - ${editRolesTarget?.full_name || editRolesTarget?.username}`} onClose={() => setEditRolesTarget(null)}>
        <p style={{ color: COLORS.muted, fontSize: 13, margin: 0 }}>Base role: <strong style={{ color: COLORS.text }}>{editRolesTarget?.roles?.includes('master') ? 'Master' : 'Employee'}</strong></p>
        {!editRolesTarget?.roles?.includes('master') && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={editRolesHR} onChange={e => setEditRolesHR(e.target.checked)} style={{ accentColor: '#7dd3fc' }} />
              <span style={{ color: COLORS.text }}>HR</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={editRolesAcct} onChange={e => setEditRolesAcct(e.target.checked)} style={{ accentColor: '#7dd3fc' }} />
              <span style={{ color: COLORS.text }}>Accountant</span>
            </label>
          </>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <AegisBtn variant="ghost" onClick={() => setEditRolesTarget(null)}>Cancel</AegisBtn>
          <AegisBtn variant="primary" onClick={handleEditRoles}>Save</AegisBtn>
        </div>
      </Popup>
    </div>
  );
}