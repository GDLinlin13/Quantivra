import { describe, it, expect } from 'vitest';
import { wordsToRow } from '../bankOcr';

const w = (text: string, x0: number) => ({ text, bbox: { x0, y0: 0, x1: x0 + text.length * 10, y1: 12 } });

describe('reading a picture statement', () => {
  it('keeps words of one column together and splits at wide gaps', () => {
    const row = wordsToRow([w('22-JUL-2025', 20), w('AECB', 180), w('CREDIT', 230), w('REPORT', 300), w('FEE', 370), w('100.00', 900), w('10,548,575.15', 1300)]);
    expect(row.map(p => p.s)).toEqual(['22-JUL-2025', 'AECB CREDIT REPORT FEE', '100.00', '10,548,575.15']);
  });
});
