import { describe, it, expect } from 'vitest';
import { rowsForCurrency, statementCurrencies } from '../bankCurrency';
import { parseStatementText, rowsToLines, type PdfRow } from '../bankPdf';

// a consolidated statement laid out like a Hong Kong digital bank's, as rows of pieces (made-up figures)
const row = (...cells: [string, number][]): PdfRow => cells.map(([s, x]) => ({ s, x, w: s.length * 5 }));
const za: PdfRow[] = [
  row(['結單日期 Statement Date：', 500]), row(['31 Aug 2025', 520]),
  row(['戶口結餘摘要 Account Balance Summary', 10]),
  row(['123456789-001', 10], ['CNY 0.00', 500]), row(['123456789-001', 10], ['HKD 1,000.01', 500]), row(['123456789-001', 10], ['USD 2,993.50', 500]),
  row(['港元活期儲蓄 HKD Savings Account', 10]),
  row(['戶口號碼 Account No. 123456789-001 EXAMPLE TRADING LIMITED', 10]),
  row(['Date', 10], ['Transaction Details', 80], ['Withdrawal', 300], ['Deposit', 380], ['Balance', 460]),
  row(['31 Jul 2025', 10], ['Opening balance 上期結餘', 80], ['1,000.00', 460]),
  row(['01 Aug 2025', 10], ['INTEREST 利息', 80], ['0.01', 380], ['1,000.01', 460]),
  row(['外幣活期儲蓄 Foreign Currency Savings Account', 10]),
  row(['戶口號碼 Account No. 123456789-001 EXAMPLE TRADING LIMITED', 10]),
  row(['Date', 10], ['Transaction Details', 80], ['Currency', 220], ['Withdrawal', 300], ['Deposit', 380], ['Balance', 460]),
  row(['31 Jul 2025', 10], ['Opening balance 上期結餘', 80], ['CNY', 220], ['0.00', 460]),
  row(['31 Jul 2025', 10], ['Opening balance 上期結餘', 80], ['USD', 220], ['0.00', 460]),
  row(['07 Aug 2025', 10], ['AUTO CREDIT 匯款存入', 80], ['USD', 220], ['5,000.00', 380], ['5,000.00', 460]),
  row(['Example Bank Limited', 10]),
  row(['07 Aug 2025', 10], ['SERVICE FEE 存入服務收費', 80], ['USD', 220], ['6.50', 300], ['4,993.50', 460]),
  row(['08 Aug 2025', 10], ['TRANSFER 轉賬', 80], ['USD', 220], ['2,000.00', 300], ['2,993.50', 460]),
];

describe('consolidated statements', () => {
  it('knows which currencies it holds', () => {
    expect(statementCurrencies(za).sort()).toEqual(['CNY', 'HKD', 'USD']);
  });
  it('the HKD account reads only the HKD part', () => {
    const lines = parseStatementText(rowsToLines(rowsForCurrency(za, 'HKD'))).lines;
    expect(lines.map(l => [l.txn_date, l.amount, l.description])).toEqual([['2025-08-01', 0.01, 'INTEREST 利息']]);
  });
  it('the USD account reads only USD lines, with USD taken out of the text', () => {
    const lines = parseStatementText(rowsToLines(rowsForCurrency(za, 'USD'))).lines;
    expect(lines.map(l => [l.txn_date, l.amount])).toEqual([['2025-08-07', 5000], ['2025-08-07', -6.5], ['2025-08-08', -2000]]);
    expect(lines[0].description).toBe('AUTO CREDIT 匯款存入');
  });
  it('a CNY account with no CNY transactions gets none', () => {
    expect(parseStatementText(rowsToLines(rowsForCurrency(za, 'CNY'))).lines).toEqual([]);
  });
  it('a one-currency statement is read whole', () => {
    const one = [row(['01 Aug 2025', 10], ['FEE', 80], ['5.00', 300], ['95.00', 460])];
    expect(rowsForCurrency(one, 'SGD')).toHaveLength(1);
  });
});
