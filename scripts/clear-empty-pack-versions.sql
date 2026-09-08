-- The 16 country_pack_versions rows all have an empty config {} and are shadowing
-- the populated COUNTRY_PACKS data in src/data/countries.ts (the page only falls back
-- to that when no version row exists). Delete the empty rows.
DELETE FROM country_pack_versions WHERE config IS NULL OR config::text IN ('{}', 'null');
SELECT country_code, version, jsonb_typeof(config) AS cfg FROM country_pack_versions;
