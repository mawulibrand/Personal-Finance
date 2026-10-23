CREATE TYPE "GoalContributionType" AS ENUM ('CONTRIBUTION', 'WITHDRAWAL');

CREATE TABLE "FinancialGoal" (
  "id" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "currencyCode" CHAR(3) NOT NULL DEFAULT 'GHS',
  "targetAmount" NUMERIC(19, 4) NOT NULL,
  "targetDate" DATE,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "FinancialGoal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialGoal_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
  CONSTRAINT "FinancialGoal_description_check" CHECK ("description" IS NULL OR char_length(btrim("description")) <= 500),
  CONSTRAINT "FinancialGoal_targetAmount_check" CHECK ("targetAmount" > 0),
  CONSTRAINT "FinancialGoal_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "FinancialSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FinancialGoal_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "FinancialGoal_spaceId_createdAt_idx" ON "FinancialGoal"("spaceId", "createdAt");

CREATE TABLE "GoalContribution" (
  "id" UUID NOT NULL,
  "goalId" UUID NOT NULL,
  "type" "GoalContributionType" NOT NULL,
  "amount" NUMERIC(19, 4) NOT NULL,
  "contributionDate" DATE NOT NULL,
  "description" TEXT,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoalContribution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GoalContribution_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "GoalContribution_description_check" CHECK ("description" IS NULL OR char_length(btrim("description")) <= 240),
  CONSTRAINT "GoalContribution_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "FinancialGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GoalContribution_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "GoalContribution_goalId_contributionDate_createdAt_idx" ON "GoalContribution"("goalId", "contributionDate", "createdAt");
