ALTER TABLE "IncomeRecord" DROP CONSTRAINT "IncomeRecord_period_check";

ALTER TABLE "IncomeRecord" ADD CONSTRAINT "IncomeRecord_period_check" CHECK (
  ("periodYear" IS NULL AND "periodMonth" IS NULL) OR
  ("periodYear" IS NOT NULL AND "periodMonth" IS NOT NULL AND "periodMonth" BETWEEN 1 AND 12)
);
