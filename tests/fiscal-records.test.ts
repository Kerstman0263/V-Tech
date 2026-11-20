import { expect, it } from "vitest";
import { fiscalRecordValues } from "@/lib/fiscal-records";
const records = { year: 2026, gross: 1210, outputVat: 210, costs: 121, inputVat: 21, invoices: 1, expenses: 1, excludedCurrency: 0 };
it("subtracts actual recorded VAT rather than applying the sales rate to costs", () => {
  expect(fiscalRecordValues(records, false)).toEqual({ gross: 1210, outputVat: 210, costs: 100, inputVat: 21 });
});
it("retains non-deductible VAT in KOR costs", () => {
  expect(fiscalRecordValues({ ...records, outputVat: 0 }, true)).toEqual({ gross: 1210, outputVat: 0, costs: 121, inputVat: 0 });
});
it("under KOR, keeps the VAT that is actually on the invoices (that VAT must be paid)", () => {
  expect(fiscalRecordValues(records, true)).toEqual({ gross: 1210, outputVat: 210, costs: 121, inputVat: 0 });
});
it("preserves credits and cent precision for manual review", () => {
  expect(fiscalRecordValues({ ...records, gross: -121, costs: 10.07, inputVat: 1.75 }, false)).toMatchObject({ gross: -121, costs: 8.32 });
});
