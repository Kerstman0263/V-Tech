# Saldova: audit en stapsgewijze uitvoering

Peildatum: 5 september 2026. Dit is een werkdocument, geen verklaring dat Saldova productieklaar is.

## Afspraken

- Bestaande donkere paarse Saldova-identiteit, bedrijfspaneel, modules en Windows-app behouden.
- Goede bestaande onderdelen uitbreiden; geen totale vervanging of migratie naar een andere hostingstack.
- Kleine samenhangende wijzigingen, met regressietests en een controle vóór iedere uitrol.
- Bedrijfsnaam, KvK, openbaar adres en definitief domein zijn nog niet officieel. Deze niet verzinnen of publiceren. Juridische teksten blijven concepten.
- Geen echte betalingen, testmails aan klanten, of productie-databasemutaties uitvoeren om te testen.
- De al aanwezige, niet-gecommitte code is onderdeel van de uitgangssituatie. Een broncodekopie zonder secrets staat naast het project in `saldova-backups`.

## Bestaande architectuur

| Onderdeel | Bestaande implementatie | Beoordeling / vervolg |
| --- | --- | --- |
| Webapp | Next.js 15 App Router, React 19, TypeScript strict, Tailwind | Behouden; security-updates binnen bestaande architectuur |
| Hosting | Vercel-project `saldova`, regio Frankfurt, dagelijkse cron | Koppeling in `V-Tech/.vercel`; bovenliggende koppeling hoort bij ander project |
| Database | PostgreSQL, Prisma 6, Decimal-velden, account-eigenaar als tenant | Nieuwe schemawijzigingen later via gecontroleerde migraties |
| Authenticatie | Auth.js credentials, bcrypt, JWT, TOTP en back-upcodes | Rechtenverversing en intrekking versterken; verificatie/reset ontbreken |
| Autorisatie | `lib/permissions.ts`: financials, approveHours, manageTeam, exports | Elke API én serverpagina toetsen; eigenaar/accountant onderscheiden bij abonnement |
| API | Routes voor bestaande modules, Zod-validatie, eigendomsfilters | Route-inventarisatie uitgevoerd; integratietests uitbreiden |
| UI | 108 componenten, gedeelde knoppen/velden/kaarten, paarse zzp- en teal bedrijfsthema's | Bestaande componenten hergebruiken |
| Vertalingen | Nederlands en Engels via next-intl | Sleutelpariteit behouden; veel API- en e-mailteksten nog rechtstreeks in code |
| Facturen/offertes | PDF, nummering, catalogus, verzenden, dupliceren, credit, conversie, aanbetaling | Verzendfouten, publieke PDF-toegang, afronding en gelijktijdige acties herstellen |
| Uren/ritten/projecten/taken | Registratie en koppelingen, teamgoedkeuring | Factureren alleen met goedgekeurde, ongefactureerde uren; timer/terugkerende taken volgen |
| Uitgaven/bank | Handmatige uitgaven, browser-OCR, inbox, CSV-preview/deduplicatie | Bankbevestiging controleren op richting, bedrag, valuta en status; veilige bijlagen volgen |
| Fiscale Rust | Lokale calculator met KOR/rechtsvorm | Tarieven bevatten oude indicaties; jaarconfiguratie, bronnen en scenario-tests nodig |
| Abonnementen | Free/Growth/Pro/Business/Business+, Mollie recurring | 14/30 dagen inconsistent; jaarprijzen nog niet verbonden aan jaarlijkse incasso |
| Onboarding/hulp | Rondleidingen per pagina, checklist, Ctrl+K-navigatie | Geen volledige opgeslagen bedrijfs-onboarding of zoeken in records |
| Admin | Gebruikers, abonnementen, reviews, support en logs | Configuratie, jobs, emailstatus en blokkering uitbreiden |
| Desktop/PWA | Electron 1.0.0, gedeelde live webapp, PWA/offlinescherm | Installer-URL ontbreekt; geen zelfstandig offline boekhouden claimen |
| Tests | 15 bestanden, 92 geslaagde tests, TypeScript geslaagd bij start | Financiële, API-, sessie-, tenant-, browser- en fouttests uitbreiden |

Inventarisatie: 336 eigen code/configuratiedocumenten, circa 38.000 regels (exclusief dependencies, buildoutput en OCR-vendorbestanden). Geen audit van ieder mogelijk runtimepad; onderstaande controles worden aantoonbaar uitgebreid.

## Prioriteiten

### P0 — eerste samenhangende herstelronde

- [ ] Bekende kwetsbaarheden in Next.js/Auth.js en afhankelijkheden oplossen en regressies testen.
- [ ] Veilige origin-controle op schrijvende API-verzoeken en securityheaders.
- [ ] Sessies en rechten server-side controleren, ook na wijzigingen en verwijdering.
- [ ] Een mislukte e-mail mag geen verzonden-status of succesmelding opleveren.
- [ ] Klant krijgt een beperkte, ondertekende, aflopende PDF-link zonder toegang tot het account.
- [ ] Laatste verzendcontrole en herstelbare fouten in bestaande factuuracties.
- [ ] Consistente afronding van positieve en negatieve factuurregels.
- [ ] Uren alleen eenmaal factureren, na goedkeuring en binnen hetzelfde account.
- [ ] Nummering veilig bij gelijktijdig aanmaken; auditregistratie bij financiële mutaties.
- [ ] Bankkoppeling mag een onjuist bedrag of uitgaande betaling niet als volledige ontvangst boeken.
- [ ] Abonnementsbeheer beperken tot eigenaar; starten checkout geeft niet alvast betaald plan.
- [ ] Webhookfouten niet als verwerkt bevestigen; veilige herhaalbaarheid uitwerken.

### P1 — bestaande kernflows volledig maken

- [ ] Jaarversies voor fiscale tarieven met officiële bronnen, uitleg, KOR, voorbelasting en marge.
- [ ] Opgeslagen onboarding per rechtsvorm, modulekeuze en eerste echte handeling.
- [ ] Concepten, kortingen, eenheden, verlegging, deelbetalingen en offerte-/creditrelaties.
- [ ] Originele bonnetjes veilig opslaan en koppelen; opslagprovider apart configureren.
- [ ] Uitnodigingen, verificatie en wachtwoordreset met eenmalige aflopende tokens.
- [ ] Eén abonnementsconfiguratie voor prijzen, maand/jaar, proef en limieten.
- [ ] Saldova-abonnementsfacturen, betalingsherstel en expliciete test/live-configuratie.
- [ ] Juridische concepten en subprocessors; officiële gegevens en juridische controle blijven extern nodig.

### P2 — gebruiksgemak zonder redesign

- [ ] Vandaag belangrijk: maximaal drie echte acties, uitleg bij bedragen.
- [ ] Timer, terugkerende taken, projectoverzicht en favorieten.
- [ ] Medewerkers deactiveren met behoud van historie en sessie-intrekking.
- [ ] Zoeken in records, contextuele hulp, begrijpelijke veldfouten.
- [ ] Toetsenbord/focus/modals, 360px, tablet, desktop, 200% zoom en reduced motion.
- [ ] Paginering en overzichtelijke empty/loading/success/error-states.

### P3 — voorbereiding op openbare lancering

- [ ] Eerlijke marketing, consistente prijzen/proef en status van toekomstige functies.
- [ ] Metadata, canonical/hreflang, sitemap, robots, deelafbeelding en inhoudelijke functiepagina's.
- [ ] Beveiligings-/statuspagina, monitoring, foutregistratie en herhaalbare jobs.
- [ ] Gescheiden testdatabase, back-up/hersteltest, veilige seed en migratieprocedure.
- [ ] Eigen domein, officiële gegevens, e-maildomein en desktopdistributie wanneer beschikbaar.

## Verificatie en uitrol

Per ronde: relevante unit/API-tests, volledige regressieset, typecheck, lint en productiebuild. Externe providers worden in tests vervangen door gecontroleerde testdoubles; geen echte klantmails of betalingen. Controleer daarna een Vercel-preview en de geraakte gebruikersflows. Productie krijgt uitsluitend de geteste ronde. Noteer resterende beperkingen in de oplevering; vink geen werk af dat alleen ontworpen is.

## Eerste bevindingen

- `sendEmail` vangt providerfouten af zonder resultaat: callers kunnen daardoor toch verzonden registreren.
- Verzonden PDF-link verwijst naar een endpoint dat een ondernemerssessie vereist.
- Bankbevestiging controleert de factuureigenaar, maar niet richting/bedrag/valuta voordat PAID wordt gezet.
- Factuuraanmaak markeert aangeleverde uren zonder volledige goedkeurings- en dubbelboekingscontrole.
- Factuurnummers worden gelezen voordat de teller wordt vergrendeld; gelijktijdige acties kunnen botsen.
- Checkout schrijft het gewenste betaalde plan al vóór geslaagde betaling; jaarbetaling ontbreekt in providerflow.
- `financials` staat abonnementsacties toe aan een boekhouder; accountinstellingen horen bij de eigenaar.
- Webhook retourneert ook bij verwerkingsfouten HTTP 200, waardoor herstelpogingen uitblijven.
- JWT-rechten kunnen nog één minuut verouderd zijn; wachtwoordwijziging trekt oude sessies niet in.
- Er is geen gedeelde origin-controle voor de eigen API-mutaties.
- Fiscale calculator bevat onder meer oude Zvw-indicaties en heeft nog geen expliciete jaarselectie.
- Npm-audit bij start: 2 critical, 7 high, 1 moderate in productie-dependencytree; toepasbaarheid verschilt per functie. Versie-updates en een nieuwe audit zijn vereist.

## Bronnen voor de herstelronde

- Auth.js security advisory: https://github.com/nextauthjs/next-auth/security/advisories/GHSA-8fpg-xm3f-6cx3
- Next.js security advisory: https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj
- Mollie webhookverificatie: https://docs.mollie.com/reference/webhooks
- Mollie idempotency: https://docs.mollie.com/reference/api-idempotency
- Resend idempotency: https://resend.com/docs/dashboard/emails/idempotency-keys

Deze bronnen ondersteunen de implementatiekeuzes; zij vervangen geen tests van Saldova zelf.
