CREATE TYPE "SavingsTransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

CREATE TABLE "SavingsAccount" (
  "id" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "provider" TEXT,
  "currencyCode" CHAR(3) NOT NULL DEFAULT 'GHS',
  "openingBalance" NUMERIC(19, 4) NOT NULL DEFAULT 0,
  "openedAt" DATE NOT NULL,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "SavingsAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SavingsAccount_openingBalance_check" CHECK ("openingBalance" >= 0),
  CONSTRAINT "SavingsAccount_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
  CONSTRAINT "SavingsAccount_provider_check" CHECK ("provider" IS NULL OR char_length(btrim("provider")) <= 100),
  CONSTRAINT "SavingsAccount_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "FinancialSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SavingsAccount_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "SavingsAccount_spaceId_createdAt_idx" ON "SavingsAccount"("spaceId", "createdAt");

CREATE TABLE "SavingsTransaction" (
  "id" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "type" "SavingsTransactionType" NOT NULL,
  "amount" NUMERIC(19, 4) NOT NULL,
  "transactionDate" DATE NOT NULL,
  "description" TEXT,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavingsTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SavingsTransaction_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "SavingsTransaction_description_check" CHECK ("description" IS NULL OR char_length(btrim("description")) <= 240),
  CONSTRAINT "SavingsTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SavingsAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SavingsTransaction_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "SavingsTransaction_accountId_transactionDate_createdAt_idx" ON "SavingsTransaction"("accountId", "transactionDate", "createdAt");
