import { describe, it, expect } from 'vitest';
import { DEFAULT_ACCOUNTS, chartUpgrade, type Account } from '../finance';
import { buildLedger, balances, profitAndLoss, balanceSheet, gstReturn, accountLedger, aged, spread, payrollDue, payrollLines, payrollSplit, splitByShare } from '../ledger';

const accounts: Account[] = DEFAULT_ACCOUNTS.map((a, i) => ({ ...a, id: i + 1, company_id: 1, archived: false, opening_balance: 0 }));
const id = (code: string) => accounts.find(a => a.code === code)!.id;
const line = (description: string, qty: number, price: number, tax = 9, account_id: number | null = null) =>
  ({ description, quantity: qty, unit_price: price, discount_pct: 0, tax_rate: tax, account_id });
const doc = (o: any) => ({ company_id: 1, contact_id: 1, contact_person_id: null, due_date: null, reference: null, currency: 'SGD', tax_inclusive: false,
  discounts: [], subtotal: 0, discount_total: 0, tax_total: 0, total: 0, amount_paid: 0, notes: null, terms: null, source_id: null, ...o });

const input = {
  accounts: accounts.map(a => (a.code === '1000' ? { ...a, opening_balance: 10000, opening_date: '2026-01-01' } : a)),
  docs: [
    doc({ id: 1, doc_type: 'invoice', number: 'INV-1', status: 'partial', issue_date: '2026-05-02', due_date: '2026-06-01', total: 2943, amount_paid: 1000,
      discounts: [{ name: 'Loyalty', kind: 'percent', value: 10 }], lines: [line('Consulting', 10, 250), line('Travel', 1, 500)] }),
    doc({ id: 2, doc_type: 'bill', number: 'BILL-1', status: 'approved', issue_date: '2026-05-03', total: 109, lines: [line('Paper', 1, 100, 9, id('6300'))] }),
    doc({ id: 3, doc_type: 'expense', number: 'EXP-1', status: 'approved', issue_date: '2026-05-04', employee_id: 7, total: 50, lines: [line('Taxi', 1, 50, 0, id('6400'))] }),
    doc({ id: 4, doc_type: 'invoice', number: 'INV-DRAFT', status: 'draft', issue_date: '2026-05-05', lines: [line('x', 1, 999)] }),
    doc({ id: 5, doc_type: 'invoice', number: 'INV-0', status: 'sent', issue_date: '2026-05-06', lines: [line('Export', 1, 1000, 0)] }),
  ],
  payments: [
    { id: 1, direction: 'in' as const, number: 'RCT-1', contact_id: 1, payment_date: '2026-05-10', amount: 1000, account_id: null },
    { id: 2, direction: 'out' as const, number: 'PAY-1', contact_id: null, payment_date: '2026-05-11', amount: 50, account_id: id('1000') },
  ],
  allocations: [{ payment_id: 1, document_id: 1, amount: 1000 }, { payment_id: 2, document_id: 3, amount: 50 }],
  payroll: [{ id: 1, period_year: 2026, period_month: 5, pay_date: '2026-05-31', status: 'finalised', total_gross: 5000, total_deductions: 1000, total_employer: 850, total_net: 4000 }],
  journals: [{ id: 1, number: 'JNL-1', journal_date: '2026-05-20', memo: 'Bank fee', lines: [{ account_id: id('6900'), debit: 10, credit: 0 }, { account_id: id('1000'), debit: 0, credit: 10 }] }],
};

describe('ledger', () => {
  const entries = buildLedger(input as any);
  it('every entry balances and drafts are left out', () => {
    for (const e of entries) {
      const d = e.lines.reduce((s, l) => s + l.debit, 0), c = e.lines.reduce((s, l) => s + l.credit, 0);
      expect(Math.round(d * 100)).toBe(Math.round(c * 100));
    }
    expect(entries.find(e => e.ref === 'INV-DRAFT')).toBeUndefined();
  });

  it('profit and loss', () => {
    const pl = profitAndLoss(input.accounts, entries, '2026-05-01', '2026-05-31');
    expect(pl.totalIncome).toBe(2700 + 1000);                // sales net of discount, without GST
    expect(pl.totalExpenses).toBe(100 + 50 + 5000 + 850 + 10);
    expect(pl.profit).toBe(3700 - 6010);
  });

  it('balance sheet balances, with the right control accounts', () => {
    const bs = balanceSheet(input.accounts, entries, '2026-05-31');
    expect(bs.balanced).toBe(true);
    const bal = (code: string) => balances(input.accounts, entries, undefined, '2026-05-31').find(b => b.account.code === code)!.balance;
    expect(bal('1100')).toBe(2943 - 1000 + 1000);            // two invoices still owed in part
    expect(bal('2000')).toBe(109);                           // bill unpaid
    expect(bal('2300')).toBe(0);                             // staff claim paid back
    expect(bal('1000')).toBe(10000 + 1000 - 50 - 10);          // net pay is owed until it's paid
    expect(bal('2200')).toBe(4000);
    expect(bal('2100')).toBe(243 - 9);                        // GST owed
    expect(bal('2210')).toBe(1000);                           // employee's CPF owed (no payslips: all deductions)
    expect(bal('2220')).toBe(850);                            // employer's CPF owed
  });

  it('GST return boxes', () => {
    const g = gstReturn(input.docs as any, '2026-05-01', '2026-05-31');
    expect(g).toMatchObject({ box1_standard: 2700, box2_zero: 1000, box4_total: 3700, box5_purchases: 100, box6_output_tax: 243, box7_input_tax: 9, box8_net: 234 });
  });

  it('account history and aged receivables', () => {
    const h = accountLedger(input.accounts.find(a => a.code === '1100')!, entries, '2026-05-05');
    expect(h.opening).toBe(2943);
    expect(h.closing).toBe(2943 - 1000 + 1000);
    const a = aged(input.docs as any, 'receivable', '2026-07-15');
    expect(a.totals.d31_60).toBe(1943);
  });

  it('payroll still to pay: net salaries and CPF, paid oldest first', () => {
    const more = { ...input, payroll: [...input.payroll, { ...input.payroll[0], id: 2, period_month: 6, pay_date: '2026-06-30' }],
      journals: [...input.journals,
        { id: 2, number: 'J2', journal_date: '2026-06-01', memo: 'Salaries May', lines: [{ account_id: id('2200'), debit: 4000, credit: 0 }, { account_id: id('1000'), debit: 0, credit: 4000 }] },
        { id: 3, number: 'J3', journal_date: '2026-06-14', memo: 'CPF part', lines: [{ account_id: id('2210'), debit: 1000, credit: 0 }, { account_id: id('1000'), debit: 0, credit: 1000 }] }] };
    const due = payrollDue(more as any, buildLedger(more as any));
    expect(due.map(d => [d.netDue, d.statDue])).toEqual([[0, 850], [4000, 1850]]);
  });

  it('spreads amounts to the cent', () => {
    expect(spread(100, [1, 1, 1])).toEqual([33.34, 33.33, 33.33]);
  });

  it('splits payroll into director / employee pay, employee and employer CPF, and SDL', () => {
    const split = payrollSplit([
      { employee_id: 1, gross_pay: 3000, deductions_json: [{ componentCode: 'DEDUCTION_CPF', amount: 600 }, { componentCode: 'DEDUCTION_CDAC', amount: 1 }],
        employer_json: [{ componentCode: 'COST_CPF_EMPLOYER', amount: 510 }, { componentCode: 'COST_SDL_EMPLOYER', amount: 7.5 }] },
      { employee_id: 2, gross_pay: 2000, deductions_json: [{ componentCode: 'DEDUCTION_CPF', amount: 399 }],
        employer_json: [{ componentCode: 'COST_CPF_EMPLOYER', amount: 332.5 }] },
    ], new Set([2]));
    expect(split).toEqual({ directorGross: 2000, eeCpf: 999, erCpf: 842.5, sdl: 7.5 });
    const run = { ...input.payroll[0], split };
    const lines = payrollLines(run as any, accounts);
    const on = (code: string) => lines.filter(l => l.account_id === id(code)).reduce((t, l) => t + l.debit - l.credit, 0);
    expect([on('6000'), on('6005'), on('6010'), on('6015')]).toEqual([3000, 2000, 842.5, 7]); // SDL 7.50 → 7 (cents dropped)
    expect([on('2200'), on('2210'), on('2220'), on('2230')]).toEqual([-4000, -999, -842.5, -8]);
    const due = payrollDue({ accounts, payroll: [run] } as any, buildLedger({ ...input, payroll: [run] } as any));
    expect(due[0].statDue).toBe(1849.5);
    expect(splitByShare(1849.5, due[0].statParts).map(p => p.amount)).toEqual([999, 842.5, 8]);
  });

  it('upgrades an older chart of accounts once', () => {
    const old = accounts.filter(a => !['2220', '2230', '6005', '6008', '6015', '6810', '6820', '6830'].includes(a.code))
      .map(a => (a.code === '2210' ? { ...a, name: 'CPF and statutory payable' } : a.code === '6000' ? { ...a, name: 'My wages' } : a));
    const up = chartUpgrade(old);
    expect(up.add.map(a => a.code)).toEqual(['2220', '2230', '6005', '6008', '6015', '6810', '6820', '6830']);
    expect(up.rename).toEqual([{ id: id('2210'), name: "Employee's CPF contribution payable" }]);
    expect(chartUpgrade(accounts)).toEqual({ add: [], rename: [] });
  });
});
