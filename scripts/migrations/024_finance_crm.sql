-- 024_finance_crm.sql — CRM contacts and the Finance module.
--
--   contacts / contact_people   customers and suppliers, and the people at them (CRM)
--   fin_accounts                chart of accounts
--   fin_documents (+ lines)     quotations, invoices, credit notes, supplier bills, expenses
--   fin_payments (+ allocations) money received and paid, matched to documents
--   fin_journals (+ lines)      manual journal entries
--   fin_bank_transactions       bank statement lines, matched to payments
--   fin_next_number()           the next document number from Settings → Document numbers
--
-- Every table has company_id and the standard tenant policy; links between
-- rows are checked to stay inside one company. GST settings live in
-- company_settings (category 'company', key 'finance').
-- Idempotent: safe to run more than once.

-- ------------------------------------------------------------------
-- Links must stay inside the company: NEW.<column> must point at a row of
-- <table> with the same company_id. Runs as the user, so RLS also applies.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_guard_ref_company() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  i int := 0;
  v_id bigint;
  v_company bigint;
BEGIN
  WHILE i < TG_NARGS LOOP
    v_id := NULLIF(to_jsonb(NEW) ->> TG_ARGV[i], '')::bigint;
    IF v_id IS NOT NULL THEN
      EXECUTE format('SELECT company_id FROM public.%I WHERE id = $1', TG_ARGV[i + 1]) INTO v_company USING v_id;
      IF v_company IS DISTINCT FROM NEW.company_id THEN
        RAISE EXCEPTION '% does not belong to this company', TG_ARGV[i] USING ERRCODE = '42501';
      END IF;
    END IF;
    i := i + 2;
  END LOOP;
  RETURN NEW;
END $$;
GRANT EXECUTE ON FUNCTION public.app_guard_ref_company() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.app_guard_ref_company() FROM PUBLIC, anon;

-- ------------------------------------------------------------------
-- CRM: customers / suppliers and their people
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id            bigserial PRIMARY KEY,
  company_id    bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  is_customer   boolean NOT NULL DEFAULT true,
  is_supplier   boolean NOT NULL DEFAULT false,
  name          text NOT NULL,
  reg_no        text,
  tax_no        text,
  email         text,
  phone         text,
  website       text,
  address       text,
  currency      text,
  payment_terms_days int,
  notes         text,
  archived      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id, name);

CREATE TABLE IF NOT EXISTS contact_people (
  id            bigserial PRIMARY KEY,
  company_id    bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id    bigint NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  name          text NOT NULL,
  designation   text,
  email         text,
  phone         text,
  is_primary    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_people_contact ON contact_people(contact_id);

-- ------------------------------------------------------------------
-- Chart of accounts
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin_accounts (
  id            bigserial PRIMARY KEY,
  company_id    bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code          text NOT NULL,
  name          text NOT NULL,
  type          text NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  subtype       text,          -- bank, receivable, payable, tax, payroll… (used to post automatically)
  description   text,
  is_system     boolean NOT NULL DEFAULT false,
  archived      boolean NOT NULL DEFAULT false,
  bank_name     text,
  bank_account_no text,
  opening_balance numeric(16, 2) NOT NULL DEFAULT 0,
  opening_date  date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

-- ------------------------------------------------------------------
-- Documents: quotations, invoices, credit notes (sales); bills, expenses (purchases)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin_documents (
  id              bigserial PRIMARY KEY,
  company_id      bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  doc_type        text NOT NULL CHECK (doc_type IN ('quote', 'invoice', 'credit_note', 'bill', 'expense')),
  number          text NOT NULL,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'approved', 'paid', 'partial', 'void')),
  contact_id      bigint REFERENCES contacts(id) ON DELETE RESTRICT,
  contact_person_id bigint REFERENCES contact_people(id) ON DELETE SET NULL,
  issue_date      date NOT NULL DEFAULT current_date,
  due_date        date,
  reference       text,
  currency        text NOT NULL DEFAULT 'SGD',
  tax_inclusive   boolean NOT NULL DEFAULT false,
  discounts       jsonb NOT NULL DEFAULT '[]',   -- [{name, kind: 'percent'|'amount', value}]
  subtotal        numeric(16, 2) NOT NULL DEFAULT 0,
  discount_total  numeric(16, 2) NOT NULL DEFAULT 0,
  tax_total       numeric(16, 2) NOT NULL DEFAULT 0,
  total           numeric(16, 2) NOT NULL DEFAULT 0,
  amount_paid     numeric(16, 2) NOT NULL DEFAULT 0,
  notes           text,
  terms           text,
  source_id       bigint REFERENCES fin_documents(id) ON DELETE SET NULL,  -- e.g. the quotation an invoice came from
  paid_from_account_id bigint REFERENCES fin_accounts(id) ON DELETE SET NULL, -- expenses paid on the spot
  employee_id     bigint REFERENCES employees(id) ON DELETE SET NULL,        -- expense claimed by a staff member
  payment_account_index int,      -- which of the company's bank accounts to print (Invoice Template)
  created_by      bigint,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_type, number)
);
CREATE INDEX IF NOT EXISTS idx_fin_documents_company ON fin_documents(company_id, doc_type, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_fin_documents_contact ON fin_documents(contact_id);

CREATE TABLE IF NOT EXISTS fin_document_lines (
  id            bigserial PRIMARY KEY,
  company_id    bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id   bigint NOT NULL REFERENCES fin_documents(id) ON DELETE CASCADE,
  position      int NOT NULL DEFAULT 0,
  description   text NOT NULL DEFAULT '',
  quantity      numeric(14, 4) NOT NULL DEFAULT 1,
  unit_price    numeric(16, 4) NOT NULL DEFAULT 0,
  discount_pct  numeric(6, 3) NOT NULL DEFAULT 0,
  tax_rate      numeric(6, 3) NOT NULL DEFAULT 0,
  account_id    bigint REFERENCES fin_accounts(id) ON DELETE SET NULL,
  amount        numeric(16, 2) NOT NULL DEFAULT 0       -- after the line discount, before tax
);
CREATE INDEX IF NOT EXISTS idx_fin_lines_doc ON fin_document_lines(document_id, position);

-- ------------------------------------------------------------------
-- Payments received (in) and made (out), matched to documents
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin_payments (
  id            bigserial PRIMARY KEY,
  company_id    bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  direction     text NOT NULL CHECK (direction IN ('in', 'out')),
  number        text,
  contact_id    bigint REFERENCES contacts(id) ON DELETE SET NULL,
  payment_date  date NOT NULL DEFAULT current_date,
  amount        numeric(16, 2) NOT NULL CHECK (amount > 0),
  method        text,            -- bank transfer, PayNow, cheque, cash, card…
  reference     text,
  account_id    bigint REFERENCES fin_accounts(id) ON DELETE SET NULL,  -- the bank / cash account
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_payments_company ON fin_payments(company_id, payment_date DESC);

CREATE TABLE IF NOT EXISTS fin_payment_allocations (
  id            bigserial PRIMARY KEY,
  company_id    bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payment_id    bigint NOT NULL REFERENCES fin_payments(id) ON DELETE CASCADE,
  document_id   bigint NOT NULL REFERENCES fin_documents(id) ON DELETE CASCADE,
  amount        numeric(16, 2) NOT NULL CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS idx_fin_alloc_doc ON fin_payment_allocations(document_id);
CREATE INDEX IF NOT EXISTS idx_fin_alloc_payment ON fin_payment_allocations(payment_id);

-- ------------------------------------------------------------------
-- Manual journal entries
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin_journals (
  id            bigserial PRIMARY KEY,
  company_id    bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  number        text,
  journal_date  date NOT NULL DEFAULT current_date,
  memo          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fin_journal_lines (
  id            bigserial PRIMARY KEY,
  company_id    bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  journal_id    bigint NOT NULL REFERENCES fin_journals(id) ON DELETE CASCADE,
  account_id    bigint NOT NULL REFERENCES fin_accounts(id) ON DELETE RESTRICT,
  description   text,
  debit         numeric(16, 2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit        numeric(16, 2) NOT NULL DEFAULT 0 CHECK (credit >= 0)
);
CREATE INDEX IF NOT EXISTS idx_fin_jl_journal ON fin_journal_lines(journal_id);

-- ------------------------------------------------------------------
-- Bank statement lines
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin_bank_transactions (
  id            bigserial PRIMARY KEY,
  company_id    bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id    bigint NOT NULL REFERENCES fin_accounts(id) ON DELETE CASCADE,
  txn_date      date NOT NULL,
  description   text,
  amount        numeric(16, 2) NOT NULL,           -- money in > 0, money out < 0
  payment_id    bigint REFERENCES fin_payments(id) ON DELETE SET NULL,
  journal_id    bigint REFERENCES fin_journals(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched', 'matched', 'ignored')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_bank_txn ON fin_bank_transactions(company_id, account_id, txn_date DESC);

-- ------------------------------------------------------------------
-- Tenant isolation + cross-company link checks
-- ------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contacts', 'contact_people', 'fin_accounts', 'fin_documents', 'fin_document_lines',
    'fin_payments', 'fin_payment_allocations', 'fin_journals', 'fin_journal_lines', 'fin_bank_transactions'] LOOP
    PERFORM public.app_apply_tenant_policy(t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated', t || '_id_seq');
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('GRANT ALL ON SEQUENCE public.%I TO service_role', t || '_id_seq');
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon', t || '_id_seq');
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_ref_company ON contact_people;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON contact_people FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('contact_id', 'contacts');
DROP TRIGGER IF EXISTS trg_ref_company ON fin_documents;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON fin_documents FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('contact_id', 'contacts', 'contact_person_id', 'contact_people',
    'source_id', 'fin_documents', 'paid_from_account_id', 'fin_accounts', 'employee_id', 'employees');
DROP TRIGGER IF EXISTS trg_ref_company ON fin_document_lines;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON fin_document_lines FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('document_id', 'fin_documents', 'account_id', 'fin_accounts');
DROP TRIGGER IF EXISTS trg_ref_company ON fin_payments;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON fin_payments FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('contact_id', 'contacts', 'account_id', 'fin_accounts');
DROP TRIGGER IF EXISTS trg_ref_company ON fin_payment_allocations;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON fin_payment_allocations FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('payment_id', 'fin_payments', 'document_id', 'fin_documents');
DROP TRIGGER IF EXISTS trg_ref_company ON fin_journal_lines;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON fin_journal_lines FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('journal_id', 'fin_journals', 'account_id', 'fin_accounts');
DROP TRIGGER IF EXISTS trg_ref_company ON fin_bank_transactions;
CREATE TRIGGER trg_ref_company BEFORE INSERT OR UPDATE ON fin_bank_transactions FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_ref_company('account_id', 'fin_accounts', 'payment_id', 'fin_payments', 'journal_id', 'fin_journals');

-- ------------------------------------------------------------------
-- Document numbers: takes the next number from Settings → Document numbers
-- (company_settings 'numbering_formats') and moves the counter on, in one go
-- so two people can't get the same number. Runs as the user (RLS applies).
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_format_doc_number(p_format text, p_n int, p_date date) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v text := p_format;
  m text[];
BEGIN
  v := replace(v, '{YYYY}', to_char(p_date, 'YYYY'));
  v := replace(v, '{YY}', to_char(p_date, 'YY'));
  v := replace(v, '{MM}', to_char(p_date, 'MM'));
  LOOP
    m := regexp_match(v, '\{(0+)\}');
    EXIT WHEN m IS NULL;
    v := regexp_replace(v, '\{0+\}', lpad(p_n::text, greatest(length(m[1]), length(p_n::text)), '0'));
  END LOOP;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.fin_next_number(p_company_id bigint, p_entity text, p_date date DEFAULT current_date)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_list jsonb;
  v_item jsonb;
  v_idx int;
  v_next int;
  v_period text;
  v_reset text;
  v_format text;
  v_defaults jsonb := jsonb_build_object(
    'invoice', 'INV-{YYYY}-{0000}', 'quotation', 'QUO-{YYYY}-{0000}', 'credit_note', 'CN-{YYYY}-{0000}',
    'receipt', 'RCT-{YYYY}-{0000}', 'bill', 'BILL-{YYYY}-{0000}', 'claim', 'EXP-{YYYY}-{0000}',
    'payment', 'PAY-{YYYY}-{0000}', 'journal', 'JNL-{YYYY}-{0000}');
BEGIN
  PERFORM public.app_require_company(p_company_id);
  INSERT INTO company_settings (company_id, category, key, value)
    VALUES (p_company_id, 'company', 'numbering_formats', '[]'::jsonb)
    ON CONFLICT (company_id, category, key) DO NOTHING;
  SELECT value INTO v_list FROM company_settings
    WHERE company_id = p_company_id AND category = 'company' AND key = 'numbering_formats' FOR UPDATE;
  IF jsonb_typeof(v_list) IS DISTINCT FROM 'array' THEN v_list := '[]'::jsonb; END IF;

  SELECT ord - 1, elem INTO v_idx, v_item
    FROM jsonb_array_elements(v_list) WITH ORDINALITY AS a(elem, ord)
    WHERE elem ->> 'entity' = p_entity LIMIT 1;
  IF v_item IS NULL THEN
    v_item := jsonb_build_object('entity', p_entity, 'format', COALESCE(v_defaults ->> p_entity, upper(left(p_entity, 3)) || '-{YYYY}-{0000}'),
                                 'next', 1, 'reset', 'yearly');
    v_list := v_list || jsonb_build_array(v_item);
    v_idx := jsonb_array_length(v_list) - 1;
  END IF;

  v_format := v_item ->> 'format';
  v_reset := COALESCE(v_item ->> 'reset', CASE WHEN v_format ~ '\{YY' THEN 'yearly' ELSE 'never' END);
  v_period := CASE v_reset WHEN 'yearly' THEN to_char(p_date, 'YYYY') WHEN 'monthly' THEN to_char(p_date, 'YYYY-MM') ELSE '' END;
  v_next := COALESCE(NULLIF(v_item ->> 'next', '')::int, 1);
  IF v_reset <> 'never' AND (v_item ->> 'period') IS NOT NULL AND v_item ->> 'period' <> v_period THEN
    v_next := 1;
  END IF;

  v_item := v_item || jsonb_build_object('next', v_next + 1, 'period', v_period);
  v_list := jsonb_set(v_list, ARRAY[v_idx::text], v_item);
  UPDATE company_settings SET value = v_list
    WHERE company_id = p_company_id AND category = 'company' AND key = 'numbering_formats';
  RETURN public.app_format_doc_number(v_format, v_next, p_date);
END $$;
GRANT EXECUTE ON FUNCTION public.fin_next_number(bigint, text, date), public.app_format_doc_number(text, int, date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fin_next_number(bigint, text, date), public.app_format_doc_number(text, int, date) FROM PUBLIC, anon;

SELECT 'migration 024 complete' AS status;
