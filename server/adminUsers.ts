// Server-side user administration for Quantivra.
//
// Creating logins and setting passwords needs the Supabase *service* key,
// which must never reach the browser. This module runs only on the server
// (Vercel function api/admin-users.ts, or the Vite dev middleware) and checks
// who is calling before doing anything.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loginEmailFor, normaliseUsername, isValidUsername, USERNAME_RULE_TEXT } from '../src/utils/loginEmail.js';

export const MIN_PASSWORD_LENGTH = 8;

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

interface Caller {
  authUserId: string;
  isPlatformAdmin: boolean;
  companyIds: number[];
}

type Body = Record<string, unknown>;

/** Write one record in the platform audit trail (a failure here never stops the action itself). */
async function audit(admin: SupabaseClient, caller: Caller, action: string, entityType: string, entityId: string | number | null, companyId: number | null, summary: string, newValue?: unknown) {
  try {
    const [p, c] = await Promise.all([
      admin.from('platform_users').select('full_name').eq('auth_user_id', caller.authUserId).maybeSingle(),
      admin.from('company_users').select('full_name').eq('auth_user_id', caller.authUserId).limit(1).maybeSingle(),
    ]);
    await admin.from('platform_audit_log').insert({
      action, entity_type: entityType, entity_id: entityId == null ? null : String(entityId), company_id: companyId, summary,
      actor_name: p.data?.full_name || c.data?.full_name || null, actor_auth_id: caller.authUserId, new_value: newValue ?? null,
    });
  } catch { /* the trail is best effort here */ }
}

function str(body: Body, key: string, required = true): string {
  const v = body[key];
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  if (required) throw new HttpError(400, `Missing ${key}`);
  return '';
}

function num(body: Body, key: string, required = true): number | null {
  const v = body[key];
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
  if (Number.isInteger(n) && n > 0) return n;
  if (required) throw new HttpError(400, `Missing ${key}`);
  return null;
}

function checkPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

async function identify(admin: SupabaseClient, token: string): Promise<Caller> {
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'Not signed in');
  const authUserId = data.user.id;

  const [platform, memberships] = await Promise.all([
    admin.from('platform_users').select('id').eq('auth_user_id', authUserId).eq('is_active', true).maybeSingle(),
    admin.from('company_users').select('company_id, companies!inner(is_active)')
      .eq('auth_user_id', authUserId).eq('is_active', true).eq('companies.is_active', true),
  ]);
  if (platform.error) throw new HttpError(500, platform.error.message);
  if (memberships.error) throw new HttpError(500, memberships.error.message);
  return {
    authUserId,
    isPlatformAdmin: !!platform.data,
    companyIds: (memberships.data || []).map((m: any) => Number(m.company_id)),
  };
}

function requirePlatformAdmin(caller: Caller) {
  if (!caller.isPlatformAdmin) throw new HttpError(403, 'Platform administrator only');
}

function requireCompany(caller: Caller, companyId: number) {
  if (!caller.isPlatformAdmin && !caller.companyIds.includes(companyId)) {
    throw new HttpError(403, 'Not authorised for this company');
  }
}

/** Platform admin, or a member of the company whose role has pay access (see migration 020). */
async function hasPayAccess(admin: SupabaseClient, caller: Caller, companyId: number): Promise<boolean> {
  if (caller.isPlatformAdmin) return true;
  if (!caller.companyIds.includes(companyId)) return false;
  const { data: me } = await admin.from('company_users').select('id')
    .eq('auth_user_id', caller.authUserId).eq('company_id', companyId).eq('is_active', true).maybeSingle();
  if (!me) return false;
  const { data: links } = await admin.from('company_user_roles').select('role_id').eq('user_id', me.id);
  const roleIds = (links || []).map((l: any) => l.role_id);
  if (!roleIds.length) return false;
  const { data: roles } = await admin.from('company_roles').select('id')
    .eq('company_id', companyId).eq('can_view_pay', true).in('id', roleIds);
  return (roles || []).length > 0;
}

/** Managing logins and roles is limited to people with pay access. */
async function requireUserAdmin(admin: SupabaseClient, caller: Caller, companyId: number) {
  requireCompany(caller, companyId);
  if (!(await hasPayAccess(admin, caller, companyId))) {
    throw new HttpError(403, 'Only people with HR / pay access can manage sign-ins');
  }
}

/**
 * Creates a Supabase Auth login, or finds the existing one for that email.
 * An existing login keeps its own password: otherwise an admin of one company
 * could take over someone's account in another company by "re-adding" them.
 */
async function findOrCreateLogin(
  admin: SupabaseClient, email: string, attrs: { password?: string; password_hash?: string },
): Promise<{ id: string; created: boolean }> {
  // A password chosen by an admin is temporary: the person must set their own
  // at first sign-in. Moved-over (legacy) passwords were already their own.
  const user_metadata = attrs.password ? { must_change_password: true } : undefined;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, ...attrs, ...(user_metadata ? { user_metadata } : {}) });
  if (!error && data?.user) return { id: data.user.id, created: true };

  const exists = error && ((error as any).code === 'email_exists' || /already (been )?registered|already exists/i.test(error.message));
  if (!exists) throw new HttpError(400, error?.message || 'Could not create login');
  const found = await admin.rpc('app_find_auth_user', { p_email: email });
  if (found.error || !found.data) throw new HttpError(500, found.error?.message || 'Login exists but could not be found');
  return { id: found.data as string, created: false };
}

async function createCompanyUser(admin: SupabaseClient, caller: Caller, body: Body) {
  const companyId = num(body, 'company_id')!;
  await requireUserAdmin(admin, caller, companyId);
  const username = normaliseUsername(str(body, 'username'));
  if (!isValidUsername(username)) throw new HttpError(400, `Username must be ${USERNAME_RULE_TEXT}`);
  const contactEmail = str(body, 'email', false).toLowerCase() || null;
  if (contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) throw new HttpError(400, 'Email address is not valid');
  const password = str(body, 'password');
  checkPassword(password);
  const roleId = num(body, 'role_id', false);

  const { data: company } = await admin.from('companies').select('company_code').eq('id', companyId).maybeSingle();
  if (!company?.company_code) throw new HttpError(404, 'Company not found');

  const taken = await admin.from('company_users').select('id').eq('company_id', companyId).ilike('username', username).maybeSingle();
  if (taken.data) throw new HttpError(400, 'This username is already used in this company');

  if (roleId) {
    const role = await admin.from('company_roles').select('id').eq('id', roleId).eq('company_id', companyId).maybeSingle();
    if (!role.data) throw new HttpError(400, 'Role does not belong to this company');
  }


  // Sign-in is by username: the Supabase login uses a hidden internal address
  // unique to this company + username, so it never collides with anyone else.
  const login = await findOrCreateLogin(admin, loginEmailFor(company.company_code, username), { password });
  if (!login.created) {
    // The hidden address is unique to this company + username. If nobody uses
    // that login any more (e.g. the company was deleted and re-created), it is
    // an orphan: reuse it with the new temporary password.
    if (await loginInUse(admin, login.id)) throw new HttpError(400, 'This username is already used in this company');
    const { error: resetErr } = await admin.auth.admin.updateUserById(login.id, { password, user_metadata: { must_change_password: true } });
    if (resetErr) throw new HttpError(400, resetErr.message);
  }
  const { data: row, error } = await admin.from('company_users').insert({
    company_id: companyId,
    username,
    email: contactEmail,
    full_name: str(body, 'full_name'),
    job_title: str(body, 'job_title', false) || null,
    phone: str(body, 'phone', false) || null,
    auth_user_id: login.id,
    is_active: true,
  }).select('id, company_id, username, email, full_name, job_title, phone, is_active, created_at').single();

  if (error) {
    if (login.created) await admin.auth.admin.deleteUser(login.id);
    throw new HttpError(400, /duplicate|unique/i.test(error.message)
      ? 'This username is already used in this company' : error.message);
  }
  if (roleId) await admin.from('company_user_roles').insert({ user_id: row.id, role_id: roleId });
  await audit(admin, caller, 'user.created', 'user', row.id, companyId, `${row.full_name} (${row.username})`, { job_title: row.job_title });

  return { user: row, existing_login: !login.created };
}

/** Is this Supabase login still linked to any company user or platform admin? */
async function loginInUse(admin: SupabaseClient, authUserId: string): Promise<boolean> {
  const [cu, pu] = await Promise.all([
    admin.from('company_users').select('id').eq('auth_user_id', authUserId),
    admin.from('platform_users').select('id').eq('auth_user_id', authUserId),
  ]);
  return (cu.data || []).length > 0 || (pu.data || []).length > 0;
}

/**
 * Permanently delete a (deactivated) company and everything in it, then
 * remove the Supabase logins that belonged only to that company — otherwise
 * they linger and block re-creating the same usernames.
 */
async function deleteCompany(admin: SupabaseClient, caller: Caller, body: Body) {
  requirePlatformAdmin(caller);
  const companyId = num(body, 'company_id')!;
  const { data: company } = await admin.from('companies').select('id, name, is_active').eq('id', companyId).maybeSingle();
  if (!company) throw new HttpError(404, 'Company not found');
  if (company.is_active) throw new HttpError(400, 'Deactivate the company before deleting it');

  const { data: users } = await admin.from('company_users').select('auth_user_id').eq('company_id', companyId);
  const authIds = Array.from(new Set((users || []).map((u: any) => u.auth_user_id).filter(Boolean))) as string[];

  const del = await admin.from('companies').delete().eq('id', companyId);
  if (del.error) throw new HttpError(400, del.error.message);

  await audit(admin, caller, 'company.deleted', 'company', companyId, companyId, String(company.name || ''));
  let removedLogins = 0;
  for (const id of authIds) {
    if (await loginInUse(admin, id)) continue;   // still used by another company or as platform admin
    const { error } = await admin.auth.admin.deleteUser(id);
    if (!error) removedLogins++;
  }
  return { ok: true, removed_logins: removedLogins };
}

/**
 * Remove a company user's sign-in. Their employee record (if linked) stays,
 * just unlinked. The Supabase login is deleted unless used elsewhere.
 * Refuses to delete yourself or the company's last user with pay access.
 */
async function deleteCompanyUser(admin: SupabaseClient, caller: Caller, body: Body) {
  const targetId = num(body, 'company_user_id')!;
  const { data: target } = await admin.from('company_users').select('id, company_id, auth_user_id, full_name, username').eq('id', targetId).maybeSingle();
  if (!target) throw new HttpError(404, 'User not found');
  const companyId = Number(target.company_id);
  await requireUserAdmin(admin, caller, companyId);
  if (target.auth_user_id && target.auth_user_id === caller.authUserId) throw new HttpError(400, "You can't delete your own sign-in");

  // Keep at least one person who can manage the company.
  const { data: payRoles } = await admin.from('company_roles').select('id').eq('company_id', companyId).eq('can_view_pay', true);
  const payRoleIds = (payRoles || []).map((r: any) => r.id);
  if (payRoleIds.length) {
    const { data: links } = await admin.from('company_user_roles').select('user_id').in('role_id', payRoleIds);
    const payUsers = new Set((links || []).map((l: any) => l.user_id));
    if (payUsers.has(targetId) && payUsers.size <= 1) {
      throw new HttpError(400, 'This is the only person who can see pay and manage users. Give someone else that role first.');
    }
  }

  const del = await admin.from('company_users').delete().eq('id', targetId);
  if (del.error) throw new HttpError(400, del.error.message);
  let loginRemoved = false;
  if (target.auth_user_id && !(await loginInUse(admin, target.auth_user_id))) {
    const { error } = await admin.auth.admin.deleteUser(target.auth_user_id);
    loginRemoved = !error;
  }
  await audit(admin, caller, 'user.deleted', 'user', targetId, companyId, `${target.full_name} (${target.username})`);
  return { ok: true, login_removed: loginRemoved };
}

async function setPassword(admin: SupabaseClient, caller: Caller, body: Body) {
  const targetId = num(body, 'company_user_id')!;
  const password = str(body, 'password');
  checkPassword(password);

  const { data: target } = await admin.from('company_users')
    .select('id, company_id, auth_user_id, full_name, username').eq('id', targetId).maybeSingle();
  if (!target?.auth_user_id) throw new HttpError(404, 'User not found');
  requireCompany(caller, Number(target.company_id));
  if (target.auth_user_id !== caller.authUserId) await requireUserAdmin(admin, caller, Number(target.company_id));

  if (!caller.isPlatformAdmin && target.auth_user_id !== caller.authUserId) {
    // A company admin may only reset logins that belong to their company alone.
    const [others, platform] = await Promise.all([
      admin.from('company_users').select('id').eq('auth_user_id', target.auth_user_id).neq('company_id', target.company_id),
      admin.from('platform_users').select('id').eq('auth_user_id', target.auth_user_id),
    ]);
    if ((others.data || []).length > 0 || (platform.data || []).length > 0) {
      throw new HttpError(403, 'This person also uses their login elsewhere; ask them to reset it themselves');
    }
  }

  // Resetting someone else's password makes it temporary until they change it.
  const { error } = await admin.auth.admin.updateUserById(target.auth_user_id, {
    password, user_metadata: { must_change_password: target.auth_user_id !== caller.authUserId },
  });
  if (error) throw new HttpError(400, error.message);
  if (target.auth_user_id !== caller.authUserId) await audit(admin, caller, 'user.password_reset', 'user', targetId, Number(target.company_id), `${target.full_name} (${target.username})`);
  return { ok: true };
}

async function createPlatformAdmin(admin: SupabaseClient, caller: Caller, body: Body) {
  requirePlatformAdmin(caller);
  const email = str(body, 'email').toLowerCase();
  const password = str(body, 'password');
  checkPassword(password);
  const login = await findOrCreateLogin(admin, email, { password });
  const { data, error } = await admin.from('platform_users').insert({
    username: email, email, full_name: str(body, 'full_name'), auth_user_id: login.id, is_active: true,
  }).select('id, email, full_name, is_active, created_at').single();
  if (error) {
    if (login.created) await admin.auth.admin.deleteUser(login.id);
    throw new HttpError(400, error.message);
  }
  await audit(admin, caller, 'platform_admin.created', 'platform_user', data.id, null, `${data.full_name} (${data.email})`);
  return { user: data, existing_login: !login.created };
}

/** Moves pre-Supabase-Auth company logins over, keeping their passwords. */
async function migrateLegacyUsers(admin: SupabaseClient, caller: Caller) {
  requirePlatformAdmin(caller);
  const { data, error } = await admin.rpc('app_legacy_password_hashes');
  if (error) throw new HttpError(500, error.message);

  const result = { migrated: 0, linked_to_existing_login: 0, failed: [] as { email: string; reason: string }[] };
  for (const row of (data || []) as { company_user_id: number; email: string; password_hash: string }[]) {
    try {
      const email = row.email.trim().toLowerCase();
      const login = await findOrCreateLogin(admin, email, { password_hash: row.password_hash });
      const upd = await admin.from('company_users').update({ auth_user_id: login.id }).eq('id', row.company_user_id);
      if (upd.error) throw new Error(upd.error.message);
      await admin.rpc('app_clear_legacy_password', { p_company_user_id: row.company_user_id });
      if (login.created) result.migrated++; else result.linked_to_existing_login++;
    } catch (e: any) {
      result.failed.push({ email: row.email, reason: e?.message || String(e) });
    }
  }
  return result;
}

export async function handleAdminUsers(request: Request, admin: SupabaseClient): Promise<Response> {
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Use POST');
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) throw new HttpError(401, 'Not signed in');
    let body: Body;
    try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }

    const caller = await identify(admin, token);
    let result: unknown;
    switch (body.action) {
      case 'create_company_user':   result = await createCompanyUser(admin, caller, body); break;
      case 'set_password':          result = await setPassword(admin, caller, body); break;
      case 'create_platform_admin': result = await createPlatformAdmin(admin, caller, body); break;
      case 'migrate_legacy_users':  result = await migrateLegacyUsers(admin, caller); break;
      case 'delete_company':        result = await deleteCompany(admin, caller, body); break;
      case 'delete_company_user':   result = await deleteCompanyUser(admin, caller, body); break;
      default: throw new HttpError(400, 'Unknown action');
    }
    return Response.json(result);
  } catch (e: any) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error('[admin-users]', e);
    return Response.json({ error: e instanceof HttpError ? e.message : 'Server error' }, { status });
  }
}

export function adminClientFromEnv(env: Record<string, string | undefined>): SupabaseClient {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(500, 'Server is missing SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function handleWithEnv(request: Request, env: Record<string, string | undefined>): Promise<Response> {
  let admin: SupabaseClient;
  try { admin = adminClientFromEnv(env); } catch (e: any) {
    console.error('[admin-users]', e.message);
    return Response.json({ error: 'User administration is not configured on the server' }, { status: 500 });
  }
  return handleAdminUsers(request, admin);
}
