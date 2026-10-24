CREATE TABLE "NotificationPreference" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "paydayInApp" BOOLEAN NOT NULL DEFAULT false,
  "paydayEmail" BOOLEAN NOT NULL DEFAULT false,
  "maturityInApp" BOOLEAN NOT NULL DEFAULT false,
  "maturityEmail" BOOLEAN NOT NULL DEFAULT false,
  "monthlyReviewInApp" BOOLEAN NOT NULL DEFAULT false,
  "monthlyReviewEmail" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "NotificationPreference_userId_key"
  ON "NotificationPreference"("userId");
