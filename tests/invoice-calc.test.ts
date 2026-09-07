import { describe, it, expect } from "vitest";
import { calculateInvoiceTotals } from "@/lib/invoice-calc";
import type { LineItemInput } from "@/lib/validations/invoice";

const line = (quantity: number, unitPrice: number, vatRate: number): LineItemInput => ({
  description: "regel",
  quantity,
  unitPrice,
  vatRate,
});

describe("calculateInvoiceTotals", () => {
  it("rekent één regel met 21% btw correct", () => {
    const r = calculateInvoiceTotals([line(10, 75, 21)]);
    expect(r.subtotal).toBe(750);
    expect(r.vatAmount).toBe(157.5);
    expect(r.total).toBe(907.5);
  });

  it("telt gemengde btw-tarieven per regel correct op", () => {
    const r = calculateInvoiceTotals([line(1, 100, 21), line(1, 100, 9)]);
    expect(r.subtotal).toBe(200);
    expect(r.vatAmount).toBe(30); // 21 + 9
    expect(r.total).toBe(230);
  });

  it("rondt netjes af op 2 decimalen (geen float-drift)", () => {
    const r = calculateInvoiceTotals([line(3, 33.33, 21)]);
    expect(r.subtotal).toBe(99.99);
    expect(r.vatAmount).toBe(21); // round2(99.99 * 0.21) = round2(20.9979)
    expect(r.total).toBe(120.99);
  });

  it("0% btw geeft geen btw", () => {
    const r = calculateInvoiceTotals([line(2, 50, 0)]);
    expect(r.subtotal).toBe(100);
    expect(r.vatAmount).toBe(0);
    expect(r.total).toBe(100);
  });

  it("zet per regel het juiste lineTotal (netto)", () => {
    const r = calculateInvoiceTotals([line(4, 25, 21)]);
    expect(r.lineItems[0].lineTotal).toBe(100);
  });
});
