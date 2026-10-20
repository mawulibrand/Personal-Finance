CREATE TYPE "RecurringFlow" AS ENUM ('INCOME', 'EXPENSE');
CREATE TYPE "RecurrenceFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'YEARLY');

CREATE TABLE "RecurringRecord" (
  "id" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "flow" "RecurringFlow" NOT NULL,
  "amount" NUMERIC(19, 4) NOT NULL,
  "currencyCode" CHAR(3) NOT NULL,
  "frequency" "RecurrenceFrequency" NOT NULL,
  "startDate" DATE NOT NULL,
  "nextDueDate" DATE NOT NULL,
  "endDate" DATE,
  "dayOfMonth" INTEGER NOT NULL,
  "monthOfYear" INTEGER,
  "categoryId" UUID,
  "sourceId" UUID,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "RecurringRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecurringRecord_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "RecurringRecord_currencyCode_check" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  CONSTRAINT "RecurringRecord_dayOfMonth_check" CHECK ("dayOfMonth" BETWEEN 1 AND 31),
  CONSTRAINT "RecurringRecord_monthOfYear_check" CHECK ("monthOfYear" IS NULL OR "monthOfYear" BETWEEN 1 AND 12),
  CONSTRAINT "RecurringRecord_date_check" CHECK ("endDate" IS NULL OR "endDate" >= "startDate"),
  CONSTRAINT "RecurringRecord_target_check" CHECK (
    ("flow" = 'EXPENSE' AND "categoryId" IS NOT NULL AND "sourceId" IS NULL) OR
    ("flow" = 'INCOME' AND "sourceId" IS NOT NULL AND "categoryId" IS NULL)
  ),
  CONSTRAINT "RecurringRecord_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "FinancialSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecurringRecord_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RecurringRecord_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IncomeSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RecurringRecord_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "RecurringRecord_spaceId_isActive_nextDueDate_idx" ON "RecurringRecord"("spaceId", "isActive", "nextDueDate");

CREATE TABLE "RecurringOccurrence" (
  "id" UUID NOT NULL,
  "recurringRecordId" UUID NOT NULL,
  "dueDate" DATE NOT NULL,
  "actualDate" DATE NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecurringOccurrence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecurringOccurrence_recurringRecordId_fkey" FOREIGN KEY ("recurringRecordId") REFERENCES "RecurringRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RecurringOccurrence_recurringRecordId_dueDate_key" ON "RecurringOccurrence"("recurringRecordId", "dueDate");
CREATE INDEX "RecurringOccurrence_actualDate_idx" ON "RecurringOccurrence"("actualDate");

ALTER TABLE "IncomeRecord" ADD COLUMN "recurringOccurrenceId" UUID;
ALTER TABLE "IncomeRecord" ADD CONSTRAINT "IncomeRecord_recurringOccurrenceId_fkey" FOREIGN KEY ("recurringOccurrenceId") REFERENCES "RecurringOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "IncomeRecord_recurringOccurrenceId_key" ON "IncomeRecord"("recurringOccurrenceId");

ALTER TABLE "ExpenseRecord" ADD COLUMN "recurringOccurrenceId" UUID;
ALTER TABLE "ExpenseRecord" ADD CONSTRAINT "ExpenseRecord_recurringOccurrenceId_fkey" FOREIGN KEY ("recurringOccurrenceId") REFERENCES "RecurringOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "ExpenseRecord_recurringOccurrenceId_key" ON "ExpenseRecord"("recurringOccurrenceId");
