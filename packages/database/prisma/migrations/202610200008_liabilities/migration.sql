CREATE TYPE "LiabilityType" AS ENUM ('CREDIT_CARD', 'PERSONAL_LOAN', 'MORTGAGE', 'STUDENT_LOAN', 'AUTO_LOAN', 'BUY_NOW_PAY_LATER', 'OTHER');
CREATE TYPE "LiabilityStatus" AS ENUM ('ACTIVE', 'PAID_OFF');

CREATE TABLE "Liability" (
  "id" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "type" "LiabilityType" NOT NULL,
  "name" TEXT NOT NULL,
  "provider" TEXT,
  "currencyCode" CHAR(3) NOT NULL DEFAULT 'GHS',
  "originalAmount" NUMERIC(19, 4) NOT NULL,
  "openingBalance" NUMERIC(19, 4) NOT NULL,
  "annualInterestRate" NUMERIC(7, 4) NOT NULL DEFAULT 0,
  "monthlyPayment" NUMERIC(19, 4),
  "startDate" DATE NOT NULL,
  "expectedPayoffDate" DATE,
  "status" "LiabilityStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "Liability_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Liability_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
  CONSTRAINT "Liability_provider_check" CHECK ("provider" IS NULL OR char_length(btrim("provider")) <= 100),
  CONSTRAINT "Liability_originalAmount_check" CHECK ("originalAmount" > 0),
  CONSTRAINT "Liability_openingBalance_check" CHECK ("openingBalance" >= 0),
  CONSTRAINT "Liability_annualInterestRate_check" CHECK ("annualInterestRate" BETWEEN 0 AND 100),
  CONSTRAINT "Liability_monthlyPayment_check" CHECK ("monthlyPayment" IS NULL OR "monthlyPayment" > 0),
  CONSTRAINT "Liability_expectedPayoffDate_check" CHECK ("expectedPayoffDate" IS NULL OR "expectedPayoffDate" >= "startDate"),
  CONSTRAINT "Liability_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "FinancialSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Liability_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Liability_spaceId_status_createdAt_idx" ON "Liability"("spaceId", "status", "createdAt");

CREATE TABLE "LiabilityPayment" (
  "id" UUID NOT NULL,
  "liabilityId" UUID NOT NULL,
  "amount" NUMERIC(19, 4) NOT NULL,
  "principalAmount" NUMERIC(19, 4) NOT NULL,
  "paidAt" DATE NOT NULL,
  "description" TEXT,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LiabilityPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LiabilityPayment_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "LiabilityPayment_principalAmount_check" CHECK ("principalAmount" >= 0 AND "principalAmount" <= "amount"),
  CONSTRAINT "LiabilityPayment_description_check" CHECK ("description" IS NULL OR char_length(btrim("description")) <= 240),
  CONSTRAINT "LiabilityPayment_liabilityId_fkey" FOREIGN KEY ("liabilityId") REFERENCES "Liability"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LiabilityPayment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "LiabilityPayment_liabilityId_paidAt_createdAt_idx" ON "LiabilityPayment"("liabilityId", "paidAt", "createdAt");
