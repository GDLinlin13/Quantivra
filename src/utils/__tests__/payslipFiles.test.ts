import { describe, it, expect } from 'vitest';
import { formatFileName, uniqueNames, DEFAULT_COMBINED_FILE_NAME } from '../payslipFiles';

const ctx = { name: 'Yong Weng Loon, Marcus', id: 'EMP-006', designation: 'Project Executive', year: 2026, month: 5, company: 'Cosmos Creative Pte Ltd' };

describe('payslip file names', () => {
  it('fills the default pattern', () => {
    expect(formatFileName(undefined, ctx)).toBe('Payslip - Yong Weng Loon, Marcus - May 2026.pdf');
    expect(formatFileName('', { year: 2026, month: 5, company: 'Cosmos' }, DEFAULT_COMBINED_FILE_NAME)).toBe('Payslips - Cosmos - May 2026.pdf');
  });
  it('supports every token and keeps unknown ones', () => {
    expect(formatFileName('{year}-{mm} {id} {designation} {Name} {foo}', ctx)).toBe('2026-05 EMP-006 Project Executive Yong Weng Loon, Marcus {foo}.pdf');
  });
  it('makes names safe for Windows and Mac', () => {
    expect(formatFileName('{name}/{month}: "x"?', { ...ctx, name: 'A<B>' })).toBe('A-B - May - x.pdf');
    expect(formatFileName('Payslip - {id} - {month}', { ...ctx, id: '' })).toBe('Payslip - May.pdf');
  });
  it('numbers duplicates inside a zip', () => {
    expect(uniqueNames(['a.pdf', 'A.pdf', 'b.pdf', 'a.pdf'])).toEqual(['a.pdf', 'A (2).pdf', 'b.pdf', 'a (3).pdf']);
  });
});

describe('amount formats', () => {
  it('shows amounts in the chosen style', async () => {
    const { money } = await import('../../data/documentLayouts');
    expect(money(1234.5, 'SGD')).toBe('SGD 1,234.50');
    expect(money(1234.5, 'SGD', 'symbol')).toBe('$1,234.50');
    expect(money(1234.5, 'SGD', 'symbol_space')).toBe('$ 1,234.50');
    expect(money(1234.5, 'SGD', 'code_after')).toBe('1,234.50 SGD');
    expect(money(1234.5, 'SGD', 'number')).toBe('1,234.50');
    expect(money(-380.95, 'SGD', 'symbol')).toBe('-$380.95');
    expect(money(10, 'EUR', 'symbol')).toBe('€10.00');
  });
});
