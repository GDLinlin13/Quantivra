import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Company, UserRole } from '../types';
import { supabase } from '../utils/supabase';

interface AuthState {
  user: User | null;
  company: Company | null;
  loading: boolean;
  isSuperAdmin: boolean;
  hasRole: (...roles: UserRole[]) => boolean;
  signIn: (username: string, password: string) => Promise<string | null>;
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
        loadProfile(data.username);
        return;
      } catch {}
    }
    setLoading(false);
  }, []);

  async function loadProfile(username: string) {
    try {
      const { data } = await supabase.from('users').select('*, companies(*)').eq('username', username).maybeSingle();
      if (data) {
        const roles = data.roles || ['employee'];
        const u: User = { ...data, roles: Array.isArray(roles) ? roles : [roles] };
        setUser(u);
        setIsSuperAdmin(data.is_super_admin === 1 || roles.includes('superadmin'));
        setCompany(data.companies || null);
      }
    } catch (err) {
      console.error('Failed to load profile', err);
    } finally {
      setLoading(false);
    }
  }

  function hasRole(...roles: UserRole[]): boolean {
    if (!user?.roles) return false;
    return roles.some(r => user.roles!.includes(r));
  }

  async function signIn(username: string, password: string): Promise<string | null> {
    username = username.toUpperCase();
    const { data: userRow, error: lookupErr } = await supabase
      .from('users').select('*').eq('username', username).maybeSingle();
    if (lookupErr || !userRow) return 'Invalid username or password';

    // Simple password check (for MVP; use bcrypt in production)
    if (userRow.password_hash !== password) return 'Invalid username or password';

    // Try Supabase Auth in background (for future use), but session is local
    if (userRow.email) {
      await supabase.auth.signInWithPassword({ email: userRow.email, password }).catch(() => {});
    }

    // Store session locally
    localStorage.setItem('acchr_session', JSON.stringify({ username }));
    await loadProfile(username);
    return null;
  }

  async function signUp(username: string, password: string, fullName: string, companyName: string): Promise<string | null> {
    username = username.toUpperCase();
    const internalEmail = `${username.toLowerCase().replace(/[^a-z0-9]/g, '_')}@acchr.internal`;

    // Create Supabase Auth user (silently handle — not essential for MVP)
    await supabase.auth.signUp({ email: internalEmail, password }).catch(() => {});

    // Create company
    const { data: newCompany, error: compErr } = await supabase.from('companies').insert({
      name: companyName, country: 'US', currency: 'USD'
    }).select().single();
    if (compErr) return compErr.message;

    // Create user with username
    const { error: userErr } = await supabase.from('users').insert({
      company_id: newCompany.id,
      username,
      email: internalEmail,
      full_name: fullName,
      password_hash: password,
      roles: ['admin', 'employee'],
    });
    if (userErr) return userErr.message;

    setCompany(newCompany);
    localStorage.setItem('acchr_session', JSON.stringify({ username }));
    await loadProfile(username);
    return null;
  }

  async function signOut() {
    localStorage.removeItem('acchr_session');
    await supabase.auth.signOut().catch(() => {});
    setUser(null);
    setCompany(null);
    setIsSuperAdmin(false);
  }

  return (
    <AuthContext.Provider value={{ user, company, loading, isSuperAdmin, hasRole, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
