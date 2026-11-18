import { describe, expect, it } from "vitest";
import { depositLines, depositSettlementLines, netCentsByVatRate, quoteConvertCheck } from "@/lib/quote-invoice";
import { calculateInvoiceTotals } from "@/lib/invoice-calc";

describe("aanbetaling per btw-tarief", () => {
  const lines = [
    { vatRate: 21, lineTotal: 1000 },
    { vatRate: 9, lineTotal: 333.33 },
    { vatRate: 21, lineTotal: 0.01 },
  ];
  it("telt netto per tarief op in centen", () => {
    expect(netCentsByVatRate(lines)).toEqual([{ vatRate: 21, netCents: 100001 }, { vatRate: 9, netCents: 33333 }]);
  });
  it("maakt per tarief een regel, afgerond in centen", () => {
    const result = depositLines(lines, 30, "OFF-0004");
    expect(result).toEqual([
      { description: "Aanbetaling 30% — offerte OFF-0004 (deel met 21% btw)", quantity: 1, unitPrice: 300, vatRate: 21 },
      { description: "Aanbetaling 30% — offerte OFF-0004 (deel met 9% btw)", quantity: 1, unitPrice: 100, vatRate: 9 },
    ]);
    // 21% over 300 + 9% over 100 = 63 + 9 btw
    expect(calculateInvoiceTotals(result)).toMatchObject({ subtotal: 400, vatAmount: 72, total: 472 });
  });
  it("één tarief: een gewone regel zonder toevoeging", () => {
    expect(depositLines([{ vatRate: 21, lineTotal: 99.99 }], 50, "OFF-1")).toEqual([
      { description: "Aanbetaling 50% — offerte OFF-1", quantity: 1, unitPrice: 50, vatRate: 21 },
    ]);
  });
});

describe("verrekening op de eindfactuur", () => {
  it("per tarief een negatieve regel voor de aanbetaling", () => {
    const settlement = depositSettlementLines({
      invoiceNumber: "2026-0010",
      lineItems: [{ vatRate: "21", lineTotal: "300.00" }, { vatRate: "9", lineTotal: "100.00" }],
    });
    expect(settlement).toEqual([
      { description: "Reeds gefactureerde aanbetaling 2026-0010", quantity: 1, unitPrice: -300, vatRate: 21 },
      { description: "Reeds gefactureerde aanbetaling 2026-0010", quantity: 1, unitPrice: -100, vatRate: 9 },
    ]);
    const final = calculateInvoiceTotals([
      { description: "Werk", quantity: 1, unitPrice: 1000, vatRate: 21 },
      { description: "Boeken", quantity: 1, unitPrice: 333.33, vatRate: 9 },
      ...settlement,
    ]);
    expect(final).toMatchObject({ subtotal: 933.33, vatAmount: 168 });
  });
});

describe("quoteConvertCheck", () => {
  it("geaccepteerd mag altijd", () => expect(quoteConvertCheck("ACCEPTED", false)).toEqual({ ok: true }));
  it("verzonden alleen met bevestiging", () => {
    expect(quoteConvertCheck("SENT", true)).toEqual({ ok: true });
    expect(quoteConvertCheck("SENT", false)).toMatchObject({ ok: false, code: "confirm_required", status: 409 });
  });
  it("concept, afgewezen of verlopen niet", () => {
    for (const status of ["DRAFT", "DECLINED", "EXPIRED"]) expect(quoteConvertCheck(status, true)).toMatchObject({ ok: false, code: "not_accepted" });
  });
});
