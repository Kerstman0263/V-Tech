# Saldova — eerste herstelronde

Datum: 8 september 2026. Deze ronde versterkt bestaande functies en behoudt de paarse Saldova-identiteit, de modules en de Vercel-koppeling. De volledige productspecificatie is nog niet af; het vervolg staat in [uitvoeringsplan.md](uitvoeringsplan.md).

## Wat is verbeterd

- Beveiligingsupdates voor Next.js, Auth.js en dependencies; aanvullende securityheaders en origin-controle op schrijvende API-verzoeken.
- Actuele accountrechten bij iedere sessiecontrole. Een wachtwoord- of 2FA-wijziging maakt oude sessies ongeldig. Na deze uitrol moeten bestaande gebruikers eenmaal opnieuw inloggen.
- Herstel van tenantcontrole bij het wijzigen van uren. Een boekhouder kan niet meer het abonnement beheren of de volledige accountexport downloaden.
- Factuurnummer, factuurregels, gekoppelde uren en aanmaaklog worden samen opgeslagen. Niet-goedgekeurde of al gefactureerde uren veroorzaken een volledige rollback.
- Factuurregels, totalen en creditbedragen gebruiken dezelfde afronding in centen in formulier, database en PDF.
- Voor factuurmail verschijnt een controle met ontvanger, bedrag en PDF. Providerfouten geven een zichtbare fout; de factuur blijft concept. De klant krijgt een ondertekende PDF-link met beperkte geldigheidsduur en hoeft niet in te loggen.
- Verzendknoppen, bankacties, registratie en abonnementsacties herstellen na netwerkfouten en tonen feedback. Gedeelde velden hebben gekoppelde labels; de verzenddialoog herstelt de toetsenbordfocus.
- Op mobiel verschijnen factuurregels onder elkaar. Het overzicht is gecontroleerd op 360 pixels breedte.
- Alleen conceptfacturen kunnen worden verwijderd. Bij verwijderen worden de gekoppelde uren weer beschikbaar. Uitgereikte facturen kunnen niet terug naar concept worden gezet.
- Een bankontvangst mag alleen een factuur volledig afboeken als richting, bedrag, valuta, eigenaar en factuurstatus passen. Herhaalde bevestiging van dezelfde koppeling telt niet dubbel.
- Offerteconversie retourneert bij herhaling dezelfde factuur. Een periodieke factuur en de volgende uitvoerdatum worden atomair vastgelegd; mislukte e-mail veroorzaakt bij de volgende cron geen tweede factuur.
- Herinneringen tellen pas na acceptatie door de e-mailprovider. Een fout bij één herinnering blokkeert de overige dagelijkse taken niet.
- Checkout geeft niet alvast een betaald plan. Betalingsmeldingen worden bij Mollie geverifieerd op account, bedrag, valuta en abonnement. Fouten krijgen een herstelbaar antwoord; verwerking wordt in een unieke auditregistratie vastgelegd. De abonnementsperiode volgt de betaaldatum, niet de aankomst van een herhaald bericht.
- De terugkeerpagina na betalen bevat geen accountgegevens en claimt geen betaling die nog niet is bevestigd.
- De vertalingen van het activiteitenlog zijn aangepast aan de bijgewerkte vertaalbibliotheek.

## Bestanden en database

De vergelijking met de broncodekopie van vóór deze ronde staat in [eerste-ronde-bestanden.json](eerste-ronde-bestanden.json). Daarmee worden de al aanwezige, niet-gecommitte wijzigingen onderscheiden van deze herstelronde.

Het Prisma-schema is **ongewijzigd**. Er zijn geen productiemigraties uitgevoerd. Bestaande tabellen voor facturen, uren, abonnementen en auditlogs worden hergebruikt.

## Controlebewijs

- 158 geslaagde unit- en regressietests in 20 bestanden: financiële afronding, rechten, sessie-intrekking, links, origin-controle, e-mailfouten, providerverificatie en herstel na herhaalde betaalmeldingen.
- Negen browser- en API-scenario's tegen de productiebuild, met een lege lokale PGlite-database: registratie en klantaanmaak; factuur/PDF/verzendcontrole; tenantgrenzen en urenrollback; bankimport en betaling; offerteconversie en periodieke factuur; beperkte boekhoudersrechten; origin-controle en toegankelijkheid van het inlogscherm; cron bij uitgevallen e-mail; accountexport en intrekken van een sessie na wachtwoordwijziging.
- Lint, TypeScript en productiebuild worden voor de uitrol gecontroleerd. Het exacte eindresultaat staat onder Uitrol.
- Npm-audit: geen bekende kwetsbaarheden in de geïnstalleerde dependencytree bij de controle op 8 september 2026. Dit is geen garantie dat de volledige applicatie vrij is van beveiligingsproblemen.
- Er zijn geen echte betalingen gedaan of testmails aan klanten verstuurd. Er is geen productieadministratie gebruikt voor schrijvende tests.

Herhaal lokaal met `npm test`, `npm run lint`, `npm run typecheck`, `node scripts/verify-build.mjs` en daarna `SALDOVA_E2E_PRODUCTION=1 npm run test:e2e` (in PowerShell eerst `$env:SALDOVA_E2E_PRODUCTION = '1'`). De tests gebruiken uitsluitend een vaste loopbackdatabase en schakelen externe e-mail- en betaalproviders uit. Deze lokale testbuild is geen Vercel-build die met `--prebuilt` mag worden gepubliceerd; Vercel bouwt opnieuw met de eigen productieconfiguratie.

## Configuratie die nog ontbreekt

In het bestaande Vercel-project zijn productievariabelen voor database, authenticatie, encryptie, app-URL, webhook-URL en cron aanwezig. Bij de controle ontbraken `RESEND_API_KEY` en `MOLLIE_API_KEY`. De e-mail- en betaalflows kunnen daarom nog niet met deze externe diensten worden afgerond. Voor e-mail zijn later ook een geverifieerd verzenddomein en afzender nodig.

Er zijn geen officiële bedrijfsgegevens, KvK-nummer, contactadres of definitief domein ingevuld. De gebruiker levert die later aan. Fiscale tarieven en berekeningen vragen nog officiële jaarconfiguratie en inhoudelijke controle; juridische teksten blijven concepten en vragen nog beoordeling vóór een officiële lancering.

## Grenzen en resterend werk

- Deze ronde implementeert geen volledige boekhouding, nieuwe onboarding, actuele fiscale jaarconfiguratie, volledige NL/EN-tekstcontrole of definitieve juridische pagina's. De bestaande belastingcalculator bevat nog oude indicaties.
- Deelbetalingen, persistente credit-/aanbetalingsrelaties, jaarlijkse incasso, veilige planwissels en toegang tot het einde van een opgezegde betaalperiode vragen een volgende ronde. Een tweede checkout naast een lopend providerabonnement wordt nu geweigerd om extra incasso's te voorkomen.
- Bij het losmaken van een bankkoppeling blijft de factuurstatus behouden. De interface legt uit dat de gebruiker de betalingsstatus moet controleren.
- Het auditlog dekt de hierboven genoemde acties; nog niet iedere financiële mutatie in alle modules. De accountexport bevat nog niet alle modules.
- De beperkte PDF-link is deelbaar door de ontvanger en vervalt binnen 90 dagen. Een afzonderlijke knop om één gedeelde link in te trekken is nog niet toegevoegd.
- E-mail wordt als verzonden beschouwd na acceptatie door de provider; dat bewijst geen bezorging of opening. Een duurzame e-mailwachtrij en beheer van foutieve taken zijn vervolgwerk. De Resend-deduplicatie is beperkt tot het providervenster van 24 uur.
- Mollies idempotencyvenster is één uur. Herstel van abonnementsaanmaak moet daarom ook een bestaand providerabonnement terugvinden; alleen een herhaald verzoek met dezelfde sleutel is onvoldoende.
- PGlite voert de browser-/databasetests lokaal uit met één onderliggende databasesessie. Dit vervangt geen belasting- of concurrencytest op een zelfstandige PostgreSQL-server. Er is geen volledige WCAG 2.2-audit of hersteltest van productieback-ups uitgevoerd.
- Verificatiemail, wachtwoordreset, gedeelde rate limiting, veilige bestandsopslag en uitgebreide monitoring blijven in het uitvoeringsplan staan.

## Uitrol

Op 8 september 2026 gepubliceerd op https://saldova.vercel.app/, na een afzonderlijke Vercel-build en controle vóór koppeling. Deployment: `dpl_88Um14opVyQmMX8cpf6hBk4DG8GR` (`saldova-5vq0o8u97-kerstman314-2971s-projects.vercel.app`). Op 16 september opnieuw bevestigd als de actieve, gereedstaande productieversie.

Lint, TypeScript, productiebuild, 158 unit-/regressietests en alle 9 browser-/API-scenario's zijn geslaagd. De openbare eindcontrole bevestigde de homepage, NL/EN-inlogschermen, betaalterugkeerpagina en doorverwijzing van het dashboard naar inloggen. Niet-ingelogde API-toegang geeft 401, schrijvende verzoeken vanaf een andere origin 403, ongeldige PDF-tokens 403 en API-antwoorden `private, no-store`. Geen browserfouten of horizontale overflow op het mobiele inlogscherm.

De voorafgaande deployment is behouden als terugvalpunt: `dpl_576p3a9hPjH1EJ6AkaHo8biyYhff`. Bewijsbestanden en schermafbeeldingen staan buiten de deployment in `saldova-backups/live-validation-20260908.json` en de bijbehorende `saldova-live-*-20260908.png`.

## Technische bronnen

- [Mollie: notificaties verifiëren](https://docs.mollie.com/reference/webhooks)
- [Mollie: idempotency en herstel via list-endpoints](https://docs.mollie.com/reference/api-idempotency)
- [Mollie: abonnementen en metadata](https://docs.mollie.com/reference/create-subscription)
- [Resend: deduplicatie van e-mails](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [PGlite: lokale databaseverbindingen](https://pglite.dev/docs/pglite-socket)
