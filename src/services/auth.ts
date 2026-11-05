import { supabase, setRememberMe } from '../utils/supabase';
import { loginEmailFor } from '../utils/loginEmail';
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
  /** signed in with a temporary password: must choose a new one first */
  mustChangePassword?: boolean;
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
  if (/invalid login credentials/i.test(msg) || error?.code === 'invalid_credentials') return 'Wrong company code, username or password';
  if (/email not confirmed/i.test(msg)) return 'This login has not been confirmed yet (Supabase → Authentication → Users → Confirm)';
  if (/fetch|network|failed to fetch/i.test(msg) || error?.status === 0) return 'Cannot reach the sign-in service. Check your connection and try again.';
  return msg ? `Sign-in failed: ${msg}` : INVALID;
}

const mustChange = (u: { user_metadata?: Record<string, any> } | null | undefined) => u?.user_metadata?.must_change_password === true;

async function signIn(email: string, password: string, remember: boolean): Promise<{ id: string; mustChangePassword: boolean }> {
  setRememberMe(remember);
  let result;
  try {
    result = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  } catch (e: any) {
    throw new Error(signInMessage({ message: e?.message || 'network error', status: 0 }));
  }
  if (result.error || !result.data.user) throw new Error(signInMessage(result.error));
  return { id: result.data.user.id, mustChangePassword: mustChange(result.data.user) };
}

/** Password was right, but this login has no access here: sign out and explain. */
async function rejectAccess(reason: string, error?: { message?: string } | null): Promise<never> {
  await supabase.auth.signOut();
  throw new Error(error?.message ? `${reason} (${error.message})` : reason);
}

export const authService = {
  async loginPlatform(identifier: string, password: string, remember = false): Promise<Session> {
    const { id: authUserId, mustChangePassword } = await signIn(toEmail(identifier), password, remember);
    const { data, error } = await supabase.rpc('app_sign_in_platform');
    const row = Array.isArray(data) ? data[0] : data;
    if (error) await rejectAccess('Signed in, but could not check platform access', error);
    if (!row) await rejectAccess('This login is not a platform administrator');
    const user: User = {
      id: row.id, username: row.username, email: row.email, full_name: row.full_name,
      roles: ['super_admin'], is_super_admin: true, is_active: true, created_at: new Date().toISOString(),
    };
    const session: Session = { type: 'platform', user, authUserId, mustChangePassword };
    saveSession(session, remember);
    return session;
  },

  async loginCompany(identifier: string, password: string, remember = false, companyCode?: string): Promise<Session> {
    if (!companyCode) throw new Error('Company code is required');
    // Usernames map to the company's hidden login address; logins created
    // before usernames existed can still type their email.
    const email = identifier.includes('@') ? identifier : loginEmailFor(companyCode, identifier);
    const { id: authUserId, mustChangePassword } = await signIn(email, password, remember);
    const { data, error } = await supabase.rpc('app_sign_in_company', { p_company_code: companyCode });
    const row = Array.isArray(data) ? data[0] : data;
    if (error) await rejectAccess('Signed in, but could not check company access', error);
    if (!row) await rejectAccess(`This login has no active access to company "${companyCode.toUpperCase()}"`);
    const user: User = {
      id: row.id, company_id: row.company_id, email: row.email || '', full_name: row.full_name,
      username: row.username || row.email, roles: [], is_super_admin: false, is_active: true, created_at: new Date().toISOString(),
    };
    const session: Session = { type: 'company', user, authUserId, companyId: row.company_id, mustChangePassword };
    saveSession(session, remember);
    return session;
  },

  /** The stored session, only if it still matches a live Supabase sign-in. */
  async restoreSession(): Promise<Session | null> {
    const stored = readSession();
    const { data } = await supabase.auth.getSession();
    let authUserId = data.session?.user?.id;
    let liveUser: { user_metadata?: Record<string, any> } | null = null;
    if (authUserId) {
      // The stored sign-in may have expired (e.g. overnight). Ask Supabase to
      // confirm it; if it can't, sign out so the login page shows instead of
      // pages that silently load nothing.
      const { data: live, error } = await supabase.auth.getUser();
      // Only a rejected sign-in logs out; a network hiccup keeps the session.
      const rejected = error
        ? (error.status === 401 || error.status === 403 || error.name === 'AuthSessionMissingError')
        : !live.user;
      if (rejected) {
        clearSession();
        await supabase.auth.signOut().catch(() => {});
        return null;
      }
      if (live.user) { authUserId = live.user.id; liveUser = live.user; }
    }
    if (!stored || !authUserId || stored.authUserId !== authUserId) {
      clearSession();
      if (authUserId && !stored) await supabase.auth.signOut();
      return null;
    }
    if (liveUser) stored.mustChangePassword = mustChange(liveUser);
    return stored;
  },

  /** Access token to prove identity to our own server functions. */
  async accessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },

  /** Change the signed-in person's own password (current password required). */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) throw new Error('New password must be at least 8 characters');
    if (newPassword === currentPassword) throw new Error('New password must be different from the current one');
    const { data: u, error: userErr } = await supabase.auth.getUser();
    const email = u.user?.email;
    if (userErr || !email) throw new Error('Your session has expired. Please sign in again.');
    const check = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (check.error) throw new Error('Current password is incorrect');
    const { error } = await supabase.auth.updateUser({ password: newPassword, data: { must_change_password: false } });
    if (error) throw new Error(error.message);
  },

  /** First sign-in with a temporary password: set the person's own password. */
  async setFirstPassword(newPassword: string): Promise<void> {
    if (newPassword.length < 8) throw new Error('New password must be at least 8 characters');
    const { error } = await supabase.auth.updateUser({ password: newPassword, data: { must_change_password: false } });
    if (error) {
      if (/same|different/i.test(error.message)) throw new Error('Choose a password different from the temporary one');
      throw new Error(error.message);
    }
    const stored = readSession();
    if (stored) {
      stored.mustChangePassword = false;
      const remember = localStorage.getItem(STORAGE_KEY) !== null;
      saveSession(stored, remember);
    }
  },

  async logout() {
    clearSession();
    await supabase.auth.signOut();
  },

  clearLocal() {
    clearSession();
  },
};
