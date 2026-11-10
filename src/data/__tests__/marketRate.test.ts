import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('../../utils/supabase', () => ({ supabase: {} }));
import { marketRate } from '../../services/finance';

const answer = (body: any) => ({ ok: true, json: async () => body });

describe('market rates', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it("today's rate in the company currency per unit", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer({ result: 'success', rates: { HKD: 7.7812345678, USD: 1 } })));
    expect(await marketRate('USD', 'HKD')).toBe(7.781235);
  });
  it('the rate on a given day, from the dated service', async () => {
    const f = vi.fn(async (url: string) => answer(url.includes('frankfurter') ? { rates: { HKD: 7.8452 } } : { result: 'success', rates: { HKD: 1 } }));
    vi.stubGlobal('fetch', f);
    expect(await marketRate('USD', 'HKD', '2025-08-22')).toBe(7.8452);
    expect(String(f.mock.calls[0][0])).toContain('2025-08-22');
  });
  it("a currency the dated service doesn't have falls back to today's rate", async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('frankfurter') ? { ok: false, json: async () => ({}) } : answer({ result: 'success', rates: { HKD: 2.12 } }))));
    expect(await marketRate('AED', 'HKD', '2025-08-22')).toBe(2.12);
  });
  it('nothing when the services cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await marketRate('USD', 'HKD', '2025-08-22')).toBeNull();
  });
});
