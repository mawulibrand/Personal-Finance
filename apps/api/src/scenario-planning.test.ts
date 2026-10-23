import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateScenarioProjection } from './scenario-planning.js';

test('projection keeps nominal and inflation-adjusted values distinct', () => {
  const result = calculateScenarioProjection({
    startingCapital: 100,
    recurringContribution: 10,
    contributionFrequency: 'MONTHLY',
    expectedAnnualReturn: 0,
    durationYears: 1,
    inflationRate: 10,
    annualContributionGrowth: 0,
  });
  assert.deepEqual(result, [{
    year: 1,
    nominalValue: 220,
    inflationAdjustedValue: 200,
    recurringContributions: 120,
  }]);
});

test('annual contribution growth applies after each completed plan year', () => {
  const result = calculateScenarioProjection({
    startingCapital: 0,
    recurringContribution: 100,
    contributionFrequency: 'MONTHLY',
    expectedAnnualReturn: 0,
    durationYears: 2,
    inflationRate: 0,
    annualContributionGrowth: 10,
  });
  assert.equal(result[0]?.recurringContributions, 1200);
  assert.equal(result[1]?.recurringContributions, 2520);
  assert.equal(result[1]?.nominalValue, 2520);
});

test('return compounds at each selected contribution interval', () => {
  const result = calculateScenarioProjection({
    startingCapital: 1000,
    recurringContribution: 0.0001,
    contributionFrequency: 'MONTHLY',
    expectedAnnualReturn: 12,
    durationYears: 1,
    inflationRate: 0,
    annualContributionGrowth: 0,
  });
  assert.ok(Math.abs((result[0]?.nominalValue ?? 0) - 1120) < 0.01);
});

test('zero return leaves contributions and starting capital unchanged', () => {
  const result = calculateScenarioProjection({
    startingCapital: 25,
    recurringContribution: 10,
    contributionFrequency: 'YEARLY',
    expectedAnnualReturn: 0,
    durationYears: 3,
    inflationRate: 0,
    annualContributionGrowth: 0,
  });
  assert.deepEqual(result.map(point => point.nominalValue), [35, 45, 55]);
});

test('invalid assumptions and non-finite projections are rejected', () => {
  assert.throws(() => calculateScenarioProjection({
    startingCapital: -1,
    recurringContribution: 10,
    contributionFrequency: 'MONTHLY',
    expectedAnnualReturn: 0,
    durationYears: 1,
    inflationRate: 0,
    annualContributionGrowth: 0,
  }), RangeError);
  assert.throws(() => calculateScenarioProjection({
    startingCapital: 1e308,
    recurringContribution: 10,
    contributionFrequency: 'MONTHLY',
    expectedAnnualReturn: 100,
    durationYears: 50,
    inflationRate: 0,
    annualContributionGrowth: 0,
  }), RangeError);
});
