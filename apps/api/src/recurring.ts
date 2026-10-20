export type RecurrenceFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY';

function dateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthLength(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function nextRecurringDate(current: string, frequency: RecurrenceFrequency, dayOfMonth: number, monthOfYear?: number | null) {
  const year = Number(current.slice(0, 4));
  const month = Number(current.slice(5, 7));
  const day = Number(current.slice(8, 10));
  if (frequency === 'WEEKLY' || frequency === 'BIWEEKLY') {
    const due = new Date(Date.UTC(year, month - 1, day + (frequency === 'WEEKLY' ? 7 : 14)));
    return dateString(due);
  }
  if (frequency === 'MONTHLY') {
    const targetMonth = month;
    const targetYear = year + Math.floor(targetMonth / 12);
    const targetMonthIndex = targetMonth % 12;
    const targetDay = Math.min(dayOfMonth, monthLength(targetYear, targetMonthIndex));
    return dateString(new Date(Date.UTC(targetYear, targetMonthIndex, targetDay)));
  }
  const targetYear = year + 1;
  const targetMonthIndex = (monthOfYear ?? month) - 1;
  const targetDay = Math.min(dayOfMonth, monthLength(targetYear, targetMonthIndex));
  return dateString(new Date(Date.UTC(targetYear, targetMonthIndex, targetDay)));
}
