-- 017_usernames.sql — company users sign in with company code + username.
-- Supabase Auth needs an email per login, so each username gets a hidden
-- internal address (<companycode>.<username>@users.quantivra.app, built in
-- src/utils/loginEmail.ts) that is never shown or emailed. A real email is
-- now optional contact information. Existing email logins keep working.
-- Idempotent. Paste into the Supabase SQL editor.

ALTER TABLE company_users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE company_users ALTER COLUMN email DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_users_username
  ON company_users (company_id, lower(username)) WHERE username IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_users_username_format') THEN
    ALTER TABLE company_users ADD CONSTRAINT company_users_username_format
      CHECK (username IS NULL OR username ~ '^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$');
  END IF;
END $$;

-- Sign-in lookup now also returns the username.
DROP FUNCTION IF EXISTS public.app_sign_in_company(text);
CREATE FUNCTION public.app_sign_in_company(p_company_code text)
RETURNS TABLE (id bigint, company_id bigint, email text, username text, full_name text, job_title text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.company_id, u.email, u.username, u.full_name, u.job_title
  FROM company_users u JOIN companies c ON c.id = u.company_id
  WHERE auth.uid() IS NOT NULL
    AND u.auth_user_id = auth.uid()
    AND lower(c.company_code) = lower(p_company_code)
    AND c.is_active AND u.is_active
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.app_sign_in_company(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_sign_in_company(text) TO authenticated, service_role;

SELECT 'migration 017 complete' AS status;
