import { supabase, setRememberMe } from '../utils/supabase';
import type { User } from '../types';

// Who the signed-in person is inside Quantivra (platform admin, or a user of
// one company). The proof of identity is the Supabase Auth session; this
// record only tells the UI which side of the app to show.
const STORAGE_KEY = 'qv_session';

export interface Session {
  type: 'platform' | 'company';
  user: User;
  authUserId: string;
  companyId?: number;
}

function saveSession(session: Session, remember: boolean) {
  clearSession();
  (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, JSON.stringify(session));
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

const INVALID = 'Invalid credentials';

// Supabase Auth signs in by email. Platform admins may type a short username
// instead; it maps to the email of their Supabase Auth login.
export const PLATFORM_USERNAMES: Record<string, string> = {
  aegis: 'aegis@quantivra.com',
};

export function isPlatformUsername(identifier: string): boolean {
  return identifier.trim().toLowerCase() in PLATFORM_USERNAMES;
}

function toEmail(identifier: string): string {
  const id = identifier.trim().toLowerCase();
  return PLATFORM_USERNAMES[id] ?? id;
}

// Plain-language reasons, so a failed sign-in says what to fix.
function signInMessage(error: { message?: string; status?: number; code?: string } | null): string {
  const msg = error?.message || '';
  if (/invalid login credentials/i.test(msg) || error?.code === 'invalid_credentials') return 'Wrong username/email or password';
  if (/email not confirmed/i.test(msg)) return 'This login has not been confirmed yet (Supabase → Authentication → Users → Confirm)';
  if (/fetch|network|failed to fetch/i.test(msg) || error?.status === 0) return 'Cannot reach the sign-in service. Check your connection and try again.';
  return msg ? `Sign-in failed: ${msg}` : INVALID;
}

async function signIn(email: string, password: string, remember: boolean): Promise<string> {
  setRememberMe(remember);
  let result;
  try {
    result = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  } catch (e: any) {
    throw new Error(signInMessage({ message: e?.message || 'network error', status: 0 }));
  }
  if (result.error || !result.data.user) throw new Error(signInMessage(result.error));
  return result.data.user.id;
}

/** Password was right, but this login has no access here: sign out and explain. */
async function rejectAccess(reason: string, error?: { message?: string } | null): Promise<never> {
  await supabase.auth.signOut();
  throw new Error(error?.message ? `${reason} (${error.message})` : reason);
}

export const authService = {
  async loginPlatform(identifier: string, password: string, remember = false): Promise<Session> {
    const authUserId = await signIn(toEmail(identifier), password, remember);
    const { data, error } = await supabase.rpc('app_sign_in_platform');
    const row = Array.isArray(data) ? data[0] : data;
    if (error) await rejectAccess('Signed in, but could not check platform access', error);
    if (!row) await rejectAccess('This login is not a platform administrator');
    const user: User = {
      id: row.id, username: row.username, email: row.email, full_name: row.full_name,
      roles: ['super_admin'], is_super_admin: true, is_active: true, created_at: new Date().toISOString(),
    };
    const session: Session = { type: 'platform', user, authUserId };
    saveSession(session, remember);
    return session;
  },

  async loginCompany(email: string, password: string, remember = false, companyCode?: string): Promise<Session> {
    if (!companyCode) throw new Error('Company code is required');
    const authUserId = await signIn(email, password, remember);
    const { data, error } = await supabase.rpc('app_sign_in_company', { p_company_code: companyCode });
    const row = Array.isArray(data) ? data[0] : data;
    if (error) await rejectAccess('Signed in, but could not check company access', error);
    if (!row) await rejectAccess(`This login has no active access to company "${companyCode.toUpperCase()}"`);
    const user: User = {
      id: row.id, company_id: row.company_id, email: row.email, full_name: row.full_name,
      username: row.email, roles: [], is_super_admin: false, is_active: true, created_at: new Date().toISOString(),
    };
    const session: Session = { type: 'company', user, authUserId, companyId: row.company_id };
    saveSession(session, remember);
    return session;
  },

  /** The stored session, only if it still matches a live Supabase sign-in. */
  async restoreSession(): Promise<Session | null> {
    const stored = readSession();
    const { data } = await supabase.auth.getSession();
    const authUserId = data.session?.user?.id;
    if (!stored || !authUserId || stored.authUserId !== authUserId) {
      clearSession();
      if (authUserId && !stored) await supabase.auth.signOut();
      return null;
    }
    return stored;
  },

  /** Access token to prove identity to our own server functions. */
  async accessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },

  async logout() {
    clearSession();
    await supabase.auth.signOut();
  },

  clearLocal() {
    clearSession();
  },
};
