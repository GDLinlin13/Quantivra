import { describe, it, expect } from 'vitest';
import { buildFolders, statementPeriod } from '../documents';

describe('documents folders', () => {
  const input = {
    runs: [{ id: 1, period_year: 2026, period_month: 5, status: 'finalised' }, { id: 2, period_year: 2026, period_month: 6, status: 'draft' }],
    docs: [
      { id: 10, doc_type: 'invoice', number: 'INV-1', issue_date: '2026-06-01', status: 'sent', contact: 'Argos' },
      { id: 11, doc_type: 'invoice', number: null, issue_date: '2026-06-02', status: 'draft' },
      { id: 12, doc_type: 'bill', number: 'BILL-1', issue_date: '2026-05-20', status: 'approved', contact: 'ACRA' },
    ],
    attachments: [{ id: 5, document_id: 12, file_name: 'acra.pdf', path: '1/12/acra.pdf', size_bytes: 10 }],
    files: [
      { id: 7, folder: 'bank', account_id: 3, period: '2026-05', path: '1/files/may.pdf', file_name: 'DBS May.pdf', size_bytes: 1, created_at: '2026-06-02T00:00:00Z' },
      { id: 8, folder: 'other', account_id: null, period: null, path: '1/files/lease.pdf', file_name: 'Lease.pdf', size_bytes: 1, created_at: '2026-06-03T00:00:00Z' },
    ],
    banks: [{ id: 3, name: 'DBS - SGD' }, { id: 4, name: 'Maybank - USD' }],
  };
  const f = buildFolders(input);
  const get = (k: string) => f.find(x => x.key === k)!;
  it('puts finalised payslip runs in year / month folders', () => {
    expect(get('payslips').children[0].title).toBe('2026');
    expect(get('payslips').children[0].children.map(m => [m.title, m.runId])).toEqual([['05 May', 1]]);
  });
  it('files invoices (not drafts), bills, bank statements and other files', () => {
    expect(get('invoice').children[0].children[0].files.map(x => x.name)).toEqual(['INV-1 - Argos.pdf']);
    expect(get('bills').children[0].children[0].files.map(x => x.name)).toEqual(['BILL-1 - ACRA - acra.pdf']);
    expect(get('bank').children.map(b => b.title)).toEqual(['DBS - SGD', 'Maybank - USD']);
    expect(get('bank').children[0].children[0].files.map(x => x.name)).toEqual(['DBS May.pdf']);
    expect(get('other').files.map(x => x.name)).toEqual(['Lease.pdf']);
    expect(buildFolders(input, { payslips: false }).some(x => x.key === 'payslips')).toBe(false);
  });
  it('works out the month a statement covers', () => {
    expect(statementPeriod(['2026-05-19', '2026-05-26', '2026-06-01'])).toBe('2026-05');
    expect(statementPeriod([])).toBeNull();
  });
});
