import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { authService, type Session } from '../services/auth';
import { supabase } from '../utils/supabase';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  type: 'platform' | 'company' | null;
  companyId: number | null;
  isAuthenticated: boolean;
  isPlatformAdmin: boolean;
  login: (username: string, password: string, type: 'platform' | 'company', remember?: boolean, companyCode?: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  /** true after signing in with a temporary password, until a new one is set */
  mustChangePassword: boolean;
  setFirstPassword: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [type, setType] = useState<'platform' | 'company' | null>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const apply = (session: Session | null) => {
    setUser(session?.user ?? null);
    setType(session?.type ?? null);
    setCompanyId(session?.companyId ?? null);
    setMustChangePassword(!!session?.mustChangePassword);
  };

  const setFirstPassword = async (newPassword: string) => {
    await authService.setFirstPassword(newPassword);
    setMustChangePassword(false);
  };

  useEffect(() => {
    let active = true;
    authService.restoreSession()
      .then(session => { if (active) apply(session); })
      .catch(() => { if (active) apply(null); })
      .finally(() => { if (active) setLoading(false); });

    // Signed out elsewhere (another tab, expired refresh token): drop the UI session.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { authService.clearLocal(); apply(null); }
    });

    // When someone comes back to a tab left open (e.g. overnight), re-check
    // the sign-in so an expired one leads to the login page.
    const recheck = () => {
      if (document.visibilityState !== 'visible') return;
      authService.restoreSession().then(s => { if (active && !s) apply(null); }).catch(() => {});
    };
    document.addEventListener('visibilitychange', recheck);
    return () => { active = false; sub.subscription.unsubscribe(); document.removeEventListener('visibilitychange', recheck); };
  }, []);

  const login = async (username: string, password: string, loginType: 'platform' | 'company', remember = false, companyCode?: string) => {
    const session = loginType === 'platform'
      ? await authService.loginPlatform(username, password, remember)
      : await authService.loginCompany(username, password, remember, companyCode);
    apply(session);
  };

  const logout = () => {
    apply(null);
    void authService.logout();
  };

  return (
    <AuthContext.Provider value={{
      user, type, companyId,
      isAuthenticated: !!user,
      isPlatformAdmin: type === 'platform',
      login, logout, loading, mustChangePassword, setFirstPassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
