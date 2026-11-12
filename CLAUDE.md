# Quantivra — notes for coding sessions

HR, accounting and payroll SaaS. React 19 + Vite 8 + Ant Design, Supabase
(Postgres + Auth), deployed on Vercel. The owner is not technical: explain
outcomes in plain language.

## Owner preference: merge pull requests yourself
The owner has asked for every pull request to be merged for them. After
opening one, merge it into `master` (Vercel deploys from there) once
`npm test` and `npm run build` pass and the PR's Vercel check is green. If a
check fails, fix it first or tell the owner; never merge a red PR. Database
migrations still need the owner to run them in the Supabase SQL editor, so
say clearly when one is waiting, and in which order the two have to happen.

## Vercel free plan: 100 deployments a day
Every push to a branch makes a preview deployment and every merge makes a production one; past 100 a day Vercel
refuses ("api-deployments-free-per-day") and a merged change does not go live until it is redeployed. Batch changes
into one pull request, push as little as possible, and merge once. If previews are switched off in Vercel
(Settings → Git → Ignored Build Step), there is no Vercel check on pull requests: rely on `npm test` and `npm run build`,
then confirm the production deployment after merging.

## Claims and payroll
Staff claims: an approver approves, then Finance approves (Finance → Payables → Staff claims). A Finance-approved claim in
the company's currency that Finance has not recorded is paid back in the next payroll run as a reimbursement (no CPF) and
leaves Finance's list; one Finance recorded first never goes into payroll. The books show it under its category account.

## Vercel previews
Branch pushes are skipped on purpose (Vercel → Settings → Git → Ignored Build Step), so only merges into `master` deploy and
pull requests have no Vercel check: run `npm test` and `npm run build`, merge, then confirm the production deployment.

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
