import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hasPrioritySupport, sortSupportThreads, supportPlanFor } from "@/lib/support-priority";
import { PLAN_ORDER } from "@/lib/plans";

const day = (n: number) => new Date(Date.UTC(2026, 10, n));

describe("hasPrioritySupport", () => {
  it("Gratis en Groei krijgen geen voorrang, Pro en hoger wel", () => {
    const withPriority = PLAN_ORDER.filter(hasPrioritySupport);
    expect(withPriority).toEqual(["PRO", "WEBSHOP", "BUSINESS", "BUSINESS_PLUS"]);
  });
});

describe("supportPlanFor", () => {
  it("gebruikt het eigen abonnement van de eigenaar", () => {
    expect(supportPlanFor({ subscription: { plan: "PRO" }, owner: null })).toBe("PRO");
  });
  it("een medewerker valt onder het abonnement van de eigenaar", () => {
    expect(
      supportPlanFor({ subscription: { plan: "FREE" }, owner: { subscription: { plan: "BUSINESS" } } }),
    ).toBe("BUSINESS");
  });
  it("zonder abonnement geldt Gratis", () => {
    expect(supportPlanFor({ subscription: null, owner: null })).toBe("FREE");
    expect(supportPlanFor({})).toBe("FREE");
  });
});

describe("sortSupportThreads", () => {
  it("zet open gesprekken met voorrang bovenaan, ook als ze ouder zijn", () => {
    const sorted = sortSupportThreads([
      { id: "groei-nieuw", status: "OPEN" as const, lastAt: day(10), priority: false },
      { id: "pro-oud", status: "OPEN" as const, lastAt: day(2), priority: true },
      { id: "pro-wacht", status: "PENDING" as const, lastAt: day(5), priority: true },
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["pro-wacht", "pro-oud", "groei-nieuw"]);
  });

  it("afgehandelde gesprekken met voorrang staan niet bovenaan", () => {
    const sorted = sortSupportThreads([
      { id: "pro-klaar", status: "RESOLVED" as const, lastAt: day(12), priority: true },
      { id: "groei-open", status: "OPEN" as const, lastAt: day(3), priority: false },
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["pro-klaar", "groei-open"]);
    const withOpenPro = sortSupportThreads([
      ...sorted,
      { id: "pro-open", status: "OPEN" as const, lastAt: day(1), priority: true },
    ]);
    expect(withOpenPro[0].id).toBe("pro-open");
  });

  it("zonder voorrang blijft het nieuwste bericht eerst; gesprekken zonder datum achteraan", () => {
    const sorted = sortSupportThreads([
      { id: "leeg", status: "OPEN" as const, lastAt: null, priority: false },
      { id: "oud", status: "OPEN" as const, lastAt: day(1), priority: false },
      { id: "nieuw", status: "OPEN" as const, lastAt: day(9), priority: false },
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["nieuw", "oud", "leeg"]);
  });

  it("verandert de invoer niet", () => {
    const input = [
      { id: "a", status: "OPEN" as const, lastAt: day(1), priority: false },
      { id: "b", status: "OPEN" as const, lastAt: day(2), priority: true },
    ];
    sortSupportThreads(input);
    expect(input.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("de support-inbox van de beheerder gebruikt de voorrang", () => {
  const route = readFileSync(
    fileURLToPath(new URL("../app/api/admin/support/route.ts", import.meta.url)),
    "utf8",
  );
  it("haalt het pakket op en sorteert met sortSupportThreads", () => {
    expect(route).toMatch(/subscription:\s*\{\s*select:\s*\{\s*plan:\s*true/);
    expect(route).toMatch(/owner:\s*\{\s*select:\s*\{\s*subscription/);
    expect(route).toContain("sortSupportThreads(");
    expect(route).toContain("hasPrioritySupport(supportPlanFor(u))");
  });
});
