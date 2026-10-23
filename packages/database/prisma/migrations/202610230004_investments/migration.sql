CREATE TYPE "InvestmentType" AS ENUM ('STOCK', 'BOND', 'TREASURY_BILL', 'MUTUAL_FUND', 'ETF', 'FIXED_INCOME', 'REAL_ESTATE', 'BUSINESS_INVESTMENT', 'CRYPTOCURRENCY', 'FIXED_DEPOSIT', 'OTHER');
CREATE TYPE "InvestmentTransactionType" AS ENUM ('BUY', 'CONTRIBUTION', 'SELL', 'WITHDRAWAL', 'DIVIDEND', 'INTEREST', 'FEE', 'TAX');
CREATE TYPE "InvestmentValuationMethod" AS ENUM ('MANUAL', 'QUANTITY_X_PRICE', 'CONTRACTUAL');
CREATE TYPE "FixedDepositInterestMethod" AS ENUM ('SIMPLE', 'COMPOUND');
CREATE TYPE "InvestmentStatus" AS ENUM ('ACTIVE', 'CLOSED');

CREATE TABLE "InvestmentAccount" (
  "id" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "provider" TEXT,
  "currencyCode" CHAR(3) NOT NULL DEFAULT 'GHS',
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "InvestmentAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InvestmentAccount_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
  CONSTRAINT "InvestmentAccount_provider_check" CHECK ("provider" IS NULL OR char_length("provider") <= 100),
  CONSTRAINT "InvestmentAccount_currencyCode_check" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  CONSTRAINT "InvestmentAccount_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "FinancialSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InvestmentAccount_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "InvestmentAccount_spaceId_createdAt_idx" ON "InvestmentAccount"("spaceId", "createdAt");

CREATE TABLE "Investment" (
  "id" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "type" "InvestmentType" NOT NULL,
  "name" TEXT NOT NULL,
  "currencyCode" CHAR(3) NOT NULL,
  "costBasis" NUMERIC(19, 4) NOT NULL DEFAULT 0,
  "startDate" DATE NOT NULL,
  "maturityDate" DATE,
  "annualInterestRate" NUMERIC(7, 4),
  "interestMethod" "FixedDepositInterestMethod",
  "compoundingFrequency" INTEGER,
  "expectedMaturityValue" NUMERIC(19, 4),
  "actualMaturityValue" NUMERIC(19, 4),
  "status" "InvestmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "closedAt" DATE,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "Investment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Investment_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
  CONSTRAINT "Investment_currencyCode_check" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  CONSTRAINT "Investment_costBasis_check" CHECK ("costBasis" >= 0),
  CONSTRAINT "Investment_dates_check" CHECK ("maturityDate" IS NULL OR "maturityDate" >= "startDate"),
  CONSTRAINT "Investment_interestRate_check" CHECK ("annualInterestRate" IS NULL OR "annualInterestRate" BETWEEN 0 AND 100),
  CONSTRAINT "Investment_compoundingFrequency_check" CHECK ("compoundingFrequency" IS NULL OR "compoundingFrequency" IN (1, 2, 4, 12, 365)),
  CONSTRAINT "Investment_actualMaturityValue_check" CHECK ("actualMaturityValue" IS NULL OR ("type" = 'FIXED_DEPOSIT' AND "actualMaturityValue" > 0)),
  CONSTRAINT "Investment_fixedDeposit_terms_check" CHECK (
    ("type" = 'FIXED_DEPOSIT' AND "maturityDate" IS NOT NULL AND "annualInterestRate" IS NOT NULL AND "interestMethod" IS NOT NULL AND "compoundingFrequency" IS NOT NULL AND "expectedMaturityValue" IS NOT NULL AND "costBasis" > 0 AND ("interestMethod" = 'SIMPLE' OR "compoundingFrequency" > 0))
    OR
    ("type" <> 'FIXED_DEPOSIT' AND "annualInterestRate" IS NULL AND "interestMethod" IS NULL AND "compoundingFrequency" IS NULL AND "expectedMaturityValue" IS NULL AND "actualMaturityValue" IS NULL)
  ),
  CONSTRAINT "Investment_closedAt_check" CHECK (("status" = 'CLOSED' AND "closedAt" IS NOT NULL) OR ("status" = 'ACTIVE' AND "closedAt" IS NULL)),
  CONSTRAINT "Investment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InvestmentAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Investment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Investment_accountId_status_startDate_idx" ON "Investment"("accountId", "status", "startDate");
CREATE INDEX "Investment_type_maturityDate_idx" ON "Investment"("type", "maturityDate");

CREATE TABLE "InvestmentTransaction" (
  "id" UUID NOT NULL,
  "investmentId" UUID NOT NULL,
  "type" "InvestmentTransactionType" NOT NULL,
  "amount" NUMERIC(19, 4) NOT NULL,
  "quantity" NUMERIC(24, 8),
  "transactionDate" DATE NOT NULL,
  "description" TEXT,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvestmentTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InvestmentTransaction_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "InvestmentTransaction_quantity_check" CHECK ("quantity" IS NULL OR "quantity" > 0),
  CONSTRAINT "InvestmentTransaction_unit_type_check" CHECK ("type" NOT IN ('BUY', 'SELL') OR "quantity" IS NOT NULL),
  CONSTRAINT "InvestmentTransaction_description_check" CHECK ("description" IS NULL OR char_length("description") <= 240),
  CONSTRAINT "InvestmentTransaction_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InvestmentTransaction_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "InvestmentTransaction_investmentId_transactionDate_createdAt_idx" ON "InvestmentTransaction"("investmentId", "transactionDate", "createdAt");

CREATE TABLE "InvestmentValuation" (
  "id" UUID NOT NULL,
  "investmentId" UUID NOT NULL,
  "valuationDate" DATE NOT NULL,
  "marketValue" NUMERIC(19, 4) NOT NULL,
  "unitPrice" NUMERIC(19, 8),
  "currencyCode" CHAR(3) NOT NULL,
  "method" "InvestmentValuationMethod" NOT NULL,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvestmentValuation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InvestmentValuation_marketValue_check" CHECK ("marketValue" >= 0),
  CONSTRAINT "InvestmentValuation_unitPrice_check" CHECK ("unitPrice" IS NULL OR "unitPrice" > 0),
  CONSTRAINT "InvestmentValuation_currencyCode_check" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  CONSTRAINT "InvestmentValuation_method_check" CHECK (("method" = 'QUANTITY_X_PRICE' AND "unitPrice" IS NOT NULL) OR ("method" <> 'QUANTITY_X_PRICE' AND "unitPrice" IS NULL)),
  CONSTRAINT "InvestmentValuation_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InvestmentValuation_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "InvestmentValuation_investmentId_valuationDate_createdAt_idx" ON "InvestmentValuation"("investmentId", "valuationDate", "createdAt");
