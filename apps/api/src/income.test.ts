import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedPaydayDates, salaryPeriodStatus } from './income.js';

test('monthly salary dates clamp to the end of shorter months and adjust weekends', () => {
  assert.deepEqual(expectedPaydayDates(2025, 2, [
    { dayOfMonth: 31, adjustmentRule: 'NO_ADJUSTMENT' },
  ]), ['2025-02-28']);
  assert.deepEqual(expectedPaydayDates(2026, 10, [
    { dayOfMonth: 25, adjustmentRule: 'PREVIOUS_WORKING_DAY' },
    { dayOfMonth: 27, adjustmentRule: 'NO_ADJUSTMENT' },
  ]), ['2026-10-23', '2026-10-27']);
  assert.deepEqual(expectedPaydayDates(2026, 10, [
    { dayOfMonth: 25, adjustmentRule: 'NEXT_WORKING_DAY' },
  ]), ['2026-10-26']);
});

test('salary stays unoverdue until the final possible payday has passed', () => {
  const dates = ['2026-10-23', '2026-10-27'];
  assert.equal(salaryPeriodStatus('2026-10-22', dates, false), 'UPCOMING');
  assert.equal(salaryPeriodStatus('2026-10-23', dates, false), 'AWAITING_CONFIRMATION');
  assert.equal(salaryPeriodStatus('2026-10-27', dates, false), 'AWAITING_CONFIRMATION');
  assert.equal(salaryPeriodStatus('2026-10-28', dates, false), 'OVERDUE');
  assert.equal(salaryPeriodStatus('2026-10-28', dates, true), 'RECEIVED');
});
