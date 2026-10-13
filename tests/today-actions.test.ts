import { describe, expect, it } from "vitest";
import { computeTodayActions, MAX_TODAY_ACTIONS, upcomingVatDeadline, type TodayInput } from "@/lib/today-actions";

const base: TodayInput = {
  now: new Date(Date.UTC(2026, 9, 13)),
  lateInvoices: { count: 0, total: 0 },
  draftInvoices: 0,
  unbilledHours: 0,
  unbilledHoursValue: 0,
  expiringQuotes: 0,
  hasAnyInvoice: true,
  hasIban: true,
  hasCompanyDetails: true,
  money: (n) => `€ ${n.toFixed(2)}`,
  date: (d) => d.toISOString().slice(0, 10),
};

describe("VAT return deadline", () => {
  it("shows Q3 from early October until 31 October", () => {
    expect(upcomingVatDeadline(new Date(Date.UTC(2026, 9, 13)))).toMatchObject({ quarter: 3, year: 2026 });
    expect(upcomingVatDeadline(new Date(Date.UTC(2026, 9, 31)))?.due.toISOString().slice(0, 10)).toBe("2026-10-31");
  });
  it("is quiet more than three weeks ahead and moves on after the deadline", () => {
    expect(upcomingVatDeadline(new Date(Date.UTC(2026, 8, 1)))).toBeNull();
    expect(upcomingVatDeadline(new Date(Date.UTC(2026, 10, 1)))).toBeNull();
  });
  it("handles the Q4 return due in January of the next year", () => {
    expect(upcomingVatDeadline(new Date(Date.UTC(2027, 0, 20)))).toMatchObject({ quarter: 4, year: 2026 });
    expect(upcomingVatDeadline(new Date(Date.UTC(2026, 3, 25)))).toMatchObject({ quarter: 1, year: 2026 });
  });
});

describe("today actions", () => {
  it("is empty when everything is in order and no deadline is near", () => {
    expect(computeTodayActions({ ...base, now: new Date(Date.UTC(2026, 8, 1)) })).toEqual([]);
  });

  it("puts overdue money and legal deadlines first, then billable work", () => {
    const actions = computeTodayActions({
      ...base,
      lateInvoices: { count: 2, total: 1815 },
      draftInvoices: 1,
      unbilledHours: 12.5,
      unbilledHoursValue: 937.5,
    });
    expect(actions.map((a) => a.key)).toEqual(["lateInvoices", "vatReturn", "draftInvoices", "unbilledHours"]);
    expect(actions[0]).toMatchObject({ href: "/invoices?status=OVERDUE", values: { count: 2, amount: "€ 1815.00" } });
    expect(actions[1].values).toMatchObject({ quarter: 3, date: "2026-10-31" });
  });

  it("never shows more than four actions", () => {
    const actions = computeTodayActions({
      ...base,
      lateInvoices: { count: 1, total: 10 },
      draftInvoices: 1,
      unbilledHours: 1,
      unbilledHoursValue: 50,
      expiringQuotes: 1,
      hasIban: false,
      hasCompanyDetails: false,
    });
    expect(actions).toHaveLength(MAX_TODAY_ACTIONS);
  });

  it("suggests setup steps that unlock the payment QR and complete invoices", () => {
    const actions = computeTodayActions({ ...base, now: new Date(Date.UTC(2026, 8, 1)), hasIban: false, hasCompanyDetails: false });
    expect(actions.map((a) => a.key)).toEqual(["addIban", "companyDetails"]);
  });

  it("skips the VAT reminder for accounts without any invoice", () => {
    expect(computeTodayActions({ ...base, hasAnyInvoice: false }).map((a) => a.key)).not.toContain("vatReturn");
  });
});
