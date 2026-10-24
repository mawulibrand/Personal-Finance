CREATE TYPE "HouseholdOwnershipEntityType" AS ENUM ('SAVINGS_ACCOUNT', 'INVESTMENT', 'LIABILITY');

CREATE TABLE "HouseholdOwnershipAllocation" (
  "id" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "entityType" "HouseholdOwnershipEntityType" NOT NULL,
  "entityId" UUID NOT NULL,
  "ownerUserId" UUID NOT NULL,
  "percentage" NUMERIC(7,4) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "HouseholdOwnershipAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HouseholdOwnershipAllocation_percentage_check" CHECK ("percentage" > 0 AND "percentage" <= 100),
  CONSTRAINT "HouseholdOwnershipAllocation_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "FinancialSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HouseholdOwnershipAllocation_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "HouseholdOwnershipAllocation_spaceId_entityType_entityId_ownerUserId_key"
  ON "HouseholdOwnershipAllocation"("spaceId", "entityType", "entityId", "ownerUserId");
CREATE INDEX "HouseholdOwnershipAllocation_spaceId_entityType_entityId_idx"
  ON "HouseholdOwnershipAllocation"("spaceId", "entityType", "entityId");
CREATE INDEX "HouseholdOwnershipAllocation_ownerUserId_idx"
  ON "HouseholdOwnershipAllocation"("ownerUserId");
