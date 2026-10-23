export type ContributionFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY';

export type ScenarioAssumptions = {
  startingCapital: number;
  recurringContribution: number;
  contributionFrequency: ContributionFrequency;
  expectedAnnualReturn: number;
  durationYears: number;
  inflationRate: number;
  annualContributionGrowth: number;
};

export type ScenarioProjectionPoint = {
  year: number;
  nominalValue: number;
  inflationAdjustedValue: number;
  recurringContributions: number;
};

const periodsPerYear: Record<ContributionFrequency, number> = {
  WEEKLY: 52,
  BIWEEKLY: 26,
  MONTHLY: 12,
  YEARLY: 1,
};

export function calculateScenarioProjection(assumptions: ScenarioAssumptions): ScenarioProjectionPoint[] {
  const {
    startingCapital,
    recurringContribution,
    contributionFrequency,
    expectedAnnualReturn,
    durationYears,
    inflationRate,
    annualContributionGrowth,
  } = assumptions;
  const periods = periodsPerYear[contributionFrequency];
  if (!Number.isFinite(startingCapital) || startingCapital < 0
    || !Number.isFinite(recurringContribution) || recurringContribution <= 0
    || !Number.isFinite(expectedAnnualReturn) || expectedAnnualReturn < -100 || expectedAnnualReturn > 100
    || !Number.isInteger(durationYears) || durationYears < 1 || durationYears > 50
    || !Number.isFinite(inflationRate) || inflationRate < 0 || inflationRate > 100
    || !Number.isFinite(annualContributionGrowth) || annualContributionGrowth < -100 || annualContributionGrowth > 100) {
    throw new RangeError('Scenario assumptions are outside the supported range.');
  }

  const annualReturn = expectedAnnualReturn / 100;
  const annualInflation = inflationRate / 100;
  const annualGrowth = annualContributionGrowth / 100;
  const periodicReturn = (1 + annualReturn) ** (1 / periods) - 1;
  const projections: ScenarioProjectionPoint[] = [];
  let value = startingCapital;
  let recurringContributions = 0;

  for (let period = 1; period <= durationYears * periods; period++) {
    value = value * (1 + periodicReturn)
      + recurringContribution * (1 + annualGrowth) ** Math.floor((period - 1) / periods);
    recurringContributions += recurringContribution * (1 + annualGrowth) ** Math.floor((period - 1) / periods);

    if (period % periods === 0) {
      const year = period / periods;
      const inflationAdjustedValue = value / (1 + annualInflation) ** year;
      if (!Number.isFinite(value) || !Number.isFinite(inflationAdjustedValue) || !Number.isFinite(recurringContributions)) {
        throw new RangeError('Scenario projection exceeds the supported calculation range.');
      }
      projections.push({
        year,
        nominalValue: Number(value.toFixed(4)),
        inflationAdjustedValue: Number(inflationAdjustedValue.toFixed(4)),
        recurringContributions: Number(recurringContributions.toFixed(4)),
      });
    }
  }
  return projections;
}
