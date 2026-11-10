-- 035_bigger_files.sql — files in Quantivra (attachments, statements, documents) can be up to 50 MB (was 10 MB).
-- 50 MB is the most a Supabase project allows per file unless its global upload limit is raised.
-- Pictures are also made smaller in the browser before they are uploaded. Idempotent.

UPDATE storage.buckets SET file_size_limit = 52428800 WHERE id = 'fin-attachments';

SELECT 'migration 035 complete' AS status;
