import { describe, it, expect, vi } from "vitest";
import { createTranslator } from "next-intl";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DELETE_STEPS,
  EXPORT_CONTENTS,
  EXPORT_GUARANTEE_PATH,
  GUARANTEE_SECTIONS,
  SHUTDOWN_NOTICE_DAYS,
  AUDITFILE_YEARS,
  auditfileHref,
  auditfileYears,
  guaranteeMessageValues,
} from "@/lib/export-guarantee";
import { FAQ_LINKS, HELP_FAQ_KEYS, LAUNCH_DEPENDENT_FAQ, faqLink } from "@/lib/faq";
import { PUBLIC_PAGES } from "@/lib/seo";
import sitemap from "@/app/sitemap";
import nl from "@/messages/nl.json";
import en from "@/messages/en.json";

// i18n/routing.ts laadt ook de navigatie van next-intl (next/navigation), die buiten Next niet
// werkt. Voor de sitemap zijn alleen de talen nodig: dezelfde waarden als in i18n/routing.ts.
vi.mock("@/i18n/routing", () => ({ routing: { locales: ["nl", "en"], defaultLocale: "nl" } }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));

type Tree = Record<string, unknown>;
const locales = { nl: nl as unknown as Tree, en: en as unknown as Tree };

function at(tree: Tree, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Tree)[key] : undefined), tree);
}

function text(tree: Tree, path: string): string {
  const value = at(tree, path);
  expect(typeof value, path).toBe("string");
  expect((value as string).trim().length, path).toBeGreaterThan(0);
  return value as string;
}

/** Alle sleutelpaden van een boom, om nl en en te vergelijken. */
function keys(node: unknown, prefix = ""): string[] {
  if (!node || typeof node !== "object") return [prefix];
  return Object.entries(node as Tree).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

function source(file: string): string {
  return readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8");
}

describe("exportgarantie: termijn en pagina", () => {
  it("waarschuwt 90 dagen vooraf bij stoppen (EIGENAAR moet dit bevestigen)", () => {
    expect(SHUTDOWN_NOTICE_DAYS).toBe(90);
    expect(guaranteeMessageValues()).toEqual({ days: 90 });
  });

  it("is een publieke pagina en staat in de sitemap, in beide talen", () => {
    expect(PUBLIC_PAGES.exportgarantie).toBe(EXPORT_GUARANTEE_PATH);
    const urls = sitemap().map((entry) => entry.url);
    expect(urls.some((u) => u.endsWith("/exportgarantie") && !u.includes("/en/"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/en/exportgarantie"))).toBe(true);
  });
});

describe("exportgarantie: teksten", () => {
  for (const [locale, m] of Object.entries(locales)) {
    it(`${locale}: elk onderdeel heeft een titel en uitleg`, () => {
      for (const key of GUARANTEE_SECTIONS) {
        text(m, `exportGuarantee.sections.${key}.title`);
        text(m, `exportGuarantee.sections.${key}.desc`);
      }
      for (const key of EXPORT_CONTENTS) text(m, `exportGuarantee.contents.${key}`);
      for (const step of DELETE_STEPS) {
        text(m, `exportGuarantee.deleteSteps.${step}.title`);
        text(m, `exportGuarantee.deleteSteps.${step}.desc`);
      }
      for (const key of ["own", "always", "cancel", "stop"]) text(m, `exportGuarantee.summary.${key}`);
    });

    it(`${locale}: de termijn bij stoppen komt uit SHUTDOWN_NOTICE_DAYS, niet uit de tekst`, () => {
      for (const path of ["exportGuarantee.sections.stop.desc", "exportGuarantee.summary.stop", "faq.stopping.a"]) {
        const value = text(m, path);
        expect(value, path).toContain("{days}");
        expect(value, path).not.toMatch(/\d+ (dagen|days)/);
      }
    });

    it(`${locale}: SEO-gegevens zonder plaatshouders (pageMetadata geeft geen waarden mee)`, () => {
      for (const field of ["title", "description"]) expect(text(m, `meta.pages.exportgarantie.${field}`)).not.toContain("{");
    });

    it(`${locale}: de FAQ heeft "Wat als Saldova stopt?" en elke doorverwijzing heeft een label`, () => {
      text(m, "faq.stopping.q");
      for (const key of Object.keys(FAQ_LINKS)) text(m, `faq.${key}.link`);
    });

    it(`${locale}: links vanuit footer, prijzen, homepage en overstappen hebben een tekst`, () => {
      for (const path of [
        "landing.nav.exportGuarantee",
        "pricing.exportGuaranteeTitle",
        "pricing.exportGuarantee",
        "pricing.exportGuaranteeBusiness",
        "pricing.exportGuaranteeLink",
        "home.heroTrust.export",
        "home.security.items.export.link",
        "migration.guaranteeTitle",
        "migration.guaranteeDesc",
        "migration.guaranteeLink",
        "exportGuarantee.deleteGateNote",
        "appExtra.trialGate.download",
        "appExtra.trialGate.auditfile",
        "appExtra.trialGate.auditfileLabel",
        "appExtra.trialGate.deleteHint",
      ]) text(m, path);
    });

    it(`${locale}: bij de Business-pakketten geen "gratis": bedrijven hebben geen gratis pakket`, () => {
      expect(text(m, "pricing.exportGuaranteeBusiness")).not.toMatch(/gratis|free/i);
    });

    it(`${locale}: elk antwoord in de hulp-widget is te tonen met de waarden van de garantie`, () => {
      const tf = createTranslator({ locale, messages: m as never, namespace: "faq" as never }) as unknown as (
        key: string,
        values?: Record<string, number>,
      ) => string;
      for (const key of HELP_FAQ_KEYS) {
        text(m, `faq.${key}.q`);
        const answers = [`${key}.a`];
        if ((LAUNCH_DEPENDENT_FAQ as readonly string[]).includes(key)) answers.push(`${key}.aLaunched`);
        for (const answer of answers) {
          const out = tf(answer, guaranteeMessageValues());
          expect(out, answer).not.toContain("{");
          expect(out, answer).not.toBe(`faq.${answer}`);
        }
      }
      expect(tf("stopping.a", guaranteeMessageValues())).toContain(String(SHUTDOWN_NOTICE_DAYS));
    });
  }

  it("nl en en hebben precies dezelfde sleutels", () => {
    expect(keys(at(locales.en, "exportGuarantee")).sort()).toEqual(keys(at(locales.nl, "exportGuarantee")).sort());
    expect(keys(at(locales.en, "faq.stopping")).sort()).toEqual(keys(at(locales.nl, "faq.stopping")).sort());
  });
});

describe("hulp-widget", () => {
  it("doorzoekt ook \"Wat als Saldova stopt?\" en elke vraag van /faq", () => {
    expect(HELP_FAQ_KEYS).toContain("stopping");
    const page = source("app/[locale]/faq/page.tsx");
    const items = [...page.matchAll(/items: \[([^\]]*)\]/g)].flatMap((match) => [...match[1].matchAll(/"([^"]+)"/g)].map((q) => q[1]));
    expect(items.length).toBeGreaterThan(0);
    for (const key of items) expect(HELP_FAQ_KEYS as readonly string[], key).toContain(key);
  });

  it("geeft de waarden van de garantie mee aan elk antwoord", () => {
    const hub = source("components/landing/HelpHub.tsx");
    const calls = hub.split("tf(faqAnswerKey(k, launched)").length - 1;
    const withValues = hub.split("tf(faqAnswerKey(k, launched), guaranteeMessageValues())").length - 1;
    expect(calls).toBeGreaterThan(0);
    expect(withValues).toBe(calls);
  });
});

describe("auditfile-keuze", () => {
  it("toont het huidige jaar en de jaren ervoor, nieuwste eerst", () => {
    expect(AUDITFILE_YEARS).toBe(4);
    expect(auditfileYears(2026)).toEqual([2026, 2025, 2024, 2023]);
    expect(auditfileYears(2026, 2)).toEqual([2026, 2025]);
    expect(auditfileYears(2026, 0)).toEqual([]);
    expect(auditfileYears(2026, -1)).toEqual([]);
  });

  it("linkt naar de XAF van dat jaar", () => {
    expect(auditfileHref(2025)).toBe("/api/exports/auditfile?year=2025&format=xaf");
  });
});

describe("FAQ-doorverwijzingen", () => {
  it("de vragen over stoppen en exporteren wijzen naar de exportgarantie", () => {
    expect(faqLink("stopping")).toBe(EXPORT_GUARANTEE_PATH);
    expect(faqLink("data")).toBe(EXPORT_GUARANTEE_PATH);
    expect(faqLink("exportData")).toBe(EXPORT_GUARANTEE_PATH);
  });

  it("andere vragen hebben geen doorverwijzing", () => {
    expect(faqLink("payment")).toBeNull();
    expect(faqLink("onbekend")).toBeNull();
  });
});

// De pagina belooft dingen over de code. Deze tests falen zodra de code die beloftes niet meer waarmaakt.
describe("exportgarantie: de code maakt de beloftes waar", () => {
  it("de export kent geen plan- of abonnementscontrole (in elk pakket, ook na opzeggen)", () => {
    const route = source("app/api/account/export/route.ts");
    const imports = route.split("\n").filter((line) => line.startsWith("import"));
    for (const forbidden of ["@/lib/subscription", "@/lib/plan-limits", "@/lib/plans", "@/lib/mollie"]) {
      expect(imports.some((line) => line.includes(forbidden)), forbidden).toBe(false);
    }
    expect(route).not.toMatch(/accessState|planHasFeature|isPaidPlan/);
  });

  it("na een verlopen proef of opzegging biedt de poort iedereen met het recht 'exports' de ZIP en de auditfile", () => {
    const gate = source("components/billing/TrialExpiredGate.tsx");
    expect(gate).toContain('"/api/account/export"');
    expect(gate).toContain("auditfileHref(");
    // Beide downloads hangen aan canExport, niet aan isOwner.
    expect(gate).not.toMatch(/isOwner && \(\s*<a href=\{EXPORT_HREF\}/);
    expect(gate).toMatch(/canExport && \(\s*<a href=\{EXPORT_HREF\}/);
    const layout = source("app/[locale]/(dashboard)/layout.tsx");
    expect(layout).toMatch(/<TrialExpiredGate[^>]*canExport=\{can\(session\.user, "exports"\)\}/);
  });

  it("de auditfile kent geen plan- of abonnementscontrole (ook bereikbaar vanaf de poort)", () => {
    const route = source("app/api/exports/auditfile/route.ts");
    const imports = route.split("\n").filter((line) => line.startsWith("import"));
    for (const forbidden of ["@/lib/subscription", "@/lib/plan-limits", "@/lib/plans"]) {
      expect(imports.some((line) => line.includes(forbidden)), forbidden).toBe(false);
    }
    expect(route).not.toMatch(/accessState|planHasFeature|isPaidPlan/);
  });

  it("de Business-prijzen gebruiken de regel zonder \"gratis\"", () => {
    expect(source("components/landing/CompanyPricing.tsx")).toMatch(/<ExportGuaranteeNote[^>]*audience="business"/);
    expect(source("components/landing/ExportGuaranteeNote.tsx")).toContain('"exportGuaranteeBusiness"');
  });

  it("verwijderen door een beheerder (als Instellingen achter de poort zit) vraagt ook eerst de export en stopt Mollie", () => {
    const route = source("app/api/admin/users/[id]/route.ts");
    const del = route.slice(route.indexOf("export async function DELETE"));
    const order = ["exportConfirmed(body)", "closeBillingBeforeDelete(", "db.user.delete("].map((s) => del.indexOf(s));
    for (const i of order) expect(i).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("opzeggen zegt alleen het Mollie-abonnement op en wist niets", () => {
    const mollie = source("lib/mollie.ts");
    const start = mollie.indexOf("export async function cancelRecurringSubscription");
    expect(start).toBeGreaterThan(-1);
    const next = mollie.indexOf("\nexport ", start + 1);
    const body = mollie.slice(start, next === -1 ? undefined : next);
    expect(body).toContain("customerSubscriptions.cancel");
    expect(body).not.toMatch(/\.delete(Many)?\(/);
    expect(source("app/api/billing/cancel/route.ts")).not.toMatch(/\.delete(Many)?\(/);
  });

  it("verwijderen: eerst de export, dan het wachtwoord, dan Mollie stopzetten, pas dan wissen", () => {
    const route = source("app/api/account/route.ts");
    const del = route.slice(route.indexOf("export async function DELETE"));
    const order = ["exportConfirmed(body)", "bcrypt.compare", "closeBillingBeforeDelete(", "db.user.delete("].map((s) => del.indexOf(s));
    for (const i of order) expect(i).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("de ZIP bevat gegevens als JSON en CSV, bonnetjes als bestanden en facturen als PDF en UBL", () => {
    const zip = source("lib/account-export.ts");
    for (const part of ["gegevens/", "bonnetjes/", "facturen/pdf/", "facturen/ubl/", "LEESMIJ.txt"]) expect(zip).toContain(part);
    expect(source("app/api/exports/auditfile/route.ts")).toContain("buildXaf");
  });
});
