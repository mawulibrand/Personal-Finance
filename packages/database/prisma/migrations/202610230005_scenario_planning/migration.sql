CREATE TYPE "ScenarioContributionFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'YEARLY');

CREATE TABLE "Scenario" (
  "id" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "currencyCode" CHAR(3) NOT NULL,
  "startingCapital" NUMERIC(19, 4) NOT NULL,
  "recurringContribution" NUMERIC(19, 4) NOT NULL,
  "contributionFrequency" "ScenarioContributionFrequency" NOT NULL,
  "expectedAnnualReturn" NUMERIC(7, 4) NOT NULL,
  "durationYears" INTEGER NOT NULL,
  "inflationRate" NUMERIC(7, 4) NOT NULL DEFAULT 0,
  "annualContributionGrowth" NUMERIC(7, 4) NOT NULL DEFAULT 0,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Scenario_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
  CONSTRAINT "Scenario_currencyCode_check" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  CONSTRAINT "Scenario_startingCapital_check" CHECK ("startingCapital" >= 0),
  CONSTRAINT "Scenario_recurringContribution_check" CHECK ("recurringContribution" > 0),
  CONSTRAINT "Scenario_expectedAnnualReturn_check" CHECK ("expectedAnnualReturn" BETWEEN -100 AND 100),
  CONSTRAINT "Scenario_durationYears_check" CHECK ("durationYears" BETWEEN 1 AND 50),
  CONSTRAINT "Scenario_inflationRate_check" CHECK ("inflationRate" BETWEEN 0 AND 100),
  CONSTRAINT "Scenario_annualContributionGrowth_check" CHECK ("annualContributionGrowth" BETWEEN -100 AND 100),
  CONSTRAINT "Scenario_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "FinancialSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Scenario_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Scenario_spaceId_createdAt_idx" ON "Scenario"("spaceId", "createdAt");

CREATE TABLE "FinancialPlan" (
  "id" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "scenarioId" UUID NOT NULL,
  "goalId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "currencyCode" CHAR(3) NOT NULL,
  "startingCapital" NUMERIC(19, 4) NOT NULL,
  "recurringContribution" NUMERIC(19, 4) NOT NULL,
  "contributionFrequency" "ScenarioContributionFrequency" NOT NULL,
  "expectedAnnualReturn" NUMERIC(7, 4) NOT NULL,
  "durationYears" INTEGER NOT NULL,
  "inflationRate" NUMERIC(7, 4) NOT NULL,
  "annualContributionGrowth" NUMERIC(7, 4) NOT NULL,
  "projectedTarget" NUMERIC(19, 4) NOT NULL,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "FinancialPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialPlan_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
  CONSTRAINT "FinancialPlan_currencyCode_check" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  CONSTRAINT "FinancialPlan_startingCapital_check" CHECK ("startingCapital" >= 0),
  CONSTRAINT "FinancialPlan_recurringContribution_check" CHECK ("recurringContribution" > 0),
  CONSTRAINT "FinancialPlan_expectedAnnualReturn_check" CHECK ("expectedAnnualReturn" BETWEEN -100 AND 100),
  CONSTRAINT "FinancialPlan_durationYears_check" CHECK ("durationYears" BETWEEN 1 AND 50),
  CONSTRAINT "FinancialPlan_inflationRate_check" CHECK ("inflationRate" BETWEEN 0 AND 100),
  CONSTRAINT "FinancialPlan_annualContributionGrowth_check" CHECK ("annualContributionGrowth" BETWEEN -100 AND 100),
  CONSTRAINT "FinancialPlan_projectedTarget_check" CHECK ("projectedTarget" > 0),
  CONSTRAINT "FinancialPlan_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "FinancialSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FinancialPlan_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinancialPlan_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "FinancialGoal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinancialPlan_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FinancialPlan_scenarioId_key" ON "FinancialPlan"("scenarioId");
CREATE UNIQUE INDEX "FinancialPlan_goalId_key" ON "FinancialPlan"("goalId");
CREATE INDEX "FinancialPlan_spaceId_createdAt_idx" ON "FinancialPlan"("spaceId", "createdAt");
