# Country packs — plan to get all 16 current

_2026-09-08_

## Decision
`COUNTRY_PACKS` in `src/data/countries.ts` is the single source of truth. The admin
page reads it (via `localFallback`); the payroll-engine JSON packs get regenerated
from it later. The normalized `country_*` / `country_scheme_*` DB tables and the
16 empty `country_pack_versions` rows are dead weight for now.

## Step 0 — make the page work (needs you to run 1 SQL file)
`node scripts/run-sql.mjs scripts/clear-empty-pack-versions.sql`
Deletes the 16 empty rows so the page falls back to `COUNTRY_PACKS`. Immediately
lights up the 7 populated countries (SG, MY, HK, AE, AU, NZ, GB).

## The 16 countries and where they stand

| Code | Country | In COUNTRY_PACKS | Status |
|---|---|---|---|
| SG | Singapore | full | ~90% current — fixes below |
| MY | Malaysia | full | needs audit |
| HK | Hong Kong | full | needs audit |
| AU | Australia | full | needs audit |
| GB | United Kingdom | full | needs audit |
| ID | Indonesia | stub | build |
| TH | Thailand | stub | build |
| PH | Philippines | stub | build |
| VN | Vietnam | stub | build |
| TW | Taiwan | stub | build |
| JP | Japan | stub | build |
| KR | South Korea | stub | build |
| CN | China | stub | build |
| US | United States | stub | build (federal only; state taxes flagged) |
| DE | Germany | stub | build |
| FR | France | stub | build |

_(AE / NZ are in COUNTRY_PACKS too but not in the 16-country `country_profiles` list — leave for later.)_

## Per-country data to get right (2026 / current law)
- Income tax brackets (resident) + non-resident rate
- Social security / pension schemes: rates (employee + employer), wage floor/ceiling,
  age bands where they apply (SG CPF, JP, KR)
- Statutory leave minimums (annual, sick, maternity, paternity)
- Minimum wage, standard weekly hours, overtime multiplier, notice periods, retirement age
- Sales tax / VAT / GST rate
- Public holidays (already seeded in `country_public_holidays` for most)

## Known SG corrections (do first, as the template)
1. Top tax brackets — YA2024+ added `320k–500k @ 22%`, `500k–1M @ 23%`, `>1M @ 24%`.
   Current pack stops at `320k+ @ 24%`.
2. Senior CPF age-band rates — the 55–65 bands stepped up again on 1 Jan 2026; verify
   against CPF Board's 2026 contribution rate table.
3. CPF `notes` says "S$6,800/month" but `max_earnings_ceiling` is correctly 8000 —
   fix the note.

## Execution
Batches of ~4 countries. For each: research → edit `COUNTRY_PACKS` → typecheck →
spot-check a payroll calc in the engine tests → screenshot the admin page tab.
Every statutory number gets a source comment. **Not payroll-certified** — needs a
local payroll professional's review per country before production use.
