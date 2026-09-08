import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { authService } from '../services/auth';
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
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [type, setType] = useState<'platform' | 'company' | null>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = authService.getSession();
    if (session) {
      setUser(session.user);
      setType(session.type);
      setCompanyId(session.companyId || null);
    }
    setLoading(false);
  }, []);

  const login = async (username: string, password: string, loginType: 'platform' | 'company', remember = false, companyCode?: string) => {
    const session = loginType === 'platform'
      ? await authService.loginPlatform(username, password, remember)
      : await authService.loginCompany(username, password, remember, companyCode);
    setUser(session.user);
    setType(session.type);
    setCompanyId(session.companyId || null);
  };

  const logout = () => {
    authService.logout();
    setUser(null);
    setType(null);
    setCompanyId(null);
  };

  return (
    <AuthContext.Provider value={{
      user, type, companyId,
      isAuthenticated: !!user,
      isPlatformAdmin: type === 'platform',
      login, logout, loading,
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
