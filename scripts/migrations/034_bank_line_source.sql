-- 034_bank_line_source.sql — where a bank line came from: 'statement' (imported from the bank's PDF / CSV)
-- or 'manual' (keyed in by hand, or a recorded transfer confirmed by hand). Balance per statement counts
-- statement lines only. Lines already there are treated as keyed in until a statement is imported over them.
-- Idempotent.

ALTER TABLE fin_bank_transactions ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
ALTER TABLE fin_bank_transactions DROP CONSTRAINT IF EXISTS fin_bank_transactions_source_check;
ALTER TABLE fin_bank_transactions ADD CONSTRAINT fin_bank_transactions_source_check CHECK (source IN ('statement', 'manual'));

SELECT 'migration 034 complete' AS status;
