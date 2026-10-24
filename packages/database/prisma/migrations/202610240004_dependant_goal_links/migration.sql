ALTER TABLE "FinancialGoal"
  ADD COLUMN "dependantId" UUID,
  ADD CONSTRAINT "FinancialGoal_dependantId_fkey"
    FOREIGN KEY ("dependantId") REFERENCES "Dependant"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "FinancialGoal_dependantId_idx" ON "FinancialGoal"("dependantId");
