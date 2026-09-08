# Country Pack Specification

## Overview

A **Country Pack** is a versioned set of structured JSON files that define every statutory, regulatory, and operational rule for a country. Country packs are the single source of truth for the platform — they are imported into Supabase via the seeder and consumed by the application at runtime.

## Directory Layout

```
src/data/country-packs/
├── shared/                          # Cross-country reference data
│   ├── salary-components.json       # 48 global salary components
│   └── ...
├── {CC}/                            # One folder per country (ISO 3166-1 alpha-2)
│   ├── index.ts                     # Assembles all JSON → CountryPackDef
│   ├── general.json
│   ├── employment.json
│   ├── payroll.json
│   ├── tax.json
│   ├── accounting.json
│   ├── public-holidays.json
│   ├── government-forms.json
│   ├── compliance.json
│   ├── document-numbering.json
│   ├── workflow-templates.json
│   ├── dashboard-widgets.json
│   └── statutory/
│       ├── {scheme_code}.json       # One file per statutory scheme (cpf.json, epf.json, etc.)
│       └── ...
├── schema.ts                        # TypeScript interfaces for every file
```

## File Specifications

### 1. `general.json`

Country-level metadata.

```json
{
  "name": "Singapore",
  "code": "SG",
  "currency": "SGD",
  "currencySymbol": "S$",
  "phoneCode": "+65",
  "timezone": "Asia/Singapore",
  "primaryLanguage": "English",
  "secondaryLanguage": "Chinese (Mandarin)",
  "dateFormat": "DD/MM/YYYY",
  "timeFormat": "24h",
  "weekStartsOn": "Monday",
  "financialYear": "01-01",
  "taxYear": "01-01",
  "defaultPayrollFrequency": "Monthly"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Country display name |
| `code` | string | yes | ISO 3166-1 alpha-2 code |
| `currency` | string | yes | ISO 4217 currency code |
| `currencySymbol` | string | yes | Local currency symbol |
| `phoneCode` | string | yes | International dialling code |
| `timezone` | string | yes | IANA timezone identifier |
| `primaryLanguage` | string | yes | Primary official language |
| `secondaryLanguage` | string | no | Secondary language |
| `dateFormat` | string | yes | Locale date format (DD/MM/YYYY) |
| `timeFormat` | string | yes | 24h or 12h |
| `weekStartsOn` | string | yes | Day the work week starts |
| `financialYear` | string | yes | MM-DD financial year start |
| `taxYear` | string | yes | MM-DD tax year start |
| `defaultPayrollFrequency` | string | yes | Monthly, Weekly, Fortnightly |

### 2. `employment.json`

Employment rules, statuses, immigration statuses, and notice periods.

```json
{
  "statuses": [
    { "code": "PERMANENT", "name": "Permanent", "enabled": true }
  ],
  "immigrationStatuses": [
    { "code": "SC", "name": "Singapore Citizen" }
  ],
  "rules": [
    {
      "key": "standard_weekly_hours",
      "value": "44",
      "editableByCompany": true,
      "referenceOnly": false,
      "description": "Maximum standard working hours per week"
    }
  ],
  "noticePeriods": [
    {
      "minServiceMonths": 0,
      "maxServiceMonths": 6,
      "noticeDays": 1,
      "description": "Less than 26 weeks of service"
    }
  ]
}
```

#### `statuses[]`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | yes | Unique code (e.g. FULL_TIME) |
| `name` | string | yes | Display name |
| `enabled` | boolean | yes | Active or deprecated |

#### `immigrationStatuses[]`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | yes | Unique code (e.g. SC, PR, EP) |
| `name` | string | yes | Display name |

#### `rules[]`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | yes | Rule identifier |
| `value` | string | yes | Rule value |
| `editableByCompany` | boolean | yes | Can company override? |
| `referenceOnly` | boolean | yes | Reference only, not enforced validation |
| `description` | string | yes | Human-readable description |

Standard rule keys:
- `standard_weekly_hours` — Maximum hours before overtime
- `minimum_rest_day` — Statutory rest day minimum
- `default_probation_months` — Recommended probation period
- `retirement_age` — Statutory retirement age (reference only)
- `re_employment_age` — Re-employment age (reference only)
- `overtime_multiplier` — Statutory overtime minimum rate
- `public_holiday_entitlement` — Public holiday rules

#### `noticePeriods[]`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `minServiceMonths` | integer | yes | From (inclusive) |
| `maxServiceMonths` | integer, null | yes | To (exclusive), null = indefinite |
| `noticeDays` | integer | yes | Statutory notice days |
| `description` | string | yes | Human-readable |

### 3. `payroll.json`

Payroll operational settings.

```json
{
  "frequencies": ["Monthly", "Weekly", "Fortnightly"],
  "minimumWage": 0,
  "payrollCutoff": "Last day of month",
  "payrollLockDate": "5th of next month",
  "thirteenthMonth": "Not mandatory",
  "bankFileFormat": "GIRO CSV"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `frequencies` | string[] | yes | Allowed payroll frequencies |
| `minimumWage` | number | yes | Statutory minimum wage (0 = none) |
| `payrollCutoff` | string | yes | Cutoff rule description |
| `payrollLockDate` | string | yes | Payroll lock description |
| `thirteenthMonth` | string | yes | 13th month/AWS rule |
| `bankFileFormat` | string | yes | Default bank file format |

### 4. `tax.json`

Income tax brackets (metadata only — calculation engine is separate).

```json
{
  "brackets": [
    { "min": 0, "max": 20000, "rate": 0, "fixed": 0 }
  ],
  "residentRules": "183 days/year",
  "nonResidentRate": 24,
  "filingFrequency": "Annual (IR8A)",
  "formTypes": ["IR8A", "IR8S"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `brackets[].min` | number | yes | Bracket floor |
| `brackets[].max` | number, null | yes | Bracket ceiling (null = unlimited) |
| `brackets[].rate` | number | yes | Marginal rate % |
| `brackets[].fixed` | number | yes | Fixed tax on preceding brackets |
| `residentRules` | string | yes | Residency determination rule |
| `nonResidentRate` | number | no | Flat rate for non-residents |
| `filingFrequency` | string | yes | Filing cycle description |
| `formTypes` | string[] | yes | Required tax forms |

### 5. `accounting.json`

Fiscal and tax code settings.

```json
{
  "fiscalYearStart": "01-01",
  "defaultTaxCode": "SR",
  "invoiceNumberFormat": "INV-{YYYY}-{0000}",
  "paymentTerms": "Net 30",
  "taxCodes": [
    { "code": "SR", "name": "Standard Rated", "rate": 9, "isDefault": true }
  ],
  "supportedBanks": ["DBS", "OCBC", "UOB"],
  "paymentMethods": ["GIRO", "Bank Transfer", "FAST"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `fiscalYearStart` | string | yes | MM-DD |
| `defaultTaxCode` | string | yes | Default sales tax/VAT code |
| `invoiceNumberFormat` | string | yes | Invoice numbering pattern |
| `paymentTerms` | string | yes | Default payment terms |
| `taxCodes[].code` | string | yes | Tax code identifier |
| `taxCodes[].name` | string | yes | Display name |
| `taxCodes[].rate` | number | yes | Tax rate % |
| `taxCodes[].isDefault` | boolean | yes | Default for transactions |
| `supportedBanks` | string[] | no | Common local banks |
| `paymentMethods` | string[] | no | Local payment methods |

### 6. `public-holidays.json`

```json
[
  { "name": "New Year's Day", "date": "2026-01-01", "recurring": true },
  { "name": "Chinese New Year", "recurring": true }
]
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Holiday name |
| `date` | string | no | Specific date (recurring can omit if date varies) |
| `recurring` | boolean | yes | Repeats annually |

### 7. `government-forms.json`

```json
[
  { "name": "IR8A", "agency": "IRAS", "frequency": "Annual", "deadline": "1 Mar" }
]
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Form name |
| `agency` | string | yes | Government agency |
| `frequency` | string | yes | Submission frequency |
| `deadline` | string | yes | Deadline description |

---

## Statutory Scheme Specification

Every statutory scheme file follows this exact structure.

### File naming

`statutory/{scheme_code}.json` — e.g. `cpf.json`, `epf.json`, `sdl.json`

### Schema

```json
{
  "general": { ... },
  "eligibility": { ... },
  "employeeCategories": [ ... ],
  "rateTables": [ ... ],
  "thresholds": [ ... ],
  "caps": [ ... ],
  "salaryComponents": [ ... ],
  "calculationRules": [ ... ],
  "rounding": { ... },
  "reporting": { ... },
  "validations": [ ... ]
}
```

#### `general`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | yes | Scheme code (e.g. CPF) |
| `name` | string | yes | Full scheme name |
| `description` | string | yes | Scheme description |
| `agency` | string | yes | Governing body |
| `type` | string | yes | `provident_fund`, `pension`, `social_security`, `training`, `development`, `tax`, `health`, `insurance` |
| `version` | string | yes | Semantic version (e.g. 2026.1) |
| `effectiveDate` | string | yes | ISO date |
| `expiryDate` | string | no | ISO date |
| `status` | string | yes | `draft`, `published`, `superseded` |

#### `eligibility`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `citizenship` | string[] | no | Applicable immigration status codes |
| `visaTypes` | string[] | no | Applicable visa codes |
| `employmentTypes` | string[] | no | Applicable employment status codes |
| `minimumAge` | number | no | Age threshold |
| `maximumAge` | number | no | Age ceiling |
| `minimumServiceMonths` | number | no | Service length requirement |
| `minimumSalary` | number | no | Earnings floor |
| `maximumSalary` | number | no | Earnings ceiling |
| `excludedCategories` | string[] | no | Explicitly excluded |
| `notes` | string | no | Free-text notes |

#### `employeeCategories`

Each entry maps an immigration status + optional PR stage to a contribution treatment.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | yes | Category code |
| `name` | string | yes | Display name |
| `immigrationStatusCode` | string | no | Reference to `employment.immigrationStatuses[].code` |
| `prStage` | string | no | `year_1`, `year_2`, `year_3_plus` |

#### `rateTables`

Each row defines a rate for a specific employee category, age band, and/or wage range.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `employeeCategory` | string | no | References `employeeCategories[].code` |
| `ageFrom` | number | no | Age band start |
| `ageTo` | number, null | no | Age band end (null = no upper limit) |
| `employeeRate` | number | yes | Employee contribution % |
| `employerRate` | number | yes | Employer contribution % |
| `wageMin` | number | no | Wage band floor |
| `wageMax` | number, null | no | Wage band ceiling |
| `effectiveDate` | string | yes | ISO date |
| `expiryDate` | string | no | ISO date |

#### `thresholds[]`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | yes | Unique code |
| `name` | string | yes | Display name |
| `type` | string | yes | `minimum_earnings`, `lower`, `upper`, `qualifying_earnings`, `relevant_income` |
| `value` | number | yes | Amount |
| `currency` | string | yes | ISO 4217 code |
| `frequency` | string | no | `monthly`, `annual`, `weekly`, `fortnightly` |

#### `caps[]`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | yes | Unique code |
| `name` | string | yes | Display name |
| `type` | string | yes | `monthly_ceiling`, `annual_ceiling`, `contribution_ceiling`, `insurable_wage`, `maximum_pensionable_earnings` |
| `value` | number | no | Fixed amount |
| `formula` | string | no | Expression (if calculated) |
| `currency` | string | yes | ISO 4217 code |

#### `salaryComponents[]`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `componentCode` | string | yes | References `shared/salary-components.json[].code` |
| `classification` | string | yes | `ordinary_wage`, `additional_wage`, `excluded` |
| `included` | boolean | yes | Whether component is subject to this scheme |
| `notes` | string | no | Free-text |

#### `calculationRules[]`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | yes | Unique rule code |
| `name` | string | yes | Display name |
| `priority` | number | yes | Execution order |
| `condition` | string | no | Condition expression |
| `action` | string | yes | Calculation action/expression |
| `parameters` | object | no | Key-value parameters |
| `description` | string | yes | Documentation |

#### `rounding`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `employee.method` | string | yes | `round`, `ceil`, `floor`, `truncate` |
| `employee.decimals` | number | yes | Decimal places |
| `employer.method` | string | yes | As above |
| `employer.decimals` | number | yes | Decimal places |

#### `reporting`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agency` | string | yes | Government agency |
| `submissionFrequency` | string | yes | Monthly, Annual, etc. |
| `portal` | string | no | Portal name |
| `fileFormat` | string | no | Expected file format |
| `dueDate` | string | yes | Submission due |
| `forms[]` | array | yes | Government forms for this scheme |
| `forms[].name` | string | yes | Form name |
| `forms[].frequency` | string | yes | Filing frequency |
| `forms[].deadline` | string | yes | Filing deadline |

#### `validations[]`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | yes | Rule code |
| `name` | string | yes | Display name |
| `type` | string | yes | `range`, `required`, `dependency`, `cross_field` |
| `expression` | string | yes | Validation expression |
| `errorMessage` | string | yes | User-facing error |
| `severity` | string | yes | `error`, `warning`, `info` |

---

## Versioning Strategy

- **Scheme versioning**: Each statutory scheme is versioned independently (e.g. `cpf/2026.1`, `cpf/2026.2`).
- **Country pack versioning**: The country pack version (e.g. `2026`) references a set of scheme versions.
- **Semantic pattern**: `{year}.{increment}` — e.g. `2026.1` for first revision of the year, `2026.2` if rules change mid-year.
- **Effective dates**: Each scheme version has `effectiveDate` and optional `expiryDate`. The calculation engine selects the applicable version based on the payroll period.

## Seeder Behaviour

- **Idempotent**: Re-running the seeder clears child data per version and re-inserts. Safe to run multiple times.
- **Upsert logic**: Uses `country_code + version` and `scheme_id + version` as conflict keys.
- **Order**: Shared data → country profile → pack version → immigration/employment statuses → statutory schemes.
- **Clear + insert**: Child tables (rates, caps, age bands, etc.) are `DELETE` + `INSERT` per version to handle removals cleanly.

## Extending for New Countries

1. Create `{CC}/` directory.
2. Add `general.json`, `employment.json`, `payroll.json`, etc.
3. Create `statutory/{scheme_code}.json` for each statutory scheme.
4. Import the pack in `src/utils/seedFromJson.ts`.
5. Run the seeder.
6. Add payroll test scenarios to `{CC}/tests/payroll-scenarios.json`.

## Schema Validation Rules

- All currency values use the minor unit convention (e.g. `8000` for S$8,000).
- Rate percentages are stored as decimals (e.g. `20` for 20%).
- Age ranges are inclusive of `ageFrom`, exclusive of `ageTo` (or null for open-ended).
- Wage ranges are inclusive of `wageMin`, exclusive of `wageMax` (or null for open-ended).
- Immigration status codes in `eligibility.citizenship` reference `employment.immigrationStatuses[].code`.
- Component codes in `salaryComponents[].componentCode` reference `shared/salary-components.json[].code`.
