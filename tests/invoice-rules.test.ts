import { describe, expect, it } from "vitest";
import { formatInvoiceNumber, invoiceStatusTransitionError, isLatestInvoiceNumber } from "@/lib/invoice-status";
import { missingSenderFields, missingSenderMessage } from "@/lib/invoice-sender";
import { createInvoiceSchema, lineItemSchema } from "@/lib/validations/invoice";
import { createInvoiceInTransaction, deliveryPeriodFromDates } from "@/lib/invoice-write";
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
  const full = { name: "Bakkerij Jansen", address: "enc:straat", postalCode: "3511 AB", city: "Utrecht", vatNumber: "enc:btw", kvkNumber: "enc:kvk" };
  it("compleet: niets ontbreekt", () => {
    expect(missingSenderFields(full, false)).toEqual([]);
    expect(missingSenderMessage([])).toBeNull();
  });
  it("meldt naam, adres, btw-nummer en KvK-nummer", () => {
    expect(missingSenderFields(null, false)).toEqual(["name", "address", "vatNumber", "kvkNumber"]);
    expect(missingSenderMessage(["name", "address", "vatNumber"])).toContain("bedrijfsnaam, adres en btw-nummer");
    expect(missingSenderMessage(["address", "kvkNumber"])).toContain("adres en KvK-nummer");
    expect(missingSenderFields({ ...full, city: " " }, false)).toEqual(["address"]);
  });
  it("een Nederlands adres heeft een postcode nodig, een buitenlands niet per se", () => {
    expect(missingSenderFields({ ...full, postalCode: "" }, false)).toEqual(["address"]);
    expect(missingSenderFields({ ...full, postalCode: null, country: "IE", kvkNumber: null }, false)).toEqual([]);
  });
  it("het KvK-nummer is verplicht voor een bedrijf in Nederland (art. 20 Handelsregisterbesluit)", () => {
    expect(missingSenderFields({ ...full, kvkNumber: null }, false)).toEqual(["kvkNumber"]);
    expect(missingSenderFields({ ...full, kvkNumber: " " , country: "nl" }, true)).toEqual(["kvkNumber"]);
    expect(missingSenderFields({ ...full, kvkNumber: null, country: "BE" }, false)).toEqual([]);
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

describe("leverdatum of periode (art. 35a Wet OB)", () => {
  const base = { customerId: "c1", lineItems: [{ description: "Werk", quantity: 1, unitPrice: 10, vatRate: 21 }] };
  it("is optioneel en accepteert een datum of een periode", () => {
    expect(createInvoiceSchema.safeParse(base).success).toBe(true);
    expect(createInvoiceSchema.safeParse({ ...base, deliveryDate: "2026-10-15" }).success).toBe(true);
    expect(createInvoiceSchema.safeParse({ ...base, deliveryDate: "2026-10-01", deliveryEndDate: "2026-10-31" }).success).toBe(true);
  });
  it("weigert een einde zonder begin of voor het begin", () => {
    expect(createInvoiceSchema.safeParse({ ...base, deliveryEndDate: "2026-10-31" }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ ...base, deliveryDate: "2026-10-31", deliveryEndDate: "2026-10-01" }).success).toBe(false);
  });
  it("leidt de periode af van de gefactureerde uren", () => {
    const d = (s: string) => new Date(`${s}T09:00:00Z`);
    expect(deliveryPeriodFromDates([d("2026-10-14"), d("2026-10-02"), d("2026-10-30")])).toEqual({ deliveryDate: d("2026-10-02"), deliveryEndDate: d("2026-10-30") });
    expect(deliveryPeriodFromDates([d("2026-10-14"), new Date("2026-10-14T17:00:00Z")])).toEqual({ deliveryDate: d("2026-10-14"), deliveryEndDate: null });
    expect(deliveryPeriodFromDates([])).toEqual({ deliveryDate: null, deliveryEndDate: null });
  });
});

describe("createInvoiceInTransaction: leverdatum en creditverwijzing opslaan", () => {
  function fakeTx(entryDates: Date[] = []) {
    const created: Record<string, unknown>[] = [];
    const tx = {
      customer: { findFirst: async () => ({ id: "c1" }) },
      invoiceSettings: {
        findUnique: async () => ({ korEnabled: false }),
        update: async () => ({ invoicePrefix: "2026-", nextNumber: 8, numberPadding: 4, defaultDueDays: 14, defaultCurrency: "EUR", defaultNotes: null }),
      },
      timeEntry: {
        findMany: async () => entryDates.map((date) => ({ date })),
        updateMany: async ({ where }: { where: { id: { in: string[] } } }) => ({ count: where.id.in.length }),
      },
      invoice: { create: async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return { id: "inv1", invoiceNumber: data.invoiceNumber, ...data }; } },
      auditLog: { create: async () => ({}) },
    };
    return { tx: tx as unknown as Parameters<typeof createInvoiceInTransaction>[0], created };
  }
  const lines = [{ description: "Werk", quantity: 1, unitPrice: 100, vatRate: 21 }];

  it("neemt de periode van de uren over als er geen leverdatum is ingevuld", async () => {
    const { tx, created } = fakeTx([new Date("2026-10-30T10:00:00Z"), new Date("2026-10-02T10:00:00Z")]);
    await createInvoiceInTransaction(tx, { accountId: "a1", createdById: "u1", customerId: "c1", lineItems: lines, timeEntryIds: ["t1", "t2"] });
    expect(created[0].deliveryDate).toEqual(new Date("2026-10-02T10:00:00Z"));
    expect(created[0].deliveryEndDate).toEqual(new Date("2026-10-30T10:00:00Z"));
    expect(created[0].originalInvoiceNumber).toBeNull();
  });

  it("een ingevulde leverdatum gaat voor, en een creditfactuur bewaart nummer en datum van het origineel", async () => {
    const { tx, created } = fakeTx([new Date("2026-10-30T10:00:00Z")]);
    await createInvoiceInTransaction(tx, {
      accountId: "a1", createdById: "u1", customerId: "c1", lineItems: lines, timeEntryIds: ["t1"],
      deliveryDate: new Date("2026-09-15T00:00:00Z"), deliveryEndDate: new Date("2026-09-15T00:00:00Z"),
      originalInvoice: { id: "orig", number: "2026-0007", date: new Date("2026-10-01T00:00:00Z") },
    });
    expect(created[0].deliveryDate).toEqual(new Date("2026-09-15T00:00:00Z"));
    expect(created[0].deliveryEndDate).toBeNull();
    expect(created[0]).toMatchObject({ originalInvoiceId: "orig", originalInvoiceNumber: "2026-0007", originalInvoiceDate: new Date("2026-10-01T00:00:00Z") });
  });
});
