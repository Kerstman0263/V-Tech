## Instappen en overstappen

Live bevestigd op 4 november 2026 met Vercel Ready, deployment `dpl_AvYskooAAoLzrTs1tvqYcoqwCNPz`. De hoofdpagina voor deze route is https://saldova.vercel.app/overstappen. Nederlandse en Engelse kandidaatpagina, registratie- en loginlinks, ontwikkelmelding en leeg sjabloon zijn vóór promotie gecontroleerd. Het hoofddomein geeft daarna 200 en de sitemap bevat de overstappagina. Terugvalpunt vóór deze aanvulling is `dpl_4RveGfftPaiqMcfwqsdVVowFuY5A`.

Gewijzigde bestanden voor deze aanvulling zijn de instelpagina, de loginpagina, AuthForm, CustomerImport, de import-API, customer-import, plan-limits, seo, de homepage, SiteNav, SiteMobileMenu, SiteFooter, beide vertaalbestanden en de betrokken tests. Nieuwe onderdelen zijn de publieke overstappagina, SetupCustomer, het lege klanten-CSV-sjabloon en welcome-switch.spec.ts.

Nieuwe registratie gaat naar /start met de gekozen beginroute en het eventuele gekozen pakket. De eigenaar doorloopt één actieve stap tegelijk, kan teruggaan of overslaan en ziet voortgang op basis van opgeslagen gegevens. De eerste klant kan direct in deze route worden toegevoegd. Een gekozen betaald pakket blijft als expliciete vervolgstap beschikbaar.

/overstappen is een publieke Nederlandse en Engelse uitlegpagina met registratie, bestaand-accountlogin en een leeg CSV-sjabloon. Navigatie, mobiele menukaart, homepage, footer en FAQ verwijzen naar overstappen. De bestaand-accountlogin ondersteunt uitsluitend de vaste bestemming next=switch en behoudt die ook na inloggen. Een bestaande sessie gaat direct naar de instelroute.

De bestaande klantenimport is hergebruikt. Voorvertoning toont herkende kolommen, maximaal vijf nieuwe klanten en uitleg bij de eerste tien overgeslagen regels. Een ongeldige nieuwe selectie vervangt de vorige selectie, zodat een oude voorvertoning geen verkeerd bestand bevestigt. Import, opnieuw controleren van dubbelen en pakketruimte, opslaan en auditlog gebeuren in dezelfde serialiseerbare transactie. Pakketoverschrijding wordt afzonderlijk van dubbelen geteld. Bestanden boven 2 MB of 2.000 gegevensregels worden geweigerd. Onbekende uitgeschreven landen vragen correctie, met een expliciete toelichting dat een leeg land Nederland gebruikt.

De overstap omvat klanten via CSV en verwijst naar de bestaande import van bankregels en documentinbox. Historische facturen, aangiften en exports horen bij het afzonderlijk bewaarde archief. Openstaande posten, beginstanden, startdatum en factuurnummering vragen afstemming met de boekhouder. De implementatie introduceert geen Prisma-schemawijziging.

Gecontroleerd met 324 unit-/regressietests, de volledige suite van 34 browser-/API-tests en een herhaling van de vier nieuwe scenario's na de login-aanpassing. Die scenario's controleren nieuwe registratie, pakketkeuze, klant aanmaken, overstaplogin met en zonder bestaande sessie, voorvertoning zonder klantmutatie, ongeldige bestandskeuze, dubbele en gelijktijdige import, pakketlimieten, accountisolatie, mobiel en toegankelijkheid van de publieke pagina. De bestaande test voor registratie verwacht nu de instelroute. Lokale productiebuild, lint en TypeScript zijn geslaagd. Alleen de geïsoleerde lokale database bevat de testaccounts.

## Productronde: inrichting, documenten en kwartaalcontrole

Live op 4 november 2026: `dpl_4RveGfftPaiqMcfwqsdVVowFuY5A`, https://saldova.vercel.app/ (Vercel Ready en hoofddomein bevestigd). Laatste kandidaat: https://saldova-7jzf2a0ii-kerstman314-2971s-projects.vercel.app. Registratie geeft 200 met ontwikkelmelding en drie juridische links. De instelroute verwijst zonder sessie naar inloggen en rendert geen privéformulier; een documentdownload zonder sessie geeft 401. Kandidaten zijn vóór promotie gecontroleerd. De laatste aanvulling vervangt twee btw-labels door neutrale tekst. Terugvalpunt vóór deze ronde: `dpl_HVSK21zNHih3yejPX6Q78PKBE3D2`.

Back-up van de verzamelde bronwijzigingen staat naast de repo in `../saldova-backups/product-round-source/`, plus patch, buildlog, twee testverslagen en screenshots. Er is geen Git-commit of reset uitgevoerd; bestaande wijzigingen blijven in de werkmap staan.

De Moneybird-review is vertaald naar een eigen route in de bestaande applicatie. Saldova blijft zichtbaar in ontwikkeling; er zijn geen officiële ondernemingsgegevens, klantclaims of nieuwe betaalvoorwaarden ingevuld.

- /start geeft de eigenaar hervatbare voortgang op basis van werkelijk opgeslagen bedrijfsnaam, klanten en facturen. De naam kan direct worden opgeslagen. KvK, btw-nummer en adres blijven voor later; vóór factuurverzending zijn juiste gegevens nodig. Bestaande modulekeuzes blijven beschikbaar. Het dashboard toont de voortgang zolang de basis niet compleet is; Instellingen houdt de instelroute bereikbaar.
- De documentinbox accepteert een eigen upload van PDF, PNG, JPEG of WebP tot 2.000.000 bytes. Het bestandstype wordt aan de hand van bytes gecontroleerd. Geen claim van virusscan of volledige documentvalidatie. E-mailinvoer blijft bestaan. De lijst heeft Te verwerken / Verwerkt / Opzijgezet / Alles en toont maximaal 100 documenten per selectie.
- Originele documenten zijn via een accountgebonden download beschikbaar. Download is een attachment met private/no-store en nosniff. Legacy e-mailbijlagen blijven als download beschikbaar, met een begrensde grootte en generiek type voor onbekende bytes. Geen openbare downloadtokens toegevoegd.
- Een uitgave maken en het inboxdocument koppelen gebeurt in één seriële database-transactie, met een auditrecord. Een herhaald verzoek met hetzelfde inbox-id geeft de bestaande uitgave terug; gelijktijdige verzoeken mogen geen dubbele uitgave achterlaten. Dit geldt voor verwerking van hetzelfde document-id, niet als algemene detectie van inhoudelijk dubbele uploads.
- Verwerkte originelen kunnen niet los via de status- of verwijderroute worden weggehaald. Verwijder je een uitgave, dan gaat het document in dezelfde transactie terug naar Te verwerken. Opzijgezette documenten kunnen via de interface terug naar de inbox.
- Kwartaalcontrole toont conceptfacturen, open bankregels, alle onverwerkte inboxdocumenten, uitgaven zonder foto of gekoppeld origineel en uitgegeven facturen in vreemde valuta. Inboxtotalen zijn bewust niet aan een kwartaal toegerekend zolang de boekingsdatum niet bekend is.
- Het btw-overzicht sluit vreemde valuta uit van EUR-totalen en telt geldbedragen in centen. De onjuiste vaste rubricering onder 1a is verwijderd. Btw op uitgaven is vastgelegde btw die nog op aftrekbaarheid gecontroleerd moet worden. Een KOR-melding volgt de bestaande instellingen. Geen elektronische aangifte, kasstelselberekening of volledige grootboekcontrole toegevoegd.
- Registratie verwijst direct naar de bestaande voorwaarden, privacyverklaring en verwerkersovereenkomst, en vermeldt dat Saldova nog niet officieel is gelanceerd. Alles is in Nederlands en Engels opgenomen.

Verificatie: 322 tests in 30 unit-/regressiebestanden geslaagd; ESLint, TypeScript en de lokale productiebuild geslaagd. Alle 30 browser-/API-tests geslaagd. De vijf nieuwe scenario's zijn daarna opnieuw geslaagd bij het controleren van de definitieve screenshots. De eerste uploadtest legde een venster vóór hydratatie bloot; upload is nu uitgeschakeld totdat de inbox is geladen. Testgegevens zijn uitsluitend in de geïsoleerde lokale database gemaakt.

Bestanden van deze productronde: app/[locale]/(dashboard)/start/page.tsx, btw/page.tsx, settings/page.tsx; components/settings/SetupProfile.tsx; components/dashboard/GettingStarted.tsx, ZzpDashboard.tsx, BedrijfDashboard.tsx; components/auth/AuthForm.tsx; components/expenses/InboxPanel.tsx en ExpenseManager.tsx; app/api/inbox/route.ts, [id]/route.ts en [id]/file/route.ts; app/api/expenses/route.ts en [id]/route.ts; lib/setup-progress.ts, lib/document-file.ts, lib/validations/expense.ts; messages/nl.json en en.json; tests/document-file.test.ts; e2e/administration-flow.spec.ts. Geen Prisma-schemawijziging of nieuwe migratie. De bestaande build voert de twee al aanwezige idempotente SQL-scripts opnieuw uit.

Voor ingebruikname blijven de bestaande externe diensten (onder meer e-mail en betalingen), definitieve bedrijfs-/juridische gegevens en controle van fiscale/juridische teksten van belang. De persoonlijke IB-reservering is nog het bestaande handmatig ingestelde schattingsmodel; deze ronde voegt geen volledige persoonlijke belastingaangifte toe. Documenten gebruiken de bestaande databaseopslag als data-URL. Een schaalbare documentopslag, paginering boven 100 inboxitems en bredere dubbele-documentdetectie blijven vervolgwerk.

# Saldova — rustige presentatie en verbonden belastingbuffer

## Aanvulling: interactief productverhaal

Uitgerold op 4 november: `dpl_HVSK21zNHih3yejPX6Q78PKBE3D2` (`saldova-riqgk8f8n-kerstman314-2971s-projects.vercel.app`). Daarna op de publieke website gecontroleerd: ontwikkelstatus zichtbaar, voorbeeld van 16 uur geeft €1.452 factuurtotaal, stapwisseling functioneert. Terugvalpunt is de voorafgaande gepromoveerde deployment `dpl_Hb5rJS24jhCwyywoSpFfE5zreoev`. De tussentijdse kandidaat vóór de contrastcorrectie is niet gepromoveerd.

Een eigen `ProductJourney` vervangt het statische driestappenblok. Bezoekers veranderen voorbeelduren en volgen hetzelfde bedrag via een factuur naar een reserveringsscenario. De factuursom en buffer worden daadwerkelijk berekend met de bestaande fiscale rekenkern, geen losstaande getallen of opgenomen animatie. De voorbeeldgegevens worden nergens opgeslagen of verstuurd. De hoofdpagina verwijst nu eerst naar deze interactieve uitleg; de bestaande accountdemo blijft bereikbaar via inloggen.

Volledig NL/EN, toetsenbordbediening met pijltjes/Home/End, gekoppelde tabs/panelen, zichtbare focus en reduced-motion. Drie gerichte productiebrowserchecks geslaagd: mobiele pagina/prijzen, gegevensdoorwerking + toetsenbord + toegankelijkheid zonder schrijvende verzoeken, en het Engelse voorbeeld met reduced-motion. Een gevonden contrastfout van de actieve stapbadge is gecorrigeerd en opnieuw gecontroleerd. Lint, TypeScript en lokale productiebuild geslaagd. Geen database-/schemaverandering.

Dit is een uitgewerkte presentatie-/interactieronde, geen verklaring dat de hele app perfect of volledig gecontroleerd is. De historische gedeelde accountdemo en overige open punten hieronder blijven vervolgwerk.

## Aanvulling: ontwikkelfase en HorizonX-referentie

Na de correctie van de gebruiker zijn de openbare Nieuw-labels verwijderd uit de hoofdnavigatie, homepage en doelgroepkaarten. De gedeelde header toont in NL/EN dat Saldova in ontwikkeling en nog niet officieel gelanceerd is. Startknoppen zijn neutraler en de onbewezen populariteitsbadge is vervangen door Aanbevolen. Teksten over een reeds gelanceerd product en de Windows-nieuwbadge zijn gecorrigeerd.

https://horizonx.so/ is publiek bekeken als visuele referentie. Eigen CSS toegevoegd voor een productframe met perspectief, zachte lichtaccenten, decoratieve orbitlijn en subtiele kaartranden. De interactieve Saldova-preview blijft bruikbaar. Beweging en perspectief worden alleen op geschikte desktops ingeschakeld en respecteren prefers-reduced-motion; mobiele invoer krijgt geen hover-effecten. Geen HorizonX-broncode of betaalde assets gebruikt, geen extra dependencies.

Lint, TypeScript en afzonderlijke Vercel-build geslaagd. Lokaal en vervolgens live visueel gecontroleerd. Actieve aanvulling: `dpl_Hb5rJS24jhCwyywoSpFfE5zreoev` op `https://saldova.vercel.app/`. Vorige deployment hieronder is behouden als terugvalpunt. De eerdere 318 unit-/regressietests en 23 browserchecks horen bij de functionele ronde; ze zijn niet opnieuw integraal uitgevoerd voor deze tekst-/CSS-aanvulling.

Uitgangspunt: bestaande schone Git-versie `e40661b` van Claude. Identiteit en bestaande panelen behouden. Referenties voor informatiehiërarchie en productpresentatie: https://linear.app/ en https://ramp.com/; geen teksten, klantcijfers of beeldmateriaal gekopieerd.

## Uitgevoerd

- Kortere hero, beter leesbaar op 360px, minder mobiele witruimte. Eén interactieve productweergave behouden; extra sfeerfoto-/beloftenblok, tweede productpreview en drie zwevende voorbeeldmeldingen verwijderd. Componentbestanden van de verwijderde presentatieblokken blijven beschikbaar voor andere pagina's.
- Koppelingenband staat stil, heeft geen dubbele merknamen en noemt expliciet ook bestandsimports.
- Alleen werkelijk ondersteunde maandbetaling wordt aangeboden. De jaartoggle met onjuiste kortingsclaim is verwijderd uit de interface; bestaande prijzen en betaalproviderlogica zijn behouden.
- Nederlandse en Engelse teksten aangescherpt: fiscale schattingen, bronnen, voorwaardelijke gegevensverwerking, supportkanalen, gratis plan versus zakelijke proefperiode en rolrechten. Geen nieuwe officiële ondernemingsgegevens ingevuld.
- Fiscale Rust kan volledige jaarbedragen uit de eigen administratie overnemen na een controle: uitgereikte EUR-facturen (ook openstaand en credits), geregistreerde uitgaven en hun btw. Accountrechten worden vóór ophalen gecontroleerd. Concepten, geannuleerde facturen en vreemde valuta tellen niet mee. Query's gebruiken database-aggregaties; geen limiet die stilzwijgend een deel van de administratie weglaat.
- Gegevensovername is een controleerbare momentopname, geen aangifte of gegarandeerde aftrek. De gebruiker kiest daarna Bereken. Negatieve of te grote totalen kunnen niet worden overgenomen. KOR houdt de niet-aftrekbare btw bij de kosten. Losse webshoporders, investeringscorrecties en kasstelsel worden niet automatisch verwerkt.
- Bij een urenachterstand die meer dan 60 uur per resterende week vraagt verschijnt een begrijpelijke melding om de registratie te controleren, in plaats van een onrealistische werkaanbeveling.

## Nog open uit de review

- De gedeelde demo heeft nog historische records. Geen productiegegevens verwijderd of automatisch opnieuw geseed. Voor een volledige demovernieuwing eerst bezoekers isoleren en veilig voorbeelddata per sessie opbouwen; het bestaande seedscript verwijdert ook het demo-account en is hiervoor niet uitgevoerd.
- Fiscale overname is nu voor het hele geselecteerde jaar. Een specifieke maand/kwartaal, opgeslagen voorkeuren en automatische persoonlijke IB/PVV met aftrekvoorwaarden vragen vervolgwerk. Het bestaande reserveringsmodel blijft van toepassing.
- De volledige marketing- en helpteksten zijn niet uitputtend gevalideerd tegenover elke providerfunctie. Geen claim dat Saldova of deze ronde volledig productieklaar of gecertificeerd is.

## Verificatie

- 318 unit-/regressietests geslaagd, inclusief KOR/centafronding bij gegevensovername.
- ESLint, TypeScript en lokale productiebuild geslaagd.
- Alle 23 browser-/API-tests geslaagd, inclusief overname van uitsluitend eigen gegevens en uitsluiten van concepten/andere valuta, mobiele homepage en maandprijzen. De webshoptests gebruiken een afzonderlijke loopback-IP-identiteit zodat zij niet de inloglimiet van andere suites verbruiken; de applicatiebeveiliging blijft ingeschakeld.
- Geen Prisma-schemawijziging of nieuwe SQL-migratie toegevoegd. De bestaande Vercel-build voert zijn twee reeds aanwezige idempotente SQL-scripts opnieuw uit.
- Eerste Vercel-build mislukte bij een externe fontdownload. De herhaalde build is geslaagd en op 4 november gepromoveerd: `dpl_CyTWHCLrgpwUQST2DLaFJiDvvbKd`, `https://saldova-dozb9ioau-kerstman314-2971s-projects.vercel.app`. De gewijzigde homepage is daarna op `https://saldova.vercel.app/` in de browser bevestigd. Terugvalpunt: `dpl_G3RFJZcjdRYdnN1ySAokTcwbrq3N`.
