CREATE TYPE "SharedFinancialEntityType" AS ENUM ('SAVINGS_ACCOUNT', 'INVESTMENT', 'LIABILITY', 'GOAL');
CREATE TYPE "FinancialSharePermission" AS ENUM ('BALANCE_ONLY', 'SUMMARY', 'FULL_READ');

CREATE TABLE "HouseholdInvitation" (
  "id" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "invitedEmail" VARCHAR(254) NOT NULL,
  "role" "Role" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "acceptedAt" TIMESTAMPTZ,
  "revokedAt" TIMESTAMPTZ,
  "invitedBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HouseholdInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HouseholdInvitation_role_check" CHECK ("role" IN ('ADMIN', 'MEMBER', 'VIEWER')),
  CONSTRAINT "HouseholdInvitation_email_check" CHECK ("invitedEmail" = lower("invitedEmail")),
  CONSTRAINT "HouseholdInvitation_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "FinancialSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HouseholdInvitation_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "HouseholdInvitation_tokenHash_key" ON "HouseholdInvitation"("tokenHash");
CREATE UNIQUE INDEX "HouseholdInvitation_active_spaceId_invitedEmail_key"
  ON "HouseholdInvitation"("spaceId", "invitedEmail")
  WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;
CREATE INDEX "HouseholdInvitation_spaceId_invitedEmail_createdAt_idx" ON "HouseholdInvitation"("spaceId", "invitedEmail", "createdAt");
CREATE INDEX "HouseholdInvitation_expiresAt_acceptedAt_revokedAt_idx" ON "HouseholdInvitation"("expiresAt", "acceptedAt", "revokedAt");

CREATE TABLE "Dependant" (
  "id" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "relationship" TEXT NOT NULL,
  "dateOfBirth" DATE,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "Dependant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Dependant_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
  CONSTRAINT "Dependant_relationship_check" CHECK (char_length(btrim("relationship")) BETWEEN 1 AND 60),
  CONSTRAINT "Dependant_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "FinancialSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Dependant_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Dependant_spaceId_name_idx" ON "Dependant"("spaceId", "name");

CREATE TABLE "SharedFinancialItem" (
  "id" UUID NOT NULL,
  "sourceSpaceId" UUID NOT NULL,
  "entityType" "SharedFinancialEntityType" NOT NULL,
  "entityId" UUID NOT NULL,
  "targetHouseholdSpaceId" UUID NOT NULL,
  "sharedBy" UUID NOT NULL,
  "permission" "FinancialSharePermission" NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMPTZ,
  CONSTRAINT "SharedFinancialItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SharedFinancialItem_not_same_space_check" CHECK ("sourceSpaceId" <> "targetHouseholdSpaceId"),
  CONSTRAINT "SharedFinancialItem_sourceSpaceId_fkey" FOREIGN KEY ("sourceSpaceId") REFERENCES "FinancialSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SharedFinancialItem_targetHouseholdSpaceId_fkey" FOREIGN KEY ("targetHouseholdSpaceId") REFERENCES "FinancialSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SharedFinancialItem_sharedBy_fkey" FOREIGN KEY ("sharedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SharedFinancialItem_sourceSpaceId_entityType_entityId_targetHouseholdSpaceId_key"
  ON "SharedFinancialItem"("sourceSpaceId", "entityType", "entityId", "targetHouseholdSpaceId");
CREATE INDEX "SharedFinancialItem_targetHouseholdSpaceId_revokedAt_idx" ON "SharedFinancialItem"("targetHouseholdSpaceId", "revokedAt");
