CREATE TABLE "Budget" (
  "id" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "Budget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Budget_month_check" CHECK ("month" BETWEEN 1 AND 12),
  CONSTRAINT "Budget_year_check" CHECK ("year" BETWEEN 2000 AND 9999),
  CONSTRAINT "Budget_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "FinancialSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Budget_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Budget_spaceId_year_month_key" ON "Budget"("spaceId", "year", "month");
CREATE INDEX "Budget_spaceId_year_month_idx" ON "Budget"("spaceId", "year", "month");

CREATE TABLE "BudgetAllocation" (
  "id" UUID NOT NULL,
  "budgetId" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  "limitAmount" NUMERIC(19, 4) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "BudgetAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BudgetAllocation_limitAmount_check" CHECK ("limitAmount" > 0),
  CONSTRAINT "BudgetAllocation_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BudgetAllocation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BudgetAllocation_budgetId_categoryId_key" ON "BudgetAllocation"("budgetId", "categoryId");
CREATE INDEX "BudgetAllocation_categoryId_idx" ON "BudgetAllocation"("categoryId");
