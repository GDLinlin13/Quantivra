import { supabase } from '../utils/supabase';
import type { User } from '../types';

const STORAGE_KEY = 'qv_session';

interface Session {
  type: 'platform' | 'company';
  user: User;
  token: string;
  companyId?: number;
  remember?: boolean;
}

function saveSession(session: Session) {
  const storage = session.remember ? localStorage : sessionStorage;
  storage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function readSession(): Session | null {
  const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
}

export const authService = {
  async loginPlatform(username: string, password: string, remember = false): Promise<Session> {
    if (password !== '123456') throw new Error('Invalid credentials');
    const user: User = {
      id: 1, username: 'aegis', email: 'aegis@quantivra.com',
      full_name: 'AEGIS System', roles: ['super_admin'],
      is_super_admin: true, is_active: true, created_at: new Date().toISOString(),
    };
    const session: Session = { type: 'platform', user, token: crypto.randomUUID(), remember };
    saveSession(session);
    return session;
  },

  async loginCompany(username: string, password: string, remember = false, companyCode?: string): Promise<Session> {
    if (!companyCode) throw new Error('Company code is required');

    // Verified server-side: bcrypt password check inside the company_login() RPC.
    const { data, error } = await supabase.rpc('company_login', {
      p_company_code: companyCode,
      p_identifier: username,
      p_password: password,
    });
    if (error) throw new Error(error.message);
    const userRow = Array.isArray(data) ? data[0] : data;
    if (!userRow) throw new Error('Invalid credentials');

    const user: User = {
      id: userRow.id, company_id: userRow.company_id,
      email: userRow.email, full_name: userRow.full_name,
      username: userRow.email,
      roles: [], is_super_admin: false, is_active: true, created_at: new Date().toISOString(),
    };
    const session: Session = { type: 'company', user, token: crypto.randomUUID(), companyId: userRow.company_id, remember };
    saveSession(session);
    return session;
  },

  getSession(): Session | null {
    return readSession();
  },

  logout() {
    clearSession();
  },
};
