import { describe, it, expect } from "vitest";
import { plansForType, isPaidPlan, planHasFeature, supportsTeam } from "@/lib/plans";

describe("plansForType", () => {
  it("zzp ziet de solo-plannen", () => {
    expect(plansForType("ZZP")).toEqual(["FREE", "GROWTH", "PRO"]);
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
