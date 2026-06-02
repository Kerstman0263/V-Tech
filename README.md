# V-Tech Systems

Schaalbare SaaS-toolkit voor zzp'ers en kleine bedrijven. **MVP:** een bizar snelle
Facturen-tool waarmee ondernemers facturen maken, opslaan en als PDF downloaden.

## Tech-stack

| Laag | Keuze |
|------|-------|
| Framework | **Next.js 15** (App Router) — frontend én backend in één, Vercel-native |
| Styling | Tailwind CSS |
| Database | PostgreSQL via **Prisma** (Neon / Supabase / Vercel Postgres) |
| Auth | NextAuth (Auth.js v5), JWT-sessies |
| Betalingen | **Mollie** (terugkerende iDEAL/creditcard-incasso) |
| i18n | **next-intl** — Nederlands + Engels (`messages/nl.json`, `messages/en.json`) |
| AVG | AES-256-GCM veld-encryptie (`lib/encryption.ts`) |

## Projectstructuur

```
app/
  [locale]/            # /nl en /en routes
    (auth)/            # login + register
    (dashboard)/       # achter login: invoices, customers, settings
  api/                 # backend (serverless functions)
    auth/, register/, invoices/, customers/, webhooks/mollie/
components/            # herbruikbare UI + feature-componenten
lib/                   # db, auth, mollie, pdf, encryption, validations
messages/              # nl.json / en.json
prisma/                # schema.prisma
i18n/                  # routing + request config
```

## Lokaal opstarten

1. **Dependencies installeren**
   ```bash
   npm install
   ```

2. **Environment instellen** — kopieer `.env.example` naar `.env.local` en vul in:
   ```bash
   cp .env.example .env.local
   ```
   Genereer de secrets:
   ```bash
   # AUTH_SECRET
   openssl rand -base64 32
   # ENCRYPTION_KEY (32 bytes hex)
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **Database opzetten** (PostgreSQL connection string in `DATABASE_URL`)
   ```bash
   npm run db:push      # schema naar database pushen
   # of: npm run db:migrate   (met migratie-historie)
   ```

4. **Starten**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000

## Deployen naar Vercel

```bash
vercel            # eerste keer: koppelt project
vercel --prod     # productie-deploy
```
Zet dezelfde env-variabelen in het Vercel-dashboard. De `vercel.json` zet de
regio op `fra1` (Frankfurt) zodat data in de EU draait (AVG).

## i18n gebruiken

In een component:
```tsx
import { useTranslations } from "next-intl";
const t = useTranslations("invoices");
t("title");                    // "Facturen" / "Invoices"
t("greeting", { name: "Jan" }); // met variabele
```
Houd `nl.json` en `en.json` altijd met identieke sleutels.

## AVG / privacy

- Gevoelige velden (KvK, BTW, adres) worden versleuteld opgeslagen via `lib/encryption.ts`.
- Wachtwoorden via bcrypt (kosten 12).
- `onDelete: Cascade` op user-data (recht op verwijdering); `Restrict` op
  klant→factuur (7 jaar bewaarplicht facturen).
- Data draait in de EU-regio (`fra1`).
