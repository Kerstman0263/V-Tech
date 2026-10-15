-- E-commerce engine, stap 1 (oktober 2026). ONTWERP — staat bewust in
-- prisma/sql-pending/ en wordt dus NIET door scripts/db-migrate.mjs uitgevoerd.
-- Verplaats naar prisma/sql/ zodra de bijbehorende code klaar en getest is.
--
-- Regels, gelijk aan de bestaande migraties:
--  * alleen toevoegen, veilig om vaker te draaien ("bestaat al? overslaan");
--  * bedragen als DECIMAL(12,2), kostprijzen per stuk als DECIMAL(12,4);
--  * elke tabel heeft "userId" (account-scope) voor snelle filters;
--  * RLS aan zonder policies: de publieke Supabase-API ziet niets. Saldova
--    gebruikt NextAuth + Prisma op de server (tabeleigenaar), geen Supabase
--    Auth — policies op auth.uid() zouden dus nooit iets matchen. De
--    account-scope wordt in de server-code afgedwongen (where: { userId }).
--  * geen ruwe webhook-payloads opslaan: die bevatten namen en adressen.
--    We bewaren alleen id's en halen de order daarna zelf op bij het platform.

-- ---------------------------------------------------------------- enums ---

DO $$ BEGIN
  CREATE TYPE "WebshopBookingMode" AS ENUM ('PER_ORDER', 'DAILY', 'WEEKLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'SKIPPED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CostSource" AS ENUM ('MANUAL', 'SUPPLIER_IMPORT', 'PRODUCT_DEFAULT', 'NONE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PayoutProvider" AS ENUM ('SHOPIFY_PAYMENTS', 'MOLLIE', 'STRIPE', 'PAYPAL', 'BOLCOM', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PayoutStatus" AS ENUM ('SCHEDULED', 'IN_TRANSIT', 'PAID', 'FAILED', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PayoutLineKind" AS ENUM ('CHARGE', 'REFUND', 'FEE', 'CHARGEBACK', 'ADJUSTMENT', 'RESERVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AdPlatform" AS ENUM ('META', 'TIKTOK', 'GOOGLE', 'PINTEREST', 'SNAPCHAT', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Hoe de btw op een inkoop/advertentiefactuur in de aangifte terechtkomt.
DO $$ BEGIN
  CREATE TYPE "PurchaseVatTreatment" AS ENUM ('DOMESTIC', 'REVERSE_CHARGE_EU', 'REVERSE_CHARGE_NON_EU', 'IMPORT', 'NONE', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SettlementStatus" AS ENUM ('OPEN', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------- uitbreiding bestaande tabellen ---

ALTER TABLE "WebshopConnection" ADD COLUMN IF NOT EXISTS "bookingMode" "WebshopBookingMode" NOT NULL DEFAULT 'DAILY';
ALTER TABLE "WebshopConnection" ADD COLUMN IF NOT EXISTS "webhooksEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WebshopConnection" ADD COLUMN IF NOT EXISTS "lastWebhookAt" TIMESTAMP(3);

-- Netto-omzet en korting apart: nodig voor btw per land en de winstberekening.
ALTER TABLE "WebshopOrder" ADD COLUMN IF NOT EXISTS "discountGross" DECIMAL(12,2) NOT NULL DEFAULT 0;
-- Gecachete som van de kostprijs per regel (null = nog geen kostprijs bekend).
ALTER TABLE "WebshopOrder" ADD COLUMN IF NOT EXISTS "cogsAmount" DECIMAL(12,2);
ALTER TABLE "WebshopOrder" ADD COLUMN IF NOT EXISTS "paymentGateway" TEXT;
-- Bij een retour: het externe id van de oorspronkelijke verkoop.
ALTER TABLE "WebshopOrder" ADD COLUMN IF NOT EXISTS "parentExternalId" TEXT;
-- Laatste wijziging bij het platform: een oudere webhook mag een nieuwere stand nooit overschrijven.
ALTER TABLE "WebshopOrder" ADD COLUMN IF NOT EXISTS "externalUpdatedAt" TIMESTAMP(3);
ALTER TABLE "WebshopOrder" ADD COLUMN IF NOT EXISTS "payoutId" TEXT;
ALTER TABLE "WebshopOrder" ADD COLUMN IF NOT EXISTS "settlementId" TEXT;

-- ----------------------------------------------------------- nieuwe tabellen ---

-- Ontvangen webhooks (inbox). Uniek per koppeling + event-id = idempotent:
-- Shopify stuurt hetzelfde event soms meerdere keren.
CREATE TABLE IF NOT EXISTS "WebhookEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "resourceId" TEXT,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- Orderregels (order_items). Kostprijs wordt op het moment van de order
-- vastgelegd, zodat een latere prijswijziging oude winst niet verandert.
CREATE TABLE IF NOT EXISTS "WebshopOrderLine" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "sku" TEXT,
    "title" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceGross" DECIMAL(12,2) NOT NULL,
    "discountGross" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vatRate" DECIMAL(5,2),
    "vatAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(12,4),
    "costSource" "CostSource" NOT NULL DEFAULT 'NONE',
    CONSTRAINT "WebshopOrderLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WebshopOrderLine_quantity_check" CHECK ("quantity" > 0)
);

-- Kostprijs per SKU met geldigheidsdatum (AliExpress, CJ, Zendrop, eigen inkoop…).
CREATE TABLE IF NOT EXISTS "ProductCost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "unitCost" DECIMAL(12,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "supplier" TEXT,
    "validFrom" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductCost_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductCost_unitCost_check" CHECK ("unitCost" >= 0)
);

-- Uitbetalingen van de betaalprovider (payouts). net = gross - fees + adjustments.
CREATE TABLE IF NOT EXISTS "WebshopPayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "provider" "PayoutProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL,
    "payoutDate" DATE NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "grossAmount" DECIMAL(12,2) NOT NULL,
    "feeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "adjustmentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(12,2) NOT NULL,
    -- Gekoppelde bankbijschrijving; null = nog niet gevonden.
    "bankTransactionId" TEXT,
    "matchedAt" TIMESTAMP(3),
    "matchMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WebshopPayout_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WebshopPayout_net_check" CHECK ("netAmount" = "grossAmount" - "feeAmount" + "adjustmentAmount")
);

-- Regels binnen een uitbetaling: welke verkopen, retouren, kosten en chargebacks.
CREATE TABLE IF NOT EXISTS "WebshopPayoutLine" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "orderId" TEXT,
    "externalId" TEXT NOT NULL,
    "kind" "PayoutLineKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    CONSTRAINT "WebshopPayoutLine_pkey" PRIMARY KEY ("id")
);

-- Advertentiekosten per dag per account (ad_spend_logs).
CREATE TABLE IF NOT EXISTS "AdSpendEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "accountRef" TEXT NOT NULL DEFAULT '',
    "date" DATE NOT NULL,
    "spend" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    -- Bedrag in EUR tegen de koers van die dag (zelfde als spend bij EUR).
    "spendEur" DECIMAL(12,2) NOT NULL,
    "vatTreatment" "PurchaseVatTreatment" NOT NULL DEFAULT 'UNKNOWN',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdSpendEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AdSpendEntry_spend_check" CHECK ("spend" >= 0 AND "spendEur" >= 0)
);

-- Dagstaat/weekstaat: honderden orders als één boeking. Een gesloten staat
-- verandert niet meer; latere retouren komen in de staat van hún datum.
CREATE TABLE IF NOT EXISTS "WebshopSettlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "mode" "WebshopBookingMode" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'OPEN',
    "orders" INTEGER NOT NULL DEFAULT 0,
    "refunds" INTEGER NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "feeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cogsAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WebshopSettlement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WebshopSettlement_period_check" CHECK ("periodEnd" >= "periodStart")
);

-- -------------------------------------------------------------- indexen ---
-- Elke lijst in de app filtert op account + datum; unieke sleutels maken
-- elke import en webhook idempotent (zelfde event twee keer = één rij).

CREATE UNIQUE INDEX IF NOT EXISTS "WebhookEvent_connectionId_externalEventId_key" ON "WebhookEvent"("connectionId", "externalEventId");
CREATE INDEX IF NOT EXISTS "WebhookEvent_status_receivedAt_idx" ON "WebhookEvent"("status", "receivedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "WebshopOrderLine_orderId_externalId_key" ON "WebshopOrderLine"("orderId", "externalId");
CREATE INDEX IF NOT EXISTS "WebshopOrderLine_userId_sku_idx" ON "WebshopOrderLine"("userId", "sku");

CREATE UNIQUE INDEX IF NOT EXISTS "ProductCost_userId_sku_validFrom_key" ON "ProductCost"("userId", "sku", "validFrom");

CREATE UNIQUE INDEX IF NOT EXISTS "WebshopPayout_connectionId_externalId_key" ON "WebshopPayout"("connectionId", "externalId");
CREATE UNIQUE INDEX IF NOT EXISTS "WebshopPayout_bankTransactionId_key" ON "WebshopPayout"("bankTransactionId");
CREATE INDEX IF NOT EXISTS "WebshopPayout_userId_payoutDate_idx" ON "WebshopPayout"("userId", "payoutDate");

CREATE UNIQUE INDEX IF NOT EXISTS "WebshopPayoutLine_payoutId_externalId_key" ON "WebshopPayoutLine"("payoutId", "externalId");
CREATE INDEX IF NOT EXISTS "WebshopPayoutLine_orderId_idx" ON "WebshopPayoutLine"("orderId");

CREATE UNIQUE INDEX IF NOT EXISTS "AdSpendEntry_userId_platform_accountRef_date_key" ON "AdSpendEntry"("userId", "platform", "accountRef", "date");
CREATE INDEX IF NOT EXISTS "AdSpendEntry_userId_date_idx" ON "AdSpendEntry"("userId", "date");

CREATE UNIQUE INDEX IF NOT EXISTS "WebshopSettlement_connectionId_mode_periodStart_key" ON "WebshopSettlement"("connectionId", "mode", "periodStart");
CREATE INDEX IF NOT EXISTS "WebshopSettlement_userId_periodStart_idx" ON "WebshopSettlement"("userId", "periodStart");

CREATE INDEX IF NOT EXISTS "WebshopOrder_payoutId_idx" ON "WebshopOrder"("payoutId");
CREATE INDEX IF NOT EXISTS "WebshopOrder_settlementId_idx" ON "WebshopOrder"("settlementId");

-- ------------------------------------------------------- foreign keys ---

DO $$ BEGIN ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WebshopConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "WebshopOrderLine" ADD CONSTRAINT "WebshopOrderLine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "WebshopOrderLine" ADD CONSTRAINT "WebshopOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "WebshopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ProductCost" ADD CONSTRAINT "ProductCost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "WebshopPayout" ADD CONSTRAINT "WebshopPayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "WebshopPayout" ADD CONSTRAINT "WebshopPayout_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WebshopConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "WebshopPayout" ADD CONSTRAINT "WebshopPayout_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "WebshopPayoutLine" ADD CONSTRAINT "WebshopPayoutLine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "WebshopPayoutLine" ADD CONSTRAINT "WebshopPayoutLine_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "WebshopPayout"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "WebshopPayoutLine" ADD CONSTRAINT "WebshopPayoutLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "WebshopOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "AdSpendEntry" ADD CONSTRAINT "AdSpendEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "WebshopSettlement" ADD CONSTRAINT "WebshopSettlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "WebshopSettlement" ADD CONSTRAINT "WebshopSettlement_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WebshopConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "WebshopOrder" ADD CONSTRAINT "WebshopOrder_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "WebshopPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "WebshopOrder" ADD CONSTRAINT "WebshopOrder_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "WebshopSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------------ RLS ---

ALTER TABLE "WebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebshopOrderLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductCost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebshopPayout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebshopPayoutLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdSpendEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebshopSettlement" ENABLE ROW LEVEL SECURITY;
