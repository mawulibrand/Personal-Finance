CREATE TYPE "PaydayActionType" AS ENUM ('SAVINGS_DEPOSIT', 'GOAL_CONTRIBUTION', 'LIABILITY_PAYMENT');
CREATE TYPE "PaydayActionStatus" AS ENUM ('DUE', 'PARTIALLY_COMPLETED', 'COMPLETED', 'SKIPPED');

CREATE TABLE "PaydayRoutineAction" (
  "id" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "sourceId" UUID NOT NULL,
  "type" "PaydayActionType" NOT NULL,
  "name" TEXT NOT NULL,
  "plannedAmount" NUMERIC(19, 4) NOT NULL,
  "savingsAccountId" UUID,
  "goalId" UUID,
  "liabilityId" UUID,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "PaydayRoutineAction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaydayRoutineAction_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
  CONSTRAINT "PaydayRoutineAction_plannedAmount_check" CHECK ("plannedAmount" > 0),
  CONSTRAINT "PaydayRoutineAction_target_check" CHECK (
    ("type" = 'SAVINGS_DEPOSIT' AND "savingsAccountId" IS NOT NULL AND "goalId" IS NULL AND "liabilityId" IS NULL) OR
    ("type" = 'GOAL_CONTRIBUTION' AND "savingsAccountId" IS NULL AND "goalId" IS NOT NULL AND "liabilityId" IS NULL) OR
    ("type" = 'LIABILITY_PAYMENT' AND "savingsAccountId" IS NULL AND "goalId" IS NULL AND "liabilityId" IS NOT NULL)
  ),
  CONSTRAINT "PaydayRoutineAction_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "FinancialSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PaydayRoutineAction_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IncomeSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaydayRoutineAction_savingsAccountId_fkey" FOREIGN KEY ("savingsAccountId") REFERENCES "SavingsAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaydayRoutineAction_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "FinancialGoal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaydayRoutineAction_liabilityId_fkey" FOREIGN KEY ("liabilityId") REFERENCES "Liability"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaydayRoutineAction_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "PaydayRoutineAction_spaceId_isActive_createdAt_idx" ON "PaydayRoutineAction"("spaceId", "isActive", "createdAt");

CREATE TABLE "PaydayRoutineEntry" (
  "id" UUID NOT NULL,
  "incomeRecordId" UUID NOT NULL,
  "actionId" UUID NOT NULL,
  "plannedAmount" NUMERIC(19, 4) NOT NULL,
  "completedAmount" NUMERIC(19, 4) NOT NULL DEFAULT 0,
  "status" "PaydayActionStatus" NOT NULL DEFAULT 'DUE',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "PaydayRoutineEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaydayRoutineEntry_incomeRecordId_actionId_key" UNIQUE ("incomeRecordId", "actionId"),
  CONSTRAINT "PaydayRoutineEntry_amount_check" CHECK ("plannedAmount" > 0 AND "completedAmount" >= 0 AND "completedAmount" <= "plannedAmount"),
  CONSTRAINT "PaydayRoutineEntry_incomeRecordId_fkey" FOREIGN KEY ("incomeRecordId") REFERENCES "IncomeRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PaydayRoutineEntry_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "PaydayRoutineAction"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "PaydayRoutineEntry_status_createdAt_idx" ON "PaydayRoutineEntry"("status", "createdAt");
