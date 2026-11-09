import { describe, it, expect } from 'vitest';
import { wordsToRow, wordsToRows } from '../bankOcr';

const w = (text: string, x0: number) => ({ text, bbox: { x0, y0: 0, x1: x0 + text.length * 10, y1: 12 } });

describe('reading a picture statement', () => {
  it('keeps words of one column together and splits at wide gaps', () => {
    const row = wordsToRow([w('22-JUL-2025', 20), w('AECB', 180), w('CREDIT', 230), w('REPORT', 300), w('FEE', 370), w('100.00', 900), w('10,548,575.15', 1300)]);
    expect(row.map(p => p.s)).toEqual(['22-JUL-2025', 'AECB CREDIT REPORT FEE', '100.00', '10,548,575.15']);
  });
});

describe('picture statements: rows and numbers', () => {
  const at = (text: string, x0: number, y0: number) => ({ text, bbox: { x0, y0, x1: x0 + text.length * 10, y1: y0 + 12 } });
  it('puts everything at the same height on one row, whatever block OCR put it in', () => {
    const rows = wordsToRows([at('105.00', 800, 101), at('02-0CT-2025', 20, 100), at('AECB', 200, 99), at('FEE', 250, 100), at('WPS', 200, 130)], 0.5);
    expect(rows.map(r => r.map(p => p.s))).toEqual([['02-OCT-2025', 'AECB FEE', '105.00'], ['WPS']]);
    expect(rows[0][0].x).toBe(10);
  });
  it('joins numbers split by a space', () => {
    expect(wordsToRow([at('10,408,', 500, 0), at('519.33', 572, 0)])[0].s).toBe('10,408,519.33');
  });
});
