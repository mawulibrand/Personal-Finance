ALTER TABLE "FinancialPlan"
ADD COLUMN "recommendationStrategyId" UUID;

CREATE UNIQUE INDEX "FinancialPlan_recommendationStrategyId_key"
ON "FinancialPlan"("recommendationStrategyId");

ALTER TABLE "FinancialPlan"
ADD CONSTRAINT "FinancialPlan_recommendationStrategyId_fkey"
FOREIGN KEY ("recommendationStrategyId")
REFERENCES "RecommendationStrategy"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
