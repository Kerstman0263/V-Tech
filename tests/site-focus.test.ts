import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nl from "../messages/nl.json";
import en from "../messages/en.json";
import { PLANS } from "@/lib/plans";
import {
  AUDIENCE_FIT,
  AUDIENCE_FIT_COMPANIES,
  AUDIENCE_NOT_YET,
  BUSINESS_TEAM_MEMBERS,
  FREE_INVOICES_PER_MONTH,
  MAIN_SOLUTIONS,
  MAX_TEAM_MEMBERS,
  SECONDARY_SOLUTION,
} from "@/lib/site-focus";

const source = (file: string) => readFileSync(path.join(__dirname, "..", file), "utf8");

describe("focus van de site: zzp'ers, starters en webshops", () => {
  it("heeft twee hoofdroutes en bedrijven als bijroute", () => {
    expect(MAIN_SOLUTIONS.map((s) => s.href)).toEqual(["/zzp", "/webshops"]);
    expect(SECONDARY_SOLUTION.href).toBe("/bedrijven");
  });

  it("noemt wel en (nog) niet de afgesproken groepen", () => {
    expect(AUDIENCE_FIT.map((a) => a.key)).toEqual(["zzp", "starter", "freelance", "webshop"]);
    expect(AUDIENCE_NOT_YET.map((a) => a.key)).toEqual(["bv", "pos", "care", "payroll"]);
  });

  it("zet op /bedrijven kleine teams bij 'wel voor'", () => {
    expect(AUDIENCE_FIT_COMPANIES.map((a) => a.key)).toEqual(["team", "zzp", "starter", "freelance", "webshop"]);
    expect(AUDIENCE_FIT.map((a) => a.key)).not.toContain("team");
  });

  it("haalt de getallen in de teksten uit de pakketten", () => {
    expect(MAX_TEAM_MEMBERS).toBe(PLANS.BUSINESS_PLUS.maxMembers);
    expect(BUSINESS_TEAM_MEMBERS).toBe(PLANS.BUSINESS.maxMembers);
    expect(BUSINESS_TEAM_MEMBERS).toBeLessThan(MAX_TEAM_MEMBERS);
    expect(FREE_INVOICES_PER_MONTH).toBe(PLANS.FREE.limits.invoicesPerMonth);
  });

  it("belooft over pakketten alleen wat de pakketten kunnen", () => {
    // Starters: gratis plan zonder Fiscale Rust, die zit vanaf Groei.
    expect(PLANS.FREE.features.fiscaleRust).toBe(false);
    expect(PLANS.GROWTH.features.fiscaleRust).toBe(true);
    expect(PLANS.FREE.features.timeTracking && PLANS.FREE.features.mileageTracking).toBe(true);
    // Webshops: koppelingen zitten in het Webshop-pakket.
    expect(PLANS.WEBSHOP.features.webshopIntegrations).toBe(true);
    for (const plan of ["FREE", "GROWTH", "PRO"] as const) expect(PLANS[plan].features.webshopIntegrations).toBe(false);
    // Geen salarisadministratie, en geen pakket voor teams groter dan Business+.
    expect(Math.max(...Object.values(PLANS).map((p) => p.maxMembers))).toBe(25);
  });

  it("noemt alleen webshopkoppelingen die bestaan", () => {
    const providers = source("lib/webshop/providers.ts");
    for (const name of ["Shopify", "WooCommerce", "Bol.com"]) expect(providers).toContain(name);
    expect(source("lib/auditfile.ts")).toContain("geen eigen grootboek");
  });
});

describe("teksten voor wie Saldova is", () => {
  for (const [locale, m] of [["nl", nl], ["en", en]] as const) {
    it(`${locale}: elke groep heeft een titel en uitleg`, () => {
      for (const { key } of AUDIENCE_FIT_COMPANIES) {
        expect(m.audience.fit[key].title).toBeTruthy();
        expect(m.audience.fit[key].desc).toBeTruthy();
      }
      for (const { key } of AUDIENCE_NOT_YET) {
        expect(m.audience.notYet[key].title).toBeTruthy();
        expect(m.audience.notYet[key].desc).toBeTruthy();
      }
      expect(m.audience.fit.starter.desc).toContain("{invoices}");
      // Business en Business+ hebben elk hun eigen grens: het getal {max}
      // (Business+) mag niet alleen bij "Business" staan.
      for (const desc of [m.audience.notYet.payroll.desc, m.audience.fit.team.desc]) {
        expect(desc).toMatch(/Business\b[^+]*\{business\}/);
        expect(desc).toMatch(/Business\+[^{]*\{max\}/);
      }
      expect(m.audience.introCompanies).toBeTruthy();
      expect(m.companies.subtitle).toContain("{max}");
    });

    it(`${locale}: geen derde hoofdroute voor teams en geen "mkb"-belofte meer`, () => {
      expect(Object.keys(m.home.routes)).not.toContain("team");
      expect(m.home.routes.teamNote.link).toBeTruthy();
      expect(m.home).not.toHaveProperty("switch");
      const focusTexts = [
        m.landing.footer.tagline,
        m.meta.pages.home.title,
        m.ova.products.saldova.what,
        m.about.title,
        m.companies.subtitle,
        m.audience.introCompanies,
      ];
      for (const text of focusTexts) expect(text).not.toMatch(/\bmkb\b|\bSMEs?\b|\bSMBs?\b|every entrepreneur|elke ondernemer/i);
    });
  }

  it("en.json heeft dezelfde sleutels onder audience als nl.json", () => {
    const keys = (value: unknown, prefix = ""): string[] =>
      typeof value === "object" && value !== null
        ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
        : [prefix];
    expect(keys(en.audience).sort()).toEqual(keys(nl.audience).sort());
    expect(keys(en.home.routes).sort()).toEqual(keys(nl.home.routes).sort());
  });
});

describe("pagina's en navigatie volgen de focus", () => {
  it("homepage en /bedrijven tonen 'Voor wie is Saldova?'", () => {
    expect(source("app/[locale]/page.tsx")).toContain("<AudienceFit");
    expect(source("app/[locale]/bedrijven/page.tsx")).toContain('variant="companies"');
  });

  it("homepage heeft geen teamkaart naast zzp en webshop", () => {
    const home = source("app/[locale]/page.tsx");
    expect(home).toContain("MAIN_SOLUTIONS.map");
    expect(home).not.toContain("team-overleg");
  });

  it("submenu toont alleen zzp en webshop als hoofdkeuze", () => {
    const nav = source("components/landing/SiteNav.tsx");
    expect(nav).toContain("MAIN_SOLUTIONS.map");
    expect(nav).not.toMatch(/[^_]SOLUTIONS\.map\(/);
  });

  it("mobiel menu en footer zetten bedrijven onder zzp, webshops en prijzen", () => {
    for (const file of ["components/landing/SiteMobileMenu.tsx", "components/landing/SiteFooter.tsx"]) {
      const code = source(file);
      const at = (href: string) => code.indexOf(`href: "${href}"`) >= 0 ? code.indexOf(`href: "${href}"`) : code.indexOf(`href="${href}"`);
      expect(at("/bedrijven")).toBeGreaterThan(at("/webshops"));
      expect(at("/bedrijven")).toBeGreaterThan(at("/zzp#pricing"));
      expect(at("/bedrijven")).toBeGreaterThan(at("/faq"));
    }
  });
});
