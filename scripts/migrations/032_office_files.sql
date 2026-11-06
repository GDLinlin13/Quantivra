-- 032_office_files.sql — Documents and attachments also accept Microsoft Office files
-- (Word, Excel, PowerPoint). Idempotent.

UPDATE storage.buckets SET allowed_mime_types = ARRAY[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif',
  'text/csv', 'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
] WHERE id = 'fin-attachments';

SELECT 'migration 032 complete' AS status;
