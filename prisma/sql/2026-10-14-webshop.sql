-- Webshop-pakket (oktober 2026). ALLEEN TOEVOEGEN en veilig om vaker te draaien:
-- alles staat in "bestaat al? dan overslaan"-vorm. Wordt bij elke productie-
-- build op Vercel uitgevoerd door scripts/db-migrate.mjs.

ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'WEBSHOP';

DO $$ BEGIN
  CREATE TYPE "WebshopPlatform" AS ENUM ('SHOPIFY', 'WOOCOMMERCE', 'BOLCOM', 'CSV');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WebshopStatus" AS ENUM ('ACTIVE', 'ERROR', 'DISCONNECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WebshopOrderKind" AS ENUM ('SALE', 'REFUND');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "WebshopConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "WebshopPlatform" NOT NULL,
    "name" TEXT NOT NULL,
    "shopUrl" TEXT,
    "credentials" TEXT,
    "status" "WebshopStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WebshopConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WebshopOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "orderNumber" TEXT,
    "kind" "WebshopOrderKind" NOT NULL DEFAULT 'SALE',
    "orderDate" TIMESTAMP(3) NOT NULL,
    "country" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "totalGross" DECIMAL(12,2) NOT NULL,
    "vatAmount" DECIMAL(12,2) NOT NULL,
    "shippingGross" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fees" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isBusiness" BOOLEAN NOT NULL DEFAULT false,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebshopOrder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WebshopConnection_userId_idx" ON "WebshopConnection"("userId");
CREATE INDEX IF NOT EXISTS "WebshopOrder_userId_orderDate_idx" ON "WebshopOrder"("userId", "orderDate");
CREATE UNIQUE INDEX IF NOT EXISTS "WebshopOrder_connectionId_externalId_key" ON "WebshopOrder"("connectionId", "externalId");

DO $$ BEGIN
  ALTER TABLE "WebshopConnection" ADD CONSTRAINT "WebshopConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WebshopOrder" ADD CONSTRAINT "WebshopOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WebshopOrder" ADD CONSTRAINT "WebshopOrder_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WebshopConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Niet bereikbaar via de publieke Supabase-API; Prisma (tabeleigenaar) merkt hier niets van.
ALTER TABLE "WebshopConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebshopOrder" ENABLE ROW LEVEL SECURITY;
