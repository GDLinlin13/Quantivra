// Fixed assets: straight-line depreciation worked out month by month from the register (nothing is stored per month).

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface FixedAsset {
  id: number; company_id: number; code: string | null; name: string; category: string | null;
  purchase_date: string; cost: number; residual_value: number; life_months: number;
  /** the first month depreciated: the first day of that month */
  start_month: string;
  asset_account_id: number | null; expense_account_id: number | null; accumulated_account_id: number | null;
  status: 'active' | 'disposed'; disposed_date: string | null; disposal_account_id: number | null; notes: string | null;
  /** bought on a loan: the system works out the interest from these */
  book_purchase?: boolean; deposit_account_id?: number | null;
  loan_amount?: number; loan_term_months?: number | null; monthly_repayment?: number | null; loan_start_month?: string | null;
  loan_account_id?: number | null; interest_account_id?: number | null;
}

export interface DepreciationMonth { month: string; date: string; amount: number }

const ym = (d: string) => d.slice(0, 7);
const monthEnd = (month: string) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const addMonths = (month: string, n: number) => { const [y, m] = month.split('-').map(Number); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };

/**
 * The depreciation of one asset, a row per completed month up to `upTo` (a date): (cost - residual value) / life, the
 * last month taking what is left so the cents add up. A disposed asset stops the month before it was disposed of.
 */
export function depreciationSchedule(a: Pick<FixedAsset, 'cost' | 'residual_value' | 'life_months' | 'start_month' | 'status' | 'disposed_date'>, upTo: string): DepreciationMonth[] {
  const base = r2(Math.max(0, Number(a.cost) - Number(a.residual_value)));
  const n = Math.max(1, Math.floor(Number(a.life_months) || 1));
  const first = ym(a.start_month);
  const stopBefore = a.status === 'disposed' && a.disposed_date ? ym(a.disposed_date) : null;
  const out: DepreciationMonth[] = [];
  let done = 0;
  for (let i = 0; i < n; i++) {
    const month = addMonths(first, i);
    const end = monthEnd(month);
    if (end > upTo) break;                       // booked at the end of each month, once it is over
    if (stopBefore && month >= stopBefore) break;
    const amount = i === n - 1 ? r2(base - done) : r2(base / n);
    done = r2(done + amount);
    if (amount > 0) out.push({ month, date: end, amount });
  }
  return out;
}

/** What has been depreciated so far, and what the asset is worth in the books. */
export function bookValue(a: Parameters<typeof depreciationSchedule>[0], upTo: string): { accumulated: number; netBookValue: number } {
  const accumulated = r2(depreciationSchedule(a, upTo).reduce((t, m) => t + m.amount, 0));
  return { accumulated, netBookValue: r2(Number(a.cost) - accumulated) };
}

export interface LoanMonth { n: number; month: string; date: string; payment: number; interest: number; principal: number; balance: number }

/**
 * A loan paid off in equal monthly repayments (interest on what is still owed): the yearly rate it implies, and the
 * schedule month by month. The last repayment takes whatever is left, so the cents add up.
 */
export function loanSchedule(loan: number, termMonths: number, repayment: number, firstMonth: string): { annualRate: number; rows: LoanMonth[]; totalInterest: number } {
  const L = Number(loan) || 0, n = Math.floor(Number(termMonths) || 0), P = Number(repayment) || 0;
  if (!(L > 0) || n < 1 || !(P > 0)) return { annualRate: 0, rows: [], totalInterest: 0 };
  // the monthly rate that makes n repayments of P pay off L (no interest when P x n is no more than the loan)
  let lo = 0, hi = 1, rate = 0;
  if (P * n > L + 0.005) {
    const owed = (r: number) => (r === 0 ? L - P * n : L * Math.pow(1 + r, n) - P * ((Math.pow(1 + r, n) - 1) / r));
    for (let i = 0; i < 80; i++) { rate = (lo + hi) / 2; if (owed(rate) > 0) hi = rate; else lo = rate; }
  }
  const rows: LoanMonth[] = [];
  let bal = r2(L), total = 0;
  const first = firstMonth.slice(0, 7);
  for (let i = 0; i < n && bal > 0.004; i++) {
    const month = addMonths(first, i);
    const interest = r2(bal * rate);
    const last = i === n - 1;
    const payment = last ? r2(bal + interest) : Math.min(P, r2(bal + interest));
    const principal = r2(payment - interest);
    bal = r2(bal - principal);
    total = r2(total + interest);
    rows.push({ n: i + 1, month, date: monthEnd(month), payment, interest, principal, balance: Math.max(0, bal) });
  }
  return { annualRate: Math.round(rate * 12 * 100000) / 1000, rows, totalInterest: total };
}
