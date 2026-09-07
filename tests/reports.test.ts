import { describe, it, expect } from "vitest";
import { buildReport } from "@/lib/reports";

const inv = (m: number, subtotal: number, status: "SENT" | "PAID" | "OVERDUE" | "DRAFT" | "CANCELED", customer = "Acme", dueOffsetDays = 14) => ({
  issueDate: new Date(2026, m - 1, 10),
  dueDate: new Date(2026, m - 1, 10 + dueOffsetDays),
  status,
  subtotal,
  vatAmount: subtotal * 0.21,
  total: subtotal * 1.21,
  customerName: customer,
});

describe("buildReport", () => {
  const invoices = [inv(1, 1000, "PAID"), inv(2, 500, "SENT", "Bakker"), inv(3, 200, "DRAFT"), inv(3, 300, "CANCELED"), inv(12, 400, "OVERDUE", "Acme")];
  const expenses = [
    { date: new Date(2026, 0, 5), amountGross: 121, vatAmount: 21, category: "SOFTWARE" },
    { date: new Date(2026, 5, 5), amountGross: 242, vatAmount: 42, category: "OFFICE" },
    { date: new Date(2025, 5, 5), amountGross: 1000, vatAmount: 0, category: "OFFICE" }, // ander jaar
  ];
  const now = new Date(2026, 11, 31);
  const report = buildReport(2026, invoices, expenses, [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], now);

  it("telt alleen verzonden/betaalde/verlopen facturen als omzet (excl. btw)", () => {
    expect(report.totals.revenue).toBe(1900);
    expect(report.totals.vatOwed).toBe(399);
  });

  it("kosten netto, afschrijving apart, resultaat = omzet - kosten - afschrijving", () => {
    expect(report.totals.costs).toBe(300);
    expect(report.totals.depreciation).toBe(120);
    expect(report.totals.result).toBe(1480);
    expect(report.totals.vatInput).toBe(63);
    expect(report.totals.vatBalance).toBe(336);
  });

  it("omzet per klant met aandeel, kosten per categorie", () => {
    expect(report.byCustomer[0]).toMatchObject({ name: "Acme", revenue: 1400, invoices: 2 });
    expect(report.byCustomer[1]).toMatchObject({ name: "Bakker", revenue: 500 });
    expect(report.byCategory.map((c) => c.category)).toEqual(["OFFICE", "SOFTWARE"]);
  });

  it("maandtabel: januari heeft omzet 1000 en kosten 100", () => {
    expect(report.monthly[0]).toMatchObject({ month: 1, revenue: 1000, costs: 100, depreciation: 10, result: 890 });
  });

  it("ouderdom debiteuren", () => {
    // SENT feb (vervallen ~10 maanden) -> 90+, OVERDUE dec (vervalt 24 dec, 7 dagen) -> 30
    expect(report.aging.openCount).toBe(2);
    expect(report.aging.d90).toBe(605);
    expect(report.aging.d30).toBe(484);
  });
});
