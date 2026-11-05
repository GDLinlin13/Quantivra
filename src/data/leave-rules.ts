/**
 * Layer 2 of the leave model: given an employee's facts, work out their actual
 * entitlement for a leave type. Country packs are the template (statutory
 * default + minimum); this turns that into a per-employee number.
 *
 * Returns days in the same unit the company's leave type uses (working days).
 * Where a statutory figure is quoted in weeks it is converted at 5 working
 * days/week.
 */

export interface LeaveRuleEmployee {
  residency_status?: string | null;   // SC | PR | FOREIGNER | citizen codes per country
  marital_status?: string | null;     // single | married | divorced | widowed
  gender?: string | null;             // female | male
  join_date?: string | null;
  employment_type?: string | null;
}

export interface Dependent {
  relationship: string;               // child | expected_child | spouse | parent
  /** for expected_child this is the expected delivery date */
  date_of_birth?: string | null;
  citizenship?: string | null;        // SC | PR | FOREIGNER
}

export interface LeaveRuleInput {
  leaveTypeName: string;
  countryCode: string;
  employee: LeaveRuleEmployee;
  dependents: Dependent[];
  /** company template values for this leave type */
  templateDefault: number;
  statutoryMin: number;
  /** company policy: extra days per completed year of service, capped at maxDays */
  incrementPerYear?: number;
  maxDays?: number | null;
  asOf?: Date;
}

export interface LeaveEntitlement {
  days: number;
  statutoryMin: number;
  basis: string;
  warnings: string[];
  /** true when a country rule engine produced this, false = plain template fallback */
  computed: boolean;
}

/** A country rule's result; policyApplies = the company's own policy may be more generous. */
type RuleResult = LeaveEntitlement & { policyApplies?: boolean };

/** Company policy: base + increment per completed year, capped. */
export function companyPolicyDays(base: number, incrementPerYear: number, maxDays: number | null | undefined, years: number) {
  const raw = base + Math.max(0, incrementPerYear) * Math.max(0, years);
  return maxDays != null && maxDays >= 0 ? Math.min(raw, Math.max(maxDays, base)) : raw;
}

function describePolicy(base: number, inc: number, max: number | null | undefined, years: number, days: number) {
  if (!inc) return `Company policy: ${base} days`;
  return `Company policy: ${base} + ${inc} × ${years} year(s) of service = ${base + inc * years}`
    + (max != null && days < base + inc * years ? `, capped at ${max}` : '') + ` → ${days} days`;
}

const WK = 5; // working days per week

function completedYears(joinDate?: string | null, asOf = new Date()): number {
  if (!joinDate) return 0;
  const j = new Date(joinDate + 'T00:00:00');
  let y = asOf.getFullYear() - j.getFullYear();
  const m = asOf.getMonth() - j.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < j.getDate())) y--;
  return Math.max(0, y);
}

function ageYears(dob?: string | null, asOf = new Date()): number | null {
  if (!dob) return null;
  return completedYears(dob, asOf);
}

const isCitizen = (code?: string | null) => code === 'SC' || code === 'CITIZEN';
const isPR = (code?: string | null) => code === 'PR';

// ---------------------------------------------------------------------------
// Singapore — Ministry of Manpower
// ---------------------------------------------------------------------------
function singapore(i: LeaveRuleInput): RuleResult | null {
  const asOf = i.asOf ?? new Date();
  const name = i.leaveTypeName.toLowerCase();
  const res = i.employee.residency_status;
  const kids = i.dependents.filter(d => d.relationship === 'child');
  // A birth that parental leave can be taken for: an expected baby (due date
  // recorded) or a child born in the last 12 months.
  const yearAgo = new Date(asOf); yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const births = i.dependents.filter(d =>
    d.relationship === 'expected_child'
    || (d.relationship === 'child' && !!d.date_of_birth && new Date(d.date_of_birth + 'T00:00:00') >= yearAgo));
  const birth = births.sort((a, b) => String(b.date_of_birth || '').localeCompare(String(a.date_of_birth || '')))[0] ?? null;
  const married = i.employee.marital_status === 'married';
  const svc = completedYears(i.employee.join_date, asOf);
  const monthsService = i.employee.join_date
    ? (asOf.getTime() - new Date(i.employee.join_date).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    : 0;

  if (name.includes('annual')) {
    // 7 days in year 1, +1 for each further completed year, capped at 14
    const days = Math.min(7 + svc, 14);
    return {
      days, statutoryMin: days, computed: true, policyApplies: true,
      basis: `${svc} completed year(s) of service → 7 + ${svc}, capped at 14`,
      warnings: [],
    };
  }

  if (name.includes('maternity')) {
    if (i.employee.gender !== 'female') {
      return { days: 0, statutoryMin: 0, computed: true, warnings: [],
        basis: i.employee.gender === 'male' ? 'Maternity leave is for mothers (see Paternity Leave)' : "Set the employee's gender in HR → Employees" };
    }
    if (!birth) {
      return { days: 0, statutoryMin: 0, computed: true, warnings: [],
        basis: 'Add the expected delivery date (or the baby\'s birth date) under HR → Employees → Dependents' };
    }
    const warnings: string[] = [];
    if (monthsService < 3) warnings.push('Must have served at least 90 days before the birth to qualify for paid maternity leave.');
    if (isCitizen(res)) {
      return { days: 16 * WK, statutoryMin: 16 * WK, computed: true,
        basis: 'Singapore citizen — 16 weeks Government-Paid Maternity Leave', warnings };
    }
    if (isPR(res)) {
      warnings.push('PR: for the 1st and 2nd child only 8 of the 16 weeks are Government-paid; the rest is employer-paid.');
      return { days: 16 * WK, statutoryMin: 8 * WK, computed: true,
        basis: 'Singapore PR — 16 weeks maternity leave (funding split by child order)', warnings };
    }
    warnings.push('Foreign employee: no Government-Paid Maternity Leave. Entitlement is whatever the employment contract provides.');
    return { days: 0, statutoryMin: 0, computed: true, basis: 'Foreign employee — contractual only', warnings };
  }

  if (name.includes('childcare')) {
    if (kids.length === 0) {
      return { days: 0, statutoryMin: 0, computed: true, basis: 'No child registered', warnings: [] };
    }
    const anyCitizenChildUnder7 = kids.some(k => (isCitizen(k.citizenship)) && (ageYears(k.date_of_birth, asOf) ?? 99) < 7);
    const anyCitizenChild7to12 = kids.some(k => isCitizen(k.citizenship) && (() => { const a = ageYears(k.date_of_birth, asOf); return a !== null && a >= 7 && a < 13; })());
    if (anyCitizenChildUnder7) {
      return { days: 6, statutoryMin: 6, computed: true, basis: 'Singapore-citizen child under 7 → 6 days/year', warnings: [] };
    }
    if (anyCitizenChild7to12) {
      return { days: 2, statutoryMin: 2, computed: true, basis: 'Singapore-citizen child aged 7–12 → 2 days/year (Extended Childcare Leave)', warnings: [] };
    }
    return { days: 2, statutoryMin: 2, computed: true, basis: 'Non-citizen child → 2 days/year', warnings: [] };
  }

  if (name.includes('shared parental')) {
    // Government-Paid Shared Parental Leave, by the youngest Singapore-citizen
    // child's birth date: 10 weeks from 1 Apr 2026, 6 weeks from 1 Apr 2025.
    const born = births
      .filter(k => isCitizen(k.citizenship ?? 'SC') && k.date_of_birth)
      .map(k => k.date_of_birth as string)
      .sort()
      .pop();
    const weeks = !born ? 0 : born >= '2026-04-01' ? 10 : born >= '2025-04-01' ? 6 : 0;
    return {
      days: weeks * WK, statutoryMin: weeks * WK, computed: true,
      basis: weeks
        ? `Singapore-citizen child born ${born} → ${weeks} weeks Shared Parental Leave, shared between both parents`
        : 'Needs an expected or newborn Singapore-citizen child (due or born on/after 1 April 2025) under HR → Employees → Dependents',
      warnings: weeks ? ['This is the total for both parents; deduct whatever the other parent takes.'] : [],
    };
  }

  if (name.includes('paternity')) {
    if (i.employee.gender !== 'male') {
      return { days: 0, statutoryMin: 0, computed: true, warnings: [],
        basis: i.employee.gender === 'female' ? 'Paternity leave is for fathers (see Maternity Leave)' : "Set the employee's gender in HR → Employees" };
    }
    if (!birth) {
      return { days: 0, statutoryMin: 0, computed: true, warnings: [],
        basis: 'Add the expected delivery date (or the baby\'s birth date) under HR → Employees → Dependents' };
    }
    if (isCitizen(birth.citizenship ?? 'SC') && married) {
      return { days: 4 * WK, statutoryMin: 4 * WK, computed: true,
        basis: 'Singapore citizen, married — 4 weeks Government-Paid Paternity Leave', warnings: [] };
    }
    return { days: 0, statutoryMin: 0, computed: true,
      basis: 'Paternity leave requires a Singapore-citizen child and lawful marriage', warnings: [] };
  }

  if (name.includes('sick') || name.includes('hospital') || name.includes('outpatient')) {
    const eligible = monthsService >= 6;
    return {
      days: name.includes('hospital') ? 60 : 14,
      statutoryMin: name.includes('hospital') ? 60 : 14,
      computed: true, policyApplies: true,
      basis: name.includes('hospital') ? '60 days hospitalisation leave (after 6 months service)' : '14 days outpatient sick leave (after 6 months service)',
      warnings: eligible ? [] : ['Full paid sick leave applies only after 6 months of service (pro-rated between 3 and 6 months).'],
    };
  }

  return null; // fall through to template
}

const COUNTRY_RULES: Record<string, (i: LeaveRuleInput) => RuleResult | null> = {
  SG: singapore,
};

export function computeLeaveEntitlement(i: LeaveRuleInput): LeaveEntitlement {
  const years = completedYears(i.employee.join_date, i.asOf ?? new Date());
  const inc = Number(i.incrementPerYear || 0);
  const policy = companyPolicyDays(Number(i.templateDefault || 0), inc, i.maxDays, years);

  const rule = COUNTRY_RULES[i.countryCode?.toUpperCase()];
  const computed = rule?.(i);
  if (computed) {
    const { policyApplies, ...result } = computed;
    // Statutory rules set the floor. For service-based leave (annual, sick) a
    // more generous company policy wins; eligibility-based leave (maternity,
    // childcare…) follows the law, and HR can still override per employee.
    if (policyApplies && policy > result.days) {
      return { ...result, days: policy,
        basis: `${describePolicy(Number(i.templateDefault || 0), inc, i.maxDays, years, policy)} (law requires ${result.statutoryMin})` };
    }
    return result;
  }
  return {
    days: Math.max(policy, Number(i.statutoryMin || 0)),
    statutoryMin: i.statutoryMin,
    basis: describePolicy(Number(i.templateDefault || 0), inc, i.maxDays, years, policy),
    warnings: [],
    computed: false,
  };
}
