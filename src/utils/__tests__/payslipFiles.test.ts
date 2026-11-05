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
