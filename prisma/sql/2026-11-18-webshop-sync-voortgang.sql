-- Webshop-synchronisatie: voortgang en bijwerken van bestellingen (november 2026).
-- Alleen toevoegen: drie nieuwe, lege kolommen. Veilig om vaker te draaien.
--
-- "WebshopConnection"."syncCursor": waar een onderbroken sync verdergaat
--   (Shopify-cursor of paginanummer). Leeg = klaar, zoals bij alle bestaande koppelingen.
-- "WebshopOrder"."cancelledAt": de bestelling is bij het platform geannuleerd
--   en telt niet meer mee in omzet en OSS. Leeg = telt mee (zo blijven alle
--   bestaande rijen werken).
-- "WebshopOrder"."checkedAt": wanneer de bestelling voor het laatst bij het
--   platform is vergeleken. Leeg bij bestaande rijen.
--
-- LET OP: scripts/db-migrate.mjs draait dit alleen bij de productie-build.
-- Draait deze code eerder tegen dezelfde database, draai dit bestand dan eerst
-- bewust. Anders vraagt Prisma kolommen op die nog niet bestaan en geven de
-- webshoppagina's en de synchronisatie een fout.
ALTER TABLE "WebshopConnection" ADD COLUMN IF NOT EXISTS "syncCursor" TEXT;
ALTER TABLE "WebshopOrder" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "WebshopOrder" ADD COLUMN IF NOT EXISTS "checkedAt" TIMESTAMP(3);
