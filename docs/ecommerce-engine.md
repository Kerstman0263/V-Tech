# E-commerce engine — ontwerp (stap 1)

Status: **ontwerp, nog niet live.** Het schema staat in `prisma/sql-pending/` en wordt
bewust níet door `scripts/db-migrate.mjs` uitgevoerd. Controle:

```bash
node scripts/check-pending-schema.mjs 2026-10-15-ecommerce-engine
```

Dat bouwt een lege, lokale database met het huidige schema, voert de SQL twee keer uit
(idempotent) en controleert dat SQL en Prisma-modellen exact overeenkomen.

## Wat er al is (oktober 2026)

- Koppelingen Shopify (Admin GraphQL), WooCommerce (REST v3), Bol.com (Retailer v10) en CSV.
- Orders als `WebshopOrder` (bruto, btw, land, kosten), OSS-drempel en btw per land.
- Ophalen gebeurt door synchroniseren (pull), nog niet via webhooks.

## Nieuwe tabellen

| Gevraagd | In Saldova | Waarvoor |
| --- | --- | --- |
| ecommerce_connections | `WebshopConnection` (+ `bookingMode`, `webhooksEnabled`) | koppeling + boekwijze |
| orders | `WebshopOrder` (+ korting, kostprijs, payout, dagstaat) | één rij per order/retour |
| order_items | `WebshopOrderLine` | regels met btw-tarief en kostprijs-snapshot |
| — | `ProductCost` | kostprijs per SKU met ingangsdatum |
| payouts | `WebshopPayout` + `WebshopPayoutLine` | uitbetaling = bruto − kosten ± correcties |
| ad_spend_logs | `AdSpendEntry` | advertentiekosten per dag, met btw-behandeling |
| — | `WebhookEvent` | inbox: hetzelfde event twee keer = één verwerking |
| — | `WebshopSettlement` | dagstaat/weekstaat als één boeking |
| tax_buffers | *geen tabel* | wordt berekend uit de bron (orders, kosten); een opgeslagen kopie raakt uit sync |

Keuzes:
- **RLS aan, zonder policies.** Saldova gebruikt NextAuth + Prisma op de server, geen
  Supabase Auth. Policies op `auth.uid()` zouden nooit matchen; de publieke Supabase-API
  ziet zo niets. De account-scope wordt in de server-code afgedwongen (`where: { userId }`).
- **Geen ruwe webhook-payloads opslaan.** Die bevatten namen en adressen (AVG). We bewaren
  alleen id's en halen de order daarna zelf op.
- Elke unieke sleutel maakt import en webhooks idempotent; `externalUpdatedAt` voorkomt dat
  een oude webhook een nieuwere stand overschrijft.

## Webhooks en uitbetalingen

- Shopify-webhooks `orders/paid`, `orders/updated`, `refunds/create`: HMAC-controle met het
  app-secret, binnen 5 s antwoorden, verwerking daarna (inbox-patroon).
- **Shopify heeft géén payout-webhook.** Uitbetalingen van Shopify Payments komen uit de
  Admin API (`shopifyPaymentsAccount.payouts` + balance transactions) via periodiek ophalen.
- Matchen met de bank: exact op nettobedrag + datumvenster (±3 dagen) tegen
  `BankTransaction`; bij twijfel een voorstel, nooit automatisch boeken.

Voorbeeld: order € 100 incl. btw, provider houdt € 2,50 in, uitbetaling € 97,50 →
omzet € 100 (waarvan btw), kosten € 2,50, bankbijschrijving € 97,50 gematcht.

## Btw — waar je op moet letten

- **Advertenties van Meta (Ierland) en vergelijkbare EU-diensten:** btw verlegd, rubriek **4b**.
  Diensten van buiten de EU: rubriek **4a**. Dit herkennen we op leverancier + land, en de
  gebruiker bevestigt.
- **Goederen van buiten de EU (AliExpress, CJ, …) zijn géén "btw verlegd".** Dat is invoer:
  vaak via IOSS of invoerbtw bij de douane. Dropshipping waarbij goederen direct van
  buiten de EU naar de klant gaan, heeft eigen regels. Hier geen automatische conclusies,
  maar een duidelijke vraag aan de gebruiker en advies om een adviseur te raadplegen.
- Belastingtarieven komen alleen uit `lib/fiscal-rates.ts` (geverifieerde jaren).
  Zelfstandigenaftrek, startersaftrek en MKB-winstvrijstelling pas toevoegen met per jaar
  gecontroleerde bedragen en bron.

## Niet doen (juridisch)

- Geen vergelijkingstabel met Moneybird/e-Boekhouden met claims die we niet met een bron en
  datum kunnen onderbouwen (vergelijkende reclame moet objectief en controleerbaar zijn).
- Geen functies op de website tonen die nog niet bestaan (true net profit, automatische
  payout-matching, AI-scanner van advertentiefacturen) tot ze werken.
- Geen "live"-status of "24/7"-claims voor support zolang dat niet zo is.

## Volgende stappen

1. Orderregels + `ProductCost` vullen bij Shopify/Woo-sync; `cogsAmount` berekenen.
2. Advertentiekosten handmatig/CSV invoeren → "echte winst"-kaart op het webshopdashboard.
3. Shopify-webhooks (inbox) + periodiek payouts ophalen + bankmatching-voorstel.
4. Dagstaat-boekwijze en afsluiten per dag/week.
