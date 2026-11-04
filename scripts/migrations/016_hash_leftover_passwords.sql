-- 016_hash_leftover_passwords.sql — no readable passwords anywhere.
--
-- Quantivra signs people in through Supabase Auth; none of its own tables
-- hold passwords (migration 011 removed them). Older tables left over from
-- before the rebuild can still have password columns in plain text, and
-- migration 011 made unrecognised tables readable by any signed-in user.
--
-- For every column in the public schema whose name looks like a password or
-- PIN, this migration:
--   1. replaces every value that is not already a bcrypt hash with a bcrypt
--      hash (one-way: the original can never be read again), and
--   2. restricts the table to platform administrators only, even when it
--      has a company_id (hashes can still be guessed offline).
-- It prints which tables and columns it changed. Idempotent.

DO $$
DECLARE
  col record;
  n bigint;
  report text := '';
BEGIN
  FOR col IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      AND c.data_type IN ('text', 'character varying', 'character')
      AND c.column_name ~* '(pass(word)?|passwd|pwd|pin_code|^pin$|secret)'
    ORDER BY 1, 2
  LOOP
    EXECUTE format(
      'UPDATE public.%I SET %I = extensions.crypt(%I, extensions.gen_salt(''bf'', 10))
       WHERE %I IS NOT NULL AND %I <> '''' AND %I !~ ''^\$2[aby]\$''',
      col.table_name, col.column_name, col.column_name, col.column_name, col.column_name, col.column_name);
    GET DIAGNOSTICS n = ROW_COUNT;

    -- Even hashed passwords can be guessed offline, so nobody but platform
    -- administrators may read these tables (none are used by the app).
    PERFORM public.app_apply_platform_policy(col.table_name);

    report := report || format('%s.%s: %s value(s) hashed; ', col.table_name, col.column_name, n);
  END LOOP;

  RAISE NOTICE 'Password-like columns: %', CASE WHEN report = '' THEN 'none found' ELSE report END;
END $$;

-- What was found (shown as the result of this script).
SELECT c.table_name, c.column_name,
       (SELECT CASE WHEN p.polname IS NULL THEN 'no policy' ELSE p.polname::text END
        FROM pg_policy p WHERE p.polrelid = format('public.%I', c.table_name)::regclass LIMIT 1) AS access_rule
FROM information_schema.columns c
JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
  AND c.data_type IN ('text', 'character varying', 'character')
  AND c.column_name ~* '(pass(word)?|passwd|pwd|pin_code|^pin$|secret)'
ORDER BY 1, 2;
