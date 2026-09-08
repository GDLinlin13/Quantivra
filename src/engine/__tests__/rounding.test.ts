import { describe, it, expect } from 'vitest';
import { roundAmount, roundByConfig, sumAndRound } from '../rounding';

describe('rounding', () => {
  it('rounds to 2 decimals by default', () => {
    expect(roundAmount(1.2345)).toBe(1.23);
    expect(roundAmount(1.235)).toBe(1.24);
  });

  it('rounds with specified decimals', () => {
    expect(roundAmount(1.2345, 3)).toBe(1.235);
    expect(roundAmount(1.2345, 0)).toBe(1);
  });

  it('ceil rounds up', () => {
    expect(roundAmount(1.001, 2, 'ceil')).toBe(1.01);
    expect(roundAmount(1.001, 0, 'ceil')).toBe(2);
  });

  it('floor rounds down', () => {
    expect(roundAmount(1.999, 2, 'floor')).toBe(1.99);
    expect(roundAmount(1.999, 0, 'floor')).toBe(1);
  });

  it('truncate removes extra decimals', () => {
    expect(roundAmount(1.999, 2, 'truncate')).toBe(1.99);
    expect(roundAmount(-1.999, 2, 'truncate')).toBe(-1.99);
  });

  it('roundByConfig uses config', () => {
    const r = roundByConfig(1.2345, { method: 'ceil', decimals: 1 });
    expect(r).toBe(1.3);
  });

  it('sumAndRound sums then rounds', () => {
    expect(sumAndRound([1.111, 2.222, 3.333])).toBe(6.67);
  });
});
