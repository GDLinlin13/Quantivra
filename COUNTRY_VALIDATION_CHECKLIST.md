# Country Validation Checklist

Every new country pack must pass all items below. If any item cannot be represented by the current schema, stop and improve the schema before adding that country.

## Statutory Schemes

- [ ] Multiples statutory schemes (e.g. CPF + SDL + SHG, EPF + SOCSO + EIS)
- [ ] Employer contribution
- [ ] Employee contribution
- [ ] Minimum contribution (floor)
- [ ] Maximum contribution (cap / ceiling)
- - Fixed amount ceiling
- - Formula-based ceiling (e.g. AW ceiling = OW ceiling × 12 − YTD OW)
- - Annual ceiling
- - Monthly ceiling
- - Per-pay-period ceiling
- [ ] Wage bands (income brackets with different rates)
- [ ] Thresholds (earnings above/below which rates change)
- [ ] Age bands (different rates for different ages)
- [ ] Age-based rate transitions (e.g. birthday during month)
- [ ] PR / residency transition stages (e.g. PR Year 1, 2, 3+)
- [ ] Employee category dependency (e.g. citizen vs PR, EP vs S Pass)
- [ ] Employer election (employer may opt to pay full contribution)
- [ ] Effective date ranges (rate changes over time)
- [ ] Historical rate versions

## Tax

- [ ] Progressive / marginal tax brackets
- [ ] Non-resident rate (flat or bracket-based)
- [ ] Tax-free threshold (tax-free allowance)
- [ ] Rebates / tax credits
- [ ] Levy (e.g. Medicare levy)
- [ ] Effective dates for rate changes
- [ ] Regional / provincial / state tax variations
- [ ] Payroll tax (employer-paid, state/provincial level)

## Salary Components

- [ ] OW (Ordinary Wages) classification for statutory
- [ ] AW (Additional Wages) classification for statutory
- [ ] Excluded earnings (not subject to statutory)
- [ ] Overtime classification
- [ ] Bonus / AWS classification
- [ ] Commission classification
- [ ] Allowances classification
- [ ] Termination / severance classification
- [ ] Director fees classification
- [ ] Salary in kind / fringe benefits
- [ ] Stock / equity classification

## Payroll Rules

- [ ] Minimum wage
- [ ] Overtime rules (multiplier, cap, threshold)
- [ ] Pay frequency constraints
- [ ] Pay date rules (e.g. within 7 days of period end)
- [ ] Proration method for mid-period changes
- [ ] Rounding rules (statutory specific)
- [ ] Currency (single or multi-currency)

## Leave

- [ ] Statutory annual leave (days per year)
- [ ] Statutory sick leave
- [ ] Statutory maternity leave
- [ ] Statutory paternity leave
- [ ] Public holidays (fixed date)
- [ ] Public holidays (floating / calculation rule)
- [ ] Public holidays (observed / substituted rule)
- [ ] Regional holiday variations
- [ ] Leave carryover limits

## Termination

- [ ] Notice period (by length of service)
- [ ] Retrenchment / redundancy pay (by length of service)
- [ ] Payment in lieu of notice
- [ ] Unpaid leave recovery

## Government Reporting

- [ ] Monthly / periodic filings
- [ ] Annual tax form / return
- [ ] New hire reporting
- [ ] Termination reporting
- [ ] Year-end certificate (e.g. IR8A, EA Form, W-2)
- [ ] Electronic submission format

## Document Numbering

- [ ] Tax ID format (e.g. NRIC, FIN, MyKad, SSN)
- [ ] Payroll reference numbering
- [ ] Leave reference numbering
- [ ] Government form reference numbering

## Test Scenarios

- [ ] Resident employee under ceiling
- [ ] Resident employee at ceiling
- [ ] Resident employee above ceiling
- [ ] Non-resident employee
- [ ] Age transition during pay period
- [ ] PR / residency transition during pay period
- [ ] Mid-period joiner
- [ ] Mid-period leaver / resignation
- [ ] Unpaid leave / zero salary period
- [ ] Multiple bonuses in a month
- [ ] Bonus exceeding AW ceiling (YTD cap scenario)
- [ ] Overtime only (no basic salary)
- [ ] Commission only
- [ ] Salary adjustment mid-period
- [ ] Retroactive adjustment / backpay
- [ ] Negative adjustment / salary correction
- [ ] Leap year (Feb 29)
- [ ] December payroll (tax year-end)
- [ ] January payroll (new tax year / new rates)
- [ ] Garnishment / legal deduction
- [ ] Multiple statutory schemes combined
- [ ] Historical rate (previous period)
- [ ] Regional variation within country
- [ ] Rounding edge cases (0.5 cents, etc.)
