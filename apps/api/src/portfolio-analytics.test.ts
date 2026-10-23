import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePortfolioAnalytics, calculateXirr, type PortfolioHoldingInput } from './portfolio-analytics.js';

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
function holding(overrides: Partial<PortfolioHoldingInput> = {}): PortfolioHoldingInput {
  return {
    id: 'investment-1',
    name: 'Index fund',
    type: 'MUTUAL_FUND',
    currencyCode: 'GHS',
    costBasis: '1000',
    startDate: date('2025-01-01'),
    maturityDate: null,
    annualInterestRate: null,
    interestMethod: null,
    compoundingFrequency: null,
    actualMaturityValue: null,
    status: 'ACTIVE',
    closedAt: null,
    transactions: [{ type: 'BUY', amount: '1000', quantity: '10', transactionDate: date('2025-01-01') }],
    valuations: [
      { valuationDate: date('2025-01-01'), marketValue: '1000', unitPrice: null, method: 'MANUAL' },
      { valuationDate: date('2026-01-01'), marketValue: '1200', unitPrice: null, method: 'MANUAL' },
    ],
    ...overrides,
  };
}

test('XIRR converges to a known annualized return for a one-year cash flow', () => {
  const result = calculateXirr([
    { date: date('2025-01-01'), amount: -1000 },
    { date: date('2026-01-01'), amount: 1100 },
  ]);
  assert.ok(result !== null);
  assert.ok(Math.abs(result - 0.1) < 0.0001);
});

test('portfolio analytics calculates absolute return, return percentage, XIRR, TWR and historical comparison', () => {
  const result = calculatePortfolioAnalytics([holding()], date('2026-01-01')).currencies[0];
  assert.ok(result);
  assert.equal(result.totalValue, 1200);
  assert.equal(result.absoluteReturn, 200);
  assert.equal(result.returnPercent, 20);
  assert.equal(result.xirr.status, 'READY');
  assert.ok(Math.abs(result.xirr.value! - 20) < 0.01);
  assert.equal(result.twr.status, 'READY');
  assert.ok(Math.abs(result.twr.value! - 20) < 0.01);
  assert.deepEqual(result.historicalComparison, {
    status: 'READY', from: '2025-01-01', to: '2026-01-01', change: 200, percentage: 20,
  });
});

test('portfolio allocation, concentration and diversification use valued holding shares', () => {
  const second = holding({
    id: 'investment-2',
    name: 'Government bond',
    type: 'BOND',
    costBasis: '1000',
    transactions: [{ type: 'BUY', amount: '1000', quantity: null, transactionDate: date('2025-01-01') }],
    valuations: [{ valuationDate: date('2026-01-01'), marketValue: '800', unitPrice: null, method: 'MANUAL' }],
  });
  const result = calculatePortfolioAnalytics([holding(), second], date('2026-01-01')).currencies[0];
  assert.ok(result);
  assert.equal(result.totalValue, 2000);
  assert.deepEqual(result.allocation.map(item => [item.type, item.value, item.percentage]), [
    ['MUTUAL_FUND', 1200, 60],
    ['BOND', 800, 40],
  ]);
  assert.deepEqual(result.concentration.map(item => [item.name, item.percentage]), [
    ['Index fund', 60],
    ['Government bond', 40],
  ]);
  assert.equal(result.diversification.hhi, 0.52);
  assert.equal(result.diversification.effectiveHoldingCount, 1.92);
});

test('portfolio analytics keeps currencies separate and returns explicit insufficient-data states', () => {
  const usd = holding({
    id: 'investment-usd',
    currencyCode: 'USD',
    costBasis: '250',
    transactions: [],
    valuations: [],
  });
  const results = calculatePortfolioAnalytics([usd], date('2026-01-01')).currencies;
  assert.equal(results.length, 1);
  const result = results[0];
  assert.ok(result);
  assert.equal(result.currencyCode, 'USD');
  assert.equal(result.status, 'NOT_ENOUGH_DATA');
  assert.equal(result.xirr.status, 'NOT_ENOUGH_DATA');
  assert.equal(result.twr.status, 'NOT_ENOUGH_DATA');
  assert.equal(result.volatility.status, 'NOT_ENOUGH_DATA');
});

test('periods containing external capital flows are excluded from time-weighted returns', () => {
  const item = holding({
    transactions: [
      { type: 'BUY', amount: '1000', quantity: '10', transactionDate: date('2025-01-01') },
      { type: 'CONTRIBUTION', amount: '100', quantity: '1', transactionDate: date('2025-06-01') },
    ],
    valuations: [
      { valuationDate: date('2025-01-01'), marketValue: '1000', unitPrice: null, method: 'MANUAL' },
      { valuationDate: date('2025-12-31'), marketValue: '1200', unitPrice: null, method: 'MANUAL' },
    ],
  });
  const result = calculatePortfolioAnalytics([item], date('2025-12-31')).currencies[0];
  assert.ok(result);
  assert.equal(result.twr.status, 'NOT_ENOUGH_DATA');
  assert.equal(result.twr.value, null);
});

test('same-day valuations use the most recently recorded value', () => {
  const item = holding({
    transactions: [],
    valuations: [
      { valuationDate: date('2026-01-01'), createdAt: date('2026-01-01'), marketValue: '100', unitPrice: null, method: 'MANUAL' },
      { valuationDate: date('2026-01-01'), createdAt: new Date('2026-01-01T12:00:00.000Z'), marketValue: '125', unitPrice: null, method: 'MANUAL' },
    ],
  });
  const result = calculatePortfolioAnalytics([item], date('2026-01-01')).currencies[0];
  assert.ok(result);
  assert.equal(result.totalValue, 125);
});

test('fixed deposits contribute contractual maturity exposure and investment income remains separate', () => {
  const deposit = holding({
    id: 'deposit',
    name: 'Six-month deposit',
    type: 'FIXED_DEPOSIT',
    costBasis: '1000',
    maturityDate: date('2026-03-01'),
    annualInterestRate: '12',
    interestMethod: 'SIMPLE',
    compoundingFrequency: 1,
    transactions: [
      { type: 'CONTRIBUTION', amount: '1000', quantity: null, transactionDate: date('2025-09-01') },
      { type: 'INTEREST', amount: '5', quantity: null, transactionDate: date('2025-10-01') },
    ],
    valuations: [],
  });
  const result = calculatePortfolioAnalytics([deposit], date('2026-01-01')).currencies[0];
  assert.ok(result);
  assert.equal(result.contributions.invested, 1000);
  assert.equal(result.contributions.investmentIncome, 5);
  assert.ok(Number(result.maturityExposure.find(item => item.bucket === '31-90 days')?.value) > 0);
  assert.equal(result.explanations.xirr.formula.includes('bounded bisection'), true);
  assert.ok(result.explanations.xirr.dataFreshness.includes('No saved market valuations'));
});
