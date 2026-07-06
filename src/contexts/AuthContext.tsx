import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Company, UserRole } from '../types';
import { supabase } from '../utils/supabase';

interface AuthState {
  user: User | null;
  company: Company | null;
  loading: boolean;
  isSuperAdmin: boolean;
  hasRole: (...roles: UserRole[]) => boolean;
  signIn: (companyCode: string, username: string, password: string) => Promise<string | null>;
  signUp: (username: string, password: string, fullName: string, companyName: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({} as AuthState);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('acchr_session');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        loadProfile(data.company_code, data.username);
        return;
      } catch {}
    }
    setLoading(false);
  }, []);

  async function loadProfile(companyCode: string, username: string) {
    try {
      let co: Company | null = null;
      if (companyCode && companyCode !== '__AEGIS__') {
        const { data } = await supabase.from('companies').select('*').eq('company_code', companyCode).maybeSingle();
        if (data) co = data;
      }
      setCompany(co);
      let query = supabase.from('users').select('*').eq('username', username);
      if (co) query = query.eq('company_id', co.id);
      const { data } = await query.maybeSingle();
      if (data) {
        const roles = data.roles || ['employee'];
        const u: User = { ...data, roles: Array.isArray(roles) ? roles : [roles] };
        setUser(u);
        setIsSuperAdmin(data.is_super_admin === 1);
      } else {
        localStorage.removeItem('acchr_session');
      }
    } catch (err) {
      console.error('Failed to load profile', err);
      localStorage.removeItem('acchr_session');
    } finally {
      setLoading(false);
    }
  }

  function hasRole(...roles: UserRole[]): boolean {
    if (!user?.roles) return false;
    return roles.some(r => user.roles!.includes(r));
  }

  async function signIn(companyCode: string, username: string, password: string): Promise<string | null> {
    username = username.toUpperCase();
    companyCode = companyCode?.toUpperCase().trim();
    let co: Company | null = null;
    if (companyCode) {
      const { data } = await supabase.from('companies').select('*').eq('company_code', companyCode).maybeSingle();
      if (!data) return 'Invalid company code';
      co = data;
    }
    let query = supabase.from('users').select('*').eq('username', username);
    if (co) query = query.eq('company_id', co.id);
    const { data: userRow, error: lookupErr } = await query.maybeSingle();
    if (lookupErr || !userRow) return 'Invalid username or password';
    if (!co && userRow.is_super_admin !== 1) return 'Company code required for non-AEGIS accounts';
    if (userRow.password_hash !== password) return 'Invalid username or password';
    if (userRow.email) {
      await supabase.auth.signInWithPassword({ email: userRow.email, password }).catch(() => {});
    }
    const sessionCode = co?.company_code || '__AEGIS__';
    localStorage.setItem('acchr_session', JSON.stringify({ company_code: sessionCode, username }));
    await loadProfile(sessionCode, username);
    return null;
  }

  async function signUp(username: string, password: string, fullName: string, companyName: string): Promise<string | null> {
    username = username.toUpperCase();
    const internalEmail = `${username.toLowerCase().replace(/[^a-z0-9]/g, '_')}@acchr.internal`;
    await supabase.auth.signUp({ email: internalEmail, password }).catch(() => {});
    const code = companyName.replace(/[^A-Z0-9]/gi, '').substring(0, 6).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
    const { data: newCompany, error: compErr } = await supabase.from('companies').insert({
      name: companyName, country: 'US', currency: 'USD', company_code: code,
    }).select().single();
    if (compErr) return compErr.message;
    const { error: userErr } = await supabase.from('users').insert({
      company_id: newCompany.id,
      username,
      email: internalEmail,
      full_name: fullName,
      password_hash: password,
      roles: ['master'],
    });
    if (userErr) return userErr.message;
    setCompany(newCompany);
    localStorage.setItem('acchr_session', JSON.stringify({ company_code: code, username }));
    await loadProfile(code, username);
    return null;
  }

  async function signOut() {
    localStorage.removeItem('acchr_session');
    await supabase.auth.signOut().catch(() => {});
    window.location.href = '/login';
  }

  return (
    <AuthContext.Provider value={{ user, company, loading, isSuperAdmin, hasRole, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
