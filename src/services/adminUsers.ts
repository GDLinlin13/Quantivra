// Browser side of /api/admin-users: creating logins and setting passwords
// happens on the server, which holds the Supabase service key.
import { authService } from './auth';

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const token = await authService.accessToken();
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  const res = await fetch('/api/admin-users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

export interface CreatedCompanyUser {
  user: { id: number; company_id: number; email: string; full_name: string };
  /** True when the email already had a Quantivra login; its password was not changed. */
  existing_login: boolean;
}

export const adminUsersService = {
  createCompanyUser(input: {
    company_id: number; email: string; password: string; full_name: string;
    job_title?: string; phone?: string; role_id?: number;
  }) {
    return call<CreatedCompanyUser>('create_company_user', input);
  },
  setPassword(companyUserId: number, password: string) {
    return call<{ ok: true }>('set_password', { company_user_id: companyUserId, password });
  },
  createPlatformAdmin(input: { email: string; password: string; full_name: string }) {
    return call<{ user: any; existing_login: boolean }>('create_platform_admin', input);
  },
  migrateLegacyUsers() {
    return call<{ migrated: number; linked_to_existing_login: number; failed: { email: string; reason: string }[] }>('migrate_legacy_users');
  },
};

export const MIN_PASSWORD_LENGTH = 8;
