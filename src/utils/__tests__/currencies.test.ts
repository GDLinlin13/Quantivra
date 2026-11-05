import { describe, it, expect } from 'vitest';
import { currencyOptions } from '../currencies';
import { packFor2026 } from '../../data/country-law-2026';

describe('currencies', () => {
  it('lists currencies with names, including every country pack currency', () => {
    const opts = currencyOptions();
    expect(opts.length).toBeGreaterThan(100);
    expect(opts.find(o => o.value === 'SGD')?.label).toBe('SGD — Singapore Dollar');
    const codes = new Set(opts.map(o => o.value));
    for (const c of ['SG', 'MY', 'ID', 'TH', 'PH', 'VN', 'HK', 'TW', 'JP', 'KR', 'CN', 'US', 'GB', 'AU', 'DE', 'FR',
      'IN', 'NZ', 'CA', 'AE', 'NL', 'IE', 'CH', 'ES', 'IT', 'SA', 'BR', 'MX']) {
      expect(codes.has(packFor2026(c)!.general.currency), c).toBe(true);
    }
  });
});
