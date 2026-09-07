import { describe, expect, it, vi } from "vitest";

// ensureAccountSubscription praat met de database; hier testen we alleen de pure logica.
vi.mock("@/lib/db", () => ({ db: {} }));

import { accessState, trialDaysLeft, TRIAL_DAYS } from "@/lib/subscription";

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
