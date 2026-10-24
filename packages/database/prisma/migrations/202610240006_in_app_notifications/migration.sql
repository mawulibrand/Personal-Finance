CREATE TYPE "InAppNotificationType" AS ENUM ('PAYDAY_ROUTINE_READY');

CREATE TABLE "InAppNotification" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "spaceId" UUID,
  "type" "InAppNotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "readAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InAppNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InAppNotification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InAppNotification_spaceId_fkey"
    FOREIGN KEY ("spaceId") REFERENCES "FinancialSpace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "InAppNotification_dedupeKey_key"
  ON "InAppNotification"("dedupeKey");
CREATE INDEX "InAppNotification_userId_readAt_createdAt_idx"
  ON "InAppNotification"("userId", "readAt", "createdAt");
CREATE INDEX "InAppNotification_spaceId_createdAt_idx"
  ON "InAppNotification"("spaceId", "createdAt");
