import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRecurringDate } from './recurring.js';

test('monthly recurring dates keep their original day after short months', () => {
  assert.equal(nextRecurringDate('2026-01-31', 'MONTHLY', 31), '2026-02-28');
  assert.equal(nextRecurringDate('2026-02-28', 'MONTHLY', 31), '2026-03-31');
});

test('weekly and yearly schedules advance by their configured calendar intervals', () => {
  assert.equal(nextRecurringDate('2026-10-20', 'BIWEEKLY', 20), '2026-11-03');
  assert.equal(nextRecurringDate('2024-02-29', 'YEARLY', 29, 2), '2025-02-28');
});
