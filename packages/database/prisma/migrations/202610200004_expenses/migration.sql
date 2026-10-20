CREATE TABLE "ExpenseRecord" (
  "id" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  "amount" NUMERIC(19, 4) NOT NULL,
  "currencyCode" CHAR(3) NOT NULL,
  "spentAt" DATE NOT NULL,
  "description" TEXT,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "ExpenseRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpenseRecord_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "ExpenseRecord_currencyCode_check" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  CONSTRAINT "ExpenseRecord_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "FinancialSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExpenseRecord_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExpenseRecord_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ExpenseRecord_spaceId_spentAt_idx" ON "ExpenseRecord"("spaceId", "spentAt");
CREATE INDEX "ExpenseRecord_categoryId_spentAt_idx" ON "ExpenseRecord"("categoryId", "spentAt");
