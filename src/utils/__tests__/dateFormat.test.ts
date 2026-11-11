import { describe, it, expect, afterEach } from 'vitest';
import { fmtDate, setDateFormat, getDateFormat } from '../dateFormat';

describe('date format', () => {
  afterEach(() => setDateFormat());
  it('shows dates in the chosen format', () => {
    expect(fmtDate('2026-08-31')).toBe('2026-08-31');
    setDateFormat('DD/MM/YYYY'); expect(fmtDate('2026-08-31')).toBe('31/08/2026');
    setDateFormat('MM/DD/YYYY'); expect(fmtDate('2026-08-31')).toBe('08/31/2026');
    setDateFormat('D MMM YYYY'); expect(fmtDate('2026-08-31')).toBe('31 Aug 2026');
    expect(fmtDate('2026-08-31T10:00:00Z', 'DD.MM.YYYY')).toMatch(/^(31|01)\.(08|09)\.2026$/);
  });
  it('never formats text that is already in a company format (day and month would swap)', () => {
    setDateFormat('DD/MM/YYYY');
    const once = fmtDate('2025-07-04');
    expect(once).toBe('04/07/2025');
    expect(fmtDate(once)).toBe('04/07/2025');
    setDateFormat('MM/DD/YYYY');
    expect(fmtDate(fmtDate('2025-08-09'))).toBe('08/09/2025');
  });
  it('leaves empty and non-date values alone, and ignores unknown formats', () => {
    expect(fmtDate(null)).toBe(''); expect(fmtDate('')).toBe(''); expect(fmtDate('Opening stock')).toBe('Opening stock');
    setDateFormat('nonsense'); expect(getDateFormat()).toBe('YYYY-MM-DD');
  });
});
