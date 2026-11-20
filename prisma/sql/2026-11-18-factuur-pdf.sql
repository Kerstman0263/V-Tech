-- Factuur-PDF: leverings- of dienstdatum (of periode) en, bij een creditfactuur,
-- de verwijzing naar de originele factuur. Alleen nieuwe, lege kolommen:
-- bestaande facturen blijven ongewijzigd werken. Veilig om vaker te draaien.
--
-- LET OP: scripts/db-migrate.mjs draait dit alleen bij de productie-build.
-- Draait deze code eerder tegen dezelfde database (lokaal next dev met een
-- .env.local die naar productie wijst, of een preview-build), draai dit
-- bestand dan eerst bewust. Anders vraagt Prisma kolommen op die nog niet
-- bestaan en geven factuurpagina's, PDF's en UBL's een fout.
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "deliveryDate" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "deliveryEndDate" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "originalInvoiceId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "originalInvoiceNumber" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "originalInvoiceDate" TIMESTAMP(3);
