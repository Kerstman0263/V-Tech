/**
 * Beveiligingspagina (/beveiliging) en public/.well-known/security.txt.
 *
 * Elk punt op de pagina is nagelopen in de code en de config. Verandert een van deze plekken,
 * pas dan ook de tekst aan (messages: securityPage.*). tests/security-page.test.ts faalt zodra
 * de code een belofte niet meer waarmaakt.
 *  - Waar de app draait: vercel.json ("regions": ["fra1"]). De database (Supabase, Ierland) en de
 *    e-mail (Resend) staan in de privacyverklaring (lib/legal/content.ts); de databaseregio staat
 *    alleen in DATABASE_URL en is niet in de code te zien.
 *  - Versleuteling: lib/encryption.ts (AES-256-GCM). encrypt() wordt alleen aangeroepen voor de
 *    velden in ENCRYPTED_FIELDS: app/api/account/route.ts (KvK, btw, adres van je bedrijf),
 *    app/api/customers/** (adres van je klant), app/api/account/2fa/setup (2FA-geheim) en
 *    lib/webshop/service.ts (sleutels van webshopkoppelingen).
 *  - Inloggen: bcrypt (kosten 12), TOTP (lib/totp.ts, back-upcodes als HMAC-hash), limieten in
 *    lib/login-guard.ts en lib/rate-limit.ts (in het geheugen, per serverinstantie).
 *  - Rechten: lib/permissions.ts, boekhouder: app/api/team/accountant/route.ts.
 *  - Monitoring: Wardova Shield in middleware.ts met monitorOnly: true (blokkeert niets).
 *  - Subverwerkers: de lijst uit de privacyverklaring (lib/legal/content.ts, onderdeel 4).
 *  - Back-ups: Saldova belooft geen back-uptermijn; die is (Supabase gratis plan) niet aan te tonen.
 *
 * Geen database, geen Next: bruikbaar in tests. Gebruikt lib/login-guard (en daarmee bcryptjs),
 * dus importeer in clientcomponenten alleen typen hieruit.
 */

import { LOGIN_EMAIL_LIMIT, LOGIN_EMAIL_WINDOW_MS, LOGIN_IP_LIMIT, LOGIN_IP_WINDOW_MS } from "@/lib/login-guard";

/** Pad van de pagina (zonder taalprefix), ook in PUBLIC_PAGES in lib/seo.ts. */
export const SECURITY_PATH = "/beveiliging" as const;

/** Pad van security.txt (RFC 9116), als bestand in public/. */
export const SECURITY_TXT_PATH = "/.well-known/security.txt" as const;

/** De Vercel-regio waar de app draait (vercel.json). */
export const APP_REGION = "fra1" as const;

/** De onderdelen van de pagina, in volgorde (messages: securityPage.sections.<key>). */
export const SECURITY_SECTIONS = ["location", "encryption", "login", "team", "monitoring", "processors", "backups", "report", "breach"] as const;
export type SecuritySection = (typeof SECURITY_SECTIONS)[number];

/** Waar de gegevens staan (messages: securityPage.location.<key>). */
export const DATA_LOCATIONS = ["app", "database", "email"] as const;

/**
 * Velden die Saldova met AES-256-GCM versleutelt voordat ze in de database gaan
 * (messages: securityPage.encrypted.<key>). Alleen deze: de rest van de administratie heeft
 * geen extra veldversleuteling.
 */
export const ENCRYPTED_FIELDS = ["companyIds", "companyAddress", "customerAddress", "totpSecret", "webshopKeys"] as const;

/** Wat er bij het inloggen gebeurt (messages: securityPage.login.<key>). */
export const LOGIN_MEASURES = ["bcrypt", "totp", "limits", "sessions"] as const;

/** Rollen in een team, in de volgorde van lib/permissions.ts (messages: securityPage.roles.<key>). */
export const TEAM_ROLES = ["owner", "manager", "accountant", "employee"] as const;

/**
 * Subverwerkers zoals in de privacyverklaring (lib/legal/content.ts, onderdeel 4), in dezelfde
 * volgorde (messages: securityPage.processors.<key>).
 */
export const PROCESSORS = ["vercel", "supabase", "mollie", "resend", "wardova", "mindee", "webshops"] as const;

/** Vercel-regio's binnen de EU, met de plaats. Londen (lhr1) valt erbuiten. */
const EU_REGIONS: Record<string, string> = {
  fra1: "Frankfurt",
  cdg1: "Paris",
  dub1: "Dublin",
  arn1: "Stockholm",
};

export type ServerRegion = { region: string | null; place: string | null; eu: boolean };

/**
 * Waar deze server draait, uit VERCEL_REGION (die zet Vercel zelf, alleen tijdens het draaien).
 * Voor de statuscheck in de hulp-widget: zo is "App-server in Frankfurt" echt gemeten.
 */
export function serverRegion(region: string | null | undefined): ServerRegion {
  const code = region?.trim().toLowerCase() || null;
  if (!code) return { region: null, place: null, eu: false };
  const place = EU_REGIONS[code] ?? null;
  return { region: code, place, eu: place !== null };
}

/**
 * Waarden voor de teksten (ICU-plaatshouders), uit de echte limieten in lib/login-guard.ts.
 * Zo noemt de pagina nooit een ander getal dan de code gebruikt.
 */
export function securityMessageValues(): { failures: number; failureMinutes: number; ipLimit: number; ipMinutes: number } {
  return {
    failures: LOGIN_EMAIL_LIMIT,
    failureMinutes: Math.round(LOGIN_EMAIL_WINDOW_MS / 60_000),
    ipLimit: LOGIN_IP_LIMIT,
    ipMinutes: Math.round(LOGIN_IP_WINDOW_MS / 60_000),
  };
}
