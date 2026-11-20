import { describe, expect, it, vi } from "vitest";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream, type PDFPage } from "pdf-lib";
import {
  customerVatSchemeProblem, implicitVatScheme, normalizeVatId, vatIdCountry, vatSchemeProblem, vatSchemeProblemCode, type VatSchemeCheck,
} from "@/lib/vat-scheme";
import { korLevel, korLinesProblem, korThresholdProblem, assertKorAllowsRates } from "@/lib/kor";
import { InvoiceRuleError } from "@/lib/invoice-rule-error";
import { createInvoiceInTransaction } from "@/lib/invoice-write";
import { generateUblInvoice, taxCategory, type UblInvoiceData } from "@/lib/ubl";
import { generateInvoicePdf, type InvoicePdfData } from "@/lib/pdf";
import { pdfTexts, vatSchemeNoticeText } from "@/lib/pdf-labels";
import { calculateInvoiceTotals } from "@/lib/invoice-calc";
import { computeTodayActions } from "@/lib/today-actions";
import { calculateFiscalReserve } from "@/lib/fiscal";
import { createInvoiceSchema } from "@/lib/validations/invoice";

// ---------------------------------------------------------------- btw-soort (nr 9)

const base: VatSchemeCheck = {
  scheme: "REVERSE_EU",
  lineRates: [0, 0],
  customer: { country: "BE", vatNumber: "BE 0123.456.789" },
  seller: { vatNumber: "versleuteld" },
  korEnabled: false,
};

describe("btw-soort: btw verlegd en intracommunautaire levering (nr 9)", () => {
  it("gewone btw heeft geen extra eisen", () => {
    expect(vatSchemeProblem({ ...base, scheme: "STANDARD", lineRates: [21], customer: {} })).toBeNull();
  });

  it("een EU-dienst of ICL aan een Belgisch bedrijf met btw-nummer klopt", () => {
    expect(vatSchemeProblemCode(base)).toBeNull();
    expect(vatSchemeProblemCode({ ...base, scheme: "ICL" })).toBeNull();
  });

  it("eist het btw-nummer van de afnemer, met landcode", () => {
    expect(vatSchemeProblemCode({ ...base, customer: { country: "BE", vatNumber: "" } })).toBe("buyer_vat_missing");
    expect(vatSchemeProblemCode({ ...base, customer: { country: "BE", vatNumber: "0123456789" } })).toBe("buyer_vat_invalid");
    expect(vatSchemeProblem({ ...base, customer: { country: "BE" } })).toMatch(/btw-nummer van de klant/);
  });

  it("eist het eigen btw-nummer", () => {
    expect(vatSchemeProblemCode({ ...base, seller: { vatNumber: null } })).toBe("seller_vat_missing");
  });

  it("geen btw op de regels", () => {
    expect(vatSchemeProblemCode({ ...base, lineRates: [0, 21] })).toBe("rates_not_zero");
  });

  it("verlegd binnen Nederland alleen bij een Nederlandse klant met NL-btw-nummer", () => {
    const nl = { ...base, scheme: "REVERSE_NL" as const, customer: { country: "NL", vatNumber: "NL123456789B01" } };
    expect(vatSchemeProblemCode(nl)).toBeNull();
    expect(vatSchemeProblemCode({ ...nl, customer: { country: "BE", vatNumber: "BE0123456789" } })).toBe("buyer_not_dutch");
  });

  it("EU-dienst of ICL alleen aan een klant in een ander EU-land (ook Griekenland met EL)", () => {
    expect(vatSchemeProblemCode({ ...base, customer: { country: "NL", vatNumber: "NL123456789B01" } })).toBe("buyer_not_eu");
    expect(vatSchemeProblemCode({ ...base, customer: { country: "US", vatNumber: "US123456" } })).toBe("buyer_not_eu");
    expect(vatSchemeProblemCode({ ...base, customer: { country: "GR", vatNumber: "EL123456789" } })).toBeNull();
    expect(vatIdCountry("EL123456789")).toBe("GR");
    expect(normalizeVatId(" be 0123.456-789 ")).toBe("BE0123456789");
  });

  it("met de KOR aan: geen verlegging binnenland of ICL (veilige kant), wel een EU-dienst", () => {
    expect(vatSchemeProblemCode({ ...base, korEnabled: true })).toBeNull();
    expect(vatSchemeProblemCode({ ...base, scheme: "ICL", korEnabled: true })).toBe("kor_conflict");
    expect(vatSchemeProblemCode({ ...base, scheme: "REVERSE_NL", korEnabled: true, customer: { country: "NL", vatNumber: "NL123456789B01" } })).toBe("kor_conflict");
    // Een creditfactuur volgt het origineel.
    expect(vatSchemeProblemCode({ ...base, scheme: "ICL", korEnabled: true, isCredit: true })).toBeNull();
  });

  it("de standaard van een klant geldt bij automatische facturen alleen als alle regels 0% zijn", () => {
    expect(implicitVatScheme("REVERSE_EU", [0, 0])).toBe("REVERSE_EU");
    expect(implicitVatScheme("REVERSE_EU", [21])).toBe("STANDARD");
    expect(implicitVatScheme(null, [0])).toBe("STANDARD");
    expect(implicitVatScheme("ONZIN", [0])).toBe("STANDARD");
  });

  it("een klant met standaard btw verlegd heeft een passend btw-nummer nodig", () => {
    expect(customerVatSchemeProblem({ vatScheme: "ICL", country: "DE", vatNumber: "DE123456789" })).toBeNull();
    expect(customerVatSchemeProblem({ vatScheme: "ICL", country: "DE", vatNumber: "" })).toMatch(/btw-nummer/);
  });

  it("het factuurformulier accepteert alleen bekende btw-soorten", () => {
    const ok = { customerId: "c1", lineItems: [{ description: "x", quantity: 1, unitPrice: 1, vatRate: 0 }] };
    expect(createInvoiceSchema.safeParse({ ...ok, vatScheme: "ICL" }).success).toBe(true);
    expect(createInvoiceSchema.safeParse({ ...ok, vatScheme: "EXPORT" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------- KOR (nr 19, 20)

describe("KOR: geen btw op facturen en de omzetgrens (nr 19, 20)", () => {
  it("weigert btw op een regel als de KOR aan staat, behalve bij een creditfactuur", () => {
    expect(korLinesProblem(true, [0, 21])).toMatch(/KOR/);
    expect(korLinesProblem(true, [0, 0])).toBeNull();
    expect(korLinesProblem(false, [21])).toBeNull();
    expect(korLinesProblem(true, [21], true)).toBeNull();
    expect(() => assertKorAllowsRates(true, [9])).toThrow(InvoiceRuleError);
  });

  it("waarschuwt vanaf 18.000 en hard boven 20.000 euro", () => {
    expect(korLevel(17_999.99, 2026)).toBe("ok");
    expect(korLevel(18_000, 2026)).toBe("near");
    expect(korLevel(20_000, 2026)).toBe("near");
    expect(korLevel(20_000.01, 2026)).toBe("over");
  });

  it("weigert de factuur waarmee je over de grens gaat", () => {
    expect(korThresholdProblem({ korEnabled: true, year: 2026, revenueBefore: 19_000, subtotal: 1_000 })).toBeNull();
    expect(korThresholdProblem({ korEnabled: true, year: 2026, revenueBefore: 19_000, subtotal: 1_000.01 })).toMatch(/KOR-grens van 20\.000 euro/);
    expect(korThresholdProblem({ korEnabled: false, year: 2026, revenueBefore: 50_000, subtotal: 1 })).toBeNull();
    expect(korThresholdProblem({ korEnabled: true, year: 2026, revenueBefore: 50_000, subtotal: -100 })).toBeNull();
  });

  it("toont de KOR-grens bij 'Vandaag doen' op het dashboard", () => {
    const common = {
      now: new Date("2026-06-01T10:00:00Z"), lateInvoices: { count: 0, total: 0 }, draftInvoices: 0, unbilledHours: 0, unbilledHoursValue: 0,
      expiringQuotes: 0, hasAnyInvoice: true, hasIban: true, hasCompanyDetails: true, money: (n: number) => `EUR ${n}`, date: (d: Date) => d.toISOString(),
    };
    expect(computeTodayActions({ ...common, korThreshold: { level: "over", revenue: 21_000, threshold: 20_000, year: 2026 } })[0]).toMatchObject({ key: "korThresholdOver", tone: "urgent" });
    expect(computeTodayActions({ ...common, korThreshold: { level: "near", revenue: 18_500, threshold: 20_000, year: 2026 } })[0]).toMatchObject({ key: "korThresholdNear" });
    expect(computeTodayActions({ ...common, korThreshold: { level: "ok", revenue: 1, threshold: 20_000, year: 2026 } })).toEqual([]);
  });

  it("Fiscale Rust telt onder de KOR de btw die werkelijk op de facturen staat", () => {
    const input = { year: 2026, mode: "ib", kor: true, period: "year", gross: 1_210, costs: 0, vatRate: 21, inputVat: 0, ibPercent: 30, safetyPercent: 0 } as const;
    expect(calculateFiscalReserve(input)).toMatchObject({ outputVat: 0, vatReserve: 0 });
    expect(calculateFiscalReserve({ ...input, outputVat: 210 })).toMatchObject({ outputVat: 210, vatReserve: 210, revenueExVat: 1_000 });
  });
});

// ---------------------------------------------------------------- server-side bij het aanmaken

function fakeTx(opts: { kor?: boolean; revenue?: number; customer?: Record<string, unknown>; sellerVat?: string | null } = {}) {
  const created: Record<string, unknown>[] = [];
  const counter = vi.fn(async () => ({ invoicePrefix: "2026-", nextNumber: 8, numberPadding: 4, defaultDueDays: 14, defaultCurrency: "EUR", defaultNotes: null, korEnabled: !!opts.kor }));
  const tx = {
    customer: { findFirst: async () => ({ id: "c1", country: "NL", vatNumber: null, vatScheme: null, ...opts.customer }) },
    company: { findUnique: async () => ({ vatNumber: opts.sellerVat === undefined ? "versleuteld" : opts.sellerVat }) },
    invoiceSettings: { findUnique: async () => ({ korEnabled: !!opts.kor }), update: counter },
    invoice: {
      aggregate: async () => ({ _sum: { subtotal: opts.revenue ?? 0 } }),
      create: async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return { id: "inv1", ...data }; },
    },
    timeEntry: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    auditLog: { create: async () => ({}) },
  };
  return { tx: tx as unknown as Parameters<typeof createInvoiceInTransaction>[0], created, counter };
}

const line = (vatRate: number, unitPrice = 100) => ({ description: "Werk", quantity: 1, unitPrice, vatRate });

describe("createInvoiceInTransaction: btw-soort en KOR op de server", () => {
  it("KOR aan + 21% wordt geweigerd, zonder dat er een nummer verloren gaat", async () => {
    const { tx, counter } = fakeTx({ kor: true });
    await expect(createInvoiceInTransaction(tx, { accountId: "a1", createdById: "u1", customerId: "c1", lineItems: [line(21)] }))
      .rejects.toMatchObject({ status: 422, code: "kor_vat" });
    expect(counter).not.toHaveBeenCalled();
  });

  it("een creditfactuur van een factuur van vóór de KOR mag de btw van het origineel houden", async () => {
    const { tx, created } = fakeTx({ kor: true });
    await createInvoiceInTransaction(tx, {
      accountId: "a1", createdById: "u1", customerId: "c1", lineItems: [{ ...line(21), quantity: -1 }],
      originalInvoice: { id: "o1", number: "2026-0001", date: new Date("2026-01-05") },
    });
    expect(created).toHaveLength(1);
  });

  it("KOR aan: de factuur over de omzetgrens wordt geweigerd", async () => {
    const { tx } = fakeTx({ kor: true, revenue: 19_950 });
    await expect(createInvoiceInTransaction(tx, { accountId: "a1", createdById: "u1", customerId: "c1", lineItems: [line(0)], issueDate: new Date("2026-11-18") }))
      .rejects.toMatchObject({ code: "kor_threshold" });
  });

  it("btw verlegd zonder btw-nummer van de klant wordt geweigerd", async () => {
    const { tx } = fakeTx({ customer: { country: "BE", vatNumber: null } });
    await expect(createInvoiceInTransaction(tx, { accountId: "a1", createdById: "u1", customerId: "c1", lineItems: [line(0)], vatScheme: "REVERSE_EU" }))
      .rejects.toMatchObject({ code: "vat_scheme" });
  });

  it("slaat de btw-soort op, en neemt de standaard van de klant over bij 0%", async () => {
    const { tx, created } = fakeTx({ customer: { country: "DE", vatNumber: "DE123456789", vatScheme: "ICL" } });
    await createInvoiceInTransaction(tx, { accountId: "a1", createdById: "u1", customerId: "c1", lineItems: [line(0)] });
    expect(created[0].vatScheme).toBe("ICL");
    // Gewone btw = leeg in de database (zoals oude facturen).
    await createInvoiceInTransaction(tx, { accountId: "a1", createdById: "u1", customerId: "c1", lineItems: [line(21)] });
    expect(created[1].vatScheme).toBeNull();
  });
});

// ---------------------------------------------------------------- UBL (Peppol BIS 3)

function ubl(overrides: Partial<UblInvoiceData> = {}): string {
  const totals = calculateInvoiceTotals([line(0, 500)]);
  return generateUblInvoice({
    invoiceNumber: "2026-0009", issueDate: new Date("2026-11-18T00:00:00Z"), currency: "EUR",
    supplier: { name: "Jansen", country: "NL", vatNumber: "NL001234567B01", kvkNumber: "12345678" },
    customer: { name: "Client SA", country: "BE", vatNumber: "BE0123456789" },
    lineItems: totals.lineItems, subtotal: totals.subtotal, vatAmount: totals.vatAmount, total: totals.total,
    ...overrides,
  });
}

describe("UBL: btw verlegd (AE) en intracommunautaire levering (K)", () => {
  it("btw verlegd wordt AE met VATEX-EU-AE, in de juiste volgorde", () => {
    const xml = ubl({ vatScheme: "REVERSE_EU" });
    expect(xml).toMatch(/<cbc:ID>AE<\/cbc:ID>\s*<cbc:Percent>0\.00<\/cbc:Percent>\s*<cbc:TaxExemptionReasonCode>VATEX-EU-AE<\/cbc:TaxExemptionReasonCode>\s*<cbc:TaxExemptionReason>Reverse charge<\/cbc:TaxExemptionReason>/);
    expect(xml).toContain("<cac:ClassifiedTaxCategory>\n        <cbc:ID>AE</cbc:ID>");
    expect(xml).not.toContain("<cbc:ID>Z</cbc:ID>");
    expect(taxCategory(0, false, "REVERSE_NL").id).toBe("AE");
  });

  it("ICL wordt K met VATEX-EU-IC, leverdatum en land van aflevering (BR-IC-11/12)", () => {
    const xml = ubl({ vatScheme: "ICL" });
    expect(xml).toContain("<cbc:TaxExemptionReasonCode>VATEX-EU-IC</cbc:TaxExemptionReasonCode>");
    expect(xml).toMatch(/<cac:Delivery><cbc:ActualDeliveryDate>2026-11-18<\/cbc:ActualDeliveryDate><cac:DeliveryLocation><cac:Address><cac:Country><cbc:IdentificationCode>BE<\/cbc:IdentificationCode>/);
    // Een periode in plaats van één datum: geen extra leverdatum.
    const period = ubl({ vatScheme: "ICL", deliveryDate: new Date("2026-10-01"), deliveryEndDate: new Date("2026-10-31") });
    expect(period).toContain("<cac:InvoicePeriod>");
    expect(period).not.toContain("<cbc:ActualDeliveryDate>");
    expect(period).toContain("<cac:DeliveryLocation>");
  });

  it("btw-soort gaat voor de KOR; zonder btw-soort blijven KOR (E) en nultarief (Z) als voorheen", () => {
    expect(ubl({ vatScheme: "REVERSE_EU", kor: true })).toContain("<cbc:ID>AE</cbc:ID>");
    expect(ubl({ kor: true })).toContain("<cbc:ID>E</cbc:ID>");
    expect(ubl({})).toContain("<cbc:ID>Z</cbc:ID>");
  });
});

// ---------------------------------------------------------------- PDF

function pageStreams(page: PDFPage): PDFRawStream[] {
  const contents = page.node.Contents();
  if (!contents) return [];
  if (contents instanceof PDFArray) return contents.asArray().map((ref) => page.doc.context.lookup(ref)).filter((s): s is PDFRawStream => s instanceof PDFRawStream);
  return contents instanceof PDFRawStream ? [contents] : [];
}
async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => pageStreams(page).map((stream) => {
    const ops = Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
    return [...ops.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)].map((m) => Buffer.from(m[1], "hex").toString("latin1")).join(" ");
  }).join(" ")).join(" ").replace(/\s+/g, " ");
}

describe("PDF: wettelijke vermelding en btw-nummer van de afnemer (art. 35a Wet OB)", () => {
  it("toont 'Btw verlegd', het btw-nummer en het land van de klant", async () => {
    const totals = calculateInvoiceTotals([line(0, 500)]);
    const data: InvoicePdfData = {
      invoiceNumber: "2026-0009", issueDate: new Date("2026-11-18T00:00:00Z"), currency: "EUR",
      company: { name: "Jansen", vatNumber: "NL001234567B01", kvkNumber: "12345678" },
      customer: { name: "Client SA", city: "Brussel", country: "BE", vatNumber: "BE0123456789" },
      lineItems: totals.lineItems, subtotal: totals.subtotal, vatAmount: totals.vatAmount, total: totals.total,
      notices: [vatSchemeNoticeText("REVERSE_EU", "nl")!], reverseCharge: true, labels: pdfTexts("nl").labels,
    };
    const text = await pdfText(await generateInvoicePdf(data));
    expect(text).toContain("Btw-nummer: BE0123456789");
    expect(text).toContain("Land: BE");
    expect(text).toContain("Btw verlegd over EUR 500.00");
    expect(text).toContain("Btw verlegd (reverse charge).");
  });

  it("heeft een vermelding per btw-soort in beide talen, en geen bij gewone btw", () => {
    expect(vatSchemeNoticeText("STANDARD", "nl")).toBeNull();
    expect(vatSchemeNoticeText("ICL", "nl")).toMatch(/Intracommunautaire levering/);
    expect(vatSchemeNoticeText("ICL", "en")).toMatch(/Intra-Community supply/);
    expect(vatSchemeNoticeText("REVERSE_NL", "nl")).toBe("Btw verlegd.");
  });
});

// ---------------------------------------------------------------- reviewpunten fase 2

describe("UBL: btw-nummer van een oude klant wordt genormaliseerd (Peppol)", () => {
  it("haalt punten, streepjes en spaties weg in CompanyID en EndpointID", () => {
    const xml = ubl({ customer: { name: "Oude Klant BV", country: "NL", vatNumber: "nl1234.56.789.b01" }, vatScheme: "REVERSE_NL" });
    expect(xml).toContain("<cbc:CompanyID>NL123456789B01</cbc:CompanyID>");
    expect(xml).toContain('<cbc:EndpointID schemeID="9944">NL123456789B01</cbc:EndpointID>');
    expect(xml).not.toContain("NL1234.56");
    expect(ubl({ customer: { name: "Client SA", country: "BE", vatNumber: "BE 0123-456-789" } })).toContain("<cbc:CompanyID>BE0123456789</cbc:CompanyID>");
  });
});

describe("KOR en de standaard btw-soort van een klant", () => {
  it("met de KOR aan kan een klant geen standaard btw verlegd binnen Nederland of ICL krijgen", () => {
    const nl = { vatScheme: "REVERSE_NL" as const, country: "NL", vatNumber: "NL123456789B01" };
    const icl = { vatScheme: "ICL" as const, country: "DE", vatNumber: "DE123456789" };
    expect(customerVatSchemeProblem(nl)).toBeNull();
    expect(customerVatSchemeProblem(nl, { korEnabled: true })).toMatch(/KOR/);
    expect(customerVatSchemeProblem(icl, { korEnabled: true })).toMatch(/KOR/);
    // Een dienst aan een EU-bedrijf valt buiten de Nederlandse KOR: mag wel.
    expect(customerVatSchemeProblem({ vatScheme: "REVERSE_EU", country: "BE", vatNumber: "BE0123456789" }, { korEnabled: true })).toBeNull();
  });

  it("automatische facturen aan een klant met REVERSE_NL of ICL worden onder de KOR een gewone KOR-factuur", () => {
    expect(implicitVatScheme("REVERSE_NL", [0], true)).toBe("STANDARD");
    expect(implicitVatScheme("ICL", [0], true)).toBe("STANDARD");
    expect(implicitVatScheme("REVERSE_EU", [0], true)).toBe("REVERSE_EU");
    expect(implicitVatScheme("ICL", [0], false)).toBe("ICL");
  });

  it("createInvoiceInTransaction: KOR aan + klant met ICL geeft een KOR-factuur in plaats van een weigering", async () => {
    const { tx, created } = fakeTx({ kor: true, customer: { country: "DE", vatNumber: "DE123456789", vatScheme: "ICL" } });
    await createInvoiceInTransaction(tx, { accountId: "a1", createdById: null, customerId: "c1", lineItems: [line(0)] });
    expect(created[0].vatScheme).toBeNull();
  });
});
