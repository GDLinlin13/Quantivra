-- 012_sg_leave_days.sql — Singapore leave minimums were stored in WEEKS in a
-- DAYS column (Maternity 16, Paternity 2, Shared Parental 4). Convert to
-- working days (5 per week) at today's law:
--   Maternity 16 weeks → 80, Paternity 4 weeks → 20 (mandatory since 1 Apr 2025),
--   Shared Parental 10 weeks → 50 (children born on/after 1 Apr 2026).
-- Only rows still holding the old wrong value are changed, so manual edits stay.
-- Idempotent. Paste into the Supabase SQL editor.

UPDATE country_pack_versions v
SET config = jsonb_set(v.config, '{leave_minimums}', (
  SELECT jsonb_agg(
    CASE
      WHEN e->>'name' = 'Maternity Leave'       AND (e->>'min_days')::numeric = 16 THEN e || '{"min_days": 80}'
      WHEN e->>'name' = 'Paternity Leave'       AND (e->>'min_days')::numeric = 2  THEN e || '{"min_days": 20}'
      WHEN e->>'name' = 'Shared Parental Leave' AND (e->>'min_days')::numeric = 4  THEN e || '{"min_days": 50}'
      ELSE e
    END ORDER BY t.ord)
  FROM jsonb_array_elements(v.config->'leave_minimums') WITH ORDINALITY AS t(e, ord)
))
WHERE v.country_code = 'SG'
  AND jsonb_typeof(v.config->'leave_minimums') = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(v.config->'leave_minimums') e
    WHERE (e->>'name', (e->>'min_days')::numeric) IN
      (('Maternity Leave', 16), ('Paternity Leave', 2), ('Shared Parental Leave', 4)));

UPDATE country_statutory_leave l
SET min_days = CASE l.name WHEN 'Maternity Leave' THEN 80 WHEN 'Paternity Leave' THEN 20 ELSE 50 END
FROM country_pack_versions v
WHERE v.id = l.version_id AND v.country_code = 'SG'
  AND (l.name, l.min_days) IN (('Maternity Leave', 16), ('Paternity Leave', 2), ('Shared Parental Leave', 4));

-- Existing Singapore companies' own leave types (only untouched old values).
UPDATE leave_types lt
SET default_days = CASE lt.name WHEN 'Maternity Leave' THEN 80 WHEN 'Paternity Leave' THEN 20 ELSE 50 END
FROM companies c
WHERE c.id = lt.company_id AND c.country = 'SG'
  AND (lt.name, lt.default_days) IN (('Maternity Leave', 16), ('Paternity Leave', 2), ('Shared Parental Leave', 4));

SELECT 'migration 012 complete' AS status;
