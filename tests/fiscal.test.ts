import { describe, expect, it } from "vitest";
import { calculateFiscalReserve, MAX_FISCAL_AMOUNT, type FiscalReserveInput } from "@/lib/fiscal";
import { FISCAL_RATES } from "@/lib/fiscal-rates";

const input: FiscalReserveInput = {
  year: 2026, mode: "ib", kor: false, period: "year", gross: 12_100, costs: 2_000,
  vatRate: 21, inputVat: 180, ibPercent: 30, safetyPercent: 10,
};
const calc = (changes: Partial<FiscalReserveInput> = {}) => calculateFiscalReserve({ ...input, ...changes });

describe("explainable fiscal reserves", () => {
  it("uses actual input VAT, with each reserve and remaining profit reconciling", () => {
    expect(calc()).toMatchObject({ revenueExVat: 10_000, outputVat: 2_100, inputVat: 180, netVat: 1_920,
      profit: 8_000, annualProfit: 8_000, taxReserve: 2_400, zvwReserve: 388,
      baseBuffer: 4_708, safetyReserve: 470.8, totalBuffer: 5_178.8, remainingProfit: 4_741.2, shortfall: 0 });
    // 12,100 receipts - 2,180 paid costs - 5,178.80 reserves = 4,741.20.
    expect(calc({ inputVat: 0 }).vatReserve).toBe(2_100);
  });

  it("shows a VAT refund separately and never treats it as available cash", () => {
    expect(calc({ inputVat: 3_000 })).toMatchObject({ netVat: -900, vatRefund: 900, vatReserve: 0,
      totalBuffer: 3_066.8, remainingProfit: 4_933.2 });
    expect(calc({ inputVat: 4_000 }).remainingProfit).toBe(calc({ inputVat: 3_000 }).remainingProfit);
  });

  it("supports actual output VAT for mixed rates and zero-rated revenue", () => {
    expect(calc({ gross: 2_300, outputVat: 300, costs: 0 })).toMatchObject({ outputVat: 300, revenueExVat: 2_000 });
    expect(calc({ vatRate: 0 })).toMatchObject({ outputVat: 0, revenueExVat: 12_100, vatRefund: 180 });
    expect(calc({ gross: 109, vatRate: 9, costs: 0 })).toMatchObject({ outputVat: 9, revenueExVat: 100 });
  });

  it("disables both output VAT and input VAT for KOR, preserving gross costs", () => {
    expect(calc({ kor: true, costs: 2_420 })).toMatchObject({ revenueExVat: 12_100, outputVat: 0,
      inputVat: 0, vatReserve: 0, vatRefund: 0, profit: 9_680 });
  });

  it("distinguishes the actual KOR threshold from a projected crossing", () => {
    expect(calc({ kor: true, gross: 20_000 }).korThresholdExceeded).toBe(false);
    expect(calc({ kor: true, gross: 20_000.01 }).korThresholdExceeded).toBe(true);
    expect(calc({ kor: true, gross: 6_000, period: "quarter" })).toMatchObject({ korThresholdExceeded: false, projectedKorThresholdExceeded: true });
    expect(calc({ kor: false, gross: 99_000 }).korThresholdExceeded).toBe(false);
  });

  it.each([[2025, 75_864, 3_990.45], [2026, 79_409, 3_851.34]] as const)("applies the verified %s Zvw annual maximum", (year, cap, expected) => {
    expect(calc({ year, vatRate: 0, gross: cap, costs: 0 }).annualZvw).toBe(expected);
    expect(calc({ year, vatRate: 0, gross: cap + 100_000, costs: 0 }).annualZvw).toBe(expected);
    expect(calc({ year, vatRate: 0, gross: 10_000, costs: 0 }).annualZvw).toBe(year === 2025 ? 526 : 485);
  });

  it("applies annual caps before sharing the reserve across months or quarters", () => {
    const month = calc({ period: "month", gross: 12_100, costs: 0 });
    expect(month).toMatchObject({ periodsPerYear: 12, annualProfit: 120_000, annualZvw: 3_851.34, zvwReserve: 320.95 });
    const quarter = calc({ period: "quarter", gross: 36_300, costs: 0 });
    expect(quarter).toMatchObject({ periodsPerYear: 4, annualProfit: 120_000, annualZvw: 3_851.34, zvwReserve: 962.84 });
    // No repeated full annual cap and no accumulating rounding drift beyond cents.
    expect(Math.abs(month.zvwReserve * 12 - quarter.zvwReserve * 4)).toBeLessThan(0.05);
  });

  it.each([2025, 2026] as const)("applies the %s corporate brackets around the threshold", (year) => {
    expect(calc({ year, mode: "vpb", vatRate: 0, gross: 200_000, costs: 0 })).toMatchObject({ annualProfitTax: 38_000, annualZvw: 0, zvwReserve: 0 });
    expect(calc({ year, mode: "vpb", vatRate: 0, gross: 200_100, costs: 0 }).annualProfitTax).toBe(38_025.8);
    expect(calc({ year, mode: "vpb", vatRate: 0, gross: 300_000, costs: 0 }).annualProfitTax).toBe(63_800);
    expect(calc({ year, mode: "vpb", period: "month", vatRate: 0, gross: 25_000, costs: 0 }).taxReserve).toBe(5_316.67);
  });

  it("uses an explicit annual projection without changing the period's VAT or profit", () => {
    expect(calc({ period: "month", annualProfit: 60_000 })).toMatchObject({ profit: 8_000,
      annualProfit: 60_000, outputVat: 2_100, taxReserve: 1_500, zvwReserve: 242.5 });
  });

  it("keeps losses visible and does not fabricate a tax refund", () => {
    expect(calc({ costs: 15_000 })).toMatchObject({ profit: -5_000, annualProfit: -5_000, taxReserve: 0,
      zvwReserve: 0, safetyReserve: 192, remainingProfit: 0, shortfall: 5_192 });
    expect(calc({ annualProfit: -1 })).toMatchObject({ annualProfitTax: 0, annualZvw: 0 });
  });

  it("does not hide a shortage when the reserve exceeds this period's profit", () => {
    expect(calc({ annualProfit: 1_000_000 })).toMatchObject({ remainingProfit: 0 });
    expect(calc({ annualProfit: 1_000_000 }).shortfall).toBeGreaterThan(0);
  });

  it("handles zero and cent amounts, with the extra margin explicitly optional", () => {
    expect(calc({ gross: 0, costs: 0, inputVat: 0 })).toMatchObject({ totalBuffer: 0, remainingProfit: 0 });
    expect(calc({ gross: 0.03, costs: 0, inputVat: 0, safetyPercent: 0 })).toMatchObject({ outputVat: 0.01, revenueExVat: 0.02 });
    expect(calc({ safetyPercent: 0 }).totalBuffer).toBe(calc({ safetyPercent: 0 }).baseBuffer);
    expect(calc({ ibPercent: 0 }).taxReserve).toBe(0);
    expect(calc({ ibPercent: 60 }).taxReserve).toBe(4_800);
  });

  it("accepts the documented maximum without unsafe integer arithmetic", () => {
    const result = calc({ gross: MAX_FISCAL_AMOUNT, period: "month" });
    for (const value of Object.values(result)) if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
  });

  it.each([
    { year: 2027 }, { year: "2026" }, { period: "week" }, { period: "toString" }, { mode: "other" }, { kor: "false" },
    { gross: NaN }, { gross: Infinity }, { gross: -1 }, { gross: 0.001 }, { gross: 100_000_000 },
    { costs: -1 }, { inputVat: -0.01 }, { outputVat: 12_101 }, { outputVat: 0.001 }, { annualProfit: NaN },
    { ibPercent: NaN }, { ibPercent: -1 }, { ibPercent: 61 }, { safetyPercent: Infinity }, { safetyPercent: -1 }, { safetyPercent: 31 }, { vatRate: 5 },
  ])("rejects invalid input %o instead of displaying a plausible number", (changes) => {
    expect(() => calc(changes as Partial<FiscalReserveInput>)).toThrow(RangeError);
  });

  it("documents a revision and official sources for every published year", () => {
    for (const [year, rates] of Object.entries(FISCAL_RATES)) {
      expect(rates.year).toBe(Number(year));
      expect(rates.revision).toMatch(new RegExp(`^${year}\\.`));
      expect(rates.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const url of Object.values(rates.sources)) expect(new URL(url).hostname).toBe("www.belastingdienst.nl");
    }
  });
});
