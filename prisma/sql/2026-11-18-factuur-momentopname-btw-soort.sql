-- Factuur vastzetten en btw-soort (btw verlegd, intracommunautaire levering).
-- Alleen nieuwe, lege kolommen: bestaande facturen en klanten blijven werken
-- (leeg = gewone btw en de huidige gegevens, zoals voorheen). Veilig om vaker te draaien.
--
-- LET OP: scripts/db-migrate.mjs draait dit alleen bij de productie-build.
-- Draait deze code eerder tegen dezelfde database (lokaal next dev met een
-- .env.local die naar productie wijst, of een preview-build), draai dit
-- bestand dan eerst bewust. Anders vraagt Prisma kolommen op die nog niet
-- bestaan en geven factuur- en klantpagina's een fout.
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "vatScheme" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "snapshot" JSONB;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "vatScheme" TEXT;
