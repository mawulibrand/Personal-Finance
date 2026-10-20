export type PaydayAdjustmentRule = 'PREVIOUS_WORKING_DAY' | 'NEXT_WORKING_DAY' | 'NO_ADJUSTMENT';
export type ExpectedPayday = { dayOfMonth: number; adjustmentRule: PaydayAdjustmentRule };
export type SalaryPeriodStatus = 'UPCOMING' | 'AWAITING_CONFIRMATION' | 'OVERDUE' | 'RECEIVED';

function dateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function expectedPaydayDates(year: number, month: number, expected: ExpectedPayday[]) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dates = expected.map(item => {
    const day = Math.min(item.dayOfMonth, lastDay);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (item.adjustmentRule === 'PREVIOUS_WORKING_DAY') {
      while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() - 1);
    } else if (item.adjustmentRule === 'NEXT_WORKING_DAY') {
      while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
    }
    return dateString(date);
  });
  return [...new Set(dates)].sort();
}

export function salaryPeriodStatus(today: string, expectedDates: string[], received: boolean): SalaryPeriodStatus {
  if (received) return 'RECEIVED';
  const first = expectedDates[0];
  const last = expectedDates[expectedDates.length - 1];
  if (!first || !last || today < first) return 'UPCOMING';
  if (today > last) return 'OVERDUE';
  return 'AWAITING_CONFIRMATION';
}
