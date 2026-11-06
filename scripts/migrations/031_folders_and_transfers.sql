-- 031_folders_and_transfers.sql
--
-- Documents: your own folders. company_files.subfolder holds the folder a file was put in, e.g. 'Contracts' or
-- 'Contracts/Leases' (empty = Other files). The list of folders, including empty ones, is a company setting.
--
-- Bank: a statement line can be matched to something already recorded (e.g. the other side of a transfer
-- between two of the company's banks). fin_bank_transactions.journal_existing marks those, so undoing the
-- match leaves the journal alone; journals made by the match itself are removed on undo as before.
-- Idempotent.

ALTER TABLE company_files ADD COLUMN IF NOT EXISTS subfolder text;
ALTER TABLE fin_bank_transactions ADD COLUMN IF NOT EXISTS journal_existing boolean NOT NULL DEFAULT false;

SELECT 'migration 031 complete' AS status;
