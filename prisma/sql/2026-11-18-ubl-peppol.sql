-- E-factuur volgens Peppol BIS 3 / NLCIUS: Peppol-adres van de klant en de
-- referentie (inkoopordernummer) van de klant op de factuur.
-- Alleen nieuwe, lege kolommen: bestaande klanten en facturen blijven werken
-- (leeg = Peppol-adres uit btw-nummer of e-mail, en het factuurnummer als
-- referentie, zoals voorheen). Veilig om vaker te draaien.
--
-- LET OP: draai dit bestand voordat deze code tegen de database draait.
-- Anders vraagt Prisma kolommen op die nog niet bestaan en geven factuur- en
-- klantpagina's een fout.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "electronicAddress" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "buyerReference" TEXT;
