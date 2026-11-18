import { describe, it, expect } from "vitest";
import { plansForType, isPaidPlan, planHasFeature, supportsTeam, PLANS, ALL_FEATURES, type FeatureKey } from "@/lib/plans";
import nl from "@/messages/nl.json";
import en from "@/messages/en.json";

describe("plansForType", () => {
  it("zzp ziet de solo-plannen", () => {
    expect(plansForType("ZZP")).toEqual(["FREE", "GROWTH", "PRO", "WEBSHOP"]);
  });
  it("bedrijf ziet de business-plannen", () => {
    expect(plansForType("BEDRIJF")).toEqual(["BUSINESS", "BUSINESS_PLUS"]);
  });
});

describe("isPaidPlan", () => {
  it("alleen FREE is gratis", () => {
    expect(isPaidPlan("FREE")).toBe(false);
    expect(isPaidPlan("GROWTH")).toBe(true);
    expect(isPaidPlan("PRO")).toBe(true);
    expect(isPaidPlan("BUSINESS")).toBe(true);
  });
});

describe("planHasFeature", () => {
  it("Fiscale Rust zit vanaf GROWTH (niet in FREE) en in alle bedrijfsplannen (ib- of vpb-modus)", () => {
    expect(planHasFeature("FREE", "fiscaleRust")).toBe(false);
    expect(planHasFeature("GROWTH", "fiscaleRust")).toBe(true);
    expect(planHasFeature("BUSINESS", "fiscaleRust")).toBe(true);
    expect(planHasFeature("BUSINESS_PLUS", "fiscaleRust")).toBe(true);
  });
  it("FREE heeft geen offertes, GROWTH wel", () => {
    expect(planHasFeature("FREE", "quotes")).toBe(false);
    expect(planHasFeature("GROWTH", "quotes")).toBe(true);
  });
});

describe("supportsTeam", () => {
  it("solo-plannen ondersteunen geen team; business wel", () => {
    expect(supportsTeam("PRO")).toBe(false);
    expect(supportsTeam("GROWTH")).toBe(false);
    expect(supportsTeam("BUSINESS")).toBe(true);
    expect(supportsTeam("BUSINESS_PLUS")).toBe(true);
  });
});

describe("huisstijl en betaalherinneringen vanaf Groei", () => {
  const branded: FeatureKey[] = ["customBranding", "reminders"];

  it("Groei heeft eigen huisstijl en betaalherinneringen", () => {
    for (const feature of branded) expect(planHasFeature("GROWTH", feature), feature).toBe(true);
  });

  it("Gratis heeft ze niet", () => {
    for (const feature of branded) expect(planHasFeature("FREE", feature), feature).toBe(false);
  });

  it("elk duurder pakket houdt ze ook", () => {
    for (const plan of ["PRO", "WEBSHOP", "BUSINESS", "BUSINESS_PLUS"] as const) {
      for (const feature of branded) expect(planHasFeature(plan, feature), `${plan} ${feature}`).toBe(true);
    }
  });

  it("de prijzen blijven gelijk", () => {
    expect(PLANS.FREE.price).toBe(0);
    expect(PLANS.GROWTH.price).toBe(15);
    expect(PLANS.PRO.price).toBe(29);
  });

  it("Pro heeft alles van Groei", () => {
    for (const feature of ALL_FEATURES) {
      if (PLANS.GROWTH.features[feature]) expect(PLANS.PRO.features[feature], feature).toBe(true);
    }
  });

  it("Pro heeft nog een eigen verschil met Groei: voorrang bij support", () => {
    const extra = ALL_FEATURES.filter((f) => PLANS.PRO.features[f] && !PLANS.GROWTH.features[f]);
    expect(extra).toEqual(["prioritySupport"]);
  });

  it("Gratis krijgt verder niets extra's: alleen facturen, PDF en uren/ritten", () => {
    const on = ALL_FEATURES.filter((f) => PLANS.FREE.features[f]);
    expect(on).toEqual(["invoices", "pdfExport", "timeTracking", "mileageTracking"]);
  });
});

describe("pakketteksten passen bij plans.ts", () => {
  const locales = { nl, en } as const;
  const words = {
    nl: { reminders: /herinnering/i, branding: /huisstijl/i, support: /voorrang bij support/i },
    en: { reminders: /reminder/i, branding: /branding/i, support: /priority support/i },
  } as const;
  // De zinnen waarin de limieten van Gratis staan: een los cijfer zegt niets
  // ("5" zit ook in "€ 15"), dus we toetsen op de hele zinsnede.
  const freeLimits = {
    nl: {
      invoices: `tot ${PLANS.FREE.limits.invoicesPerMonth} facturen`,
      customers: `maximaal ${PLANS.FREE.limits.customers} klanten`,
    },
    en: {
      invoices: `up to ${PLANS.FREE.limits.invoicesPerMonth} invoices`,
      customers: `up to ${PLANS.FREE.limits.customers} customers`,
    },
  } as const;

  for (const locale of ["nl", "en"] as const) {
    const m = locales[locale];
    const w = words[locale];

    it(`${locale}: Groei noemt herinneringen en huisstijl`, () => {
      expect(m.pricing.plans.growth.desc).toMatch(w.reminders);
      expect(m.pricing.plans.growth.desc).toMatch(w.branding);
    });

    it(`${locale}: Pro noemt voorrang bij support als eigen verschil`, () => {
      expect(m.pricing.plans.pro.desc).toMatch(w.support);
    });

    it(`${locale}: Gratis belooft geen herinneringen of huisstijl`, () => {
      expect(m.pricing.plans.free.desc).not.toMatch(w.reminders);
      expect(m.pricing.plans.free.desc).not.toMatch(w.branding);
    });

    it(`${locale}: de vraag over Groei en Pro noemt de echte prijzen en verschillen`, () => {
      const a = m.faq.plans.a;
      expect(a).toContain(`€ ${PLANS.GROWTH.price}`);
      expect(a).toContain(`€ ${PLANS.PRO.price}`);
      expect(a).toMatch(w.reminders);
      expect(a).toMatch(w.support);
      expect(a).toContain(freeLimits[locale].invoices);
      expect(a).toContain(freeLimits[locale].customers);
    });

    it(`${locale}: de prijsmatrix noemt herinneringen niet meer als "komt later"`, () => {
      expect(m.pricing.features.reminders).not.toMatch(/later/i);
      expect(m.companyPricing.business.features.join(" ")).not.toMatch(/later/i);
    });

    it(`${locale}: voorrang bij support zegt wat het concreet is`, () => {
      for (const text of [m.pricing.plans.pro.desc, m.faq.plans.a, m.faq.support.a]) {
        expect(text).toMatch(locale === "nl" ? /bovenaan/ : /top of our queue/);
      }
    });
  }
});
