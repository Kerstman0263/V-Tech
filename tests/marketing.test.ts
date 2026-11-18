import { describe, it, expect } from "vitest";
import { formatPlanPrice, URENCRITERIUM_HOURS, WORK_WEEKS_PER_YEAR } from "@/lib/marketing";

describe("planprijs", () => {
  it("toont hele euro's in Nederlandse notatie: € 29", () => {
    // Tussen € en het bedrag staat een harde spatie (U+00A0).
    expect(formatPlanPrice(29)).toBe("€ 29");
    expect(formatPlanPrice(149)).toBe("€ 149");
    expect(formatPlanPrice(0)).toBe("€ 0");
  });
});

describe("urencriterium-constanten", () => {
  it("hanteert de wettelijke 1225-uursgrens en realistische werkweken", () => {
    expect(URENCRITERIUM_HOURS).toBe(1225);
    expect(WORK_WEEKS_PER_YEAR).toBe(46);
  });
});
