import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFinancialRules, type FinancialProfile, type FinancialRule } from './financial-insights.js';

const profile: FinancialProfile = {
  currencyCode: 'GHS',
  periodStart: '2026-07-01',
  periodEnd: '2026-10-01',
  monthlyIncome: 1000,
  monthlyExpenses: 950,
  savingsRatePercent: 5,
  monthlyCashFlow: 50,
  savingsBalance: 500,
  emergencyFundMonths: 0.5263,
  netWorthByCurrency: [{ currencyCode: 'GHS', netWorth: 200 }],
  dataFreshness: 'UP_TO_DATE',
  limitations: [],
};
const rules: FinancialRule[] = [
  { code: 'SAVINGS_RATE_BELOW_TARGET', metric: 'savingsRatePercent', operator: 'LESS_THAN', threshold: 10, severity: 'MEDIUM', enabled: true },
  { code: 'EXPENSES_EXCEED_INCOME', metric: 'monthlyCashFlow', operator: 'LESS_THAN', threshold: 0, severity: 'HIGH', enabled: true },
  { code: 'EMERGENCY_FUND_BELOW_TARGET', metric: 'emergencyFundMonths', operator: 'LESS_THAN', threshold: 3, severity: 'LOW', enabled: true },
];

test('financial rules create only supported, ordered observations', () => {
  assert.deepEqual(evaluateFinancialRules(profile, rules).map(strategy => strategy.code), [
    'SAVINGS_RATE_BELOW_TARGET',
    'EMERGENCY_FUND_BELOW_TARGET',
  ]);
});

test('rules do not invent metrics when profile data is insufficient', () => {
  const incomplete = { ...profile, monthlyIncome: null, savingsRatePercent: null, monthlyCashFlow: null };
  assert.deepEqual(evaluateFinancialRules(incomplete, rules).map(strategy => strategy.code), ['EMERGENCY_FUND_BELOW_TARGET']);
});

test('disabled rules do not generate strategies', () => {
  assert.deepEqual(evaluateFinancialRules(profile, rules.map(rule => ({ ...rule, enabled: false }))), []);
});
