import { describe, it, expect } from 'vitest';
import { lineAmount, docTotals, balanceDue, statusAfterPayment, isOverdue, addDays, bankCodePlan, defaultAccountsFor, chartUpgrade, chartStyleOf, recommendedChartPlan, nextBankCode } from '../finance';

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
    const rows = defaultAccountsFor('SG', 'legacy').filter(a => !String(a.subtype).startsWith('dividend')).map((a, i) => ({ ...a, id: i + 1 }));
    const add = chartUpgrade(rows, 'SG').add.map(a => `${a.code} ${a.name}`);
    expect(add).toEqual(['2400 Dividends payable', '3200 Dividends']);
    const own = [...rows, { id: 99, code: '3300', name: 'Dividend paid', subtype: null }];
    expect(chartUpgrade(own, 'SG').add.map(a => a.name)).toEqual(['Dividends payable']);
    expect(chartUpgrade(defaultAccountsFor('SG', 'legacy').map((a, i) => ({ ...a, id: i + 1 })), 'SG').add).toEqual([]);
    expect(chartUpgrade(defaultAccountsFor('SG').map((a, i) => ({ ...a, id: i + 1 })), 'SG')).toEqual({ add: [], rename: [] });   // the recommended chart is complete
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

describe('number year vs date', () => {
  it('spots a counted number from another year', async () => {
    const { numberYearDiffers } = await import('../finance');
    expect(numberYearDiffers('BILL-2026-0001', '2025-09-15')).toBe(true);
    expect(numberYearDiffers('BILL-2025-0001', '2025-09-15')).toBe(false);
    expect(numberYearDiffers('ARG-0457', '2025-09-15')).toBe(false);
    expect(numberYearDiffers('INV-12026', '2025-09-15')).toBe(false);
  });
});

describe('numbers for another year', () => {
  it('continue from the numbers already used in that year', async () => {
    const { nextFreeNumber } = await import('../../utils/numbering');
    const used = ['BILL-2025-0001', 'BILL-2025-0002', 'BILL-2026-0001', 'X'];
    expect(nextFreeNumber('BILL-{YYYY}-{0000}', '2025-09-15', used)).toBe('BILL-2025-0003');
    expect(nextFreeNumber('BILL-{YYYY}-{0000}', '2024-01-02', used)).toBe('BILL-2024-0001');
    expect(nextFreeNumber('INV.{YY}{MM}-{000}', '2025-09-15', ['INV.2509-007'])).toBe('INV.2509-008');
  });
});

describe('the recommended chart of accounts', () => {
  const rec = defaultAccountsFor('SG');
  const legacy = defaultAccountsFor('SG', 'legacy').map((a, i) => ({ ...a, id: i + 1, archived: false }));

  it('has the agreed accounts: merged payroll, fees and tax accounts, income of five accounts', () => {
    const name = (c: string) => rec.find(a => a.code === c)?.name;
    expect([name('6600'), name('6005'), name('6010'), name('2031'), name('6850'), name('6900'), name('6910'), name('6920'), name('7000'), name('7010'), name('8000')]).toEqual([
      'IT Expenses', "Director's Salary / Wages", 'Employer Contributions and Payroll Expenses', 'Payroll Contributions and Statutory Deductions Payable',
      'Tax Advisory and Filing Fees', 'Bank and Payment Charges', 'Foreign Exchange Losses', 'Depreciation and Amortisation', 'Interest and Finance Charges',
      'Other Non-operating Expenses', 'Corporate Income Tax Expense']);
    expect(rec.filter(a => a.type === 'income').map(a => a.code)).toEqual(['4000', '4010', '4020', '4090', '4100']);
    expect(rec.find(a => a.code === '6008')!.name).toBe("Director's Fees");      // director's fees are separate from the director's wages
    expect(rec.find(a => a.code === '4100')!.subtype).toBe('fx_gain');      // exchange gains post to Other Income, losses to 6910
  });

  it('stays between 60 and 90 accounts, without the merged-away ones', () => {
    expect(rec.length).toBeGreaterThanOrEqual(60);
    expect(rec.length).toBeLessThanOrEqual(90);
    const codes = new Set(rec.map(a => a.code));
    for (const gone of ['1120', '1140', '1210', '1220', '1230', '1340', '1410', '1500', '2020', '2032', '2033', '2060', '2110', '2220', '2400', '3020', '3210',
      '5040', '5050', '5060', '5070', '5080', '6015', '6020', '6050', '6130', '6210', '6220', '6310', '6510', '6520', '6880', '6940', '6950', '7100', '7110', '7130', '7140', '8020', '8030']) expect(codes.has(gone), gone).toBe(false);
  });

  it('follows the numbering: 1xxx assets … 8xxx taxation', () => {
    const kind: Record<string, string> = { '1': 'asset', '2': 'liability', '3': 'equity', '4': 'income', '5': 'expense', '6': 'expense', '7': 'expense', '8': 'expense' };
    for (const a of rec) expect([a.code, a.type]).toEqual([a.code, kind[a.code[0]]]);
    expect(rec.find(a => a.code === '1000')!.name).toBe('Cash on Hand');
    expect(rec.find(a => a.code === '6990')!.name).toBe('General Administrative Expenses');
    expect(new Set(rec.map(a => a.code)).size).toBe(rec.length);
  });

  it('has every account Quantivra posts to by itself, once', () => {
    const roles = ['bank', 'cash', 'receivable', 'payable', 'tax', 'payroll_payable', 'statutory_payable',
      'claims_payable', 'dividends_payable', 'retained', 'dividends', 'sales', 'payroll', 'payroll_director', 'payroll_employer', 'general', 'fx_gain', 'fx_loss'];
    for (const r of roles) expect(rec.filter(a => a.subtype === r), r).toHaveLength(1);
    // payroll contributions, SDL and the like share one payable and one cost account (the ledger falls back to them)
    for (const r of ['cpf_employer_payable', 'other_payroll_payable', 'payroll_employer_other', 'fx_gain_loss']) expect(rec.some(a => a.subtype === r), r).toBe(false);
    expect(rec.some(a => a.subtype === 'gratuity_provision')).toBe(false);          // Gulf states only
    expect(defaultAccountsFor('AE').some(a => a.subtype === 'gratuity_provision')).toBe(true);
    expect(rec.find(a => a.subtype === 'tax')!.name).toBe('GST Payable');
    expect(defaultAccountsFor('AE').find(a => a.subtype === 'tax')!.name).toBe('VAT Payable');
  });

  it('numbers new bank accounts from 1010, and accounts in another currency from 1021', () => {
    const rows = rec.map((a, i) => ({ ...a, id: i + 1 }));
    expect(bankCodePlan(rows, 'SGD')).toEqual([]);
    const withMore = [...rows, { id: 900, code: '1011', subtype: 'bank', name: 'x', currency: null }, { id: 901, code: '1012', subtype: 'bank', name: 'y', currency: 'USD' }] as any[];
    expect(bankCodePlan(withMore, 'SGD')).toEqual([{ id: 901, code: '1021' }]);
    expect(nextBankCode(rows, false)).toBe('1011');
    expect(nextBankCode(rows, true)).toBe('1021');
    expect(nextBankCode(legacy, false)).toBe('1001');
  });

  it('brings an older chart onto the recommended one', () => {
    const rows = [...legacy, { id: 500, code: '1002', name: 'DBS - USD', type: 'asset', subtype: 'bank', is_system: false, archived: false, currency: 'USD' },
      { id: 501, code: '1300', name: 'My own account', type: 'asset', subtype: null, is_system: false, archived: false }] as any[];
    expect(chartStyleOf(rows)).toBe('legacy');
    const plan = recommendedChartPlan(rows, 'SG', 'SGD');
    // apply it
    const after = rows.map(r => { const m = plan.moves.find(x => x.id === r.id); return m ? { ...r, code: m.to, name: m.name ?? r.name } : r; })
      .concat(plan.add.map((a, i) => ({ ...a, id: 1000 + i, archived: false }) as any));
    expect(chartStyleOf(after)).toBe('recommended');
    expect(new Set(after.map(a => a.code)).size).toBe(after.length);                        // no code twice
    const at = (sub: string) => after.filter(a => a.subtype === sub).map(a => a.code);
    expect([at('cash'), at('receivable'), at('payable'), at('tax'), at('payroll_payable'), at('sales'), at('retained'), at('fx_gain_loss')])
      .toEqual([['1000'], ['1100'], ['2000'], ['2050'], ['2030'], ['4000'], ['3100'], ['4900']]);   // an older chart keeps its one exchange account
    expect(at('bank').sort()).toEqual(['1010', '1021']);                                      // the SGD bank, then the USD one
    expect(after.find(a => a.id === 501)!.code).toBe('1300');                                 // a company's own account keeps its code
    expect(plan.skipped.map(s => s.code)).toContain('1300');                                  // so the recommended 1300 is not added
    expect(after.find(a => a.code === '6110')!.name).toBe('Utilities');
    expect(after.find(a => a.code === '6600')!.name).toBe('IT Expenses');                       // software and subscriptions became IT Expenses
    expect(after.find(a => a.code === '4100')!.name).toBe('Other Income');                      // and Other income is 4100
    expect(after.find(a => a.code === '1130')!.name).toBe('Prepayments and Deposits');
    expect(after.find(a => a.name === 'Equipment and furniture' || a.name === 'Office Equipment and Furniture')!.code).toBe('1320');
    // nothing more to do afterwards
    expect(recommendedChartPlan(after as any, 'SG', 'SGD').moves).toEqual([]);
  });

  it('leaves a name the company changed alone', () => {
    const rows = legacy.map(r => (r.code === '6200' ? { ...r, name: 'Electricity and water' } : r)) as any[];
    const plan = recommendedChartPlan(rows, 'SG', 'SGD');
    expect(plan.moves.find(m => m.from === '6200')).toBeUndefined();      // not an untouched default: stays at 6200
    expect(plan.add.some(a => a.code === '6110')).toBe(true);
  });
});
