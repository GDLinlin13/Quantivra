import { describe, it, expect } from 'vitest';
import { lineAmount, docTotals, balanceDue, statusAfterPayment, isOverdue, addDays, bankCodePlan, defaultAccountsFor, chartUpgrade } from '../finance';

describe('finance maths', () => {
  it('works out line amounts with a line discount', () => {
    expect(lineAmount({ quantity: 10, unit_price: 250, discount_pct: 0 })).toBe(2500);
    expect(lineAmount({ quantity: 3, unit_price: 19.99, discount_pct: 10 })).toBe(53.97);
  });

  it('applies document discounts before GST', () => {
    const lines = [
      { description: 'Consulting', quantity: 10, unit_price: 250, discount_pct: 0, tax_rate: 9 },
      { description: 'Travel', quantity: 1, unit_price: 500, discount_pct: 0, tax_rate: 9 },
    ];
    const t = docTotals(lines, [{ name: 'Loyalty', kind: 'percent', value: 10 }]);
    expect(t).toMatchObject({ subtotal: 3000, discount_total: 300, tax_total: 243, total: 2943 });
    const fixed = docTotals(lines, [{ name: 'Promo', kind: 'amount', value: 100 }]);
    expect(fixed).toMatchObject({ discount_total: 100, tax_total: 261, total: 3161 });
  });

  it('without GST the total is subtotal less discounts', () => {
    const t = docTotals([{ description: 'A', quantity: 2, unit_price: 50, discount_pct: 0, tax_rate: 0 }]);
    expect(t).toMatchObject({ subtotal: 100, tax_total: 0, total: 100 });
  });

  it('handles prices that already include GST', () => {
    const t = docTotals([{ description: 'A', quantity: 1, unit_price: 109, discount_pct: 0, tax_rate: 9 }], [], true);
    expect(t).toMatchObject({ subtotal: 109, tax_total: 9, total: 109 });
  });

  it('a discount can never make the total negative', () => {
    const t = docTotals([{ description: 'A', quantity: 1, unit_price: 50, discount_pct: 0, tax_rate: 0 }], [{ name: 'Big', kind: 'amount', value: 80 }]);
    expect(t).toMatchObject({ discount_total: 50, total: 0 });
  });

  it('tracks payment status and overdue', () => {
    expect(balanceDue({ total: 100, amount_paid: 30 })).toBe(70);
    expect(statusAfterPayment({ total: 100, amount_paid: 30, status: 'sent' })).toBe('partial');
    expect(statusAfterPayment({ total: 100, amount_paid: 100, status: 'partial' })).toBe('paid');
    expect(statusAfterPayment({ total: 100, amount_paid: 0, status: 'paid' })).toBe('sent');
    expect(statusAfterPayment({ total: 100, amount_paid: 0, status: 'draft' })).toBe('draft');
    expect(isOverdue({ doc_type: 'invoice', status: 'sent', due_date: '2026-01-01' }, '2026-02-01')).toBe(true);
    expect(isOverdue({ doc_type: 'invoice', status: 'paid', due_date: '2026-01-01' }, '2026-02-01')).toBe(false);
    expect(addDays('2026-01-31', 30)).toBe('2026-03-02');
  });
});

describe('bank codes', () => {
  it('numbers banks from 1000 with no gaps, keeping their order', () => {
    const accts = [
      { id: 5, code: '1001', subtype: 'bank' }, { id: 6, code: '1002', subtype: 'bank' }, { id: 7, code: '1003', subtype: 'bank' },
      { id: 8, code: '1010', subtype: 'cash' },
    ];
    expect(bankCodePlan(accts)).toEqual([{ id: 5, code: '1000' }, { id: 6, code: '1001' }, { id: 7, code: '1002' }]);
  });
  it('changes nothing when already in order, and skips codes other accounts use', () => {
    expect(bankCodePlan([{ id: 1, code: '1000', subtype: 'bank' }, { id: 2, code: '1001', subtype: 'bank' }])).toEqual([]);
    const many = Array.from({ length: 11 }, (_, i) => ({ id: i + 1, code: String(1000 + i + (i >= 10 ? 1 : 0)), subtype: 'bank' }));
    expect(bankCodePlan([...many, { id: 99, code: '1010', subtype: 'cash' }])).toEqual([]);
  });
});

describe('national ID names', () => {
  it('uses each country’s own term', async () => {
    const { nationalIdLabel } = await import('../countries');
    expect([nationalIdLabel('SG'), nationalIdLabel('MY'), nationalIdLabel('HK'), nationalIdLabel('AE'), nationalIdLabel('GB'), nationalIdLabel('ZZ')])
      .toEqual(['NRIC / FIN', 'MyKad', 'HKID', 'Emirates ID', 'NI Number', 'National ID']);
  });
});

describe('company and tax registration names', () => {
  it('follow the country', async () => {
    const { companyRegLabel, taxRegLabel } = await import('../countries');
    expect([companyRegLabel('SG'), companyRegLabel('AE'), companyRegLabel('MY'), companyRegLabel('ZZ')]).toEqual(['UEN', 'Trade Licence No.', 'SSM Registration No.', 'Company Registration No.']);
    expect([taxRegLabel('SG'), taxRegLabel('AE'), taxRegLabel('ZZ')]).toEqual(['GST Reg. No.', 'TRN', 'Tax Registration No.']);
  });
});

describe('dividend accounts', () => {
  it('are added to older charts once, unless the company made its own', () => {
    const rows = defaultAccountsFor('SG').filter(a => !String(a.subtype).startsWith('dividend')).map((a, i) => ({ ...a, id: i + 1 }));
    const add = chartUpgrade(rows, 'SG').add.map(a => `${a.code} ${a.name}`);
    expect(add).toEqual(['2400 Dividends payable', '3200 Dividends']);
    const own = [...rows, { id: 99, code: '3300', name: 'Dividend paid', subtype: null }];
    expect(chartUpgrade(own, 'SG').add.map(a => a.name)).toEqual(['Dividends payable']);
    expect(chartUpgrade(defaultAccountsFor('SG').map((a, i) => ({ ...a, id: i + 1 })), 'SG').add).toEqual([]);
  });
});

describe('contact currencies', () => {
  it('reads one or several, first is the default', async () => {
    const { contactCurrencies } = await import('../finance');
    expect(contactCurrencies({ currency: 'USD,eur' })).toEqual(['USD', 'EUR']);
    expect(contactCurrencies({ currency: 'MYR' })).toEqual(['MYR']);
    expect(contactCurrencies({ currency: null })).toEqual([]);
  });
});
