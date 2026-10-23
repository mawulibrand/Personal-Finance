CREATE TABLE "NetWorthSnapshot" (
  "id" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "snapshotDate" DATE NOT NULL,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NetWorthSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NetWorthSnapshot_spaceId_snapshotDate_key" UNIQUE ("spaceId", "snapshotDate"),
  CONSTRAINT "NetWorthSnapshot_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "FinancialSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NetWorthSnapshot_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "NetWorthSnapshot_spaceId_snapshotDate_idx" ON "NetWorthSnapshot"("spaceId", "snapshotDate");

CREATE TABLE "NetWorthSnapshotCurrency" (
  "id" UUID NOT NULL,
  "snapshotId" UUID NOT NULL,
  "currencyCode" CHAR(3) NOT NULL,
  "assets" NUMERIC(19, 4) NOT NULL,
  "liabilities" NUMERIC(19, 4) NOT NULL,
  "netWorth" NUMERIC(19, 4) NOT NULL,
  CONSTRAINT "NetWorthSnapshotCurrency_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NetWorthSnapshotCurrency_snapshotId_currencyCode_key" UNIQUE ("snapshotId", "currencyCode"),
  CONSTRAINT "NetWorthSnapshotCurrency_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "NetWorthSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "NetWorthSnapshotCurrency_currencyCode_idx" ON "NetWorthSnapshotCurrency"("currencyCode");
