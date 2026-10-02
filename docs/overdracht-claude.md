# Saldova — overdracht aan Claude

Afgerond voor overdracht op 30 september 2026. De gebruiker wil nu verder met Claude. Er is geen verdere achtergrondtaak of automatische vervolguitrol ingesteld. **De volledige productspecificatie is niet af.** Twee samenhangende herstelrondes zijn uitgevoerd; hieronder staat wat daadwerkelijk is gebouwd, getest en gepubliceerd.

## Eerst lezen: lokale code en live versie verschillen mogelijk

- Werkmap: `C:\Users\valdr\Downloads\v-techsystems.nl\V-Tech`.
- Electron-wrapper: naast de werkmap in `saldova-desktop`; in deze rondes niet herbouwd.
- Vercel-project: `saldova`, project-ID `prj_HXstWCYWzHFIwfMU2fEoJUnHGNYR`. Gebruik de koppeling in **V-Tech/.vercel**. De koppeling in de bovenliggende map hoort bij een ander project.
- Onze eerste gepubliceerde ronde: `dpl_88Um14opVyQmMX8cpf6hBk4DG8GR` op 8 september.
- Onze tweede gepubliceerde en gepromoveerde ronde: `dpl_GzR5LtMCYZq2ZfVxoD566s8TNiqA` op 23 september, URL `https://saldova-9s8aer80s-kerstman314-2971s-projects.vercel.app`.
- **Actueel op 30 september:** `saldova.vercel.app` verwijst naar een latere deployment, `dpl_CSjc4y82Es7LqF4TsWDxyfk8EFTG`, URL `https://saldova-fzfoculry-kerstman314-2971s-projects.vercel.app`, aangemaakt op 23 september om 13:25. De maker en wijzigingen van die latere uitrol zijn hier niet vastgesteld. Deze versie is niet overschreven tijdens de overdracht.
- De lokale werkmap bevat gewijzigde én nieuwe, nog niet gecommitte bestanden. Er waren ook vóór onze werkzaamheden bestaande wijzigingen. **Niet resetten, schoonmaken of blind over de huidige productieversie deployen.** Vergelijk eerst Git, lokale wijzigingen en de latere deployment. Huidige lokale HEAD bij overdracht: `7f07d35` (`Saldova`). Er is in deze herstelrondes geen commit gemaakt.

De korte live controle op 30 september gaf `/login` 200 en `/api/invoices` zonder sessie 401. De 401-response had `Cache-Control: public, max-age=0, must-revalidate`, terwijl onze lokale middleware en gecontroleerde uitrol `private, no-store` gebruiken. Dit is een concrete afwijking om bij het vergelijken na te lopen; geen bewijs dat financiële gegevens zijn gelekt. Een gewone HTTP-fetch van `/fiscale-rust` gaf 200; dit controleert geen uiteindelijke browserredirect of toegang na inloggen. De huidige live gebruikersflows zijn niet opnieuw volledig getest.

## Wat is gedaan

### 1. Bestaande architectuur onderzocht en P0 hersteld

Next.js 15, React 19, Prisma/PostgreSQL, Auth.js, next-intl, Mollie en Resend behouden. Bestaande donkere paarse Saldova-identiteit en het teal bedrijfspaneel behouden.

- Dependencybeveiligingsupdates, securityheaders, origin-controle op API-mutaties en private API-cacheheaders.
- Rechten bij sessiegebruik opnieuw server-side controleren; wachtwoord-/2FA-wijziging trekt bestaande sessies in.
- Tenantcontrole bij urenwijzigingen; factureren alleen met toegestane, goedgekeurde en nog niet gefactureerde uren.
- Factuurnummering, regels, urenclaims en audit samen in transacties; consistente centafronding, ook voor credits.
- E-mailfouten laten een factuur concept; laatste verzendcontrole met ontvanger/bedrag/PDF; beperkte ondertekende PDF-link voor klanten zonder account.
- Alleen conceptfacturen verwijderen; gekoppelde uren vrijgeven. Bankkoppeling controleert richting, exact bedrag, valuta, tenant en status.
- Herhaalde offerteconversie en periodieke verwerking veiliger; herinneringen pas tellen na provideracceptatie.
- Mollie-verificatie en herstel bij herhaalde meldingen; checkout geeft niet alvast een betaald plan. Bestaande providerabonnementen terugvinden vóór opnieuw aanmaken.
- Abonnementsbeheer en volledige accountexport beperken tot bevoegden. Netwerkfouten en mobiele factuurweergave verbeterd.

Volledige details, gewijzigde bestanden en beperkingen: [eerste-herstelronde.md](eerste-herstelronde.md) en [eerste-ronde-bestanden.json](eerste-ronde-bestanden.json).

### 2. Bestaande Fiscale Rust uitgebreid

- Centrale jaarconfiguratie 2025/2026 met officiële Belastingdienst-bronnen en versienummers.
- Juiste gepubliceerde Zvw-percentages en jaarmaxima, VPB-schijven eerst op jaarbasis en daarna verdelen over maand/kwartaal.
- Werkelijke voorbelasting apart invoeren; optioneel werkelijk omzet-btw-bedrag voor gemengde tarieven.
- KOR houdt rekening met niet-aftrekbare btw in kosten. Ingevoerde omzet boven de KOR-grens blokkeert een misleidende berekening.
- Extra veiligheidsmarge, eigen jaarverwachting, verlies/tekort en mogelijke btw-teruggaaf zichtbaar.
- CSV lokaal voorvertonen; niets standaard geselecteerd. Alleen bevestigde ontvangsten als omzet overnemen. Strikte bedragen/datums/valuta, limieten en paginering.
- NL/EN-uitleg, veldlabels, toetsenbordbediening, rekenstappen en servercontrole op financiële rechten.

**IB blijft een persoonlijk gekozen reserveringspercentage.** Er is geen automatische persoonlijke IB/PVV-berekening met aftrekposten/heffingskortingen. Resterende winst is geen beschikbaar banksaldo. Meerdere vennoten vragen aparte persoonlijke berekeningen. Raadpleeg [fiscale-herstelronde.md](fiscale-herstelronde.md) voor alle grenzen en bestanden. [fiscale-bronnen-2025-2026.md](fiscale-bronnen-2025-2026.md) bevat ook onderzoek voor toekomstige automatische IB; dat is nadrukkelijk nog niet geïmplementeerd.

## Testbewijs en database

Laatste volledige controle op **23 september 2026**:

- 264 unit-/regressietests in 22 bestanden geslaagd.
- 15 browser-/API-scenario's tegen een lokale productiebuild geslaagd, geen overgeslagen of flaky tests.
- TypeScript, ESLint, lokale productiebuild en afzonderlijke Vercel-build geslaagd.
- Mobiel op 360px, desktop en een gerichte toegankelijkheidscontrole van Fiscale Rust geslaagd; geen volledige WCAG-audit van de hele app.
- Npm-audit productieafhankelijkheden: 0 bekende kwetsbaarheden op die controledatum.
- Geen Prisma-schemawijzigingen of productiemigraties. Geen echte klantmails, betalingen of schrijvende tests tegen de productieadministratie.

Browser-/DB-tests gebruiken een geïsoleerde lokale PGlite-database op loopbackpoort 55432; de testserver draait op `localhost:3100`. Dit is geen volwaardige PostgreSQL-concurrencytest. De scripts zetten echte betaal-/mailproviders uit. Gebruik geen productie-DB voor tests.

Herhalen vanuit V-Tech:

```powershell
npm test
npm run lint
npm run typecheck
node scripts/verify-build.mjs
$env:SALDOVA_E2E_PRODUCTION = '1'
npm run test:e2e
```

De lokale testbuild mag niet via `vercel --prebuilt` naar productie; Vercel moet opnieuw bouwen met de eigen configuratie.

## Wat nog openstaat

Het volledige vervolg staat in [uitvoeringsplan.md](uitvoeringsplan.md). Belangrijke open punten: opgeslagen onboarding/modulekeuze; volledige factuurkortingen, deelbetalingen, credits en aanbetalingsrelaties; veilige bonnenopslag; verificatie-/reset-/uitnodigingsmails; gedeelde rate limiting; consistente maand-/jaarabonnementen en proefperiode; volledige audit/export; automatische persoonlijke fiscaliteit; alle schermen toegankelijk/mobiel; juridische concepten, eerlijke marketing en SEO.

Bij de configuratiecontrole op 8 september ontbraken `RESEND_API_KEY` en `MOLLIE_API_KEY`. Die zijn door ons niet toegevoegd; controleer actuele configuratie zonder sleutelwaarden te publiceren. E-mail vereist later ook een geverifieerd verzenddomein.

De gebruiker heeft expliciet gezegd: **nog niets is officieel; KvK, bedrijfsgegevens, contactadres en definitief domein komen later. Niets daarvoor verzinnen of als officieel publiceren.** Bestaande identiteit behouden en in kleine samenhangende rondes blijven werken.

## Bewaren

Broncodekopieën zonder secrets staan naast V-Tech in `saldova-backups`:

- `voor-verbeteringen-20260905-191704.zip`
- `voor-fiscale-ronde-20260916.zip`

Testresultaten en schermafbeeldingen staan in `V-Tech/test-results`; de live controle bij overdracht in `saldova-backups/fiscal-live-validation-20260930.json`. Er staan geen toegangstokens in deze overdracht. De Vercel CLI was bij de laatste controle al aangemeld.
