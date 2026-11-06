import { describe, it, expect } from 'vitest';
import { matchLabel } from '../MatchDetails';

const data: any = {
  accounts: [{ id: 1, code: '1001', name: 'DBS - SGD' }, { id: 2, code: '6900', name: 'Bank charges' }, { id: 3, code: '2200', name: 'Net salaries payable' }],
  contacts: [{ id: 9, name: 'Argos Solutions Limited' }],
};
const look: any = {
  journals: [
    { id: 1, memo: 'INWARD TT COMM', lines: [{ account_id: 2, debit: 10, credit: 0 }, { account_id: 1, debit: 0, credit: 10 }] },
    { id: 2, memo: 'Salaries — May 2026', lines: [{ account_id: 3, debit: 24400, credit: 0 }, { account_id: 1, debit: 0, credit: 24400 }] },
  ],
  payments: [{ id: 5, number: 'RCT-2026-0001', contact_id: 9 }],
  allocations: [{ payment_id: 5, document_id: 7, amount: 67750 }],
  docs: [{ id: 7, number: 'CCSG2605001' }],
};
const t = (o: any): any => ({ id: 1, account_id: 1, description: 'INWARD TT COMM', amount: -10, ...o });

describe('what a matched bank line shows', () => {
  it('shows the account it was booked to, not the bank', () => {
    expect(matchLabel(t({ journal_id: 1 }), data, look)).toEqual({ title: '6900 Bank charges' });
  });
  it('shows the payroll month for salaries / CPF', () => {
    expect(matchLabel(t({ journal_id: 2, description: 'GIRO PAYROLL' }), data, look)).toEqual({ title: 'Salaries — May 2026', sub: '2200 Net salaries payable' });
  });
  it('shows the payment, customer and invoice', () => {
    expect(matchLabel(t({ payment_id: 5 }), data, look)).toEqual({ title: 'RCT-2026-0001 · Argos Solutions Limited', sub: 'for CCSG2605001' });
  });
});
