# Quantivra — notes for coding sessions

HR, accounting and payroll SaaS. React 19 + Vite 8 + Ant Design, Supabase
(Postgres + Auth), deployed on Vercel. The owner is not technical: explain
outcomes in plain language.

## Commands
- `npm test` — vitest (payroll engine + server function tests)
- `npm run build` — `tsc && vite build`
- `bash scripts/security-tests/run.sh` — builds a throwaway local Postgres
  shaped like Supabase, applies every migration, and tries to break tenant
  isolation. Needs a local PostgreSQL superuser (set PGHOST/PGPORT/PGUSER).
  Run it after any SQL change.

## Security rules (migration 011 — do not regress)
- Sign-in is **Supabase Auth**. `company_users.auth_user_id` /
  `platform_users.auth_user_id` link app users to `auth.users`. Never add a
  password column to an app table, and never check passwords in the browser.
- **RLS is on for every public table.** The anon key gets no grants at all.
  Never `DISABLE ROW LEVEL SECURITY` and never `GRANT ... TO anon`. The older
  migrations (002–010, `fix-rls.sql`) did both. Don't copy that pattern.
- **New table with company data:** give it a `company_id` column and run
  `SELECT public.app_apply_tenant_policy('<table>');`. If its company lives on a
  parent row, use `app_apply_child_policy('<table>', '<fk>', '<parent>')`.
- **SECURITY DEFINER functions skip RLS.** The first line must be
  `PERFORM public.app_require_company(<company id>)` or
  `PERFORM public.app_require_platform_admin()`. The security tests fail otherwise.
- Creating logins and setting passwords goes through `POST /api/admin-users`
  (`api/admin-users.ts` → `server/adminUsers.ts`), which uses
  `SUPABASE_SERVICE_ROLE_KEY`. That key is server-only: never `VITE_`-prefixed.
- Employee ID, tax and bank numbers are encrypted (`private.enc` / `private.dec`).
  Decrypt only inside checked RPCs.

## Migrations
`scripts/migrations/NNN_*.sql`, idempotent. The owner applies them by pasting
into the Supabase SQL editor. `SECURITY_SETUP.md` has the owner's setup steps.
