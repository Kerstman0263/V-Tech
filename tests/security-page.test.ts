import { describe, it, expect, vi } from "vitest";
import { createTranslator } from "next-intl";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_REGION,
  DATA_LOCATIONS,
  ENCRYPTED_FIELDS,
  LOGIN_MEASURES,
  PROCESSORS,
  SECURITY_PATH,
  SECURITY_SECTIONS,
  SECURITY_TXT_PATH,
  TEAM_ROLES,
  securityMessageValues,
  serverRegion,
} from "@/lib/security-page";
import { LOGIN_EMAIL_LIMIT, LOGIN_EMAIL_WINDOW_MS, LOGIN_IP_LIMIT, LOGIN_IP_WINDOW_MS, loginIpLimited } from "@/lib/login-guard";
import { measuredState, serverRegionCheck } from "@/lib/status-checks";
import { defaultPermissions } from "@/lib/permissions";
import { COMPANY } from "@/lib/company";
import { faqLink } from "@/lib/faq";
import { PUBLIC_PAGES } from "@/lib/seo";
import { legalContent } from "@/lib/legal/content";
import sitemap from "@/app/sitemap";
import nl from "@/messages/nl.json";
import en from "@/messages/en.json";

// Zie tests/export-guarantee.test.ts: buiten Next zijn alleen de talen nodig.
vi.mock("@/i18n/routing", () => ({ routing: { locales: ["nl", "en"], defaultLocale: "nl" } }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));

type Tree = Record<string, unknown>;
const locales = { nl: nl as unknown as Tree, en: en as unknown as Tree };
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SITE = "https://saldova.vercel.app";

function at(tree: Tree, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Tree)[key] : undefined), tree);
}

function keys(node: unknown, prefix = ""): string[] {
  if (!node || typeof node !== "object") return [prefix];
  return Object.entries(node as Tree).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

/** Alle teksten van een boom, om op claims te zoeken. */
function strings(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (!node || typeof node !== "object") return [];
  return Object.values(node as Tree).flatMap(strings);
}

function source(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

function filesIn(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(join(ROOT, rel)).isDirectory() ? filesIn(rel) : /\.tsx?$/.test(name) ? [rel] : [];
  });
}

describe("beveiligingspagina: pagina en sitemap", () => {
  it("is een publieke pagina en staat in de sitemap, in beide talen", () => {
    expect(PUBLIC_PAGES.beveiliging).toBe(SECURITY_PATH);
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain(`${SITE}/beveiliging`);
    expect(urls).toContain(`${SITE}/en/beveiliging`);
  });

  it("de footer, de exportgarantie, de homepage en de hulp-widget linken ernaar", () => {
    for (const file of [
      "components/landing/SiteFooter.tsx",
      "app/[locale]/exportgarantie/page.tsx",
      "app/[locale]/page.tsx",
      "components/landing/HelpHub.tsx",
    ]) expect(source(file), file).toContain(`href="${SECURITY_PATH}"`);
  });

  it("de FAQ over veiligheid en privacy wijst naar de pagina", () => {
    expect(faqLink("security")).toBe(SECURITY_PATH);
    expect(faqLink("avg")).toBe(SECURITY_PATH);
  });
});

describe("beveiligingspagina: teksten", () => {
  for (const [locale, m] of Object.entries(locales)) {
    const t = createTranslator({ locale, messages: m as never, namespace: "securityPage" as never }) as unknown as (
      key: string,
      values?: Record<string, number>,
    ) => string;
    const values = securityMessageValues();

    it(`${locale}: elk onderdeel heeft een tekst, zonder losse plaatshouders`, () => {
      const paths = [
        ...SECURITY_SECTIONS.flatMap((key) => [`sections.${key}.title`, `sections.${key}.desc`]),
        ...DATA_LOCATIONS.flatMap((key) => [`location.${key}.title`, `location.${key}.where`, `location.${key}.desc`]),
        ...ENCRYPTED_FIELDS.map((key) => `encrypted.${key}`),
        ...LOGIN_MEASURES.flatMap((key) => [`login.${key}.title`, `login.${key}.desc`]),
        ...TEAM_ROLES.flatMap((key) => [`roles.${key}.title`, `roles.${key}.desc`]),
        ...PROCESSORS.flatMap((key) => [`processors.${key}.name`, `processors.${key}.role`]),
        ...["location", "encryption", "login", "team", "report"].map((key) => `summary.${key}`),
        ...["what", "own", "time"].map((key) => `reportAsks.${key}`),
        ...["ap", "customers", "people", "log"].map((key) => `breach.${key}`),
      ];
      for (const path of paths) {
        const out = t(path, values);
        expect(out.trim().length, path).toBeGreaterThan(0);
        expect(out, path).not.toContain("{");
        expect(out, path).not.toBe(`securityPage.${path}`);
      }
    });

    it(`${locale}: de inloglimieten komen uit lib/login-guard, niet uit de tekst`, () => {
      const raw = at(m, "securityPage.login.limits.desc") as string;
      for (const placeholder of ["{failures}", "{failureMinutes}", "{ipLimit}", "{ipMinutes}"]) expect(raw).toContain(placeholder);
      expect(raw).not.toMatch(/\d/);
      const out = t("login.limits.desc", values);
      expect(out).toContain(String(LOGIN_EMAIL_LIMIT));
      expect(out).toContain(String(LOGIN_IP_LIMIT));
    });

    it(`${locale}: niets zegt dat alles versleuteld is opgeslagen`, () => {
      expect(at(m, "home.security.items.enc.title")).toBe(at(m, "auth.chrome.encrypted"));
      expect(strings(m).filter((s) => /^(Versleuteld opgeslagen|Encrypted at rest)$/.test(s))).toEqual([]);
    });

    it(`${locale}: de middleware wordt niet in Frankfurt geplaatst`, () => {
      // middleware.ts draait als Edge Middleware op het netwerk van Vercel; vercel.json geldt voor de serverfuncties.
      expect(source("middleware.ts")).not.toMatch(/runtime/);
      expect(t("location.app.desc")).toMatch(/Vercel/);
      expect(t("location.app.desc")).not.toMatch(/onderdelen van de app die je gegevens verwerken|parts of the app that process your data/);
    });

    it(`${locale}: SEO-gegevens zonder plaatshouders`, () => {
      for (const field of ["title", "description"]) {
        const value = at(m, `meta.pages.beveiliging.${field}`);
        expect(typeof value).toBe("string");
        expect(value as string).not.toContain("{");
      }
    });

    it(`${locale}: e-mail via Resend staat er eerlijk bij`, () => {
      expect(t("location.email.desc")).toMatch(/Resend/);
      expect(at(m, "about.values.privacy.desc") as string).toMatch(/Resend/);
      expect(t("location.email.where")).toMatch(/Amerikaans|American/);
      for (const key of ["security", "avg"]) expect(at(m, `faq.${key}.a`) as string, key).toMatch(/Resend/);
    });

    it(`${locale}: geen "data/servers in de EU" zonder voorbehoud meer`, () => {
      const bad = /(data|gegevens) (staan |stays )?in (de|the) EU|servers in (de|the) EU|opgeslagen op servers|stored on servers/i;
      const hits = strings(m).filter((s) => bad.test(s) && !/Resend|Supabase|Vercel/.test(s));
      expect(hits).toEqual([]);
    });
  }

  it("nl en en hebben precies dezelfde sleutels", () => {
    expect(keys(at(locales.en, "securityPage")).sort()).toEqual(keys(at(locales.nl, "securityPage")).sort());
    expect(keys(at(locales.en, "help")).sort()).toEqual(keys(at(locales.nl, "help")).sort());
  });
});

// De pagina belooft dingen over de code. Deze tests falen zodra de code die beloftes niet meer waarmaakt.
describe("beveiligingspagina: de code maakt de beloftes waar", () => {
  it("de app draait in de regio uit vercel.json (Frankfurt)", () => {
    const vercel = JSON.parse(source("vercel.json")) as { regions?: string[] };
    expect(vercel.regions).toEqual([APP_REGION]);
    expect(serverRegion(APP_REGION)).toEqual({ region: "fra1", place: "Frankfurt", eu: true });
  });

  it("encrypt() wordt alleen gebruikt voor de velden op de pagina", () => {
    // Elke aanroep van encrypt( (niet decrypt) buiten lib/encryption.ts, per bestand.
    const calls: Record<string, number> = {};
    for (const file of [...filesIn("app"), ...filesIn("lib")]) {
      if (file === "lib/encryption.ts") continue;
      const text = source(file);
      if (!/from "@\/lib\/encryption"/.test(text)) continue;
      const count = (text.match(/(?<![A-Za-z])encrypt\(/g) ?? []).length;
      if (count) calls[file] = count;
    }
    // Komt hier een bestand bij, zet het veld dan ook in ENCRYPTED_FIELDS en de teksten.
    expect(calls).toEqual({
      "app/api/account/route.ts": 3, // companyIds (KvK, btw) + companyAddress
      "app/api/customers/route.ts": 1, // customerAddress
      "app/api/customers/[id]/route.ts": 1, // customerAddress
      "app/api/customers/import/route.ts": 1, // customerAddress
      "app/api/account/2fa/setup/route.ts": 1, // totpSecret
      "lib/webshop/service.ts": 1, // webshopKeys
    });
    expect(source("lib/encryption.ts")).toContain('"aes-256-gcm"');
  });

  it("wachtwoorden met bcrypt (kosten 12), 2FA met TOTP", () => {
    for (const file of filesIn("app")) {
      const text = source(file);
      for (const match of text.matchAll(/bcrypt\.hash\([^,]+,\s*(\d+)\)/g)) expect(match[1], file).toBe("12");
    }
    expect(source("lib/totp.ts")).toContain("OTPAuth.TOTP");
    expect(source("lib/totp.ts")).toMatch(/BACKUP_COUNT = 10\b/);
  });

  it("de inloglimieten zijn de getallen die de pagina noemt, en het inloggen gebruikt ze", () => {
    expect(securityMessageValues()).toEqual({
      failures: LOGIN_EMAIL_LIMIT,
      failureMinutes: LOGIN_EMAIL_WINDOW_MS / 60_000,
      ipLimit: LOGIN_IP_LIMIT,
      ipMinutes: LOGIN_IP_WINDOW_MS / 60_000,
    });
    // Beide inlogstappen tellen per IP-adres, niet per IP-adres plus e-mailadres.
    expect(source("lib/auth.ts")).toContain('loginIpLimited("signin", ip)');
    expect(source("lib/auth.ts")).not.toMatch(/auth:\$\{ip\}:\$\{email\}/);
    expect(source("app/api/auth/2fa-check/route.ts")).toContain('loginIpLimited("precheck", clientIp(req))');
  });

  it("de grens per IP-adres geldt over alle e-mailadressen samen, per inlogstap", () => {
    const ip = "203.0.113.77";
    // Wie steeds een ander e-mailadres probeert, telt toch in dezelfde emmer: het IP-adres zit niet aan het adres vast.
    for (let i = 0; i < LOGIN_IP_LIMIT; i++) expect(loginIpLimited("signin", ip), `poging ${i + 1}`).toBe(false);
    expect(loginIpLimited("signin", ip)).toBe(true);
    // De voor-controle heeft een eigen emmer: een gewone login kost in elke emmer één poging.
    expect(loginIpLimited("precheck", ip)).toBe(false);
    // Een ander IP-adres heeft er geen last van.
    expect(loginIpLimited("signin", "203.0.113.78")).toBe(false);
  });

  it("de rollen op de pagina hebben de rechten uit lib/permissions.ts", () => {
    expect(defaultPermissions("MANAGER")).toEqual(["approveHours", "manageTeam"]);
    expect(defaultPermissions("ACCOUNTANT")).toEqual(["financials", "exports"]);
    expect(defaultPermissions("EMPLOYEE")).toEqual([]);
  });

  it("Wardova Shield staat in de monitor-stand en blokkeert niets", () => {
    expect(source("middleware.ts")).toContain("createShield({ siteKey, monitorOnly: true })");
  });

  it("elke subverwerker op de pagina staat in de privacyverklaring", () => {
    const privacy = JSON.stringify(legalContent("nl").privacy);
    for (const name of ["Vercel", "Supabase", "Mollie", "Resend", "Wardova", "Mindee", "Shopify", "WooCommerce", "Bol.com"]) {
      expect(privacy, name).toContain(name);
    }
  });
});

describe("statusvak in de hulp-widget", () => {
  it("de serverregio wordt gemeten, niet altijd groen gezet", () => {
    const hub = source("components/landing/HelpHub.tsx");
    expect(hub).not.toMatch(/ok:\s*true/);
    expect(hub).not.toContain("statusEu");
    expect(source("app/api/status/route.ts")).toContain("serverRegion(process.env.VERCEL_REGION)");
  });

  it("niet gemeten is neutraal, niet rood zoals een storing", () => {
    expect(serverRegionCheck(undefined, false, false)).toEqual({ label: { key: "statusServerPending" }, state: "pending" });
    // /api/status gaf geen antwoord: dan weten we de regio niet, en dat staat er ook.
    expect(serverRegionCheck(undefined, false, true)).toEqual({ label: { key: "statusServerUnknown" }, state: "unknown" });
    // Lokaal of zonder VERCEL_REGION.
    expect(serverRegionCheck(serverRegion(undefined), true, false)).toEqual({ label: { key: "statusServerUnknown" }, state: "unknown" });
    expect(serverRegionCheck(undefined, true, false).state).toBe("unknown");
    // Gemeten: groen in de EU, rood erbuiten.
    expect(serverRegionCheck(serverRegion("fra1"), true, false)).toEqual({ label: { key: "statusServer", place: "Frankfurt" }, state: "ok" });
    expect(serverRegionCheck(serverRegion("iad1"), true, false)).toEqual({ label: { key: "statusServer", place: "iad1" }, state: "down" });
    expect([measuredState(null), measuredState(true), measuredState(false)]).toEqual(["pending", "ok", "down"]);
    expect(source("components/landing/HelpHub.tsx")).toContain('c.state === "unknown"');
  });

  it("alleen een EU-regio telt als in de EU", () => {
    expect(serverRegion("fra1").eu).toBe(true);
    expect(serverRegion(" FRA1 ").region).toBe("fra1");
    expect(serverRegion("iad1")).toEqual({ region: "iad1", place: null, eu: false });
    expect(serverRegion("lhr1").eu).toBe(false);
    expect(serverRegion(undefined)).toEqual({ region: null, place: null, eu: false });
    expect(serverRegion("")).toEqual({ region: null, place: null, eu: false });
  });
});

describe("security.txt (RFC 9116)", () => {
  const raw = source(`public${SECURITY_TXT_PATH}`);
  const lines = raw.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("#"));
  const fields = lines.map((line) => {
    const match = /^([A-Za-z-]+): (.+)$/.exec(line);
    expect(match, line).not.toBeNull();
    return { name: match![1], value: match![2] };
  });
  const field = (name: string) => fields.filter((f) => f.name === name).map((f) => f.value);

  it("heeft alleen bekende velden", () => {
    const known = ["Contact", "Expires", "Preferred-Languages", "Canonical", "Policy", "Acknowledgments", "Encryption", "Hiring", "CSAF"];
    for (const f of fields) expect(known, f.name).toContain(f.name);
    expect(field("Expires")).toHaveLength(1);
    expect(field("Preferred-Languages")).toHaveLength(1);
  });

  it("Contact: het contactformulier, en een e-mailadres zodra dat in lib/company.ts staat", () => {
    expect(field("Contact")).toContain(`${SITE}/contact`);
    if (COMPANY.email) expect(field("Contact")).toContain(`mailto:${COMPANY.email}`);
    for (const contact of field("Contact")) expect(contact).toMatch(/^(https:\/\/|mailto:|tel:)/);
  });

  it("Canonical, Policy en talen kloppen", () => {
    expect(field("Canonical")).toEqual([`${SITE}${SECURITY_TXT_PATH}`]);
    expect(field("Policy")).toEqual([`${SITE}${SECURITY_PATH}`]);
    expect(field("Preferred-Languages")).toEqual(["nl, en"]);
  });

  // Faalt deze test, dan is security.txt verlopen of bijna: zet Expires op een jaar vanaf nu.
  it("Expires ligt in de toekomst en hoogstens een jaar vooruit", () => {
    const [value] = field("Expires");
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    const expires = Date.parse(value);
    const now = Date.now();
    expect(expires).toBeGreaterThan(now);
    expect(expires - now).toBeLessThanOrEqual(366 * 24 * 60 * 60 * 1000);
  });

  it("wordt door de middleware niet afgevangen (bestand met extensie)", () => {
    expect(source("middleware.ts")).toContain(".*\\\\..*");
  });
});
