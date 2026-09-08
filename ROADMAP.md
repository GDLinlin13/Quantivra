# Quantivra — scope of what you're describing

_2026-09-08_

Your goal: **companies sign up → employees are managed → payslips + statutory
filings + financial statements generate automatically per that country's tax law →
deleting a company wipes all its data → passwords & IDs encrypted at rest.**

Here's where the July rebuild actually stands against that.

## Built ✅
- Platform admin: company provisioning wizard, country packs page, business packs, platform users/roles, audit log
- **Payroll / income-tax / statutory calculation engine** (`src/engine/`) — 91 passing tests. Handles CPF-style age-banded schemes, tax brackets, proration, rounding, journal generation. **But nothing calls it** — it's a standalone library.
- Company auth, users, roles, settings, profile pages

## Not built ❌ (this is most of your product)
| Area | State |
|---|---|
| Employee management (records, contracts, pay details) | none — provisioning writes a few names into a `company_settings` JSON blob |
| Leave / claims / attendance | 10-line stub pages |
| Payroll runs (create run → engine → results → payslip PDF) | none |
| Payslip generation | none |
| General ledger / journals / chart of accounts (company side) | none in this codebase |
| Invoicing / AP / AR | 10-line stub |
| Financial statements (P&L, balance sheet, cash flow) | none |
| Statutory filing exports (IR8A, CPF file, EPF, etc.) | none |
| Engine ↔ real employee data wiring | none |

## Security gaps ⚠️ (your explicit asks)
1. **Passwords are plaintext.** `company_users.password_hash` stores the raw
   password (`provisioning.ts:172`); platform login is hardcoded `=== '123456'`
   (`auth.ts:32`). Needs real hashing — best path is adopting **Supabase Auth**
   (bcrypt + sessions + RLS), interim is a `pgcrypto crypt()` RPC.
2. **PII is plaintext** — NRIC/FIN, tax IDs, bank account numbers. Needs
   column encryption (`pgcrypto` + key in Supabase Vault) with decryption only
   through checked server-side RPCs.
3. **No hard-delete company.** Only "Deactivate" exists. Cascade FKs are in place
   for the *current* tables, but a real "delete company + all data + storage files"
   flow needs building (and every new HR/finance table must carry
   `ON DELETE CASCADE` + a storage-bucket sweep).

## Suggested build order
1. **Security foundation** — Supabase Auth migration + PII encryption + hard-delete-company flow. Do this first; retrofitting later is worse.
2. **Employee module** — real `employees` table, contract & pay setup, cascade-wired.
3. **Payroll run** — wire the engine: run → per-employee calc → results table → payslip PDF.
4. **GL + financial statements** — chart of accounts, journal posting from payroll & invoices, P&L / balance sheet.
5. **Statutory exports** — per-country filing files, driven by the country packs.
6. **Country packs to current law** — parallel track, feeds 3 & 5.

Each is roughly 1–3 focused sessions. This is a multi-week build, not a one-shot.

## Question
Where do you want to start — the security foundation (#1), or do you want a
working payslip end-to-end first (#2→#3) and security hardening right after?
