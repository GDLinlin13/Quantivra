import { describe, it, expect, beforeEach } from 'vitest';
import { handleAdminUsers } from '../adminUsers';

// A tiny in-memory stand-in for the Supabase service client: just enough of
// the query builder and auth admin API for the code under test.
type Row = Record<string, any>;

function makeFake() {
  const db: Record<string, Row[]> = {
    companies: [{ id: 1, is_active: true, company_code: 'alpha' }, { id: 2, is_active: true, company_code: 'beta' }],
    platform_users: [{ id: 1, auth_user_id: 'u-admin', is_active: true }],
    company_users: [
      { id: 10, company_id: 1, email: 'a@alpha.test', auth_user_id: 'u-a', is_active: true },
      { id: 20, company_id: 2, email: 'b@beta.test', auth_user_id: 'u-b', is_active: true },
      { id: 11, company_id: 1, email: 'shared@x.test', auth_user_id: 'u-shared', is_active: true },
      { id: 21, company_id: 2, email: 'shared@x.test', auth_user_id: 'u-shared', is_active: true },
      { id: 12, company_id: 1, email: 'staff@alpha.test', auth_user_id: 'u-staff', is_active: true },
    ],
    company_roles: [
      { id: 100, company_id: 1, can_view_pay: true }, { id: 200, company_id: 2, can_view_pay: true },
      { id: 101, company_id: 1, can_view_pay: false },
    ],
    // u-a (Alpha) has pay access via role 100; u-staff (Alpha) only has the plain role 101
    company_user_roles: [{ user_id: 10, role_id: 100 }, { user_id: 12, role_id: 101 }] as Row[],
    employees: [{ id: 500, company_id: 1, user_id: null }, { id: 600, company_id: 2, user_id: null }] as Row[],
  };
  const tokens: Record<string, string> = { 'tok-a': 'u-a', 'tok-b': 'u-b', 'tok-admin': 'u-admin', 'tok-nobody': 'u-nobody', 'tok-staff': 'u-staff' };
  const authUsers: Record<string, { email: string; password?: string; password_hash?: string }> = {
    'u-a': { email: 'a@alpha.test' }, 'u-b': { email: 'b@beta.test' }, 'u-admin': { email: 'admin@q.test' },
    'u-shared': { email: 'shared@x.test', password: 'orig' }, 'u-staff': { email: 'staff@alpha.test', password: 'orig' },
    'u-nobody': { email: 'nobody@x.test' },
  };
  const legacy = [{ company_user_id: 30, email: 'Old@Alpha.test', password_hash: '$2a$10$abc' }];
  db.company_users.push({ id: 30, company_id: 1, email: 'Old@Alpha.test', auth_user_id: null, is_active: true });
  const cleared: number[] = [];
  let nextId = 1000;

  function query(table: string) {
    let rows = () => db[table] ?? [];
    const filters: ((r: Row) => boolean)[] = [];
    let joinCompanies = false;
    let pending: { kind: 'insert' | 'update' | 'delete'; values: Row } | null = null;
    const get = (r: Row, path: string) => {
      if (path.startsWith('companies.')) return db.companies.find(c => c.id === r.company_id)?.[path.slice(10)];
      return r[path];
    };
    const run = () => {
      if (pending?.kind === 'insert') {
        const v = pending.values;
        if (table === 'company_users' && db.company_users.some(r => r.company_id === v.company_id && r.email === v.email)) {
          return { data: null, error: { message: 'duplicate key value violates unique constraint' } };
        }
        const row = { id: nextId++, ...v };
        db[table].push(row);
        return { data: [row], error: null };
      }
      const matched = rows().filter(r => filters.every(f => f(r)));
      if (pending?.kind === 'update') matched.forEach(r => Object.assign(r, pending!.values));
      if (pending?.kind === 'delete') {
        db[table] = db[table].filter(r => !matched.includes(r));
        if (table === 'companies') {  // ON DELETE CASCADE
          const ids = matched.map(r => r.id);
          db.company_users = db.company_users.filter(u => !ids.includes(u.company_id));
        }
      }
      return { data: matched.map(r => joinCompanies ? { ...r, companies: db.companies.find(c => c.id === r.company_id) } : r), error: null };
    };
    const b: any = {
      select(cols?: string) { if (cols?.includes('companies!inner')) joinCompanies = true; return b; },
      insert(values: Row) { pending = { kind: 'insert', values }; return b; },
      update(values: Row) { pending = { kind: 'update', values }; return b; },
      delete() { pending = { kind: 'delete', values: {} }; return b; },
      eq(col: string, val: any) { filters.push(r => get(r, col) === val); return b; },
      neq(col: string, val: any) { filters.push(r => get(r, col) !== val); return b; },
      in(col: string, vals: any[]) { filters.push(r => vals.includes(get(r, col))); return b; },
      ilike(col: string, val: any) { filters.push(r => String(get(r, col) ?? '').toLowerCase() === String(val).toLowerCase()); return b; },
      maybeSingle() { const r = run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); },
      single() { const r = run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); },
      then(res: any, rej: any) { return Promise.resolve(run()).then(res, rej); },
    };
    return b;
  }

  const client: any = {
    from: query,
    rpc(name: string, args: any) {
      if (name === 'app_find_auth_user') {
        const id = Object.keys(authUsers).find(k => authUsers[k].email === args.p_email.toLowerCase());
        return Promise.resolve({ data: id ?? null, error: null });
      }
      if (name === 'app_legacy_password_hashes') return Promise.resolve({ data: legacy, error: null });
      if (name === 'app_clear_legacy_password') { cleared.push(args.p_company_user_id); return Promise.resolve({ data: null, error: null }); }
      throw new Error('unexpected rpc ' + name);
    },
    auth: {
      getUser: async (token: string) => tokens[token]
        ? { data: { user: { id: tokens[token] } }, error: null }
        : { data: { user: null }, error: { message: 'bad token' } },
      admin: {
        createUser: async (attrs: any) => {
          if (Object.values(authUsers).some(u => u.email === attrs.email)) {
            return { data: { user: null }, error: { code: 'email_exists', message: 'A user with this email address has already been registered' } };
          }
          const id = `u-new-${nextId++}`;
          authUsers[id] = { email: attrs.email, password: attrs.password, password_hash: attrs.password_hash };
          return { data: { user: { id } }, error: null };
        },
        updateUserById: async (id: string, attrs: any) => { Object.assign(authUsers[id], attrs); return { data: {}, error: null }; },
        deleteUser: async (id: string) => { delete authUsers[id]; return { data: {}, error: null }; },
      },
    },
  };
  return { client, db, authUsers, cleared };
}

let fake: ReturnType<typeof makeFake>;
beforeEach(() => { fake = makeFake(); });

async function call(token: string | null, body: Record<string, unknown>) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await handleAdminUsers(new Request('http://x/api/admin-users', {
    method: 'POST', headers, body: JSON.stringify(body),
  }), fake.client);
  return { status: res.status, body: await res.json() };
}

const newUser = (company_id: number, extra: Record<string, unknown> = {}) => ({
  action: 'create_company_user', company_id, username: 'New.Person', email: 'New@Alpha.test', password: 'longenough', full_name: 'New Person', ...extra,
});

describe('admin-users server function', () => {
  it('rejects callers who are not signed in', async () => {
    expect((await call(null, newUser(1))).status).toBe(401);
    expect((await call('forged', newUser(1))).status).toBe(401);
  });

  it('lets a company user add a login to their own company, signing in by username', async () => {
    const r = await call('tok-a', newUser(1, { role_id: 100 }));
    expect(r.status).toBe(200);
    const row = fake.db.company_users.find(u => u.username === 'new.person');
    expect(row).toMatchObject({ company_id: 1, email: 'new@alpha.test' });
    expect(fake.authUsers[row!.auth_user_id]).toMatchObject({ email: 'alpha.new.person@users.quantivra.app', password: 'longenough' });
    expect(fake.db.company_user_roles).toContainEqual({ id: expect.any(Number), user_id: row!.id, role_id: 100 });
  });

  it('email is optional; usernames are checked and unique per company', async () => {
    expect((await call('tok-a', newUser(1, { email: '' }))).status).toBe(200);
    expect(fake.db.company_users.find(u => u.username === 'new.person')?.email).toBeNull();
    expect((await call('tok-a', newUser(1, { email: '' }))).body.error).toMatch(/already used/);
    expect((await call('tok-a', newUser(1, { username: 'a' }))).status).toBe(400);
    expect((await call('tok-a', newUser(1, { username: 'has space' }))).status).toBe(400);
    expect((await call('tok-a', newUser(1, { email: 'not-an-email' }))).status).toBe(400);
    // the same username in another company is a separate login
    expect((await call('tok-admin', newUser(2))).status).toBe(200);
  });

  it('blocks adding a login to another company', async () => {
    const r = await call('tok-a', newUser(2));
    expect(r.status).toBe(403);
    expect(fake.db.company_users.some(u => u.username === 'new.person')).toBe(false);
  });

  it('blocks a role from another company', async () => {
    expect((await call('tok-a', newUser(1, { role_id: 200 }))).status).toBe(400);
  });

  it('blocks users with no company and enforces password length', async () => {
    expect((await call('tok-nobody', newUser(1))).status).toBe(403);
    expect((await call('tok-a', newUser(1, { password: 'short' }))).status).toBe(400);
  });

  it('platform admins can add logins to any company', async () => {
    expect((await call('tok-admin', newUser(2))).status).toBe(200);
  });

  it('password reset: own company only, and never for a login shared with another company', async () => {
    expect((await call('tok-a', { action: 'set_password', company_user_id: 12, password: 'newpassword' })).status).toBe(200);
    expect(fake.authUsers['u-staff'].password).toBe('newpassword');

    expect((await call('tok-a', { action: 'set_password', company_user_id: 20, password: 'newpassword' })).status).toBe(403);
    expect((await call('tok-a', { action: 'set_password', company_user_id: 11, password: 'newpassword' })).status).toBe(403);
    expect(fake.authUsers['u-shared'].password).toBe('orig');

    expect((await call('tok-admin', { action: 'set_password', company_user_id: 11, password: 'newpassword' })).status).toBe(200);
  });

  it('platform-only actions are refused for company users', async () => {
    expect((await call('tok-a', { action: 'create_platform_admin', email: 'x@y.z', password: 'longenough', full_name: 'X' })).status).toBe(403);
    expect((await call('tok-a', { action: 'migrate_legacy_users' })).status).toBe(403);
  });

  it('moves legacy logins into Supabase Auth keeping their bcrypt hash', async () => {
    const r = await call('tok-admin', { action: 'migrate_legacy_users' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ migrated: 1, linked_to_existing_login: 0, failed: [] });
    const row = fake.db.company_users.find(u => u.id === 30)!;
    expect(fake.authUsers[row.auth_user_id]).toMatchObject({ email: 'old@alpha.test', password_hash: '$2a$10$abc' });
    expect(fake.cleared).toEqual([30]);
  });

  it('rejects unknown actions and non-POST requests', async () => {
    expect((await call('tok-a', { action: 'drop_tables' })).status).toBe(400);
    const res = await handleAdminUsers(new Request('http://x/api/admin-users'), fake.client);
    expect(res.status).toBe(405);
  });

  it('deleting a company removes its data and the logins only it used', async () => {
    expect((await call('tok-a', { action: 'delete_company', company_id: 1 })).status).toBe(403);
    expect((await call('tok-admin', { action: 'delete_company', company_id: 1 })).body.error).toMatch(/Deactivate/);
    fake.db.companies.find(c => c.id === 1)!.is_active = false;
    const r = await call('tok-admin', { action: 'delete_company', company_id: 1 });
    expect(r.status).toBe(200);
    expect(fake.db.companies.some(c => c.id === 1)).toBe(false);
    expect(fake.authUsers['u-a']).toBeUndefined();          // only used by company 1
    expect(fake.authUsers['u-staff']).toBeUndefined();
    expect(fake.authUsers['u-shared']).toBeDefined();       // still used by company 2
  });

  it('re-creating a username whose old login was left behind reuses that login', async () => {
    fake.authUsers['u-orphan'] = { email: 'alpha.ivan@users.quantivra.app', password: 'old' };
    const r = await call('tok-admin', newUser(1, { username: 'ivan', password: 'brandnew1' }));
    expect(r.status).toBe(200);
    expect(fake.db.company_users.find(u => u.username === 'ivan')?.auth_user_id).toBe('u-orphan');
    expect(fake.authUsers['u-orphan'].password).toBe('brandnew1');
    // but a login that is still in use is never taken over
    expect((await call('tok-admin', newUser(1, { username: 'ivan', password: 'another12' }))).status).toBe(400);
    expect(fake.authUsers['u-orphan'].password).toBe('brandnew1');
  });

  it('only people with pay access can create sign-ins or reset other people\'s passwords', async () => {
    expect((await call('tok-staff', newUser(1))).status).toBe(403);
    expect((await call('tok-staff', { action: 'set_password', company_user_id: 10, password: 'newpassword' })).status).toBe(403);
    // anyone may change their own password
    expect((await call('tok-staff', { action: 'set_password', company_user_id: 12, password: 'newpassword' })).status).toBe(200);
  });

});
