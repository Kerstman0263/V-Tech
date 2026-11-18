import { describe, expect, it } from "vitest";
import { PLANS, planHasRecurringInvoices, priceInclVat, priceInclVatCents } from "@/lib/plans";
import { isSubstantiveEdit } from "@/lib/time-approval";
import { csvCell, neutralizeCsvText } from "@/lib/csv-safe";
import { invoiceStatusAfterUnmatch, isPaidOnline } from "@/lib/bank-matching";
import { createTimeEntrySchema, updateTimeEntrySchema } from "@/lib/validations/time";
import { createTaskSchema } from "@/lib/validations/task";
import { recurringAccessProblem } from "@/lib/recurring";

describe("priceInclVat", () => {
  it("rekent 21% btw op de prijs excl. btw, in centen", () => {
    expect(priceInclVatCents("GROWTH")).toBe(1815);
    expect(priceInclVat("GROWTH")).toBe(18.15);
    expect(priceInclVat("PRO")).toBe(35.09);
    expect(priceInclVat("WEBSHOP")).toBe(47.19);
    expect(priceInclVat("BUSINESS")).toBe(95.59);
    expect(priceInclVat("BUSINESS_PLUS")).toBe(180.29);
    expect(priceInclVat("FREE")).toBe(0);
  });
  it("de lijstprijs zelf blijft excl. btw", () => {
    expect(PLANS.GROWTH.price).toBe(15);
    expect(priceInclVat("PRO").toFixed(2)).toBe("35.09");
  });
});

describe("periodieke facturen per plan", () => {
  it("alleen betaalde plannen", () => {
    expect(planHasRecurringInvoices("FREE")).toBe(false);
    for (const plan of ["GROWTH", "PRO", "WEBSHOP", "BUSINESS", "BUSINESS_PLUS"] as const) expect(planHasRecurringInvoices(plan)).toBe(true);
  });
  it("verlopen bedrijfsproef of gratis plan wordt overgeslagen", () => {
    const now = new Date("2026-11-18T09:00:00Z");
    expect(recurringAccessProblem({ plan: "PRO", status: "ACTIVE", trialEndsAt: null, accountType: "ZZP" }, now)).toBeNull();
    expect(recurringAccessProblem({ plan: "FREE", status: "TRIALING", trialEndsAt: null, accountType: "ZZP" }, now)).toMatch(/Groei/);
    expect(recurringAccessProblem({ plan: "BUSINESS", status: "TRIALING", trialEndsAt: new Date("2026-11-01"), accountType: "BEDRIJF" }, now)).toMatch(/verlopen/);
    expect(recurringAccessProblem({ plan: "BUSINESS", status: "TRIALING", trialEndsAt: new Date("2026-12-01"), accountType: "BEDRIJF" }, now)).toBeNull();
  });
});

describe("isSubstantiveEdit", () => {
  it("uurtarief wijzigen vraagt om herbeoordeling", () => {
    expect(isSubstantiveEdit({ hourlyRate: 120 })).toBe(true);
    expect(isSubstantiveEdit({ hourlyRate: 0 })).toBe(true);
  });
  it("uren, datum, omschrijving, project en klant ook", () => {
    for (const field of ["hours", "date", "description", "projectId", "customerId"]) expect(isSubstantiveEdit({ [field]: null })).toBe(true);
  });
  it("alleen de facturatiestatus niet", () => {
    expect(isSubstantiveEdit({})).toBe(false);
    expect(isSubstantiveEdit({ status: "BILLED" } as Record<string, unknown>)).toBe(false);
  });
});

describe("grenzen voor uren en tarieven", () => {
  it("maximaal 9999,99 uur", () => {
    expect(createTimeEntrySchema.safeParse({ hours: 9999.99, description: "x" }).success).toBe(true);
    expect(createTimeEntrySchema.safeParse({ hours: 10000, description: "x" }).success).toBe(false);
    expect(updateTimeEntrySchema.safeParse({ hours: 10000 }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: "Taak", hours: 10000 }).success).toBe(false);
  });
  it("uurtarief heeft een redelijke bovengrens", () => {
    expect(createTimeEntrySchema.safeParse({ hours: 1, description: "x", hourlyRate: 10000 }).success).toBe(true);
    expect(updateTimeEntrySchema.safeParse({ hourlyRate: 1_000_000 }).success).toBe(false);
  });
});

describe("csvCell", () => {
  it("zet een apostrof voor tekst die als formule kan starten", () => {
    for (const text of ["=SUM(A1)", "+31 6", "-2+3", "@cmd", "\tTab"]) expect(neutralizeCsvText(text)).toBe(`'${text}`);
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
  });
  it("gewone tekst en bedragen blijven gelijk", () => {
    expect(csvCell("Bakkerij Jansen")).toBe(`"Bakkerij Jansen"`);
    expect(csvCell("-12,50", "amount")).toBe(`"-12,50"`);
    expect(csvCell("2026-01-31", "amount")).toBe(`"2026-01-31"`);
  });
});

describe("factuur na het losmaken van een bankkoppeling", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const none = { otherMatchedTransaction: false, paidOnline: false };
  it("betaald -> weer openstaand of te laat", () => {
    expect(invoiceStatusAfterUnmatch({ status: "PAID", dueDate: new Date("2026-12-01") }, none, now)).toBe("SENT");
    expect(invoiceStatusAfterUnmatch({ status: "PAID", dueDate: new Date("2026-11-01") }, none, now)).toBe("OVERDUE");
    expect(invoiceStatusAfterUnmatch({ status: "PAID", dueDate: null }, none, now)).toBe("SENT");
  });
  it("blijft betaald als er nog een andere betaling is", () => {
    expect(invoiceStatusAfterUnmatch({ status: "PAID", dueDate: null }, { ...none, otherMatchedTransaction: true }, now)).toBeNull();
    expect(invoiceStatusAfterUnmatch({ status: "PAID", dueDate: null }, { ...none, paidOnline: true }, now)).toBeNull();
  });
  it("raakt andere statussen niet", () => {
    expect(invoiceStatusAfterUnmatch({ status: "CANCELED", dueDate: null }, none, now)).toBeNull();
  });
  it("online betaald telt alleen als de laatste gebeurtenis een betaling is", () => {
    const at = (s: string) => new Date(s);
    expect(isPaidOnline([])).toBe(false);
    expect(isPaidOnline([{ action: "invoice.payment_received", createdAt: at("2026-11-01") }])).toBe(true);
    expect(isPaidOnline([
      { action: "invoice.payment_received", createdAt: at("2026-11-01") },
      { action: "invoice.payment_reversed", createdAt: at("2026-11-05") },
    ])).toBe(false);
  });
});
