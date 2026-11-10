import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('../../utils/supabase', () => ({ supabase: {} }));
import { marketRate } from '../../services/finance';

describe("today's market rate", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('reads the company currency per unit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ result: 'success', rates: { HKD: 7.7812345678, USD: 1 } }) })));
    expect(await marketRate('USD', 'HKD')).toBe(7.781235);
  });
  it('gives nothing when the service cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await marketRate('USD', 'HKD')).toBeNull();
  });
});
