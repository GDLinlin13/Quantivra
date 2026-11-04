import { describe, it, expect } from 'vitest';
import migrationSql from '../../../scripts/migrations/015_country_packs_2026.sql?raw';
import { packFor2026, allCountryLaw2026 } from '../country-law-2026';
import { progressive } from '../tax-brackets';
import { packConfig2026 } from '../packConfig';

const CODES = ['SG', 'MY', 'ID', 'TH', 'PH', 'VN', 'HK', 'TW', 'JP', 'KR', 'CN', 'US', 'GB', 'AU', 'DE', 'FR',
  'IN', 'NZ', 'CA', 'AE', 'NL', 'IE', 'CH', 'ES', 'IT', 'SA', 'BR', 'MX'];

describe('2026 country packs', () => {
  it.each(CODES)('%s has a complete 2026 pack with sources', code => {
    const p = packFor2026(code)!;
    const law = allCountryLaw2026()[code];
    expect(p, code).toBeTruthy();
    expect(law?.sources.length, `${code} sources`).toBeGreaterThan(0);
    expect(p.general.code).toBe(code);
    expect(p.leave.types.length, `${code} leave`).toBeGreaterThan(0);
    expect(p.income_tax.brackets.length, `${code} tax`).toBeGreaterThan(0);
    expect(p.statutory_contributions.length, `${code} contributions`).toBeGreaterThan(0);
    // brackets are in order and contiguous
    p.income_tax.brackets.forEach((b, i, all) => {
      if (i > 0) expect(b.min).toBe(all[i - 1].max);
    });
    for (const t of p.leave.types) {
      expect(['working_days', 'weeks', 'calendar_days', undefined]).toContain(t.count_method);
      if (t.count_method === 'weeks') expect(t.min_days % 5 === 0 || t.min_days === 0, `${code} ${t.name}`).toBe(true);
    }
  });

  it('progressive() adds up the tax below each band', () => {
    expect(progressive([[0, 0], [20000, 2], [30000, 3.5]])).toEqual([
      { min: 0, max: 20000, rate: 0, fixed: 0 },
      { min: 20000, max: 30000, rate: 2, fixed: 0 },
      { min: 30000, max: null, rate: 3.5, fixed: 200 },
    ]);
  });

  it('spot checks of 2026 law', () => {
    expect(packFor2026('SG')!.statutory_contributions[0].max_earnings_ceiling).toBe(8000);
    expect(packFor2026('MY')!.payroll.minimum_wage).toBe(1700);
    expect(packFor2026('GB')!.payroll.minimum_wage).toBe(12.71);
    expect(packFor2026('DE')!.payroll.minimum_wage).toBe(13.9);
    expect(packFor2026('TW')!.general.currency).toBe('TWD');
    expect(packFor2026('HK')!.leave.types.find(t => t.name === 'Maternity Leave')).toMatchObject({ count_method: 'weeks', min_days: 70 });
  });

  it('the 2026 migration is up to date with this data (run scripts/generate/pack-versions-2026.ts)', () => {
    const sql = migrationSql;
    for (const code of CODES) expect(sql).toContain(JSON.stringify(packConfig2026(code)));
  });
});
