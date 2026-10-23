CREATE TYPE "FinancialRuleOperator" AS ENUM ('LESS_THAN', 'GREATER_THAN');
CREATE TYPE "FinancialRuleSeverity" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "FinancialReviewTrigger" AS ENUM ('MONTHLY', 'ON_DEMAND');
CREATE TYPE "StrategyDecision" AS ENUM ('PROPOSED', 'SELECTED', 'MODIFIED', 'REJECTED');
CREATE TYPE "RecommendationFeedback" AS ENUM ('HELPFUL', 'NOT_HELPFUL', 'NOT_APPLICABLE');

CREATE TABLE "FinancialRule" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "market" VARCHAR(3) NOT NULL DEFAULT '*',
  "metric" TEXT NOT NULL,
  "operator" "FinancialRuleOperator" NOT NULL,
  "threshold" NUMERIC(19, 4) NOT NULL,
  "severity" "FinancialRuleSeverity" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "FinancialRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialRule_code_market_key" UNIQUE ("code", "market"),
  CONSTRAINT "FinancialRule_metric_check" CHECK ("metric" IN ('savingsRatePercent', 'monthlyCashFlow', 'emergencyFundMonths')),
  CONSTRAINT "FinancialRule_market_check" CHECK ("market" = '*' OR "market" ~ '^[A-Z]{3}$')
);
CREATE INDEX "FinancialRule_market_enabled_idx" ON "FinancialRule"("market", "enabled");

CREATE TABLE "FinancialProfileSnapshot" (
  "id" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "createdBy" UUID NOT NULL,
  "trigger" "FinancialReviewTrigger" NOT NULL,
  "monthlyPeriod" TEXT,
  "currencyCode" CHAR(3) NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "profile" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialProfileSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialProfileSnapshot_monthlyPeriod_check" CHECK (
    ("trigger" = 'MONTHLY' AND "monthlyPeriod" ~ '^\d{4}-\d{2}$')
    OR ("trigger" = 'ON_DEMAND' AND "monthlyPeriod" IS NULL)
  ),
  CONSTRAINT "FinancialProfileSnapshot_currencyCode_check" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  CONSTRAINT "FinancialProfileSnapshot_period_check" CHECK ("periodStart" < "periodEnd"),
  CONSTRAINT "FinancialProfileSnapshot_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "FinancialSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FinancialProfileSnapshot_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FinancialProfileSnapshot_spaceId_monthlyPeriod_key" ON "FinancialProfileSnapshot"("spaceId", "monthlyPeriod");
CREATE INDEX "FinancialProfileSnapshot_spaceId_createdAt_idx" ON "FinancialProfileSnapshot"("spaceId", "createdAt");

CREATE TABLE "RecommendationStrategy" (
  "id" UUID NOT NULL,
  "snapshotId" UUID NOT NULL,
  "ruleCode" TEXT NOT NULL,
  "severity" "FinancialRuleSeverity" NOT NULL,
  "title" TEXT NOT NULL,
  "explanation" TEXT NOT NULL,
  "observedValue" NUMERIC(19, 4) NOT NULL,
  "threshold" NUMERIC(19, 4) NOT NULL,
  "decision" "StrategyDecision" NOT NULL DEFAULT 'PROPOSED',
  "feedback" "RecommendationFeedback",
  "userNote" TEXT,
  "respondedBy" UUID,
  "respondedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecommendationStrategy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecommendationStrategy_userNote_check" CHECK ("userNote" IS NULL OR char_length("userNote") <= 500),
  CONSTRAINT "RecommendationStrategy_snapshotId_ruleCode_key" UNIQUE ("snapshotId", "ruleCode"),
  CONSTRAINT "RecommendationStrategy_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "FinancialProfileSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecommendationStrategy_respondedBy_fkey" FOREIGN KEY ("respondedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "RecommendationStrategy_snapshotId_severity_idx" ON "RecommendationStrategy"("snapshotId", "severity");

INSERT INTO "FinancialRule" ("id", "code", "market", "metric", "operator", "threshold", "severity", "updatedAt") VALUES
  ('e7000000-0000-4000-8000-000000000001', 'SAVINGS_RATE_BELOW_TARGET', '*', 'savingsRatePercent', 'LESS_THAN', 10, 'MEDIUM', CURRENT_TIMESTAMP),
  ('e7000000-0000-4000-8000-000000000002', 'EXPENSES_EXCEED_INCOME', '*', 'monthlyCashFlow', 'LESS_THAN', 0, 'HIGH', CURRENT_TIMESTAMP),
  ('e7000000-0000-4000-8000-000000000003', 'EMERGENCY_FUND_BELOW_TARGET', '*', 'emergencyFundMonths', 'LESS_THAN', 3, 'LOW', CURRENT_TIMESTAMP);
