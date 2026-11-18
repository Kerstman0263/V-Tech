# Saldova

Boekhouden voor zzp'ers, webshops en kleine bedrijven: facturen, uren, ritten en je
belastingbuffer op één plek, in gewone taal.

**Saldova hoort bij Ova Groep**, naast [Cloudova](https://cloudova.vercel.app) (websites)
en [Wardova](https://wardova.vercel.app) (beveiliging). Live: https://saldova.vercel.app.

> Saldova is **in ontwikkeling en nog niet officieel gelanceerd**. Betaalde plannen
> worden te koop bij de lancering; tot die tijd begin je gratis (bedrijven met een
> proefperiode van 30 dagen op Business). Online betalen en het versturen van e-mail
> zijn nog niet live ingesteld.

## Onderdelen

- **Facturen en offertes**: automatisch genummerd, als PDF en als e-factuurbestand (UBL),
  met betaal-QR. Snelle offertes, terugkerende facturen en creditnota's.
- **Uren en ritten**: urenregistratie per klant/project, urencriterium-check,
  rittenregistratie gescheiden van privé.
- **Fiscale Rust (belastingbuffer)**: een uitlegbare schatting van btw, inkomstenbelasting
  en Zvw, met zichtbare aannames. Geen fiscaal advies.
- **Btw**: kwartaaloverzicht en kwartaalcontrole; voor webshops btw per EU-land
  (voorbereiding op de OSS-aangifte).
- **Bank en inbox**: bank-CSV importeren (ING, Rabobank, Knab), documentinbox voor bonnen
  en facturen.
- **Webshops** (Webshop-plan): Shopify, WooCommerce en Bol.com koppelen met een koppelcode
  (alleen leesrechten), andere platforms via CSV.
- **Team** (Business-plannen): medewerkers, verlof, taken, uren goedkeuren, rollen en
  rechten.
- **Overstappen**: klanten importeren uit een CSV-export (`/overstappen`).
- **Website**: publieke pagina's in het Nederlands en Engels, met eigen 404- en
  foutpagina's.

Prijzen (per maand, excl. btw): Gratis € 0, Groei € 15, Pro € 29, Webshop € 39,
Business € 79, Business+ € 149. Zie `lib/plans.ts`.

## Huisstijl

Saldova binnen Ova: violet `#7C3AED` (licht `#a78bfa` voor tekst op donker) op de donkere
Ova-grond `#0b0f14`, kaarten `#11161d` met rand `#1f2937`, witte primaire knoppen.

- Tailwind-tokens (`tailwind.config.ts`): `saldova`, `saldova-licht`, `grond`, `kaart`,
  `rand`, `tekst-gedempt`. Deze hangen niet aan het paneel.
- `brand-*` volgt het paneel via CSS-variabelen (`app/globals.css`): zzp paars, webshop
  mint, bedrijf blauw.
- Logo: het Ova-ei voor Saldova (`components/ova-ei.tsx`, `OvaEi merk="saldova"`) met het
  woordmerk SALDOVA; samen in `components/ui/SaldovaLogo.tsx`. Pas de vorm van het ei
  niet aan.
- Knoppen: `components/ui/Button.tsx` (`Button` of `buttonClass()` voor links), velden:
  `fieldClass` uit `components/ui/Input.tsx`.

## Tech-stack

| Laag | Keuze |
|------|-------|
| Framework | **Next.js 15** (App Router) |
| Styling | Tailwind CSS |
| Database | PostgreSQL via **Prisma** (Supabase) |
| Auth | NextAuth (Auth.js v5), JWT-sessies |
| Betalingen | Mollie (nog niet live) |
| i18n | **next-intl**: Nederlands + Engels (`messages/nl.json`, `messages/en.json`) |
| Tests | Vitest (unit), Playwright (browser) |

## Projectstructuur

```
app/
  [locale]/            # / (nl) en /en
    (auth)/            # inloggen, registreren
    (dashboard)/       # achter login
    [...rest]/         # onbekende URL's -> eigen 404
  api/                 # backend (serverless functions)
components/            # UI + feature-componenten (landing/ = website)
lib/                   # db, auth, pdf, encryptie, fiscale rekenkern, validaties
messages/              # nl.json / en.json (identieke sleutels)
prisma/                # schema.prisma
i18n/                  # routing + request config
```

## Lokaal opstarten

1. `npm install`
2. Kopieer `.env.example` naar `.env.local` en vul je **eigen, lokale** waarden in.
   Gebruik voor ontwikkelen en testen een aparte database, nooit de productiedatabase.
   ```bash
   # AUTH_SECRET
   openssl rand -base64 32
   # ENCRYPTION_KEY (32 bytes hex)
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. Schema naar je lokale database: `npm run db:push` (of `npm run db:migrate`).
4. Optioneel voorbeelddata: `npm run db:seed` (alleen op je lokale database; maakt een
   beheerder uit je eigen `ADMIN_EMAIL`/`ADMIN_PASSWORD` en een demo-account).
5. `npm run dev` en open http://localhost:3000

Inloggegevens staan nooit in deze README of in de code; gebruik je eigen `.env.local`.

## Controleren

```bash
npx tsc --noEmit   # typecheck
npm run lint
npm test           # vitest (unit)
npm run build
```
Browsertests (`npm run test:e2e`) schrijven naar de database: draai ze alleen tegen een
lokale testdatabase.

## Deployen

Vercel, regio `fra1` (Frankfurt). Zet dezelfde env-variabelen in het Vercel-dashboard.
De build (`vercel-build`) draait de migraties automatisch.

Let bij deze variabelen op (uitleg ook in `.env.example`):

- `INBOUND_WEBHOOK_SECRET`: beveiligt `/api/inbound/email`. Alleen nog via de header
  (`Authorization: Bearer <geheim>` of Basic-auth). Een geheim in het adres (`?secret=`)
  geeft nu 401: **zet de mailprovider om vóór de deploy**, anders worden inkomende
  bonnetjes geweigerd.
- `MOLLIE_INVOICE_PAYMENTS`: `1` zet de online betaallink op facturen aan, alleen samen
  met `MOLLIE_API_KEY`. Zonder één van beide krijgt de klant alleen de bankgegevens.
- `WARDOVA_SHIELD_KEY`: zet Wardova Shield aan. Saldova draait Shield altijd in de
  Monitor-stand (alleen melden, nooit blokkeren); webhooks en de cron gaan er buiten om.
  Bij verdachte verzoeken gaan IP-adres, pad, user-agent en land naar Wardova; dat staat
  in de privacyverklaring.
- `MOLLIE_API_KEY`: nieuwe abonnementen worden **inclusief 21% btw** geïncasseerd
  (bijvoorbeeld Pro € 29 excl. btw = € 35,09). De bevestigingsvraag in de app noemt beide
  bedragen. Lopende abonnementen op het oude bedrag worden nog steeds herkend.

## i18n

```tsx
import { useTranslations } from "next-intl";
const t = useTranslations("invoices");
t("title"); // "Facturen" / "Invoices"
```
Houd `nl.json` en `en.json` altijd met identieke sleutels.

## Privacy

- Gevoelige velden worden versleuteld opgeslagen (`lib/encryption.ts`); wachtwoorden met
  bcrypt.
- Verwijderen van een account verwijdert de bijbehorende gegevens; facturen kennen een
  wettelijke bewaarplicht van 7 jaar.
- Data staat op servers in de EU.
