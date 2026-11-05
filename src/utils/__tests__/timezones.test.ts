import { describe, it, expect } from 'vitest';
import { timezoneOptions } from '../timezones';
import { packFor2026 } from '../../data/country-law-2026';

describe('timezones', () => {
  it('lists every timezone, sorted, with UTC offsets', () => {
    const opts = timezoneOptions();
    expect(opts.length).toBeGreaterThan(100);
    expect(opts.find(o => o.value === 'Asia/Singapore')?.label).toBe('Asia/Singapore (UTC+08:00)');
    expect([...opts].map(o => o.value)).toEqual([...opts].map(o => o.value).sort((a, b) => a.localeCompare(b)));
  });
  it("every country pack's default timezone is in the list", () => {
    const zones = new Set(timezoneOptions().map(o => o.value));
    for (const code of ['SG', 'MY', 'ID', 'TH', 'PH', 'VN', 'HK', 'TW', 'JP', 'KR', 'CN', 'US', 'GB', 'AU', 'DE', 'FR',
      'IN', 'NZ', 'CA', 'AE', 'NL', 'IE', 'CH', 'ES', 'IT', 'SA', 'BR', 'MX']) {
      expect(zones.has(packFor2026(code)!.general.timezone), code).toBe(true);
    }
  });
});
