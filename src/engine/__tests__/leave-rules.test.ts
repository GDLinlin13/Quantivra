import { describe, it, expect } from 'vitest';
import { computeLeaveEntitlement } from '../../data/leave-rules';

const base = { countryCode: 'SG', templateDefault: 14, statutoryMin: 7, asOf: new Date('2026-06-30') };
const emp = (o: any = {}) => ({ residency_status: 'SC', marital_status: 'married', join_date: '2020-01-01', employment_type: 'full_time', ...o });

describe('SG leave eligibility rules', () => {
  it('annual leave (statutory scale alone) grows with service, capped at 14', () => {
    expect(computeLeaveEntitlement({ ...base, templateDefault: 0, leaveTypeName: 'Annual Leave', employee: emp({ join_date: '2026-01-01' }), dependents: [] }).days).toBe(7);
    expect(computeLeaveEntitlement({ ...base, templateDefault: 0, leaveTypeName: 'Annual Leave', employee: emp({ join_date: '2023-01-01' }), dependents: [] }).days).toBe(10);
    expect(computeLeaveEntitlement({ ...base, templateDefault: 0, leaveTypeName: 'Annual Leave', employee: emp({ join_date: '2000-01-01' }), dependents: [] }).days).toBe(14);
  });

  it('childcare: citizen child under 7 → 6 days, else 2, none → 0', () => {
    const under7 = computeLeaveEntitlement({ ...base, leaveTypeName: 'Childcare Leave', employee: emp(), dependents: [{ relationship: 'child', citizenship: 'SC', date_of_birth: '2022-01-01' }] });
    expect(under7.days).toBe(6);
    const over7 = computeLeaveEntitlement({ ...base, leaveTypeName: 'Childcare Leave', employee: emp(), dependents: [{ relationship: 'child', citizenship: 'SC', date_of_birth: '2016-01-01' }] });
    expect(over7.days).toBe(2);
    const foreignKid = computeLeaveEntitlement({ ...base, leaveTypeName: 'Childcare Leave', employee: emp(), dependents: [{ relationship: 'child', citizenship: 'FOREIGNER', date_of_birth: '2022-01-01' }] });
    expect(foreignKid.days).toBe(2);
    expect(computeLeaveEntitlement({ ...base, leaveTypeName: 'Childcare Leave', employee: emp(), dependents: [] }).days).toBe(0);
  });

  it('maternity: citizen 16 weeks, PR statutory min is 8 weeks, foreigner 0', () => {
    expect(computeLeaveEntitlement({ ...base, leaveTypeName: 'Maternity Leave', employee: emp({ residency_status: 'SC' }), dependents: [] }).days).toBe(80);
    const pr = computeLeaveEntitlement({ ...base, leaveTypeName: 'Maternity Leave', employee: emp({ residency_status: 'PR' }), dependents: [] });
    expect(pr.days).toBe(80);
    expect(pr.statutoryMin).toBe(40);
    const fr = computeLeaveEntitlement({ ...base, leaveTypeName: 'Maternity Leave', employee: emp({ residency_status: 'FOREIGNER' }), dependents: [] });
    expect(fr.days).toBe(0);
    expect(fr.warnings.length).toBeGreaterThan(0);
  });

  it('paternity: citizen + married → 4 weeks, otherwise 0', () => {
    expect(computeLeaveEntitlement({ ...base, leaveTypeName: 'Paternity Leave', employee: emp({ residency_status: 'SC', marital_status: 'married' }), dependents: [] }).days).toBe(20);
    expect(computeLeaveEntitlement({ ...base, leaveTypeName: 'Paternity Leave', employee: emp({ marital_status: 'single' }), dependents: [] }).days).toBe(0);
  });

  it('unknown country falls back to the company template', () => {
    const r = computeLeaveEntitlement({ ...base, countryCode: 'ZZ', leaveTypeName: 'Annual Leave', employee: emp(), dependents: [] });
    expect(r.days).toBe(14);
    expect(r.computed).toBe(false);
  });

  it('shared parental: 10 weeks for citizen children born from Apr 2026, 6 weeks from Apr 2025, else 0', () => {
    const spl = (dob: string, citizenship = 'SC') => computeLeaveEntitlement({
      ...base, leaveTypeName: 'Shared Parental Leave', employee: emp(),
      dependents: [{ relationship: 'child', citizenship, date_of_birth: dob }],
    }).days;
    expect(spl('2026-05-01')).toBe(50);
    expect(spl('2025-06-01')).toBe(30);
    expect(spl('2024-06-01')).toBe(0);
    expect(spl('2026-05-01', 'FOREIGNER')).toBe(0);
  });

  it('built-in SG pack lists maternity, paternity and shared parental leave in days, not weeks', async () => {
    const { COUNTRY_PACKS } = await import('../../data/countries');
    const days = Object.fromEntries((COUNTRY_PACKS.SG.leave?.types || []).map((t: any) => [t.name, t.min_days]));
    expect(days['Maternity Leave']).toBe(80);
    expect(days['Paternity Leave']).toBe(20);
    expect(days['Shared Parental Leave']).toBe(50);
  });

  it('company policy: grows with service, capped, never below the law', () => {
    const al = (join: string, extra: any = {}) => computeLeaveEntitlement({
      ...base, templateDefault: 14, leaveTypeName: 'Annual Leave', employee: emp({ join_date: join }), dependents: [], ...extra,
    });
    // 14 + 1 per completed year, capped at 18
    expect(al('2026-01-01', { incrementPerYear: 1, maxDays: 18 }).days).toBe(14);
    expect(al('2023-01-01', { incrementPerYear: 1, maxDays: 18 }).days).toBe(17);
    expect(al('2010-01-01', { incrementPerYear: 1, maxDays: 18 }).days).toBe(18);
    expect(al('2023-01-01', { incrementPerYear: 1, maxDays: 18 }).basis).toMatch(/Company policy/);
    // a stingy company policy never undercuts the statutory scale (7 + years, max 14)
    expect(al('2023-01-01', { templateDefault: 5 }).days).toBe(10);
  });

  it('company policy does not override eligibility-based leave', () => {
    const fr = computeLeaveEntitlement({ ...base, templateDefault: 80, incrementPerYear: 1, leaveTypeName: 'Maternity Leave', employee: emp({ residency_status: 'FOREIGNER' }), dependents: [] });
    expect(fr.days).toBe(0);
  });

  it('countries without rules use the company policy', () => {
    const r = computeLeaveEntitlement({ countryCode: 'XX', templateDefault: 12, statutoryMin: 10, incrementPerYear: 2, maxDays: 20, asOf: new Date('2026-06-30'),
      leaveTypeName: 'Annual Leave', employee: emp({ join_date: '2023-01-01' }), dependents: [] });
    expect(r.days).toBe(18);
  });
});
