import { describe, expect, it, vi } from "vitest";

// ensureAccountSubscription praat met de database; hier testen we alleen de pure logica.
vi.mock("@/lib/db", () => ({ db: {} }));

import {
  accessState,
  businessSubscriptionFix,
  effectivePlan,
  effectivePlanFor,
  hasSoloTrial,
  SOLO_TRIAL_PLAN,
  SOLO_TRIAL_SINCE,
  soloTrialActive,
  soloTrialSubscription,
  trialDaysLeft,
  TRIAL_DAYS,
} from "@/lib/subscription";

const NOW = new Date("2026-08-27T10:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe("trialDaysLeft", () => {
  it("geeft null zonder einddatum", () => {
    expect(trialDaysLeft({ plan: "BUSINESS", status: "TRIALING", trialEndsAt: null }, NOW)).toBeNull();
  });
  it("rondt naar boven af (deel van een dag telt als dag)", () => {
    expect(trialDaysLeft({ plan: "BUSINESS", status: "TRIALING", trialEndsAt: days(29.5) }, NOW)).toBe(30);
    expect(trialDaysLeft({ plan: "BUSINESS", status: "TRIALING", trialEndsAt: days(TRIAL_DAYS) }, NOW)).toBe(TRIAL_DAYS);
  });
  it("is negatief na afloop", () => {
    expect(trialDaysLeft({ plan: "BUSINESS", status: "TRIALING", trialEndsAt: days(-2) }, NOW)).toBe(-2);
  });
});

describe("accessState", () => {
  it("zzp heeft altijd toegang, ongeacht status", () => {
    expect(accessState({ plan: "FREE", status: "TRIALING", trialEndsAt: null }, "ZZP", NOW)).toBe("ok");
    expect(accessState({ plan: "PRO", status: "CANCELED", trialEndsAt: null }, "ZZP", NOW)).toBe("ok");
  });
  it("bedrijf in lopende proef", () => {
    expect(accessState({ plan: "BUSINESS", status: "TRIALING", trialEndsAt: days(5) }, "BEDRIJF", NOW)).toBe("trial");
  });
  it("bedrijf met verlopen proef wordt geblokkeerd", () => {
    expect(accessState({ plan: "BUSINESS", status: "TRIALING", trialEndsAt: days(-1) }, "BEDRIJF", NOW)).toBe("expired");
  });
  it("betalend bedrijf heeft toegang; opgezegd/achterstallig niet", () => {
    expect(accessState({ plan: "BUSINESS_PLUS", status: "ACTIVE", trialEndsAt: days(-40) }, "BEDRIJF", NOW)).toBe("ok");
    expect(accessState({ plan: "BUSINESS", status: "CANCELED", trialEndsAt: days(-40) }, "BEDRIJF", NOW)).toBe("expired");
    expect(accessState({ plan: "BUSINESS", status: "PAST_DUE", trialEndsAt: null }, "BEDRIJF", NOW)).toBe("expired");
  });
  it("oud bedrijfsaccount zonder einddatum blijft in proef (wordt hersteld door ensure)", () => {
    expect(accessState({ plan: "BUSINESS", status: "TRIALING", trialEndsAt: null }, "BEDRIJF", NOW)).toBe("trial");
  });
});

describe("Groei-proef voor zzp en webshop (effectivePlan)", () => {
  // Registratie na de start van de proef (SOLO_TRIAL_SINCE): 30 dagen Groei.
  const REG = new Date("2026-11-20T10:00:00Z");
  const at = (n: number) => new Date(REG.getTime() + n * 86_400_000);
  const trial = soloTrialSubscription(REG);

  it("nieuw zzp-account: opgeslagen als Gratis in proef, met einddatum na 30 dagen", () => {
    expect(trial).toEqual({ plan: "FREE", status: "TRIALING", trialEndsAt: at(TRIAL_DAYS) });
    expect(SOLO_TRIAL_PLAN).toBe("GROWTH");
  });

  it("in de proef gelden de rechten van Groei", () => {
    expect(effectivePlan(trial, "ZZP", at(0))).toBe("GROWTH");
    expect(effectivePlan(trial, "ZZP", at(29.9))).toBe("GROWTH");
    expect(soloTrialActive(trial, "ZZP", at(10))).toBe(true);
    expect(trialDaysLeft(trial, at(27))).toBe(3);
  });

  it("na de proef vanzelf terug naar Gratis, zonder schrijfactie of poort", () => {
    expect(effectivePlan(trial, "ZZP", at(TRIAL_DAYS))).toBe("FREE");
    expect(effectivePlan(trial, "ZZP", at(90))).toBe("FREE");
    expect(soloTrialActive(trial, "ZZP", at(31))).toBe(false);
    expect(hasSoloTrial(trial, "ZZP")).toBe(true);
    expect(accessState(trial, "ZZP", at(31))).toBe("ok");
  });

  it("betaald pakket gaat altijd voor, ook tijdens of na de proef", () => {
    const paid = { plan: "PRO" as const, status: "ACTIVE" as const, trialEndsAt: at(TRIAL_DAYS) };
    expect(effectivePlan(paid, "ZZP", at(5))).toBe("PRO");
    expect(effectivePlan(paid, "ZZP", at(60))).toBe("PRO");
    expect(effectivePlan({ plan: "GROWTH", status: "ACTIVE", trialEndsAt: at(TRIAL_DAYS) }, "ZZP", at(60))).toBe("GROWTH");
    expect(effectivePlan({ plan: "WEBSHOP", status: "CANCELED", trialEndsAt: null }, "ZZP", at(60))).toBe("WEBSHOP");
  });

  it("bestaande zzp-accounts veranderen niet", () => {
    // Gratis zonder einddatum (alle zzp-accounts van voor de proef)
    expect(effectivePlan({ plan: "FREE", status: "TRIALING", trialEndsAt: null }, "ZZP", at(0))).toBe("FREE");
    // Door beheer op Groei gezet, status nooit aangepast
    expect(effectivePlan({ plan: "GROWTH", status: "TRIALING", trialEndsAt: null }, "ZZP", at(0))).toBe("GROWTH");
    // Oud bedrijfsaccount dat naar zzp wisselde: einddatum van de Business-proef van voor SOLO_TRIAL_SINCE telt niet
    const oldBusinessTrial = { plan: "FREE" as const, status: "TRIALING" as const, trialEndsAt: new Date(SOLO_TRIAL_SINCE.getTime() + 10 * 86_400_000) };
    expect(hasSoloTrial(oldBusinessTrial, "ZZP")).toBe(false);
    expect(effectivePlan(oldBusinessTrial, "ZZP", SOLO_TRIAL_SINCE)).toBe("FREE");
    // Geen abonnement: Gratis
    expect(effectivePlan(null, "ZZP", at(0))).toBe("FREE");
  });

  it("bedrijfsaccount ongewijzigd: opgeslagen plan, eigen proef en poort", () => {
    const biz = { plan: "BUSINESS" as const, status: "TRIALING" as const, trialEndsAt: at(TRIAL_DAYS) };
    expect(effectivePlan(biz, "BEDRIJF", at(5))).toBe("BUSINESS");
    expect(effectivePlan(biz, "BEDRIJF", at(40))).toBe("BUSINESS");
    expect(accessState(biz, "BEDRIJF", at(5))).toBe("trial");
    expect(accessState(biz, "BEDRIJF", at(40))).toBe("expired");
    // Ook een Gratis-abonnement met einddatum geeft een bedrijf nooit Groei
    expect(effectivePlan(trial, "BEDRIJF", at(5))).toBe("FREE");
    expect(hasSoloTrial(trial, "BEDRIJF")).toBe(false);
  });
});

describe("businessSubscriptionFix blijft gelijk", () => {
  it("zzp in Groei-proef die naar bedrijf gaat krijgt een verse Business-proef", () => {
    const now = new Date("2026-11-25T10:00:00Z");
    const fix = businessSubscriptionFix(soloTrialSubscription(new Date("2026-11-20T10:00:00Z")), now);
    expect(fix).toEqual({ plan: "BUSINESS", status: "TRIALING", trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * 86_400_000) });
  });
  it("kloppend bedrijfsabonnement: niets schrijven", () => {
    expect(businessSubscriptionFix({ plan: "BUSINESS_PLUS", status: "ACTIVE", trialEndsAt: null })).toBeNull();
  });
});

describe("effectivePlanFor (leest abonnement + accounttype)", () => {
  const REG = new Date("2026-11-20T10:00:00Z");
  const client = (row: unknown) => ({ subscription: { findUnique: async () => row } }) as unknown as Parameters<typeof effectivePlanFor>[1];
  it("zzp in de proef: Groei; na de proef: Gratis", async () => {
    const row = { ...soloTrialSubscription(REG), user: { company: { accountType: "ZZP" } } };
    expect(await effectivePlanFor("acc", client(row), new Date("2026-12-01T10:00:00Z"))).toBe("GROWTH");
    expect(await effectivePlanFor("acc", client(row), new Date("2026-12-21T10:00:00Z"))).toBe("FREE");
  });
  it("bedrijf met dezelfde velden: opgeslagen plan; geen abonnement: Gratis", async () => {
    const row = { ...soloTrialSubscription(REG), user: { company: { accountType: "BEDRIJF" } } };
    expect(await effectivePlanFor("acc", client(row), new Date("2026-12-01T10:00:00Z"))).toBe("FREE");
    expect(await effectivePlanFor("acc", client(null), REG)).toBe("FREE");
  });
});
