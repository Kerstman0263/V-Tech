# Saldova — Fiscale Rust, tweede herstelronde

Werk gestart op 16 september 2026, hervat op 23 september na een onderbreking. Dit is een uitbreiding van de bestaande reserveringscalculator, geen nieuwe boekhouding of aangiftesoftware. De herkenbare paarse vormgeving en het bedrijfsthema blijven behouden.

## Wijzigingen

- Centrale, versieerbare jaarconfiguratie voor 2025 en 2026 met officiële bronlinks en controledatum. Een onbekend jaar krijgt geen stilzwijgende nieuwe tarieven.
- Het oude Zvw-percentage van 5,32% is vervangen door het gepubliceerde percentage en maximum van het gekozen jaar.
- Jaar-, kwartaal- en maandscenario's: eerst het jaarbedrag berekenen, dan een gelijk deel aan de gekozen periode toewijzen. Een jaarmaximum wordt niet opnieuw volledig op iedere maand toegepast.
- Werkelijke aftrekbare voorbelasting wordt apart ingevuld. Het verkoop-btw-percentage wordt niet langer automatisch op alle kosten toegepast. Bij gemengde tarieven kan de gebruiker de werkelijke omzet-btw invullen.
- KOR: geen omzet-btw of aftrek van voorbelasting; kosten inclusief niet-aftrekbare btw. Een werkelijke overschrijding van de grens wordt onderscheiden van een projectie bij gelijkblijvende omzet.
- Een btw-teruggaaf wordt apart getoond en financiert niet alvast de weergegeven winst na reservering.
- Instelbare extra veiligheidsmarge. Negatieve winst en een tekort na reserveringen worden zichtbaar gehouden.
- CSV wordt uitsluitend lokaal gelezen. Alleen geselecteerde EUR-ontvangsten worden overgenomen, na een voorvertoning. Leningen, privéontvangsten en interne overboekingen zijn niet automatisch omzet. Transacties uit een ander jaar kunnen niet worden geselecteerd; onbekende datums vragen eigen controle.
- Strikte bedrag-, datum- en CSV-validatie, bestands-/recordlimieten, paginering en foutmeldingen. De gebruiker kan ongeldige invoer herstellen.
- Nederlands en Engels, gekoppelde veldlabels, toetsenbordbediening en zichtbare rekenstappen/bronnen. De server controleert financiële rechten vóór toegang tot deze pagina.

## Rekenmodel en grenzen

Inkomstenbelasting blijft een **door de gebruiker gekozen reserveringspercentage**, geen automatische persoonlijke IB/PVV-berekening. Zelfstandigenaftrek, startersaftrek, mkb-winstvrijstelling, heffingskortingen, ander inkomen en leeftijd worden niet automatisch toegepast. Die uitbreiding vereist een aparte invoer- en voorwaardencontrole. De fiscale bronnen voor die volgende stap worden afzonderlijk vastgelegd.

Voor Zvw gebruikt dit eenvoudige model de winst vóór persoonlijke aftrekken. De uiteindelijke aanslag gebruikt de toepasselijke bijdragegrondslag; ander inkomen kan ook een deel van het jaarmaximum gebruiken. Dit model kan daardoor te veel reserveren. Een IB-keuze zoals 30% kan voor een andere persoonlijke situatie juist te weinig zijn; de extra marge biedt geen garantie. Laat deze instellingen en complexe situaties door een boekhouder beoordelen.

Bij een maand of kwartaal wordt de periodewinst naar een jaar doorgetrokken, tenzij een eigen jaarverwachting wordt ingevuld. Dit is een gelijke periodieke reservering; betaalde voorlopige aanslagen, bestaande reserves en seizoensverschillen worden niet automatisch verrekend. Een bv krijgt VPB over de jaarverwachting; DGA-loon, loonheffingen, box 2 en verliesverrekening zijn niet berekend.

De calculator verdeelt de winst en persoonlijke Zvw-grenzen niet over meerdere vennoten. Een vof heeft afzonderlijke persoonlijke berekeningen per vennoot nodig; de gezamenlijke btw-administratie kan niet simpelweg naar één persoonlijk winstaandeel worden verkleind.

Omzet minus kosten en reserves is **indicatieve winst na reservering**, geen banksaldo of gegarandeerd vrij besteedbaar geld. Investeringen, onbetaalde facturen, privéopnames en werkkapitaal kunnen het beschikbare geld veranderen. Bankontvangsten bepalen bovendien niet zonder meer de btw-aangifteperiode; bij het factuurstelsel is doorgaans de factuurdatum leidend. De calculator doet geen aangifte en slaat geen financiële mutatie op.

## Bestanden en database

- Nieuw: `lib/fiscal-rates.ts`, `lib/fiscal.ts`, `lib/fiscal-csv.ts`, `tests/fiscal.test.ts`, `tests/fiscal-csv.test.ts`, `e2e/fiscal-flows.spec.ts`, deze opleverdocumentatie en [fiscale-bronnen-2025-2026.md](fiscale-bronnen-2025-2026.md).
- Aangepast: `components/fiscale-rust/FiscaleRust.tsx`, `app/[locale]/(dashboard)/fiscale-rust/page.tsx`, fiscale vertalingen en rondleidingen in `messages/nl.json` en `messages/en.json`, uitvoeringsplan en uitrolstatus van de eerste ronde. In `e2e/core-flows.spec.ts` leest de factuurtest de opgeslagen factuur terug na de paginawisseling, zodat die niet meer wacht op een door navigatie afgebroken browserantwoord.
- Geen Prisma-schemawijziging, migratie of schrijvende test tegen productie. Broncodekopie vóór deze ronde: `saldova-backups/voor-fiscale-ronde-20260916.zip` (zonder secrets).

## Validatie en uitrol

23 september: 264 unit-/regressietests in 22 bestanden geslaagd, waaronder 39 fiscale scenario-/grenswaardetests en 67 CSV-/bedragtests. Alle 15 browser-/API-scenario's geslaagd, waaronder de eerdere 9 kernflows en 6 nieuwe fiscale flows. Die controleren jaarwissels, jaarmaximum bij maandreserves, CSV-selectie, KOR, Engelse bv-berekening, 360px, toegankelijkheid binnen het fiscale hoofdscherm en weigering van een medewerker zonder financiële rechten. Geen echte betalingen of klantmails.

Lint, TypeScript en de lokale productiebuild zijn geslaagd. De NL/EN-sleutels van deze module zijn gelijk (112 sleutels). Npm-audit van de productieafhankelijkheden meldt op 23 september geen bekende kwetsbaarheden. Dit is geen volledige beveiligings- of WCAG-audit van de hele app.

Op 23 september gepubliceerd en gepromoveerd naar `saldova.vercel.app`: deployment `dpl_GzR5LtMCYZq2ZfVxoD566s8TNiqA`, URL `https://saldova-9s8aer80s-kerstman314-2971s-projects.vercel.app`. De afzonderlijke Vercel-build is geslaagd. Vóór promotie gaf de niet-ingelogde API 401 met `private, no-store`; de fiscale pagina leidde naar het inlogscherm. De laatste lokale productiebuild doorstond alle 15 browser-/API-tests in 45,2 seconden.

**Overdracht op 30 september:** inmiddels is een andere, latere deployment actief: `dpl_CSjc4y82Es7LqF4TsWDxyfk8EFTG` (`saldova-fzfoculry-kerstman314-2971s-projects.vercel.app`, aangemaakt 23 september om 13:25). Die latere versie is niet door deze werkzaamheden gepubliceerd of inhoudelijk geverifieerd. De live wijzigingen kunnen daarom niet zonder vergelijking gelijk worden gesteld aan de hier beschreven en lokaal geteste code. Zie [overdracht-claude.md](overdracht-claude.md).

## Configuratie en vervolg

Voor deze lokale calculator zijn geen nieuwe externe accounts of API-sleutels nodig. Officiële bedrijfsgegevens, KvK, contactadres en eigen domein blijven zoals afgesproken uitgesteld. De eerder ontbrekende e-mail-/betaalconfiguratie wordt door deze ronde niet ingevuld.

De volledige productspecificatie blijft open: onder meer automatische persoonlijke fiscaliteit, opgeslagen voorkeuren/onboarding, volledige factuurrelaties, opslag van bonnetjes, accountverificatie/reset, abonnementsverbeteringen en juridische/marketingcontrole. Zie [uitvoeringsplan.md](uitvoeringsplan.md).
