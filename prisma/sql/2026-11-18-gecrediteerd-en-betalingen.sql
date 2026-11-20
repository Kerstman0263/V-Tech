-- Gecrediteerde facturen en online betalingen per factuur.
-- Alleen toevoegen: een nieuwe, lege kolom op "Invoice" en een nieuwe tabel.
-- Bestaande facturen blijven werken (leeg = niet gecrediteerd, zoals voorheen).
-- Veilig om vaker te draaien.
--
-- De bestandsnaam begint na "2026-11-18-factuur-pdf.sql" in de sortering,
-- zodat de kolom "originalInvoiceId" (uit dat bestand) al bestaat.
--
-- LET OP: scripts/db-migrate.mjs draait dit alleen bij de productie-build.
-- Draait deze code eerder tegen dezelfde database (lokaal next dev met een
-- .env.local die naar productie wijst, of een preview-build), draai dit
-- bestand dan eerst bewust. Anders vraagt Prisma een kolom en tabel op die nog
-- niet bestaan en geven factuurpagina's en de Mollie-webhook een fout.

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "creditedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "InvoicePayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "refunded" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "chargedBack" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InvoicePayment_invoiceId_idx" ON "InvoicePayment"("invoiceId");
CREATE INDEX IF NOT EXISTS "InvoicePayment_userId_idx" ON "InvoicePayment"("userId");

-- Net als alle andere tabellen: RLS aan zonder regels, zodat de Supabase-API (anon/authenticated)
-- er niet bij kan. De app gebruikt Prisma met de database-eigenaar en heeft er geen last van.
ALTER TABLE "InvoicePayment" ENABLE ROW LEVEL SECURITY;

-- Bijwerken van facturen die al vóór deze versie zijn gecrediteerd, zodat ze
-- geen herinneringen meer krijgen. Raakt alleen de nieuwe kolom, en alleen
-- waar die nog leeg is: vaker draaien (dit bestand draait bij elke
-- productie-build) verandert niets meer.
-- Een factuur telt als gecrediteerd als er een UITGEREIKTE creditfactuur
-- (negatief bedrag, verzonden, te laat of betaald) voor bestaat. Een
-- concept-creditfactuur telt niet: die is nog niet uitgereikt, en kan nog weg.
-- Een uitgereikte creditfactuur kan niet meer weg of vervallen, dus de
-- uitkomst verandert later niet meer.
-- Het verband met het origineel:
-- - via de vaste verwijzing ("originalInvoiceId"), of
-- - alleen bij oude creditfacturen ZONDER vaste verwijzing: via het logboek
--   ("invoice.credited", doel "ORIGINEEL → CREDIT"). Factuurnummers kunnen
--   terugkomen (het laatste concept verwijderen zet de teller één terug).
--   Daarom telt alleen een logregel die niet ouder is dan deze creditfactuur:
--   de logregel wordt direct na de creditfactuur geschreven, en een logregel
--   van een eerder, verwijderd concept met hetzelfde nummer is ouder.
UPDATE "Invoice" AS o
SET "creditedAt" = c."createdAt"
FROM "Invoice" AS c
WHERE o."creditedAt" IS NULL
  AND c."userId" = o."userId"
  AND c."id" <> o."id"
  AND c."total" < 0
  AND c."status" IN ('SENT', 'OVERDUE', 'PAID')
  AND o."total" > 0
  AND (
    c."originalInvoiceId" = o."id"
    OR (
      c."originalInvoiceId" IS NULL
      AND EXISTS (
        SELECT 1 FROM "AuditLog" AS a
        WHERE a."accountId" = o."userId"
          AND a."action" = 'invoice.credited'
          AND a."target" = o."invoiceNumber" || ' → ' || c."invoiceNumber"
          AND a."createdAt" >= c."createdAt"
      )
    )
  );
