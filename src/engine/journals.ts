import type { EmployeePayrollResult, JournalEntry, JournalLine } from './types';

export interface JournalConfig {
  salaryExpenseAccount: string;
  salaryExpenseName: string;
  employerCostExpenseAccount: string;
  employerCostExpenseName: string;
  salaryPayableAccount: string;
  salaryPayableName: string;
  statutoryPayableAccount: string;
  statutoryPayableName: string;
  taxPayableAccount: string;
  taxPayableName: string;
  cashAccount: string;
  cashName: string;
}

export const DEFAULT_JOURNAL_CONFIG: JournalConfig = {
  salaryExpenseAccount: '5000',
  salaryExpenseName: 'Salaries & Wages',
  employerCostExpenseAccount: '5010',
  employerCostExpenseName: 'Employer Contributions',
  salaryPayableAccount: '2100',
  salaryPayableName: 'Accrued Salaries',
  statutoryPayableAccount: '2110',
  statutoryPayableName: 'Statutory Payable',
  taxPayableAccount: '2120',
  taxPayableName: 'Tax Withholding Payable',
  cashAccount: '1100',
  cashName: 'Cash at Bank',
};

function makeLine(
  accountCode: string, accountName: string,
  debit: number, credit: number, description: string,
): JournalLine {
  return { accountCode, accountName, debit, credit, description };
}

export function generatePayrollJournals(
  result: EmployeePayrollResult,
  periodLabel: string,
  config: JournalConfig = DEFAULT_JOURNAL_CONFIG,
): JournalEntry[] {
  const entries: JournalEntry[] = [];
  const empRef = `${result.name} (${periodLabel})`;

  // === Entry 1: Salary Accrual ===
  // Dr Salary Expense (gross pay)
  // Cr Statutory Payable (employee deductions)
  // Cr Tax Payable
  // Cr Salary Payable (net pay)
  const accrualLines: JournalLine[] = [];
  const employeeDeductions = result.statutoryContributions.reduce((s, sc) => s + sc.employeeTotal, 0);
  const taxWithheld = result.tax.taxWithheld;

  // Debit salary expense
  accrualLines.push(makeLine(
    config.salaryExpenseAccount, config.salaryExpenseName,
    result.grossPay, 0,
    `Gross salary: ${result.grossPay}`,
  ));

  // Credit statutory payable
  if (employeeDeductions > 0) {
    accrualLines.push(makeLine(
      config.statutoryPayableAccount, config.statutoryPayableName,
      0, employeeDeductions,
      `Employee statutory: ${employeeDeductions}`,
    ));
  }

  // Credit tax payable
  if (taxWithheld > 0) {
    accrualLines.push(makeLine(
      config.taxPayableAccount, config.taxPayableName,
      0, taxWithheld,
      `Tax withholding: ${taxWithheld}`,
    ));
  }

  // Credit salary payable (net pay)
  if (result.netPay > 0) {
    accrualLines.push(makeLine(
      config.salaryPayableAccount, config.salaryPayableName,
      0, result.netPay,
      `Net pay: ${result.netPay}`,
    ));
  }

  const accrualDebit = accrualLines.reduce((s, l) => s + l.debit, 0);
  const accrualCredit = accrualLines.reduce((s, l) => s + l.credit, 0);

  entries.push({
    entryId: `SAL_${periodLabel}_${result.employeeId}`,
    entryDate: '', description: `Salary accrual: ${empRef}`,
    lines: accrualLines,
    totalDebit: accrualDebit, totalCredit: accrualCredit,
  });

  // === Entry 2: Employer Contributions ===
  // Dr Employer Cost Expense (employer portion of each scheme)
  // Cr Statutory Payable (liability for employer portion)
  const employerLines: JournalLine[] = [];
  let empCostTotal = 0;

  for (const sc of result.statutoryContributions) {
    if (sc.employerTotal > 0) {
      employerLines.push(makeLine(
        config.employerCostExpenseAccount, config.employerCostExpenseName,
        sc.employerTotal, 0,
        `${sc.schemeName} employer: ${sc.employerTotal}`,
      ));
      employerLines.push(makeLine(
        config.statutoryPayableAccount, config.statutoryPayableName,
        0, sc.employerTotal,
        `Payable: ${sc.schemeName} employer`,
      ));
      empCostTotal += sc.employerTotal;
    }
  }

  if (empCostTotal > 0) {
    entries.push({
      entryId: `EMPCOST_${periodLabel}_${result.employeeId}`,
      entryDate: '', description: `Employer contributions: ${empRef}`,
      lines: employerLines,
      totalDebit: empCostTotal, totalCredit: empCostTotal,
    });
  }

  // === Entry 3: Payment (Salary Payable → Cash) ===
  if (result.netPay > 0) {
    entries.push({
      entryId: `PAY_${periodLabel}_${result.employeeId}`,
      entryDate: '', description: `Salary payment: ${empRef}`,
      lines: [
        makeLine(config.salaryPayableAccount, config.salaryPayableName,
          result.netPay, 0, `Payment of net salary`),
        makeLine(config.cashAccount, config.cashName,
          0, result.netPay, `Cash paid`),
      ],
      totalDebit: result.netPay, totalCredit: result.netPay,
    });
  }

  return entries;
}
