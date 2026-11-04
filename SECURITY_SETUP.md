# Switching on the security foundation

_2026-11-04 — goes with migration `011_auth_rls.sql`_

## What changes

| Before | After |
|---|---|
| Anyone with the app's public key could read or change **every** company's data, including decrypted ID and bank numbers | The public key alone gets nothing. Each signed-in person sees only their own company. |
| Platform login was the fixed password `123456`, checked in the browser | Platform admins sign in with their own email and password (Supabase Auth) |
| Company passwords were checked by our own code; hashes sat in a table the app could read | Supabase Auth handles sign-in. No password hashes remain in app tables. |
| New logins were created from the browser | New logins are created by a small server function that holds the secret key |

Existing company users **keep their current passwords**. They sign in with
**email + password + company code**. Signing in by name no longer works.

## One-time setup (about 15 minutes, in this order)

Do steps 1–4 together. Once step 1 runs, the old app version can no longer
sign anyone in.

1. **Run the database update.** Supabase → SQL Editor → New query → paste all of
   `scripts/migrations/011_auth_rls.sql` → **Run**. It ends with
   `migration 011 complete`. It's safe to run again.
   - The output lists the "shared reference tables" every signed-in user can
     read (country packs etc.). If anything in that list holds one company's
     private data, tell the next session.
2. **Create the AEGIS platform admin login.**
   Supabase → Authentication → Users → **Add user** → email
   `aegis@quantivra.com`, a strong password (not `123456`) → tick
   **Auto Confirm User**. Then in the SQL Editor run:
   ```sql
   SELECT public.grant_platform_admin('aegis@quantivra.com', 'AEGIS System');
   ```
   On the login page, type **AEGIS** as the username with that password.
   (Typing AEGIS signs in as `aegis@quantivra.com`. Other platform admins sign
   in with their own email.)
3. **Turn off public sign-ups.** Supabase → Authentication → Sign In / Providers →
   switch off **Allow new users to sign up**. Logins are only created by admins.
4. **Give the server its key, then deploy.** Supabase → Project Settings → API Keys →
   copy the **service_role** (secret) key. Vercel → your project → Settings →
   Environment Variables → add `SUPABASE_SERVICE_ROLE_KEY` with that value
   (Production and Preview). Deploy this version of the app.
   **Never put this key in a `VITE_` variable or in the code.**
5. **Sign in and move the older logins.** Open the app and sign in as **AEGIS**
   with the password from step 2. On **Companies**,
   click **Upgrade N older login(s)**. Everyone keeps their password.

## Checking it worked

- Sign in as a company user from company A. You should not see anything from company B.
- `123456` no longer gets anyone into the platform.
- Developers: `bash scripts/security-tests/run.sh` runs 10 groups of break-in
  checks against a throwaway local Postgres database.

## Still to do (next security steps)

- **Roles inside a company.** Today every user of a company can see and change
  all of that company's data, payroll and ID numbers included. Next comes
  role-based access, for example only HR/payroll roles can see salaries and ID
  numbers.
- **Move the encryption key into Supabase Vault.** The key for ID/bank numbers
  sits in a private table in the same database. Moving it to Vault separates
  the key from the data.
- **Password reset by email.** Admins can set a new password today. A
  "forgot password" email flow is not built yet.
- **Delete company files.** Deleting a company removes all its database rows,
  but there are no file uploads yet. Once there are, deletion must clear
  storage too.
