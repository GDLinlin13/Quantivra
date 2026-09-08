import dayjs from 'dayjs';

export interface ProrationInput {
  joinDate?: string;
  leaveDate?: string;
  periodStart: string;
  periodEnd: string;
  unpaidLeaveDays?: number;
}

export function calculateWorkingDaysInPeriod(
  periodStart: string,
  periodEnd: string,
): number {
  const start = dayjs(periodStart);
  const end = dayjs(periodEnd);
  return end.diff(start, 'day') + 1;
}

export function calculateEmployeeWorkingDays(input: ProrationInput): number {
  const periodStart = dayjs(input.periodStart);
  const periodEnd = dayjs(input.periodEnd);
  const totalDays = periodEnd.diff(periodStart, 'day') + 1;

  let effectiveStart = periodStart;
  let effectiveEnd = periodEnd;

  if (input.joinDate) {
    const join = dayjs(input.joinDate);
    if (join.isAfter(periodStart)) {
      effectiveStart = join;
    }
  }

  if (input.leaveDate) {
    const leave = dayjs(input.leaveDate);
    if (leave.isBefore(periodEnd)) {
      effectiveEnd = leave;
    }
  }

  let workingDays = effectiveEnd.diff(effectiveStart, 'day') + 1;

  if (workingDays < 0) workingDays = 0;

  if (input.unpaidLeaveDays) {
    workingDays = Math.max(0, workingDays - input.unpaidLeaveDays);
  }

  return workingDays;
}

export function calculateProrationFactor(input: ProrationInput): number {
  const totalDays = calculateWorkingDaysInPeriod(input.periodStart, input.periodEnd);
  if (totalDays === 0) return 0;
  const employeeDays = calculateEmployeeWorkingDays(input);
  return employeeDays / totalDays;
}

export function prorateAmount(amount: number, factor: number): number {
  return amount * factor;
}
