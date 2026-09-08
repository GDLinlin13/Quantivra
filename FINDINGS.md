# Quantivra — country packs status

_2026-09-08_

## Fixed today
- **RLS blocker** — ran `scripts/fix-rls.sql`. All 39 reference tables now readable by the app. Country Packs page loads: 16 countries, version 2026, General tab populates.
- **`.env` BOM** — cleaned (was breaking `VITE_SUPABASE_URL`).

## The bad news about "check all packs are current"

The country-pack data is **half-built and split across three disconnected models**, so there isn't one dataset to check yet:

| Layer | State |
|---|---|
| `country_pack_versions.config` (JSONB) — **what the Country Packs page actually reads** | all 16 are empty `{}` |
| `country_statutory_schemes` / `country_tax_brackets` / `country_payroll_components` / `country_statutory_leave` (linked by `version_id`) | has data, but **rows are duplicated** (CPF seeded twice, etc.) and `version_id` points at old pack rows the page doesn't use |
| `country_scheme_*` engine (schemes → scheme_versions → rates/caps/formulas/thresholds) | has SG data, well-structured, but **nothing in the app reads it** and it's also duplicated |
| Hardcoded `COUNTRY_PACKS` in `src/data/countries.ts` (135 KB) | real data for **7 countries** (SG, MY, HK, AE, AU, NZ, GB); the other 14 (US, CA, DE, FR, NL, CH, JP, KR, IN, CN, ID, TH, PH, VN) are **general-info stubs only** |

So the honest answer: **~7 countries have real statutory content, ~10 have none, and the app displays none of it** because the page reads the empty layer.

Even the SG data that exists is partly stale — e.g. CPF Ordinary Wage ceiling is seeded as **S$6,800**; for 2026 it's **S$8,000** (was raised on a published schedule: $6,800 → $7,400 Jan 2025 → $8,000 Jan 2026).

## What "updating all packs to current law" actually involves

1. **Pick one source of truth** (recommend the `country_scheme_*` engine model — it's the most complete and versioned) and delete the other two, or collapse everything into `country_pack_versions.config`.
2. **Wire the Country Packs page + payroll engine** to read that model.
3. **De-duplicate** the existing rows.
4. **Research & enter current statutory data** for each country: social-security/pension contribution rates + wage ceilings, income-tax brackets, statutory leave minimums, min wage, overtime multipliers — from official government sources, with citations. This is the bulk of the work and needs to go country-by-country.

## Proposed order

1. Consolidate the data model + fix the page wiring (engineering, ~1 session).
2. Get **Singapore** fully correct and current as the reference implementation, end to end.
3. Then work through the rest, prioritised by which countries you actually operate in.

**Which countries do you need first?** And do you want me to start with step 1 (the consolidation), or do you want to decide the data-model direction yourself first?
