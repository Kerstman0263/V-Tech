import { describe, expect, it } from "vitest";
import { epcQrPayload, extractIban, formatIban, isValidIban } from "@/lib/iban";
import { generateUblInvoice, type UblInvoiceData } from "@/lib/ubl";
import { generateInvoicePdf } from "@/lib/pdf";
import { calculateInvoiceTotals } from "@/lib/invoice-calc";

describe("IBAN", () => {
  it("accepts valid IBANs with or without spaces and rejects typos", () => {
    expect(isValidIban("NL91ABNA0417164300")).toBe(true);
    expect(isValidIban("nl91 abna 0417 1643 00")).toBe(true);
    expect(isValidIban("BE68539007547034")).toBe(true);
    expect(isValidIban("NL91ABNA0417164301")).toBe(false);
    expect(isValidIban("NL91")).toBe(false);
  });

  it("finds the IBAN inside free-form payment instructions", () => {
    expect(extractIban("Graag binnen 14 dagen op IBAN NL91 ABNA 0417 1643 00 t.n.v. Jansen")).toBe("NL91ABNA0417164300");
    expect(extractIban("Rekening: NL00FAKE0000000000, of NL91ABNA0417164300")).toBe("NL91ABNA0417164300");
    expect(extractIban("Betaal via de link in de mail")).toBeNull();
    expect(extractIban(null)).toBeNull();
    expect(formatIban("NL91ABNA0417164300")).toBe("NL91 ABNA 0417 1643 00");
  });
});

describe("EPC payment QR", () => {
  it("follows the EPC069-12 v002 layout", () => {
    const payload = epcQrPayload({ name: "Jansen Klus", iban: "NL91 ABNA 0417 1643 00", amount: 1210, currency: "EUR", reference: "Factuur 2026-0007" });
    expect(payload?.split("\n")).toEqual(["BCD", "002", "1", "SCT", "", "Jansen Klus", "NL91ABNA0417164300", "EUR1210.00", "", "", "Factuur 2026-0007"]);
  });

  it("is skipped for credits, other currencies and invalid accounts", () => {
    const base = { name: "Jansen", iban: "NL91ABNA0417164300", amount: 100, currency: "EUR", reference: "F1" };
    expect(epcQrPayload({ ...base, amount: -50 })).toBeNull();
    expect(epcQrPayload({ ...base, amount: 0 })).toBeNull();
    expect(epcQrPayload({ ...base, currency: "USD" })).toBeNull();
    expect(epcQrPayload({ ...base, iban: "NL91ABNA0417164301" })).toBeNull();
  });

  it("renders into the invoice PDF without breaking it", async () => {
    const data = {
      invoiceNumber: "2026-0007", issueDate: new Date("2026-10-09"), currency: "EUR",
      company: { name: "Jansen" }, customer: { name: "Klant" },
      lineItems: [{ description: "Werk", quantity: 1, unitPrice: 100, vatRate: 21, lineTotal: 100 }],
      subtotal: 100, vatAmount: 21, total: 121,
    };
    const plain = await generateInvoicePdf(data);
    const withQr = await generateInvoicePdf({ ...data, paymentQr: epcQrPayload({ name: "Jansen", iban: "NL91ABNA0417164300", amount: 121, currency: "EUR", reference: "Factuur 2026-0007" }) });
    expect(Buffer.from(withQr.slice(0, 5)).toString()).toBe("%PDF-");
    expect(withQr.length).toBeGreaterThan(plain.length);
  });
});

function sample(overrides: Partial<UblInvoiceData> = {}): UblInvoiceData {
  const totals = calculateInvoiceTotals([
    { description: "Advies <senior> & ondersteuning", quantity: 3.5, unitPrice: 85.55, vatRate: 21 },
    { description: "Boek", quantity: 1, unitPrice: 19.99, vatRate: 9 },
    { description: "Korting", quantity: 1, unitPrice: -10, vatRate: 21 },
  ]);
  return {
    invoiceNumber: "2026-0042", issueDate: new Date("2026-10-09T12:00:00Z"), dueDate: new Date("2026-10-23T12:00:00Z"), currency: "EUR",
    supplier: { name: "Jansen & Zn", address: "Dorpsstraat 1", postalCode: "1234 AB", city: "Utrecht", country: "NL", vatNumber: "NL001234567B01", kvkNumber: "12345678", email: "jan@example.nl" },
    customer: { name: "Klant BV", city: "Amsterdam", country: "nl", vatNumber: "NL009876543B01" },
    lineItems: totals.lineItems.map((li) => ({ description: li.description, quantity: li.quantity, unitPrice: li.unitPrice, vatRate: li.vatRate, lineTotal: li.lineTotal })),
    subtotal: totals.subtotal, vatAmount: totals.vatAmount, total: totals.total,
    iban: "NL91ABNA0417164300",
    ...overrides,
  };
}

const tag = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`, "g"))].map((m) => m[1]);

function wellFormed(xml: string): boolean {
  const stack: string[] = [];
  for (const m of xml.matchAll(/<(\/?)([A-Za-z][\w:.-]*)[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (m[1]) { if (stack.pop() !== m[2]) return false; } else stack.push(m[2]);
  }
  return stack.length === 0;
}

describe("UBL e-invoice (Peppol BIS 3)", () => {
  it("is well-formed, escapes text and declares the Peppol profile", () => {
    const xml = generateUblInvoice(sample());
    expect(wellFormed(xml)).toBe(true);
    expect(xml).toContain("urn:fdc:peppol.eu:2017:poacc:billing:3.0");
    expect(xml).toContain("Advies &lt;senior&gt; &amp; ondersteuning");
    expect(xml).toContain("Jansen &amp; Zn");
    expect(xml).not.toMatch(/<senior>/);
    expect(tag(xml, "cbc:IssueDate")).toEqual(["2026-10-09"]);
    expect(xml).toContain('<cbc:EndpointID schemeID="0106">12345678</cbc:EndpointID>');
    expect(xml).toContain('<cbc:EndpointID schemeID="9944">NL009876543B01</cbc:EndpointID>');
    expect(xml).toContain("<cbc:IdentificationCode>NL</cbc:IdentificationCode>");
  });

  it("tax subtotals add up exactly to the invoice totals Saldova stored", () => {
    const data = sample();
    const xml = generateUblInvoice(data);
    const taxAmounts = tag(xml, "cbc:TaxAmount").map(Number);
    const [total, ...subs] = taxAmounts;
    expect(total).toBe(data.vatAmount);
    expect(Math.round(subs.reduce((a, b) => a + b, 0) * 100)).toBe(Math.round(data.vatAmount * 100));
    const taxable = tag(xml, "cbc:TaxableAmount").map(Number);
    expect(Math.round(taxable.reduce((a, b) => a + b, 0) * 100)).toBe(Math.round(data.subtotal * 100));
    const lines = tag(xml, "cbc:LineExtensionAmount").map(Number);
    expect(lines[0]).toBe(data.subtotal);
    expect(Math.round(lines.slice(1).reduce((a, b) => a + b, 0) * 100)).toBe(Math.round(data.subtotal * 100));
    expect(tag(xml, "cbc:PayableAmount").map(Number)).toEqual([data.total]);
  });

  it("marks KOR as exempt and includes SEPA payment details", () => {
    const kor = generateUblInvoice(sample({
      lineItems: [{ description: "Les", quantity: 2, unitPrice: 50, vatRate: 0, lineTotal: 100 }],
      subtotal: 100, vatAmount: 0, total: 100, kor: true,
    }));
    expect(tag(kor, "cbc:ID")).toContain("E");
    expect(kor).toContain("kleineondernemersregeling");
    expect(kor).toContain("<cbc:PaymentMeansCode name=\"SEPA credit transfer\">58</cbc:PaymentMeansCode>");
    expect(kor).toContain("<cbc:ID>NL91ABNA0417164300</cbc:ID>");
    const noIban = generateUblInvoice(sample({ iban: null }));
    expect(noIban).not.toContain("PaymentMeans");
  });
});
