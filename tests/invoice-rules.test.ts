import { describe, expect, it } from "vitest";
import { formatInvoiceNumber, invoiceStatusTransitionError, isLatestInvoiceNumber } from "@/lib/invoice-status";
import { missingSenderFields, missingSenderMessage } from "@/lib/invoice-sender";
import { lineItemSchema } from "@/lib/validations/invoice";
import { updateInvoiceSettingsSchema } from "@/lib/validations/invoice-settings";

describe("invoiceStatusTransitionError", () => {
  it("een concept mag verstuurd, betaald of vervallen worden", () => {
    for (const to of ["SENT", "PAID", "OVERDUE", "CANCELED"] as const) {
      expect(invoiceStatusTransitionError("DRAFT", to)).toBeNull();
    }
  });
  it("uitgereikte facturen wisselen alleen tussen openstaand, te laat en betaald", () => {
    const issued = ["SENT", "OVERDUE", "PAID"] as const;
    for (const from of issued) for (const to of issued) expect(invoiceStatusTransitionError(from, to)).toBeNull();
  });
  it("een uitgereikte factuur annuleren kan niet: maak een creditfactuur", () => {
    for (const from of ["SENT", "OVERDUE", "PAID"] as const) {
      expect(invoiceStatusTransitionError(from, "CANCELED")).toMatch(/creditfactuur/i);
      expect(invoiceStatusTransitionError(from, "DRAFT")).toMatch(/creditfactuur/i);
    }
  });
  it("een vervallen factuur blijft afgesloten", () => {
    for (const to of ["SENT", "PAID", "OVERDUE", "DRAFT"] as const) expect(invoiceStatusTransitionError("CANCELED", to)).not.toBeNull();
  });
  it("dezelfde status is geen wijziging", () => {
    expect(invoiceStatusTransitionError("PAID", "PAID")).toBeNull();
  });
});

describe("isLatestInvoiceNumber", () => {
  const settings = { invoicePrefix: "2026-", nextNumber: 8, numberPadding: 4 };
  it("herkent het laatst uitgegeven nummer", () => {
    expect(formatInvoiceNumber("2026-", 7, 4)).toBe("2026-0007");
    expect(isLatestInvoiceNumber("2026-0007", settings)).toBe(true);
  });
  it("een ouder nummer of een ander voorvoegsel is niet het laatste", () => {
    expect(isLatestInvoiceNumber("2026-0006", settings)).toBe(false);
    expect(isLatestInvoiceNumber("2025-0007", settings)).toBe(false);
    expect(isLatestInvoiceNumber("0001", { invoicePrefix: "", nextNumber: 1, numberPadding: 4 })).toBe(false);
  });
});

describe("verplichte afzendergegevens", () => {
  const full = { name: "Bakkerij Jansen", address: "enc:straat", city: "Utrecht", vatNumber: "enc:btw" };
  it("compleet: niets ontbreekt", () => {
    expect(missingSenderFields(full, false)).toEqual([]);
    expect(missingSenderMessage([])).toBeNull();
  });
  it("meldt naam, adres en btw-nummer", () => {
    expect(missingSenderFields(null, false)).toEqual(["name", "address", "vatNumber"]);
    expect(missingSenderMessage(["name", "address", "vatNumber"])).toContain("bedrijfsnaam, adres en btw-nummer");
    expect(missingSenderFields({ ...full, city: " " }, false)).toEqual(["address"]);
  });
  it("bij de KOR is geen btw-nummer nodig", () => {
    expect(missingSenderFields({ ...full, vatNumber: null }, true)).toEqual([]);
    expect(missingSenderFields({ ...full, vatNumber: null }, false)).toEqual(["vatNumber"]);
  });
});

describe("btw-tarieven", () => {
  const line = { description: "Werk", quantity: 1, unitPrice: 100 };
  it("alleen 0, 9 en 21% op factuur- en offerteregels", () => {
    for (const vatRate of [0, 9, 21]) expect(lineItemSchema.safeParse({ ...line, vatRate }).success).toBe(true);
    for (const vatRate of [6, 19, 20, 100, -1]) expect(lineItemSchema.safeParse({ ...line, vatRate }).success).toBe(false);
  });
  it("standaardtarief in de instellingen", () => {
    expect(updateInvoiceSettingsSchema.safeParse({ defaultVatRate: 9 }).success).toBe(true);
    expect(updateInvoiceSettingsSchema.safeParse({ defaultVatRate: 19 }).success).toBe(false);
  });
});
