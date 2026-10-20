CREATE TYPE "CategoryType" AS ENUM ('INCOME', 'EXPENSE');

CREATE TABLE "Category" (
  "id" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "type" "CategoryType" NOT NULL,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Category_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "FinancialSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Category_spaceId_type_normalizedName_key" ON "Category"("spaceId", "type", "normalizedName");
CREATE INDEX "Category_spaceId_type_isArchived_idx" ON "Category"("spaceId", "type", "isArchived");

INSERT INTO "Category" ("id", "spaceId", "name", "normalizedName", "type", "isSystem")
SELECT gen_random_uuid(), space."id", seed.name, seed.normalized_name, seed.type::"CategoryType", true
FROM "FinancialSpace" AS space
CROSS JOIN (VALUES
  ('Salary', 'salary', 'INCOME'),
  ('Self-employment', 'self-employment', 'INCOME'),
  ('Business income', 'business income', 'INCOME'),
  ('Investment income', 'investment income', 'INCOME'),
  ('Gifts and support', 'gifts and support', 'INCOME'),
  ('Other income', 'other income', 'INCOME'),
  ('Housing', 'housing', 'EXPENSE'),
  ('Food and groceries', 'food and groceries', 'EXPENSE'),
  ('Transport', 'transport', 'EXPENSE'),
  ('Utilities', 'utilities', 'EXPENSE'),
  ('Communication', 'communication', 'EXPENSE'),
  ('Healthcare', 'healthcare', 'EXPENSE'),
  ('Education', 'education', 'EXPENSE'),
  ('Debt payments', 'debt payments', 'EXPENSE'),
  ('Family support', 'family support', 'EXPENSE'),
  ('Personal care', 'personal care', 'EXPENSE'),
  ('Clothing', 'clothing', 'EXPENSE'),
  ('Entertainment', 'entertainment', 'EXPENSE'),
  ('Giving', 'giving', 'EXPENSE'),
  ('Other expense', 'other expense', 'EXPENSE')
) AS seed(name, normalized_name, type);
