-- ============================================================
-- QUANTIVRA CORE PLATFORM — Full Database Schema
-- ============================================================

-- ============================================================
-- PLATFORM LAYER (super admin / aegis only)
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_roles (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_permissions (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role_id    BIGINT NOT NULL REFERENCES platform_roles(id) ON DELETE CASCADE,
  module     TEXT NOT NULL,
  feature    TEXT NOT NULL,
  action     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure unique constraints exist (safe to re-run)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_roles_name_key') THEN
    DELETE FROM platform_roles WHERE id NOT IN (SELECT min(id) FROM platform_roles GROUP BY name);
    ALTER TABLE platform_roles ADD CONSTRAINT platform_roles_name_key UNIQUE (name);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_permissions_unique') THEN
    DELETE FROM platform_permissions WHERE id NOT IN (SELECT min(id) FROM platform_permissions GROUP BY role_id, module, feature, action);
    ALTER TABLE platform_permissions ADD CONSTRAINT platform_permissions_unique UNIQUE (role_id, module, feature, action);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS platform_subscriptions (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id      BIGINT NOT NULL,
  plan            TEXT NOT NULL DEFAULT 'starter',
  status          TEXT NOT NULL DEFAULT 'active',
  start_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date        DATE,
  max_users       INT NOT NULL DEFAULT 5,
  max_storage_gb  INT NOT NULL DEFAULT 5,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     BIGINT,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  old_value   JSONB,
  new_value   JSONB,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- COUNTRY PROFILES (renamed from platform_countries)
-- ============================================================

CREATE TABLE IF NOT EXISTS country_profiles (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  currency    TEXT NOT NULL,
  phone_code  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS country_pack_versions (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  country_code   TEXT NOT NULL REFERENCES country_profiles(code),
  version        TEXT NOT NULL,
  effective_from DATE NOT NULL,
  effective_to   DATE,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  config         JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(country_code, version)
);

-- ============================================================
-- COUNTRY PACK GRANULAR TABLES (per-version structured data)
-- ============================================================

CREATE TABLE IF NOT EXISTS country_employment_types (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id      BIGINT NOT NULL REFERENCES country_pack_versions(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS country_employee_categories (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id      BIGINT NOT NULL REFERENCES country_pack_versions(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  statutory_treatment   TEXT NOT NULL
);

-- ============================================================
-- IMMIGRATION STATUSES (replaces country_employee_categories)
-- Separate from employment status — statutory rules compute from immigration status
-- ============================================================
CREATE TABLE IF NOT EXISTS immigration_statuses (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id      BIGINT NOT NULL REFERENCES country_pack_versions(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(version_id, code)
);

-- ============================================================
-- EMPLOYMENT STATUSES (separate from immigration)
-- ============================================================
CREATE TABLE IF NOT EXISTS employment_statuses (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id      BIGINT NOT NULL REFERENCES country_pack_versions(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(version_id, code)
);

-- ============================================================
-- EMPLOYMENT RULES (statutory country-level employment rules)
-- ============================================================
CREATE TABLE IF NOT EXISTS employment_rules (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id        BIGINT NOT NULL REFERENCES country_pack_versions(id) ON DELETE CASCADE,
  rule_key          TEXT NOT NULL,
  rule_value        TEXT NOT NULL,
  editable_by_company BOOLEAN NOT NULL DEFAULT false,
  reference_only    BOOLEAN NOT NULL DEFAULT false,
  description       TEXT,
  UNIQUE(version_id, rule_key)
);

-- ============================================================
-- NOTICE PERIODS (statutory minimum notice by service length)
-- ============================================================
CREATE TABLE IF NOT EXISTS notice_periods (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id        BIGINT NOT NULL REFERENCES country_pack_versions(id) ON DELETE CASCADE,
  min_service_months INT NOT NULL DEFAULT 0,
  max_service_months INT,
  notice_days       INT NOT NULL,
  description       TEXT
);

CREATE TABLE IF NOT EXISTS country_payroll_components (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id      BIGINT NOT NULL REFERENCES country_pack_versions(id) ON DELETE CASCADE,
  component_type  TEXT NOT NULL CHECK (component_type IN ('earning', 'deduction')),
  name            TEXT NOT NULL,
  is_taxable      BOOLEAN NOT NULL DEFAULT true,
  is_mandatory    BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS country_statutory_schemes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id      BIGINT NOT NULL REFERENCES country_pack_versions(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('pension','health','social_security','training','development','tax','other')),
  description     TEXT,
  employee_rate   NUMERIC(5,2),
  employer_rate   NUMERIC(5,2),
  min_amount      NUMERIC(12,2),
  max_amount      NUMERIC(12,2),
  is_mandatory    BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS country_statutory_rates (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scheme_id       BIGINT NOT NULL REFERENCES country_statutory_schemes(id) ON DELETE CASCADE,
  age_group       TEXT,
  wage_min        NUMERIC(12,2),
  wage_max        NUMERIC(12,2),
  employee_rate   NUMERIC(5,2) NOT NULL,
  employer_rate   NUMERIC(5,2) NOT NULL,
  effective_from  DATE,
  effective_to    DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS country_tax_brackets (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id      BIGINT NOT NULL REFERENCES country_pack_versions(id) ON DELETE CASCADE,
  min_income      NUMERIC(12,2) NOT NULL,
  max_income      NUMERIC(12,2),
  rate            NUMERIC(5,2) NOT NULL,
  fixed_amount    NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS country_statutory_leave (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id      BIGINT NOT NULL REFERENCES country_pack_versions(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  min_days        INT NOT NULL,
  carry_forward   INT NOT NULL DEFAULT 0,
  encashable      BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS country_public_holidays (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id      BIGINT NOT NULL REFERENCES country_pack_versions(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  date            DATE,
  recurring       BOOLEAN NOT NULL DEFAULT true,
  year            INT
);

CREATE TABLE IF NOT EXISTS country_government_forms (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id      BIGINT NOT NULL REFERENCES country_pack_versions(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  frequency       TEXT NOT NULL,
  deadline        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS country_tax_codes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id      BIGINT NOT NULL REFERENCES country_pack_versions(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  rate            NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_default      BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS country_document_numbering (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id      BIGINT NOT NULL REFERENCES country_pack_versions(id) ON DELETE CASCADE,
  entity          TEXT NOT NULL,
  format          TEXT NOT NULL,
  next_number     BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS country_workflow_templates (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id      BIGINT NOT NULL REFERENCES country_pack_versions(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  entity_type     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS country_dashboard_widgets (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id      BIGINT NOT NULL REFERENCES country_pack_versions(id) ON DELETE CASCADE,
  name            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS country_compliance_items (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id      BIGINT NOT NULL REFERENCES country_pack_versions(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  frequency       TEXT NOT NULL,
  deadline        TEXT NOT NULL
);

-- ============================================================
-- NORMALIZED STATUTORY SCHEMA (Phase 2A)
-- Global lookup & per-scheme detail tables
-- ============================================================

-- Global salary component library
CREATE TABLE IF NOT EXISTS salary_components (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('earning','deduction','employer_cost')),
  category         TEXT,
  default_taxable  BOOLEAN NOT NULL DEFAULT true,
  description      TEXT,
  display_order    INT NOT NULL DEFAULT 0,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Country regions (for sub-national rules: AU states, CA provinces, UK countries, US states)
CREATE TABLE IF NOT EXISTS country_regions (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  country_code    TEXT NOT NULL REFERENCES country_profiles(code),
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'state',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(country_code, code)
);

-- Scheme-level versioning (each scheme versioned independently)
CREATE TABLE IF NOT EXISTS country_scheme_versions (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scheme_id       BIGINT NOT NULL REFERENCES country_statutory_schemes(id) ON DELETE CASCADE,
  version         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','superseded')),
  effective_from  DATE NOT NULL,
  effective_to    DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(scheme_id, version)
);

-- Employee categories per scheme version
-- Links an immigration_status + optional pr_stage to a treatment table
CREATE TABLE IF NOT EXISTS country_scheme_employee_categories (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scheme_version_id BIGINT NOT NULL REFERENCES country_scheme_versions(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  treatment         TEXT NOT NULL,
  display_order     INT NOT NULL DEFAULT 0
);

-- Add immigration_status_id + pr_stage if table already existed
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'country_scheme_employee_categories' AND column_name = 'immigration_status_id') THEN
    ALTER TABLE country_scheme_employee_categories ADD COLUMN immigration_status_id BIGINT REFERENCES immigration_statuses(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'country_scheme_employee_categories' AND column_name = 'pr_stage') THEN
    ALTER TABLE country_scheme_employee_categories ADD COLUMN pr_stage TEXT;
  END IF;
END $$;

-- Age bands per scheme version
CREATE TABLE IF NOT EXISTS country_scheme_age_bands (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scheme_version_id BIGINT NOT NULL REFERENCES country_scheme_versions(id) ON DELETE CASCADE,
  min_age           INT,
  max_age           INT,
  employee_rate     NUMERIC(5,2),
  employer_rate     NUMERIC(5,2),
  label             TEXT
);

-- Contribution rates per scheme version
CREATE TABLE IF NOT EXISTS country_scheme_rates (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scheme_version_id BIGINT NOT NULL REFERENCES country_scheme_versions(id) ON DELETE CASCADE,
  rate_type         TEXT NOT NULL CHECK (rate_type IN ('flat_percentage','wage_band','progressive_table','tiered')),
  employee_rate     NUMERIC(5,2),
  employer_rate     NUMERIC(5,2),
  wage_min          NUMERIC(12,2),
  wage_max          NUMERIC(12,2),
  display_order     INT NOT NULL DEFAULT 0
);

-- Unified rules (ceilings, thresholds, formulas) per scheme version
-- Replaces legacy country_scheme_caps + country_scheme_thresholds
CREATE TABLE IF NOT EXISTS country_scheme_rules (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scheme_version_id BIGINT NOT NULL REFERENCES country_scheme_versions(id) ON DELETE CASCADE,
  rule_type         TEXT NOT NULL CHECK (rule_type IN ('ceiling','threshold','formula')),
  name              TEXT NOT NULL,
  value_type        TEXT NOT NULL CHECK (value_type IN ('fixed_amount','formula','percentage')),
  value             NUMERIC(12,2),
  formula_ref       TEXT,
  frequency         TEXT,
  description       TEXT,
  display_order     INT NOT NULL DEFAULT 0
);

-- Many-to-many salary component mapping per scheme version
CREATE TABLE IF NOT EXISTS country_scheme_salary_components (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scheme_version_id BIGINT NOT NULL REFERENCES country_scheme_versions(id) ON DELETE CASCADE,
  salary_component_id BIGINT NOT NULL REFERENCES salary_components(id) ON DELETE CASCADE,
  included          BOOLEAN NOT NULL DEFAULT true,
  calculation_type  TEXT NOT NULL DEFAULT 'full' CHECK (calculation_type IN ('full','additional','partial','excluded')),
  priority          INT NOT NULL DEFAULT 0,
  effective_date    DATE,
  expiry_date       DATE,
  UNIQUE(scheme_version_id, salary_component_id)
);

-- Typed formulas per scheme version
CREATE TABLE IF NOT EXISTS country_scheme_formulas (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scheme_version_id BIGINT NOT NULL REFERENCES country_scheme_versions(id) ON DELETE CASCADE,
  formula_code      TEXT NOT NULL,
  formula_name      TEXT NOT NULL,
  formula_type      TEXT NOT NULL CHECK (formula_type IN ('ceiling','threshold','age_band','proration','aggregation','custom')),
  expression        TEXT NOT NULL,
  description       TEXT,
  priority          INT NOT NULL DEFAULT 0,
  effective_date    DATE,
  expiry_date       DATE,
  UNIQUE(scheme_version_id, formula_code)
);

-- Rounding rules per scheme version
CREATE TABLE IF NOT EXISTS country_scheme_rounding (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scheme_version_id BIGINT NOT NULL REFERENCES country_scheme_versions(id) ON DELETE CASCADE,
  field             TEXT NOT NULL,
  method            TEXT NOT NULL CHECK (method IN ('round','ceil','floor','truncate')),
  decimals          INT NOT NULL DEFAULT 2,
  description       TEXT
);

-- Government forms per scheme version
CREATE TABLE IF NOT EXISTS country_scheme_government_forms (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scheme_version_id BIGINT NOT NULL REFERENCES country_scheme_versions(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  frequency         TEXT NOT NULL,
  deadline          TEXT NOT NULL,
  submission_method TEXT NOT NULL DEFAULT 'online' CHECK (submission_method IN ('online','file_upload','api','postal'))
);

-- Submission format definitions per scheme version
CREATE TABLE IF NOT EXISTS country_scheme_submission_formats (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scheme_version_id BIGINT NOT NULL REFERENCES country_scheme_versions(id) ON DELETE CASCADE,
  format_name       TEXT NOT NULL,
  file_type         TEXT NOT NULL DEFAULT 'csv' CHECK (file_type IN ('csv','xml','json','txt','api')),
  schema_definition JSONB,
  description       TEXT
);

-- Validation rules per scheme version
CREATE TABLE IF NOT EXISTS country_scheme_validations (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scheme_version_id BIGINT NOT NULL REFERENCES country_scheme_versions(id) ON DELETE CASCADE,
  rule_code         TEXT NOT NULL,
  rule_name         TEXT NOT NULL,
  validation_type   TEXT NOT NULL CHECK (validation_type IN ('range','required','format','dependency','cross_field')),
  expression        TEXT NOT NULL,
  error_message     TEXT,
  severity          TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('error','warning','info')),
  UNIQUE(scheme_version_id, rule_code)
);

-- Compliance items per scheme version
CREATE TABLE IF NOT EXISTS country_scheme_compliance (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scheme_version_id BIGINT NOT NULL REFERENCES country_scheme_versions(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  frequency         TEXT NOT NULL,
  deadline          TEXT NOT NULL,
  responsible_role  TEXT,
  penalty           TEXT
);

-- ============================================================
-- INDUSTRY PROFILES (renamed from platform_industry_templates)
-- ============================================================

CREATE TABLE IF NOT EXISTS industry_profiles (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  industry   TEXT NOT NULL UNIQUE,
  category   TEXT,
  config     JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- BUSINESS PROFILES (renamed from platform_business_packs)
-- ============================================================

CREATE TABLE IF NOT EXISTS business_profiles (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_pack_modules (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pack_id      BIGINT NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  module_key   TEXT NOT NULL,
  UNIQUE(pack_id, module_key)
);

-- ============================================================
-- COMPANY LAYER (tenant)
-- ============================================================

CREATE TABLE IF NOT EXISTS companies (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                TEXT NOT NULL,
  company_code        TEXT NOT NULL UNIQUE,
  country             TEXT NOT NULL,
  industry            TEXT NOT NULL DEFAULT 'General',
  business_type       TEXT NOT NULL DEFAULT 'General',
  currency            TEXT NOT NULL DEFAULT 'SGD',
  financial_year_start TEXT NOT NULL DEFAULT '01-01',
  timezone            TEXT NOT NULL DEFAULT 'Asia/Singapore',
  logo_url            TEXT,
  modules             TEXT[] NOT NULL DEFAULT '{}',
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_users (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  full_name   TEXT NOT NULL,
  job_title   TEXT,
  phone       TEXT,
  avatar_url  TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, email)
);

CREATE TABLE IF NOT EXISTS company_roles (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

CREATE TABLE IF NOT EXISTS company_permissions (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role_id    BIGINT NOT NULL REFERENCES company_roles(id) ON DELETE CASCADE,
  module     TEXT NOT NULL,
  feature    TEXT NOT NULL,
  action     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_user_roles (
  user_id BIGINT NOT NULL REFERENCES company_users(id) ON DELETE CASCADE,
  role_id BIGINT NOT NULL REFERENCES company_roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS company_settings (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  key         TEXT NOT NULL,
  value       JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, category, key)
);

-- ============================================================
-- COMPANY DEFAULT SETTINGS (Company layer between Country Pack & Employee)
-- ============================================================
CREATE TABLE IF NOT EXISTS company_default_settings (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id      BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  setting_key     TEXT NOT NULL,
  setting_value   TEXT NOT NULL,
  UNIQUE(company_id, setting_key)
);

-- ============================================================
-- WORKFLOW ENGINE
-- ============================================================

CREATE TABLE IF NOT EXISTS workflow_templates (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  template_id     BIGINT NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  step_order      INT NOT NULL,
  assignee_role   TEXT NOT NULL,
  action          TEXT NOT NULL DEFAULT 'approve',
  timeout_days    INT,
  conditions      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_instances (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id    BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_id   BIGINT NOT NULL REFERENCES workflow_templates(id),
  entity_type   TEXT NOT NULL,
  entity_id     BIGINT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  current_step  INT NOT NULL DEFAULT 1,
  created_by    BIGINT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS workflow_logs (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  instance_id   BIGINT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  step_order    INT NOT NULL,
  actor_id      BIGINT NOT NULL,
  action        TEXT NOT NULL,
  comment       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- NOTIFICATION ENGINE
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'in_app',
  channel     TEXT NOT NULL DEFAULT 'in_app',
  read        BOOLEAN NOT NULL DEFAULT false,
  link        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- DOCUMENT / FILE ENGINE
-- ============================================================

CREATE TABLE IF NOT EXISTS documents (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general',
  mime_type   TEXT,
  size_bytes  BIGINT NOT NULL DEFAULT 0,
  uploaded_by BIGINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- AUDIT ENGINE (company-scoped)
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id  BIGINT REFERENCES companies(id) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  old_value   JSONB,
  new_value   JSONB,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_companies_is_active ON companies(is_active);
CREATE INDEX IF NOT EXISTS idx_company_users_company ON company_users(company_id);
CREATE INDEX IF NOT EXISTS idx_company_roles_company ON company_roles(company_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_company ON workflow_instances(company_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_entity ON workflow_instances(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_audit_log_company ON audit_log(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_log_created ON platform_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_country_pack_versions_active ON country_pack_versions(country_code, is_active);
CREATE INDEX IF NOT EXISTS idx_c_employment_types_version ON country_employment_types(version_id);
CREATE INDEX IF NOT EXISTS idx_c_employee_categories_version ON country_employee_categories(version_id);
CREATE INDEX IF NOT EXISTS idx_c_payroll_components_version ON country_payroll_components(version_id);
CREATE INDEX IF NOT EXISTS idx_c_stat_schemes_version ON country_statutory_schemes(version_id);
CREATE INDEX IF NOT EXISTS idx_c_stat_rates_scheme ON country_statutory_rates(scheme_id);
CREATE INDEX IF NOT EXISTS idx_c_tax_brackets_version ON country_tax_brackets(version_id);
CREATE INDEX IF NOT EXISTS idx_c_statutory_leave_version ON country_statutory_leave(version_id);
CREATE INDEX IF NOT EXISTS idx_c_public_holidays_version ON country_public_holidays(version_id);
CREATE INDEX IF NOT EXISTS idx_c_govt_forms_version ON country_government_forms(version_id);
CREATE INDEX IF NOT EXISTS idx_c_tax_codes_version ON country_tax_codes(version_id);
CREATE INDEX IF NOT EXISTS idx_c_numbering_version ON country_document_numbering(version_id);
CREATE INDEX IF NOT EXISTS idx_c_workflows_version ON country_workflow_templates(version_id);
CREATE INDEX IF NOT EXISTS idx_c_widgets_version ON country_dashboard_widgets(version_id);
CREATE INDEX IF NOT EXISTS idx_c_compliance_version ON country_compliance_items(version_id);
CREATE INDEX IF NOT EXISTS idx_c_regions_country ON country_regions(country_code);
CREATE INDEX IF NOT EXISTS idx_c_scheme_versions_scheme ON country_scheme_versions(scheme_id);
CREATE INDEX IF NOT EXISTS idx_cs_employee_categories_ver ON country_scheme_employee_categories(scheme_version_id);
CREATE INDEX IF NOT EXISTS idx_cs_age_bands_ver ON country_scheme_age_bands(scheme_version_id);
CREATE INDEX IF NOT EXISTS idx_cs_rates_ver ON country_scheme_rates(scheme_version_id);
CREATE INDEX IF NOT EXISTS idx_cs_rules_ver ON country_scheme_rules(scheme_version_id);
CREATE INDEX IF NOT EXISTS idx_cs_salary_components_ver ON country_scheme_salary_components(scheme_version_id);
CREATE INDEX IF NOT EXISTS idx_cs_formulas_ver ON country_scheme_formulas(scheme_version_id);
CREATE INDEX IF NOT EXISTS idx_cs_rounding_ver ON country_scheme_rounding(scheme_version_id);
CREATE INDEX IF NOT EXISTS idx_cs_govt_forms_ver ON country_scheme_government_forms(scheme_version_id);
CREATE INDEX IF NOT EXISTS idx_cs_submission_formats_ver ON country_scheme_submission_formats(scheme_version_id);
CREATE INDEX IF NOT EXISTS idx_cs_validations_ver ON country_scheme_validations(scheme_version_id);
CREATE INDEX IF NOT EXISTS idx_cs_compliance_ver ON country_scheme_compliance(scheme_version_id);
CREATE INDEX IF NOT EXISTS idx_cs_employee_categories_immigration ON country_scheme_employee_categories(immigration_status_id);
CREATE INDEX IF NOT EXISTS idx_immigration_statuses_version ON immigration_statuses(version_id);
CREATE INDEX IF NOT EXISTS idx_employment_statuses_version ON employment_statuses(version_id);
CREATE INDEX IF NOT EXISTS idx_employment_rules_version ON employment_rules(version_id);
CREATE INDEX IF NOT EXISTS idx_notice_periods_version ON notice_periods(version_id);
CREATE INDEX IF NOT EXISTS idx_company_default_settings_company ON company_default_settings(company_id);

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO country_profiles (code, name, currency, phone_code) VALUES
  ('SG', 'Singapore', 'SGD', '+65'),
  ('MY', 'Malaysia', 'MYR', '+60'),
  ('ID', 'Indonesia', 'IDR', '+62'),
  ('TH', 'Thailand', 'THB', '+66'),
  ('PH', 'Philippines', 'PHP', '+63'),
  ('VN', 'Vietnam', 'VND', '+84'),
  ('HK', 'Hong Kong', 'HKD', '+852'),
  ('TW', 'Taiwan', 'TWD', '+886'),
  ('JP', 'Japan', 'JPY', '+81'),
  ('KR', 'South Korea', 'KRW', '+82'),
  ('CN', 'China', 'CNY', '+86'),
  ('US', 'United States', 'USD', '+1'),
  ('GB', 'United Kingdom', 'GBP', '+44'),
  ('AU', 'Australia', 'AUD', '+61'),
  ('DE', 'Germany', 'EUR', '+49'),
  ('FR', 'France', 'EUR', '+33') ON CONFLICT DO NOTHING;

INSERT INTO business_profiles (name, description) VALUES
  ('Starter', 'Essential HR operations including employee management, leave tracking, and expense claims'),
  ('HR & Payroll', 'Complete HR suite with payroll processing, attendance tracking, and leave management'),
  ('Finance', 'Financial management including accounting, banking operations, and fixed assets tracking'),
  ('Trading', 'Trading operations with finance, inventory management, purchasing, and sales modules'),
  ('Enterprise', 'All modules including HR, payroll, finance, inventory, CRM, and project management') ON CONFLICT DO NOTHING;

INSERT INTO business_pack_modules (pack_id, module_key)
SELECT bp.id, t.module_key
FROM (VALUES
  (1, 'hr'), (1, 'leave'), (1, 'claims'),
  (2, 'hr'), (2, 'payroll'), (2, 'leave'), (2, 'attendance'),
  (3, 'finance'), (3, 'accounting'),
  (4, 'finance'), (4, 'inventory'), (4, 'purchasing'), (4, 'sales'),
  (5, 'hr'), (5, 'payroll'), (5, 'leave'), (5, 'attendance'), (5, 'claims'),
  (5, 'finance'), (5, 'accounting'), (5, 'inventory'), (5, 'purchasing'), (5, 'sales'),
  (5, 'crm'), (5, 'projects')
) AS t(pack_order, module_key)
JOIN business_profiles bp ON bp.id = t.pack_order ON CONFLICT (pack_id, module_key) DO NOTHING;

-- Global salary component library
INSERT INTO salary_components (code, name, type, category, default_taxable, display_order) VALUES
  ('BASIC', 'Basic Salary', 'earning', 'regular', true, 1),
  ('OVERTIME', 'Overtime Pay', 'earning', 'variable', true, 2),
  ('BONUS', 'Bonus', 'earning', 'variable', true, 3),
  ('COMMISSION', 'Commission', 'earning', 'variable', true, 4),
  ('ALLOWANCE_TRANSPORT', 'Transport Allowance', 'earning', 'allowance', true, 5),
  ('ALLOWANCE_HOUSING', 'Housing Allowance', 'earning', 'allowance', true, 6),
  ('ALLOWANCE_MEAL', 'Meal Allowance', 'earning', 'allowance', true, 7),
  ('ALLOWANCE_MOBILE', 'Mobile Allowance', 'earning', 'allowance', true, 8),
  ('ALLOWANCE_SHIFT', 'Shift Allowance', 'earning', 'allowance', true, 9),
  ('ALLOWANCE_NIGHT', 'Night Shift Allowance', 'earning', 'allowance', true, 10),
  ('ALLOWANCE_ATTENDANCE', 'Attendance Incentive', 'earning', 'allowance', true, 11),
  ('AWS', 'Annual Wage Supplement (13th Month)', 'earning', 'bonus', true, 12),
  ('BACKPAY', 'Back Pay', 'earning', 'adjustment', true, 13),
  ('LEAVE_ENCASHMENT', 'Leave Encashment', 'earning', 'adjustment', true, 14),
  ('TIP', 'Tips/Gratuity', 'earning', 'variable', true, 15),
  ('DIRECTOR_FEE', 'Director Fee', 'earning', 'irregular', true, 16),
  ('SALARY_IN_KIND', 'Salary In Kind', 'earning', 'allowance', true, 17),
  ('STOCK', 'Stock/Equity', 'earning', 'irregular', true, 18),
  ('DEDUCTION_CPF', 'CPF Employee', 'deduction', 'statutory', false, 50),
  ('DEDUCTION_EPF', 'EPF Employee', 'deduction', 'statutory', false, 51),
  ('DEDUCTION_SOCSO', 'SOCSO Employee', 'deduction', 'statutory', false, 52),
  ('DEDUCTION_EIS', 'EIS Employee', 'deduction', 'statutory', false, 53),
  ('DEDUCTION_MPF', 'MPF Employee', 'deduction', 'statutory', false, 54),
  ('DEDUCTION_PENSION', 'Pension Employee', 'deduction', 'statutory', false, 55),
  ('DEDUCTION_NI', 'NI Employee', 'deduction', 'statutory', false, 56),
  ('DEDUCTION_PAYE', 'PAYE Income Tax', 'deduction', 'tax', false, 57),
  ('DEDUCTION_STUDENT_LOAN', 'Student Loan', 'deduction', 'statutory', false, 58),
  ('DEDUCTION_KIWISAVER', 'KiwiSaver Employee', 'deduction', 'statutory', false, 59),
  ('DEDUCTION_401K', '401(k) Employee', 'deduction', 'pension', false, 60),
  ('DEDUCTION_MEDICARE', 'Medicare Levy', 'deduction', 'tax', false, 61),
  ('DEDUCTION_NPL', 'No Pay Leave', 'deduction', 'adjustment', false, 70),
  ('DEDUCTION_LOAN', 'Loan Repayment', 'deduction', 'company', false, 71),
  ('DEDUCTION_ADVANCE', 'Salary Advance', 'deduction', 'company', false, 72),
  ('DEDUCTION_INSURANCE', 'Insurance Premium', 'deduction', 'company', false, 73),
  ('DEDUCTION_GARNISHMENT', 'Garnishment', 'deduction', 'legal', false, 74),
  ('COST_CPF_EMPLOYER', 'CPF Employer Contribution', 'employer_cost', 'statutory', false, 100),
  ('COST_EPF_EMPLOYER', 'EPF Employer Contribution', 'employer_cost', 'statutory', false, 101),
  ('COST_SOCSO_EMPLOYER', 'SOCSO Employer Contribution', 'employer_cost', 'statutory', false, 102),
  ('COST_SDL', 'SDL Employer Levy', 'employer_cost', 'statutory', false, 103),
  ('COST_SHG', 'SHG Contribution', 'employer_cost', 'statutory', false, 104),
  ('COST_PENSION_EMPLOYER', 'Pension Employer Contribution', 'employer_cost', 'statutory', false, 105),
  ('COST_NI_EMPLOYER', 'NI Employer Contribution', 'employer_cost', 'statutory', false, 106),
  ('COST_SUPER', 'Superannuation Guarantee', 'employer_cost', 'statutory', false, 107),
  ('COST_KIWISAVER_EMPLOYER', 'KiwiSaver Employer Contribution', 'employer_cost', 'statutory', false, 108),
  ('COST_401K_MATCH', '401(k) Employer Match', 'employer_cost', 'pension', false, 109),
  ('COST_WORKERS_COMP', 'Workers Compensation Insurance', 'employer_cost', 'insurance', false, 110),
  ('COST_PAYROLL_TAX', 'Payroll Tax', 'employer_cost', 'tax', false, 111),
  ('COST_FUTA', 'FUTA (Federal Unemployment)', 'employer_cost', 'tax', false, 112)
ON CONFLICT (code) DO NOTHING;

-- Initial country pack versions
INSERT INTO country_pack_versions (country_code, version, effective_from, config, is_active)
SELECT cp.code, '2026', '2026-01-01', '{}'::jsonb, true
FROM country_profiles cp ON CONFLICT (country_code, version) DO NOTHING;

-- Default platform admin (password: admin123 — change immediately)
INSERT INTO platform_users (username, email, password_hash, full_name) VALUES
  ('aegis', 'aegis@quantivra.com', '$2a$10$placeholder_hash_change_me', 'ATLAS CORE') ON CONFLICT DO NOTHING;

-- Platform roles
INSERT INTO platform_roles (name) VALUES ('super_admin'), ('support'), ('viewer') ON CONFLICT DO NOTHING;

-- Super admin gets all permissions
INSERT INTO platform_permissions (role_id, module, feature, action)
SELECT 1, m.module, f.feature, a.action
FROM (VALUES ('platform'), ('company'), ('country'), ('industry'), ('subscription')) AS m(module)
CROSS JOIN (VALUES ('manage'), ('view'), ('create'), ('edit'), ('delete')) AS f(feature)
CROSS JOIN (VALUES ('view'), ('create'), ('edit'), ('delete'), ('export')) AS a(action) ON CONFLICT DO NOTHING;

-- Add business_type column to companies if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'business_type') THEN
    ALTER TABLE companies ADD COLUMN business_type TEXT NOT NULL DEFAULT 'General';
  END IF;
END $$;

-- Grant API access (disable RLS for development)
ALTER TABLE country_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_pack_versions DISABLE ROW LEVEL SECURITY;
ALTER TABLE business_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE business_pack_modules DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform_roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform_permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE company_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE company_roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE company_permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE company_user_roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_employment_types DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_employee_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_payroll_components DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_statutory_schemes DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_statutory_rates DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_tax_brackets DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_statutory_leave DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_public_holidays DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_government_forms DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_tax_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_document_numbering DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_workflow_templates DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_dashboard_widgets DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_compliance_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE salary_components DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_regions DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_scheme_versions DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_scheme_employee_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_scheme_age_bands DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_scheme_rates DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_scheme_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_scheme_salary_components DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_scheme_formulas DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_scheme_rounding DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_scheme_government_forms DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_scheme_submission_formats DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_scheme_validations DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_scheme_compliance DISABLE ROW LEVEL SECURITY;
ALTER TABLE immigration_statuses DISABLE ROW LEVEL SECURITY;
ALTER TABLE employment_statuses DISABLE ROW LEVEL SECURITY;
ALTER TABLE employment_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE notice_periods DISABLE ROW LEVEL SECURITY;
ALTER TABLE company_default_settings DISABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
