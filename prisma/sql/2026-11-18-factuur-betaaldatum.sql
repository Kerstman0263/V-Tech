-- Echte betaaldatum per factuur, voor de auditfile en de journaalposten.
-- Alleen toevoegen: een nieuwe, lege kolom op "Invoice", en daarna één keer de
-- betaaldatum invullen bij facturen die al betaald waren. Veilig om vaker te
-- draaien: de UPDATE raakt alleen betaalde facturen waar "paidAt" nog leeg is.
--
-- LET OP: scripts/db-migrate.mjs draait dit alleen bij de productie-build.
-- Draait deze code eerder tegen dezelfde database (lokaal next dev met een
-- .env.local die naar productie wijst, of een preview-build), draai dit
-- bestand dan eerst bewust. Anders vraagt Prisma een kolom op die nog niet
-- bestaat en geven factuurpagina's, de bankkoppeling en de Mollie-webhook een fout.
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

-- Bestaande betaalde facturen krijgen één vaste betaaldatum, zodat die niet meer
-- meeschuift met updatedAt (bijv. als er later een creditfactuur komt). Anders
-- kon de auditfile dezelfde ontvangst in twee jaren boeken.
-- Volgorde, zoals bij het koppelen van een bankregel:
--   1. online betaald via Mollie (laatste Mollie-melding is "betaald"): die datum;
--   2. anders de datum van de gekoppelde bankontvangst (de laatste);
--   3. anders het laatste wijzigmoment (zoals de export tot nu toe deed).
-- Alle huidige schrijfpaden vullen "paidAt" al bij betaald, dus nieuwe facturen
-- raakt dit niet. "updatedAt" wordt door Prisma bijgehouden, niet door de
-- database, en verandert hier dus niet.
UPDATE "Invoice" i
SET "paidAt" = COALESCE(
  (
    SELECT CASE WHEN m."action" = 'invoice.payment_received' THEN m."createdAt" END
    FROM "AuditLog" m
    WHERE m."accountId" = i."userId"
      AND m."actorName" = 'Mollie'
      AND m."target" = i."invoiceNumber"
      AND m."action" IN ('invoice.payment_received', 'invoice.payment_reversed')
      AND m."createdAt" >= i."createdAt"
    ORDER BY m."createdAt" DESC
    LIMIT 1
  ),
  (
    SELECT max(b."date")
    FROM "BankTransaction" b
    WHERE b."matchedInvoiceId" = i."id"
      AND b."userId" = i."userId"
      AND b."status" = 'MATCHED'
  ),
  i."updatedAt"
)
WHERE i."status" = 'PAID'
  AND i."paidAt" IS NULL;
