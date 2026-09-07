import { describe, it, expect } from "vitest";
import { YEARLY_DISCOUNT, monthlyAtYearly, yearlyTotal, URENCRITERIUM_HOURS, WORK_WEEKS_PER_YEAR } from "@/lib/marketing";

describe("jaarbetaling-korting", () => {
  it("15% korting op de maandprijs, afgerond op hele euro's", () => {
    expect(YEARLY_DISCOUNT).toBe(0.15);
    expect(monthlyAtYearly(29)).toBe(25); // round(24.65)
    expect(monthlyAtYearly(15)).toBe(13); // round(12.75)
    expect(monthlyAtYearly(79)).toBe(67); // round(67.15)
  });

  it("jaarprijs = effectieve maandprijs × 12", () => {
    expect(yearlyTotal(29)).toBe(300);
    expect(yearlyTotal(79)).toBe(804);
  });
});

describe("urencriterium-constanten", () => {
  it("hanteert de wettelijke 1225-uursgrens en realistische werkweken", () => {
    expect(URENCRITERIUM_HOURS).toBe(1225);
    expect(WORK_WEEKS_PER_YEAR).toBe(46);
  });
});
