-- 033_supporting_documents.sql — supporting documents for things booked straight to an account from the
-- bank (e.g. share capital, a loan, bank charges): company_files.journal_id links the file to that journal
-- entry, in folder 'journal'. Idempotent.

ALTER TABLE company_files ADD COLUMN IF NOT EXISTS journal_id bigint REFERENCES fin_journals(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_company_files_journal ON company_files(journal_id);
ALTER TABLE company_files DROP CONSTRAINT IF EXISTS company_files_folder_check;
ALTER TABLE company_files ADD CONSTRAINT company_files_folder_check CHECK (folder IN ('bank', 'other', 'journal'));

DROP TRIGGER IF EXISTS trg_ref_company ON company_files;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON company_files FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('account_id', 'fin_accounts', 'journal_id', 'fin_journals');

SELECT 'migration 033 complete' AS status;
