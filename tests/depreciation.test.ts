import { describe, it, expect } from "vitest";
import { accumulatedAt, bookValueAt, depreciationInYear, depreciationByMonth, monthlyDepreciation, monthsElapsed } from "@/lib/depreciation";

const laptop = { purchaseDate: new Date(2026, 2, 15), purchasePrice: 1500, residualValue: 300, usefulLifeMonths: 60 };

describe("afschrijving", () => {
  it("rekent per maand vanaf de aanschafmaand", () => {
    expect(monthlyDepreciation(laptop)).toBe(20); // (1500-300)/60
    expect(monthsElapsed(laptop.purchaseDate, new Date(2026, 2, 31))).toBe(1);
    expect(monthsElapsed(laptop.purchaseDate, new Date(2026, 11, 31))).toBe(10);
    expect(accumulatedAt(laptop, new Date(2026, 11, 31))).toBe(200);
    expect(bookValueAt(laptop, new Date(2026, 11, 31))).toBe(1300);
  });

  it("stopt aan het einde van de looptijd op de restwaarde", () => {
    expect(accumulatedAt(laptop, new Date(2035, 0, 1))).toBe(1200);
    expect(bookValueAt(laptop, new Date(2035, 0, 1))).toBe(300);
  });

  it("geeft de jaarlast: eerste jaar 10 maanden, daarna 12", () => {
    expect(depreciationInYear(laptop, 2026)).toBe(200);
    expect(depreciationInYear(laptop, 2027)).toBe(240);
    expect(depreciationInYear(laptop, 2025)).toBe(0);
  });

  it("stopt bij afstoten", () => {
    const sold = { ...laptop, disposedAt: new Date(2026, 5, 1) };
    expect(accumulatedAt(sold, new Date(2027, 0, 1))).toBe(80); // mrt t/m jun = 4 maanden
  });

  it("verdeelt de jaarlast over de maanden", () => {
    const byMonth = depreciationByMonth([laptop], 2026);
    expect(byMonth.slice(0, 2)).toEqual([0, 0]);
    expect(byMonth[2]).toBe(20);
    expect(byMonth.reduce((a, b) => a + b, 0)).toBe(200);
  });
});
