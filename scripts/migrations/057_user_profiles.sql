-- 057_user_profiles.sql — each person's own profile: the name shown at the top right, a picture, or the colour of the
-- round head icon. Everyone reads and changes only their own row. Idempotent.
CREATE TABLE IF NOT EXISTS public.user_profiles (
  auth_user_id  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text,
  avatar_color  text,
  avatar_data   text,                       -- a small picture (data address), made in the browser
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_profile ON public.user_profiles;
CREATE POLICY own_profile ON public.user_profiles FOR ALL TO authenticated
  USING (auth_user_id = auth.uid()) WITH CHECK (auth_user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles TO authenticated;
GRANT ALL ON public.user_profiles TO service_role;
REVOKE ALL ON public.user_profiles FROM anon;

SELECT 'migration 057 complete' AS status;
