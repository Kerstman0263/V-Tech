import { describe, expect, it } from "vitest";
import { toCents, multiplyToCents, percentageOfCents } from "@/lib/money";
import { calculateInvoiceTotals } from "@/lib/invoice-calc";
import { bankMatchError } from "@/lib/bank-matching";

describe("cent arithmetic", () => {
  it.each([[1.005, 101], [10.075, 1008], [-1.005, -101], [-10.075, -1008]])("rounds %s symmetrically to %s cents", (amount, expected) => expect(toCents(amount)).toBe(expected));
  it("rounds a credit note to the exact inverse, including half-cent VAT", () => {
    const rows = [{ description: "Werk", quantity: 1, unitPrice: 0.5, vatRate: 21 }, { description: "Werk 2", quantity: 3, unitPrice: 33.33, vatRate: 9 }];
    const invoice = calculateInvoiceTotals(rows);
    const credit = calculateInvoiceTotals(rows.map((row) => ({ ...row, quantity: -row.quantity })));
    expect(credit.total).toBe(-invoice.total);
    expect(credit.vatAmount).toBe(-invoice.vatAmount);
    expect(percentageOfCents(50, 21)).toBe(11);
    expect(percentageOfCents(-50, 21)).toBe(-11);
  });
  it("handles decimal quantities without accumulating floating point drift", () => {
    expect(multiplyToCents(1.5, 19.99)).toBe(2999);
    const r = calculateInvoiceTotals(Array.from({ length: 200 }, () => ({ description: "Werk", quantity: 1, unitPrice: 0.1, vatRate: 0 })));
    expect(r.total).toBe(20);
    expect(() => toCents(Infinity)).toThrow();
    expect(() => toCents(NaN)).toThrow();
  });
});

describe("bank payment validation", () => {
  const invoice = { total: 121, currency: "EUR", status: "SENT" };
  it("accepts an exact incoming payment", () => expect(bankMatchError({ direction: "CREDIT", amount: 121 }, invoice)).toBeNull());
  it.each([0, 1, 120.99, 121.01, 1000, NaN])("does not mark amount %s as a full payment", (amount) => expect(bankMatchError({ direction: "CREDIT", amount }, invoice)).not.toBeNull());
  it("rejects outgoing payments, other currencies, drafts and cancelled invoices", () => {
    expect(bankMatchError({ direction: "DEBIT", amount: 121 }, invoice)).not.toBeNull();
    for (const changed of [{ currency: "USD" }, { status: "DRAFT" }, { status: "CANCELED" }]) expect(bankMatchError({ direction: "CREDIT", amount: 121 }, { ...invoice, ...changed })).not.toBeNull();
  });
});
