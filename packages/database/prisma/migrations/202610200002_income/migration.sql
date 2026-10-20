CREATE TYPE "IncomeSourceType" AS ENUM (
  'SALARY',
  'SELF_EMPLOYMENT',
  'BUSINESS',
  'INVESTMENT',
  'GIFT',
  'OTHER'
);

CREATE TYPE "PaydayAdjustmentRule" AS ENUM (
  'PREVIOUS_WORKING_DAY',
  'NEXT_WORKING_DAY',
  'NO_ADJUSTMENT'
);

CREATE TABLE "IncomeSource" (
  "id" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "type" "IncomeSourceType" NOT NULL,
  "expectedAmount" NUMERIC(19, 4),
  "currencyCode" CHAR(3) NOT NULL DEFAULT 'GHS',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "IncomeSource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IncomeSource_expectedAmount_check" CHECK ("expectedAmount" IS NULL OR "expectedAmount" > 0),
  CONSTRAINT "IncomeSource_currencyCode_check" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  CONSTRAINT "IncomeSource_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "FinancialSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "IncomeSource_spaceId_isActive_createdAt_idx" ON "IncomeSource"("spaceId", "isActive", "createdAt");

CREATE TABLE "SalaryExpectedDate" (
  "id" UUID NOT NULL,
  "sourceId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "dayOfMonth" INTEGER NOT NULL,
  "adjustmentRule" "PaydayAdjustmentRule" NOT NULL,
  CONSTRAINT "SalaryExpectedDate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalaryExpectedDate_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "SalaryExpectedDate_dayOfMonth_check" CHECK ("dayOfMonth" BETWEEN 1 AND 31),
  CONSTRAINT "SalaryExpectedDate_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IncomeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SalaryExpectedDate_sourceId_sequence_key" ON "SalaryExpectedDate"("sourceId", "sequence");
CREATE INDEX "SalaryExpectedDate_sourceId_dayOfMonth_idx" ON "SalaryExpectedDate"("sourceId", "dayOfMonth");

CREATE TABLE "IncomeRecord" (
  "id" UUID NOT NULL,
  "sourceId" UUID NOT NULL,
  "amount" NUMERIC(19, 4) NOT NULL,
  "receivedDate" DATE NOT NULL,
  "periodYear" INTEGER,
  "periodMonth" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncomeRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IncomeRecord_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "IncomeRecord_period_check" CHECK (
    ("periodYear" IS NULL AND "periodMonth" IS NULL) OR
    ("periodYear" IS NOT NULL AND "periodMonth" BETWEEN 1 AND 12)
  ),
  CONSTRAINT "IncomeRecord_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IncomeSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "IncomeRecord_sourceId_periodYear_periodMonth_key" ON "IncomeRecord"("sourceId", "periodYear", "periodMonth");
CREATE INDEX "IncomeRecord_sourceId_receivedDate_idx" ON "IncomeRecord"("sourceId", "receivedDate");
