import { describe, it, expect } from "vitest";
import { nextRunAfter, recurringAccessCode } from "@/lib/recurring";

describe("recurringAccessCode met de Groei-proef", () => {
  const end = new Date("2026-12-20T10:00:00Z");
  const zzp = { plan: "FREE" as const, status: "TRIALING" as const, trialEndsAt: end, accountType: "ZZP" as const };
  it("in de proef mag periodiek factureren (Groei)", () => {
    expect(recurringAccessCode(zzp, new Date("2026-12-01T10:00:00Z"))).toBeNull();
  });
  it("na de proef niet meer (Gratis), en nooit de poort van een verlopen proef", () => {
    expect(recurringAccessCode(zzp, new Date("2026-12-21T10:00:00Z"))).toBe("plan");
  });
  it("bestaand gratis zzp-account zonder proef: zoals altijd geen periodieke facturen", () => {
    expect(recurringAccessCode({ ...zzp, trialEndsAt: null }, new Date("2026-12-01T10:00:00Z"))).toBe("plan");
  });
  it("bedrijf: eigen proef en poort blijven gelijk", () => {
    const biz = { plan: "BUSINESS" as const, status: "TRIALING" as const, trialEndsAt: end, accountType: "BEDRIJF" as const };
    expect(recurringAccessCode(biz, new Date("2026-12-01T10:00:00Z"))).toBeNull();
    expect(recurringAccessCode(biz, new Date("2026-12-21T10:00:00Z"))).toBe("expired");
  });
});

const d = (s: string) => new Date(`${s}T09:00:00`);
const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

describe("nextRunAfter", () => {
  it("wekelijks: +7 dagen", () => {
    expect(iso(nextRunAfter(d("2026-08-24"), "WEEKLY"))).toBe("2026-08-31");
  });
  it("maandelijks: zelfde dag volgende maand", () => {
    expect(iso(nextRunAfter(d("2026-08-15"), "MONTHLY"))).toBe("2026-09-15");
  });
  it("maandelijks: klemt op maandeinde (31 jan -> 28 feb)", () => {
    expect(iso(nextRunAfter(d("2026-01-31"), "MONTHLY"))).toBe("2026-02-28");
    expect(iso(nextRunAfter(d("2026-03-31"), "MONTHLY"))).toBe("2026-04-30");
  });
  it("kwartaal en jaar", () => {
    expect(iso(nextRunAfter(d("2026-11-30"), "QUARTERLY"))).toBe("2027-02-28");
    expect(iso(nextRunAfter(d("2024-02-29"), "YEARLY"))).toBe("2025-02-28");
  });
  it("over jaargrens heen", () => {
    expect(iso(nextRunAfter(d("2026-12-10"), "MONTHLY"))).toBe("2027-01-10");
  });
});
