import { describe, it, expect } from 'vitest';
import { formatDocumentNumber, validateFormat } from '../numbering';

describe('document numbering', () => {
  const d = new Date('2026-03-05T00:00:00');
  it('fills year, month and padded running number', () => {
    expect(formatDocumentNumber('INV-{YYYY}-{0000}', 42, d)).toBe('INV-2026-0042');
    expect(formatDocumentNumber('PO{YY}{MM}/{000}', 7, d)).toBe('PO2603/007');
    expect(formatDocumentNumber('EMP{0}', 123, d)).toBe('EMP123');
  });
  it('explains bad formats', () => {
    expect(validateFormat('INV-{YYYY}-{0000}')).toEqual([]);
    expect(validateFormat('INV-{YYYY}')).toHaveLength(1);
    expect(validateFormat('INV-{DD}-{0000}')[0]).toMatch(/Unknown code/);
  });
});
