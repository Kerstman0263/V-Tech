import { describe, expect, it, vi } from "vitest";
import { generateUblInvoice, ublPlainAllowed, ublProblems, type UblInvoiceData } from "@/lib/ubl";
import { ublBlockedMessage, ublInvoiceData, ublProblemTexts } from "@/lib/ubl-invoice";
import { endpointFor, isValidBelgianEnterpriseNumber, isValidGln, normalizePeppolId, parsePeppolId } from "@/lib/peppol";
import { calculateInvoiceTotals } from "@/lib/invoice-calc";
import { createCustomerSchema, createInvoiceSchema, updateCustomerSchema, withoutUnchangedVatNumber } from "@/lib/validations/invoice";
import { parseCustomerCsv } from "@/lib/customer-import";
import { updateProfileSchema } from "@/lib/validations/account";
import { buildInvoiceSnapshot, invoiceParties, type SnapshotSource } from "@/lib/invoice-snapshot";
import { createInvoiceInTransaction } from "@/lib/invoice-write";
import { generateInvoicePdf } from "@/lib/pdf";
import { pdfTexts } from "@/lib/pdf-labels";
import nl from "@/messages/nl.json";
import en from "@/messages/en.json";

/*
 * Controles op de gegenereerde e-factuur volgens Peppol BIS Billing 3.0 en
 * NLCIUS. Dit is GEEN officiële validator: de officiële Peppol-schematron
 * (PEPPOL-EN16931-UBL.sch met de NL-regels) en het UBL 2.1-XSD zijn hier niet
 * gedraaid. Hieronder staan de belangrijkste regels nagebouwd: verplichte
 * elementen, de volgorde uit het UBL-schema, de BR-CO-sommen, de
 * btw-categorieën (S, Z, E, AE, K) en de Nederlandse regels NL-R-001 t/m 008.
 *
 * De NL-regels zijn op 20-11-2026 nagelezen in de tekst van de officiële
 * PEPPOL-EN16931-UBL.sch (Peppol BIS 3.0.22, NL-sectie); de schematron zelf
 * is niet uitgevoerd. NL-R-003 en NL-R-005 hangen daar aan het element
 * PartyLegalEntity/CompanyID (zonder dat element gelden ze niet). Hier is
 * NL-R-003 strenger: het KvK-nummer van de leverancier moet er altijd staan.
 * NL-R-008 geldt officieel alleen bij een Nederlandse klant; hier altijd.
 */

// ---------------------------------------------------------------- mini-XML-parser

interface XNode { name: string; attrs: Record<string, string>; children: XNode[]; text: string }

function parseXml(xml: string): XNode {
  const body = xml.replace(/^<\?xml[^>]*\?>\s*/, "");
  const root: XNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack = [root];
  const re = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g;
  let pos = 0;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    if (m.index !== pos) throw new Error(`Onleesbare XML op positie ${pos}`);
    pos = re.lastIndex;
    if (m[5] !== undefined) { stack[stack.length - 1].text += m[5]; continue; }
    if (m[1]) {
      const open = stack.pop();
      if (!open || open.name !== m[2]) throw new Error(`Sluittag ${m[2]} past niet bij ${open?.name}`);
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of m[3].matchAll(/([\w:.-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    const node: XNode = { name: m[2], attrs, children: [], text: "" };
    stack[stack.length - 1].children.push(node);
    if (!m[4]) stack.push(node);
  }
  if (pos !== body.length || stack.length !== 1 || root.children.length !== 1) throw new Error("XML is niet goed gevormd");
  return root.children[0];
}

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const all = (n: XNode | undefined, path: string): XNode[] => {
  let nodes = n ? [n] : [];
  for (const part of path.split("/")) nodes = nodes.flatMap((x) => x.children.filter((c) => c.name === part));
  return nodes;
};
const one = (n: XNode | undefined, path: string) => all(n, path)[0];
const val = (n: XNode | undefined, path: string) => { const x = one(n, path); return x ? decode(x.text).trim() : undefined; };
const cents = (s: string | undefined) => Math.round(Number(s) * 100);
const walk = (n: XNode, fn: (x: XNode) => void) => { fn(n); n.children.forEach((c) => walk(c, fn)); };

const INVOICE_ORDER = [
  "cbc:CustomizationID", "cbc:ProfileID", "cbc:ID", "cbc:IssueDate", "cbc:DueDate", "cbc:InvoiceTypeCode", "cbc:Note",
  "cbc:DocumentCurrencyCode", "cbc:BuyerReference", "cac:InvoicePeriod", "cac:OrderReference", "cac:BillingReference",
  "cac:AccountingSupplierParty", "cac:AccountingCustomerParty", "cac:Delivery", "cac:PaymentMeans", "cac:PaymentTerms",
  "cac:TaxTotal", "cac:LegalMonetaryTotal", "cac:InvoiceLine",
];
// UBL 2.1 CreditNote: geen DueDate op documentniveau.
const CREDIT_ORDER = INVOICE_ORDER.filter((n) => n !== "cbc:DueDate")
  .map((n) => (n === "cbc:InvoiceTypeCode" ? "cbc:CreditNoteTypeCode" : n === "cac:InvoiceLine" ? "cac:CreditNoteLine" : n));
const PARTY_ORDER = ["cbc:EndpointID", "cac:PartyIdentification", "cac:PartyName", "cac:PostalAddress", "cac:PartyTaxScheme", "cac:PartyLegalEntity", "cac:Contact"];
const ADDRESS_ORDER = ["cbc:StreetName", "cbc:AdditionalStreetName", "cbc:CityName", "cbc:PostalZone", "cbc:CountrySubentity", "cac:AddressLine", "cac:Country"];
const LINE_ORDER = ["cbc:ID", "cbc:Note", "cbc:InvoicedQuantity", "cbc:CreditedQuantity", "cbc:LineExtensionAmount", "cac:InvoicePeriod", "cac:Item", "cac:Price"];
const CATEGORY_ORDER = ["cbc:ID", "cbc:Percent", "cbc:TaxExemptionReasonCode", "cbc:TaxExemptionReason", "cac:TaxScheme"];
// Deel van de Peppol-codelijst EAS dat Saldova gebruikt.
const KNOWN_EAS = ["0106", "0190", "0088", "0208", "0204", "9914", "9920", "9925", "9930", "9944", "9957", "EM"];
const ISO_COUNTRY = /^(A[DEFGILMOQRSTUWXZ]|B[ABDEFGHIJLMNOQRSTVWYZ]|C[ADFGHIKLMNORUVWXYZ]|D[EJKMOZ]|E[CEGHRST]|F[IJKMOR]|G[ABDEFGHILMNPQRSTUWY]|H[KMNRTU]|I[DELMNOQRST]|J[EMOP]|K[EGHIMNPRWYZ]|L[ABCIKRSTUVY]|M[ACDEFGHKLMNOPQRSTUVWXYZ]|N[ACEFGILOPRUZ]|OM|P[AEFGHKLMNRSTWY]|QA|R[EOSUW]|S[ABCDEGHIJKLMNORSTVXYZ]|T[CDFGHJKLMNORTVWZ]|U[AGMSYZ]|V[ACEGINU]|W[FS]|XI|Y[ET]|Z[AMW])$/;

function inOrder(n: XNode, order: string[]): boolean {
  let last = -1;
  for (const c of n.children) {
    const i = order.indexOf(c.name);
    if (i < 0 || i < last) return false;
    last = i;
  }
  return true;
}

/** Nagebouwde Peppol BIS 3 / NLCIUS-regels. Geeft de geschonden regels terug. */
function peppolCheck(xml: string): string[] {
  const errors = new Set<string>();
  const rule = (id: string, ok: boolean) => { if (!ok) errors.add(id); };
  const doc = parseXml(xml);
  const credit = doc.name === "CreditNote";
  rule("UBL-root", doc.name === "Invoice" || credit);
  rule("UBL-namespace", doc.attrs.xmlns === `urn:oasis:names:specification:ubl:schema:xsd:${doc.name}-2`);
  rule("UBL-order", inOrder(doc, credit ? CREDIT_ORDER : INVOICE_ORDER));
  rule("UBL-escape", !/&(?!(amp|lt|gt|quot|apos);)/.test(xml));

  rule("PEPPOL-EN16931-R004", val(doc, "cbc:CustomizationID") === "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0");
  rule("PEPPOL-EN16931-R007", /^urn:fdc:peppol\.eu:2017:poacc:billing:\d\d:1\.0$/.test(val(doc, "cbc:ProfileID") ?? ""));
  rule("BR-02", !!val(doc, "cbc:ID"));
  rule("BR-03", /^\d{4}-\d{2}-\d{2}$/.test(val(doc, "cbc:IssueDate") ?? ""));
  if (credit) rule("PEPPOL-EN16931-P0101", ["381", "396", "81", "83", "532"].includes(val(doc, "cbc:CreditNoteTypeCode") ?? ""));
  else rule("PEPPOL-EN16931-P0100", ["380", "383", "386", "393", "82", "80", "84", "395", "575", "623", "780"].includes(val(doc, "cbc:InvoiceTypeCode") ?? ""));
  const currency = val(doc, "cbc:DocumentCurrencyCode");
  rule("BR-05", !!currency);
  rule("PEPPOL-EN16931-R003", !!val(doc, "cbc:BuyerReference") || !!val(doc, "cac:OrderReference/cbc:ID"));
  rule("PEPPOL-EN16931-R002", all(doc, "cbc:Note").length <= 1);
  walk(doc, (n) => {
    // Geen lege elementen.
    if (!n.children.length) rule("PEPPOL-EN16931-R008", decode(n.text).trim().length > 0);
    if (n.attrs.currencyID !== undefined) {
      rule("PEPPOL-EN16931-R051", n.attrs.currencyID === currency);
      // Bedragen hoogstens twee decimalen (BR-DEC-*), behalve de prijs.
      if (n.name !== "cbc:PriceAmount") rule("BR-DEC", /^-?\d+(\.\d{1,2})?$/.test(n.text.trim()));
    }
  });
  rule("PEPPOL-EN16931-R053", all(doc, "cac:TaxTotal").length === 1 && all(doc, "cac:TaxTotal/cac:TaxSubtotal").length > 0);

  const supplier = one(doc, "cac:AccountingSupplierParty/cac:Party");
  const customer = one(doc, "cac:AccountingCustomerParty/cac:Party");
  const vatOf = (p: XNode | undefined) => all(p, "cac:PartyTaxScheme").find((s) => val(s, "cac:TaxScheme/cbc:ID") === "VAT");
  for (const [p, endpointRule, nameRule, countryRule] of [
    [supplier, "PEPPOL-EN16931-R020", "BR-06", "BR-09"],
    [customer, "PEPPOL-EN16931-R010", "BR-07", "BR-11"],
  ] as const) {
    rule("UBL-party-order", !!p && inOrder(p, PARTY_ORDER) && inOrder(one(p, "cac:PostalAddress") ?? p, one(p, "cac:PostalAddress") ? ADDRESS_ORDER : PARTY_ORDER));
    const endpoint = one(p, "cbc:EndpointID");
    rule(endpointRule, !!endpoint && !!decode(endpoint.text).trim());
    rule("BR-62/63", !!endpoint?.attrs.schemeID);
    rule("PEPPOL-EN16931-CL008", KNOWN_EAS.includes(endpoint?.attrs.schemeID ?? ""));
    rule(nameRule, !!val(p, "cac:PartyLegalEntity/cbc:RegistrationName"));
    rule(countryRule, ISO_COUNTRY.test(val(p, "cac:PostalAddress/cac:Country/cbc:IdentificationCode") ?? ""));
    const vat = val(vatOf(p), "cbc:CompanyID");
    if (vat) rule("BR-CO-09", /^(EL|[A-Z]{2})[0-9A-Z]{2,13}$/.test(vat) && (vat.startsWith("EL") || ISO_COUNTRY.test(vat.slice(0, 2))));
  }
  const sellerVat = !!val(vatOf(supplier), "cbc:CompanyID");
  const buyerVat = !!val(vatOf(customer), "cbc:CompanyID");

  const lines = all(doc, credit ? "cac:CreditNoteLine" : "cac:InvoiceLine");
  rule("BR-16", lines.length > 0);
  const lineGroups = new Map<string, number>();
  let lineSum = 0;
  for (const line of lines) {
    rule("UBL-line-order", inOrder(line, LINE_ORDER));
    const qty = Number(val(line, credit ? "cbc:CreditedQuantity" : "cbc:InvoicedQuantity"));
    const amount = cents(val(line, "cbc:LineExtensionAmount"));
    const price = Number(val(line, "cac:Price/cbc:PriceAmount"));
    rule("BR-21/22/24", !!val(line, "cbc:ID") && Number.isFinite(qty) && Number.isFinite(amount));
    rule("BR-25", !!val(line, "cac:Item/cbc:Name"));
    rule("BR-27", price >= 0);
    // Regelbedrag = aantal x prijs (met de marge van 0,02 uit de regel).
    rule("PEPPOL-EN16931-R120", Math.abs(amount / 100 - qty * price) <= 0.02 + 1e-9);
    const cat = val(line, "cac:Item/cac:ClassifiedTaxCategory/cbc:ID");
    const rate = Number(val(line, "cac:Item/cac:ClassifiedTaxCategory/cbc:Percent"));
    rule("BR-CO-04", !!cat);
    if (cat === "S") rule("BR-S-05", rate > 0);
    if (cat === "Z") rule("BR-Z-05", rate === 0);
    if (cat === "E") rule("BR-E-05", rate === 0);
    if (cat === "AE") rule("BR-AE-05", rate === 0);
    if (cat === "K") rule("BR-IC-05", rate === 0);
    const key = `${cat}:${rate}`;
    lineGroups.set(key, (lineGroups.get(key) ?? 0) + amount);
    lineSum += amount;
  }

  const lmt = one(doc, "cac:LegalMonetaryTotal");
  const lea = cents(val(lmt, "cbc:LineExtensionAmount"));
  const taxExcl = cents(val(lmt, "cbc:TaxExclusiveAmount"));
  const taxIncl = cents(val(lmt, "cbc:TaxInclusiveAmount"));
  const payable = cents(val(lmt, "cbc:PayableAmount"));
  const taxTotal = cents(val(doc, "cac:TaxTotal/cbc:TaxAmount"));
  const subtotals = all(doc, "cac:TaxTotal/cac:TaxSubtotal");
  rule("BR-12/13/14/15", [lea, taxExcl, taxIncl, payable].every(Number.isFinite));
  rule("BR-CO-10", lea === lineSum);
  rule("BR-CO-13", taxExcl === lea);
  rule("BR-CO-14", taxTotal === subtotals.reduce((s, x) => s + cents(val(x, "cbc:TaxAmount")), 0));
  rule("BR-CO-15", taxIncl === taxExcl + taxTotal);
  rule("BR-CO-16", payable === taxIncl);

  const seen = new Set<string>();
  for (const sub of subtotals) {
    const tc = one(sub, "cac:TaxCategory");
    rule("UBL-category-order", !!tc && inOrder(tc, CATEGORY_ORDER));
    const cat = val(tc, "cbc:ID") ?? "";
    const rate = Number(val(tc, "cbc:Percent"));
    const taxable = cents(val(sub, "cbc:TaxableAmount"));
    const tax = cents(val(sub, "cbc:TaxAmount"));
    const key = `${cat}:${rate}`;
    rule("BR-CO-18", !seen.has(key));
    seen.add(key);
    const prefix = cat === "K" ? "BR-IC" : `BR-${cat}`;
    // Grondslag per categorie en tarief = som van de regels (BR-S-08 enz.).
    rule(`${prefix}-08`, taxable === (lineGroups.get(key) ?? NaN));
    // BR-CO-17: btw = grondslag x tarief, met de marge van 1 uit EN 16931.
    rule("BR-CO-17", Math.abs(tax - Math.round(taxable * rate / 100)) < 100);
    const hasReason = !!val(tc, "cbc:TaxExemptionReasonCode") || !!val(tc, "cbc:TaxExemptionReason");
    if (cat === "S") { rule("BR-S-02", sellerVat); rule("BR-S-10", !hasReason); }
    if (cat === "Z") { rule("BR-Z-02", sellerVat); rule("BR-Z-10", !hasReason); rule("BR-Z-09", tax === 0); }
    if (cat === "E") { rule("BR-E-02", sellerVat); rule("BR-E-10", hasReason); rule("BR-E-09", tax === 0); }
    if (cat === "AE") {
      rule("BR-AE-02", sellerVat && buyerVat); rule("BR-AE-10", hasReason); rule("BR-AE-09", tax === 0);
      rule("BR-AE-01", subtotals.filter((s) => val(s, "cac:TaxCategory/cbc:ID") === "AE").length === 1);
    }
    if (cat === "K") {
      rule("BR-IC-02", sellerVat && buyerVat); rule("BR-IC-10", hasReason); rule("BR-IC-09", tax === 0);
      rule("BR-IC-11", !!val(doc, "cac:Delivery/cbc:ActualDeliveryDate") || !!val(doc, "cac:InvoicePeriod/cbc:StartDate"));
      rule("BR-IC-12", !!val(doc, "cac:Delivery/cac:DeliveryLocation/cac:Address/cac:Country/cbc:IdentificationCode"));
    }
  }
  // Elke regelcategorie heeft een btw-groep (BR-S-01, BR-Z-01, ...).
  for (const key of lineGroups.keys()) rule("BR-CO-18-group", seen.has(key));

  // BR-CO-25: te betalen bedrag -> vervaldatum of betaalvoorwaarden.
  if (payable > 0) rule("BR-CO-25", !!val(doc, "cbc:DueDate") || !!val(doc, "cac:PaymentMeans/cbc:PaymentDueDate") || !!val(doc, "cac:PaymentTerms/cbc:Note"));
  for (const pm of all(doc, "cac:PaymentMeans")) {
    const code = val(pm, "cbc:PaymentMeansCode") ?? "";
    if (code === "30" || code === "58") rule("BR-61", !!val(pm, "cac:PayeeFinancialAccount/cbc:ID"));
  }

  // NLCIUS (Peppol-regels voor een leverancier in Nederland).
  if (val(supplier, "cac:PostalAddress/cac:Country/cbc:IdentificationCode") === "NL") {
    if (credit) rule("NL-R-001", !!val(doc, "cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID"));
    rule("NL-R-002", !!val(supplier, "cac:PostalAddress/cbc:StreetName") && !!val(supplier, "cac:PostalAddress/cbc:CityName") && !!val(supplier, "cac:PostalAddress/cbc:PostalZone"));
    rule("NL-R-003", ["0106", "0190"].includes(one(supplier, "cac:PartyLegalEntity/cbc:CompanyID")?.attrs.schemeID ?? ""));
    if (val(customer, "cac:PostalAddress/cac:Country/cbc:IdentificationCode") === "NL") {
      rule("NL-R-004", !!val(customer, "cac:PostalAddress/cbc:StreetName") && !!val(customer, "cac:PostalAddress/cbc:CityName") && !!val(customer, "cac:PostalAddress/cbc:PostalZone"));
      // Alleen als er een CompanyID van de klant staat: schema 0106 (KvK) of 0190 (OIN), niet leeg.
      for (const id of all(customer, "cac:PartyLegalEntity/cbc:CompanyID")) {
        rule("NL-R-005", ["0106", "0190"].includes(id.attrs.schemeID ?? "") && !!decode(id.text).trim());
      }
    }
    if (!credit && payable > 0) rule("NL-R-007", all(doc, "cac:PaymentMeans").length > 0);
    for (const pm of all(doc, "cac:PaymentMeans")) rule("NL-R-008", ["30", "48", "49", "57", "58", "59"].includes(val(pm, "cbc:PaymentMeansCode") ?? ""));
  }
  return [...errors].sort();
}

// ---------------------------------------------------------------- voorbeeldfacturen

type Line = { description: string; quantity: number; unitPrice: number; vatRate: number };

const SUPPLIER = { name: "Jansen & Zn", address: "Dorpsstraat 1", postalCode: "1234 AB", city: "Utrecht", country: "NL", vatNumber: "NL001234567B01", kvkNumber: "12345678", email: "jan@example.nl" };
const NL_CUSTOMER = { name: "Klant BV", address: "Kerkplein 2", postalCode: "1011 AA", city: "Amsterdam", country: "NL", vatNumber: "NL009876543B01", email: "inkoop@klant.nl" };
const BE_CUSTOMER = { name: "Client SA", address: "Rue Neuve 3", postalCode: "1000", city: "Brussel", country: "BE", vatNumber: "BE0123456749", email: "achat@client.be" };

function invoice(lines: Line[], overrides: Partial<UblInvoiceData> = {}): UblInvoiceData {
  const totals = calculateInvoiceTotals(lines);
  return {
    invoiceNumber: "2026-0042", issueDate: new Date("2026-11-18T12:00:00Z"), dueDate: new Date("2026-12-02T12:00:00Z"), currency: "EUR",
    supplier: SUPPLIER, customer: NL_CUSTOMER,
    lineItems: totals.lineItems.map((li) => ({ description: li.description, quantity: li.quantity, unitPrice: li.unitPrice, vatRate: li.vatRate, lineTotal: li.lineTotal })),
    subtotal: totals.subtotal, vatAmount: totals.vatAmount, total: totals.total,
    iban: "NL91ABNA0417164300", paymentTerms: "Betaal binnen 14 dagen op NL91 ABNA 0417 1643 00",
    ...overrides,
  };
}

/** Zoals de credit-route: dezelfde regels met een negatief aantal, zonder vervaldatum. */
function creditOf(lines: Line[], overrides: Partial<UblInvoiceData> = {}): UblInvoiceData {
  return invoice(lines.map((l) => ({ ...l, quantity: -l.quantity })), {
    invoiceNumber: "2026-0050", dueDate: null,
    notes: "Creditfactuur voor factuur 2026-0042.",
    creditReference: { number: "2026-0042", date: new Date("2026-11-18T12:00:00Z") },
    ...overrides,
  });
}

const MIXED: Line[] = [
  { description: "Advies <senior> & ondersteuning", quantity: 3.5, unitPrice: 85.55, vatRate: 21 },
  { description: "Boek", quantity: 1, unitPrice: 19.99, vatRate: 9 },
  { description: "Vrijgestelde post", quantity: 2, unitPrice: 12.5, vatRate: 0 },
];
const ZERO: Line[] = [{ description: "Dienst", quantity: 4, unitPrice: 125, vatRate: 0 }];

// ---------------------------------------------------------------- de controle zelf werkt

describe("nagebouwde Peppol-controle vangt fouten", () => {
  it("keurt een kapotte factuur af", () => {
    const good = generateUblInvoice(invoice(MIXED));
    expect(peppolCheck(good)).toEqual([]);
    // Verkeerd totaal, ontbrekend elektronisch adres, verkeerde volgorde, negatieve prijs.
    expect(peppolCheck(good.replace(/<cbc:PayableAmount currencyID="EUR">[^<]+</, "<cbc:PayableAmount currencyID=\"EUR\">1.00<"))).toContain("BR-CO-16");
    expect(peppolCheck(good.replace(/<cbc:EndpointID schemeID="9944">[^<]+<\/cbc:EndpointID>/, ""))).toContain("PEPPOL-EN16931-R010");
    expect(peppolCheck(good.replace("<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>", "").replace("<cbc:CustomizationID>", "<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode><cbc:CustomizationID>"))).toContain("UBL-order");
    expect(peppolCheck(good.replace("<cbc:PriceAmount currencyID=\"EUR\">19.99", "<cbc:PriceAmount currencyID=\"EUR\">-19.99"))).toEqual(expect.arrayContaining(["BR-27"]));
    expect(peppolCheck(good.replace(/<cbc:CompanyID schemeID="0106">12345678<\/cbc:CompanyID>/, ""))).toContain("NL-R-003");
  });
});

// ---------------------------------------------------------------- gewone factuur (380)

describe("UBL Invoice (380) volgens Peppol BIS 3 en NLCIUS", () => {
  it("gewone factuur met 21%, 9% en 0% doorstaat alle nagebouwde regels", () => {
    const data = invoice(MIXED);
    const xml = generateUblInvoice(data);
    expect(ublProblems(data)).toEqual([]);
    expect(peppolCheck(xml)).toEqual([]);
    const doc = parseXml(xml);
    expect(doc.name).toBe("Invoice");
    expect(val(doc, "cbc:InvoiceTypeCode")).toBe("380");
    // Btw-categorieën: S voor 21 en 9, Z voor 0 (geen KOR, geen btw-soort).
    const cats = all(doc, "cac:TaxTotal/cac:TaxSubtotal").map((s) => `${val(s, "cac:TaxCategory/cbc:ID")}:${val(s, "cac:TaxCategory/cbc:Percent")}`);
    expect(cats.sort()).toEqual(["S:21.00", "S:9.00", "Z:0.00"]);
    // De totalen zijn precies wat Saldova opsloeg.
    expect(cents(val(doc, "cac:LegalMonetaryTotal/cbc:PayableAmount"))).toBe(Math.round(data.total * 100));
    expect(cents(val(doc, "cac:TaxTotal/cbc:TaxAmount"))).toBe(Math.round(data.vatAmount * 100));
  });

  it("btw per groep is exact grondslag x tarief bij gewone bedragen", () => {
    const doc = parseXml(generateUblInvoice(invoice(MIXED)));
    for (const sub of all(doc, "cac:TaxTotal/cac:TaxSubtotal")) {
      const taxable = cents(val(sub, "cbc:TaxableAmount"));
      const rate = Number(val(sub, "cac:TaxCategory/cbc:Percent"));
      expect(cents(val(sub, "cbc:TaxAmount"))).toBe(Math.round(taxable * rate / 100));
    }
  });

  it("veel kleine regels: per regel afgeronde btw blijft binnen de marge van BR-CO-17", () => {
    const many: Line[] = Array.from({ length: 40 }, (_, i) => ({ description: `Item ${i + 1}`, quantity: 1, unitPrice: 0.02, vatRate: 21 }));
    const xml = generateUblInvoice(invoice(many));
    expect(peppolCheck(xml)).toEqual([]);
  });

  it("negatieve prijs (korting) wordt een negatief aantal met positieve prijs (BR-27)", () => {
    const data = invoice([], {});
    const lines = [
      { description: "Werk", quantity: 2, unitPrice: 100, vatRate: 21, lineTotal: 200 },
      { description: "Korting", quantity: 1, unitPrice: -10, vatRate: 21, lineTotal: -10 },
    ];
    const xml = generateUblInvoice({ ...data, lineItems: lines, subtotal: 190, vatAmount: 39.9, total: 229.9 });
    expect(peppolCheck(xml)).toEqual([]);
    const korting = all(parseXml(xml), "cac:InvoiceLine")[1];
    expect(val(korting, "cbc:InvoicedQuantity")).toBe("-1");
    expect(val(korting, "cac:Price/cbc:PriceAmount")).toBe("10.00");
    expect(val(korting, "cbc:LineExtensionAmount")).toBe("-10.00");
  });

  it("KOR: categorie E met vrijstellingsreden", () => {
    const data = invoice(ZERO, { kor: true });
    const xml = generateUblInvoice(data);
    expect(peppolCheck(xml)).toEqual([]);
    expect(val(parseXml(xml), "cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:ID")).toBe("E");
  });

  it("btw verlegd binnen Nederland: AE met VATEX-EU-AE en beide btw-nummers", () => {
    const xml = generateUblInvoice(invoice(ZERO, { vatScheme: "REVERSE_NL" }));
    expect(peppolCheck(xml)).toEqual([]);
    const tc = one(parseXml(xml), "cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory");
    expect(val(tc, "cbc:ID")).toBe("AE");
    expect(val(tc, "cbc:TaxExemptionReasonCode")).toBe("VATEX-EU-AE");
  });

  it("dienst aan een Belgisch bedrijf: AE, Belgisch btw-schema als Peppol-adres", () => {
    const data = invoice(ZERO, { vatScheme: "REVERSE_EU", customer: BE_CUSTOMER });
    const xml = generateUblInvoice(data);
    expect(ublProblems(data)).toEqual([]);
    expect(peppolCheck(xml)).toEqual([]);
    const endpoint = one(parseXml(xml), "cac:AccountingCustomerParty/cac:Party/cbc:EndpointID");
    expect(endpoint?.attrs.schemeID).toBe("9925");
    expect(endpoint?.text).toBe("BE0123456749");
  });

  it("intracommunautaire levering: K met leverdatum en land van aflevering", () => {
    const xml = generateUblInvoice(invoice(ZERO, { vatScheme: "ICL", customer: { ...BE_CUSTOMER, country: "DE", vatNumber: "DE123456789" } }));
    expect(peppolCheck(xml)).toEqual([]);
    const doc = parseXml(xml);
    expect(val(doc, "cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:TaxExemptionReasonCode")).toBe("VATEX-EU-IC");
    expect(val(doc, "cac:Delivery/cac:DeliveryLocation/cac:Address/cac:Country/cbc:IdentificationCode")).toBe("DE");
    expect(one(doc, "cac:AccountingCustomerParty/cac:Party/cbc:EndpointID")?.attrs.schemeID).toBe("9930");
  });

  it("referentie van de klant in BuyerReference; zonder referentie het factuurnummer", () => {
    expect(val(parseXml(generateUblInvoice(invoice(MIXED, { buyerReference: "  PO-4711 " }))), "cbc:BuyerReference")).toBe("PO-4711");
    expect(val(parseXml(generateUblInvoice(invoice(MIXED))), "cbc:BuyerReference")).toBe("2026-0042");
  });

  it("geen vervaldatum: de betaalvoorwaarden staan in PaymentTerms (BR-CO-25)", () => {
    const xml = generateUblInvoice(invoice(MIXED, { dueDate: null }));
    expect(peppolCheck(xml)).toEqual([]);
    expect(val(parseXml(xml), "cac:PaymentTerms/cbc:Note")).toContain("14 dagen");
  });
});

// ---------------------------------------------------------------- creditnota (381)

describe("UBL CreditNote (381) met verwijzing naar de originele factuur (nr 48)", () => {
  it("een creditfactuur wordt een CreditNote met positieve bedragen en BillingReference", () => {
    const data = creditOf(MIXED);
    expect(data.total).toBeLessThan(0);
    const xml = generateUblInvoice(data);
    expect(ublProblems(data)).toEqual([]);
    expect(peppolCheck(xml)).toEqual([]);
    const doc = parseXml(xml);
    expect(doc.name).toBe("CreditNote");
    expect(doc.attrs.xmlns).toBe("urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2");
    expect(val(doc, "cbc:CreditNoteTypeCode")).toBe("381");
    expect(one(doc, "cbc:InvoiceTypeCode")).toBeUndefined();
    expect(one(doc, "cbc:DueDate")).toBeUndefined();
    expect(val(doc, "cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID")).toBe("2026-0042");
    expect(val(doc, "cac:BillingReference/cac:InvoiceDocumentReference/cbc:IssueDate")).toBe("2026-11-18");
    expect(all(doc, "cac:CreditNoteLine")).toHaveLength(3);
    expect(all(doc, "cac:InvoiceLine")).toHaveLength(0);
    // Alle bedragen positief, en precies het tegengestelde van de opgeslagen factuur.
    walk(doc, (n) => { if (n.attrs.currencyID) expect(Number(n.text)).toBeGreaterThanOrEqual(0); });
    expect(cents(val(doc, "cac:LegalMonetaryTotal/cbc:PayableAmount"))).toBe(-Math.round(data.total * 100));
    expect(val(all(doc, "cac:CreditNoteLine")[0], "cbc:CreditedQuantity")).toBe("3.5");
    // Geen betaalwijze van de klant op een creditnota; wel de verwijzing als betaalvoorwaarde (BR-CO-25).
    expect(one(doc, "cac:PaymentMeans")).toBeUndefined();
    expect(val(doc, "cac:PaymentTerms/cbc:Note")).toBe("Creditfactuur voor factuur 2026-0042");
  });

  it("creditnota van een intracommunautaire levering houdt K, leverdatum en land", () => {
    const xml = generateUblInvoice(creditOf(ZERO, { vatScheme: "ICL", customer: BE_CUSTOMER }));
    expect(peppolCheck(xml)).toEqual([]);
    expect(val(parseXml(xml), "cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:ID")).toBe("K");
  });

  it("zonder verwijzing naar het origineel: eerst aanvullen (NL-R-001)", () => {
    const data = creditOf(MIXED, { creditReference: null });
    expect(ublProblems(data)).toContain("credit_reference_missing");
    expect(peppolCheck(generateUblInvoice(data))).toContain("NL-R-001");
  });

  it("de oude creditfactuur zonder vaste verwijzing vindt het origineel via het logboek", async () => {
    const lookup = {
      auditLog: { findFirst: vi.fn(async () => ({ target: "2026-0042 → 2026-0050" })) },
      invoice: { findFirst: vi.fn(async () => ({ issueDate: new Date("2026-11-01T00:00:00Z") })) },
    };
    const totals = calculateInvoiceTotals(MIXED.map((l) => ({ ...l, quantity: -l.quantity })));
    const parties = invoiceParties({ snapshot: null, vatScheme: null }, liveSource(), (v) => v ?? null);
    const data = await ublInvoiceData(lookup, "a1", {
      invoiceNumber: "2026-0050", issueDate: new Date("2026-11-18"), dueDate: null, deliveryDate: null, deliveryEndDate: null,
      currency: "EUR", subtotal: totals.subtotal, vatAmount: totals.vatAmount, total: totals.total, notes: null,
      lineItems: totals.lineItems,
    }, parties);
    expect(data.creditReference).toEqual({ number: "2026-0042", date: new Date("2026-11-01T00:00:00Z") });
    expect(ublProblems(data)).toEqual([]);
    expect(peppolCheck(generateUblInvoice(data))).toEqual([]);
  });
});

function liveSource(customer: Partial<SnapshotSource["customer"]> = {}): SnapshotSource {
  return {
    userEmail: "jan@example.nl",
    company: { name: SUPPLIER.name, address: SUPPLIER.address, postalCode: SUPPLIER.postalCode, city: SUPPLIER.city, country: "NL", vatNumber: SUPPLIER.vatNumber, kvkNumber: SUPPLIER.kvkNumber },
    customer: { ...NL_CUSTOMER, ...customer },
    settings: { korEnabled: false, paymentTerms: "IBAN NL91ABNA0417164300", footerText: null },
    vatScheme: null,
    locale: "nl",
  };
}

// ---------------------------------------------------------------- wat ontbreekt (nr 49)

describe("ublProblems: geen e-factuur die een Peppol-validator afkeurt (nr 49)", () => {
  it("KvK-nummer van de Nederlandse leverancier is verplicht (NL-R-003)", () => {
    const data = invoice(MIXED, { supplier: { ...SUPPLIER, kvkNumber: null } });
    expect(ublProblems(data)).toContain("seller_kvk");
    expect(peppolCheck(generateUblInvoice(data))).toContain("NL-R-003");
  });

  it("adres van leverancier en Nederlandse klant volledig (NL-R-002, NL-R-004)", () => {
    expect(ublProblems(invoice(MIXED, { supplier: { ...SUPPLIER, postalCode: " " } }))).toContain("seller_address");
    const noAddress = invoice(MIXED, { customer: { ...NL_CUSTOMER, address: null } });
    expect(ublProblems(noAddress)).toContain("customer_address");
    expect(peppolCheck(generateUblInvoice(noAddress))).toContain("NL-R-004");
    // Een Belgische klant valt niet onder NL-R-004.
    expect(ublProblems(invoice(MIXED, { customer: { ...BE_CUSTOMER, address: null } }))).not.toContain("customer_address");
  });

  it("zonder IBAN geen betaalwijze: eerst aanvullen (NL-R-007)", () => {
    const data = invoice(MIXED, { iban: null });
    expect(ublProblems(data)).toContain("iban_missing");
    expect(peppolCheck(generateUblInvoice(data))).toContain("NL-R-007");
    // Een creditnota hoeft geen betaalwijze.
    expect(ublProblems(creditOf(MIXED, { iban: null }))).toEqual([]);
  });

  it("btw-nummer van de verkoper met landcode (BR-CO-09, BR-S-02), ook bij de KOR (BR-E-02)", () => {
    expect(ublProblems(invoice(MIXED, { supplier: { ...SUPPLIER, vatNumber: "001234567B01" } }))).toContain("seller_vat");
    const kor = invoice(ZERO, { kor: true, supplier: { ...SUPPLIER, vatNumber: null } });
    expect(ublProblems(kor)).toContain("seller_vat");
    expect(peppolCheck(generateUblInvoice(kor))).toContain("BR-E-02");
  });

  it("btw-nummer van de klant zonder landcode valt weg; bij btw verlegd is het dan een probleem", () => {
    const standard = invoice(MIXED, { customer: { ...NL_CUSTOMER, vatNumber: "009876543B01" } });
    const xml = generateUblInvoice(standard);
    expect(xml).not.toContain("009876543B01");
    expect(peppolCheck(xml)).toEqual([]);
    const reverse = invoice(ZERO, { vatScheme: "REVERSE_NL", customer: { ...NL_CUSTOMER, vatNumber: "009876543B01" } });
    expect(ublProblems(reverse)).toContain("customer_vat");
    expect(peppolCheck(generateUblInvoice(reverse))).toContain("BR-AE-02");
  });

  it("totalen die niet kloppen met de regels geven geen bestand", () => {
    expect(ublProblems({ ...invoice(MIXED), total: 1 })).toContain("totals_mismatch");
    expect(ublProblems({ ...invoice(MIXED), lineItems: [] })).toContain("no_lines");
  });

  it("elk probleem heeft een uitleg in het Nederlands en het Engels", () => {
    const codes = Object.keys(nl.invoices.ublProblems) as (keyof typeof nl.invoices.ublProblems)[];
    expect(Object.keys(en.invoices.ublProblems).sort()).toEqual([...codes].sort());
    expect(ublProblemTexts(["seller_kvk"], "nl")[0]).toMatch(/KvK-nummer/);
    expect(ublProblemTexts(["seller_kvk"], "en")[0]).toMatch(/Chamber of Commerce/);
    expect(ublBlockedMessage(["iban_missing", "seller_kvk"], "nl").split("\n")).toHaveLength(3);
  });
});

// ---------------------------------------------------------------- elektronisch adres (EndpointID)

describe("Peppol-adres van verkoper en klant (PEPPOL-EN16931-R010/R020)", () => {
  it("volgorde: opgegeven Peppol-adres, KvK, btw-nummer met bekend schema, e-mail", () => {
    expect(endpointFor({ electronicAddress: "0190:00000001234567890000", vatNumber: "NL009876543B01" })).toEqual({ scheme: "0190", id: "00000001234567890000" });
    expect(endpointFor({ kvkNumber: "12345678", vatNumber: "NL001234567B01" })).toEqual({ scheme: "0106", id: "12345678" });
    expect(endpointFor({ vatNumber: "NL 0098.76543.B01" })).toEqual({ scheme: "9944", id: "NL009876543B01" });
    // Italiaans btw-nummer: schema niet zeker in de codelijst -> e-mail.
    expect(endpointFor({ vatNumber: "IT12345678901", email: "a@b.it" })).toEqual({ scheme: "EM", id: "a@b.it" });
    expect(endpointFor({ vatNumber: "IT12345678901" })).toBeNull();
  });

  it("een klant zonder btw-nummer en Peppol-adres krijgt zijn e-mailadres (EM)", () => {
    const data = invoice(MIXED, { customer: { ...NL_CUSTOMER, vatNumber: null } });
    const endpoint = one(parseXml(generateUblInvoice(data)), "cac:AccountingCustomerParty/cac:Party/cbc:EndpointID");
    expect(endpoint?.attrs.schemeID).toBe("EM");
    expect(endpoint?.text).toBe("inkoop@klant.nl");
    expect(ublProblems(data)).toEqual([]);
  });

  it("zonder enig elektronisch adres: eerst aanvullen", () => {
    const data = invoice(MIXED, { customer: { ...NL_CUSTOMER, vatNumber: null, email: null } });
    expect(ublProblems(data)).toContain("customer_endpoint");
    expect(peppolCheck(generateUblInvoice(data))).toContain("PEPPOL-EN16931-R010");
  });

  it("controleert Peppol-adressen per schema", () => {
    expect(parsePeppolId("0106:12345678")).toEqual({ scheme: "0106", id: "12345678" });
    expect(parsePeppolId("0106:1234567")).toBeNull();
    expect(parsePeppolId("12345678")).toBeNull();
    expect(parsePeppolId("9999:12345678")).toBeNull();
    expect(parsePeppolId("9944:NL009876543B01")).toEqual({ scheme: "9944", id: "NL009876543B01" });
    expect(parsePeppolId("9944:BE0123456749")).toBeNull();
    expect(normalizePeppolId(" 0208 : 0123.456.749 ")).toBe("0208:0123456749");
    expect(isValidBelgianEnterpriseNumber("0123456749")).toBe(true);
    expect(isValidBelgianEnterpriseNumber("0123456789")).toBe(false);
    expect(isValidGln("8712345678906")).toBe(true);
    expect(isValidGln("8712345678901")).toBe(false);
    expect(parsePeppolId("0088:8712345678906")).toEqual({ scheme: "0088", id: "8712345678906" });
  });
});

// ---------------------------------------------------------------- invoer: klant en factuur

describe("klantgegevens: btw-nummer met landcode en Peppol-adres", () => {
  it("btw-nummer moet met de landcode beginnen", () => {
    expect(createCustomerSchema.safeParse({ name: "K", vatNumber: "NL009876543B01" }).success).toBe(true);
    expect(createCustomerSchema.safeParse({ name: "K", vatNumber: "" }).success).toBe(true);
    expect(createCustomerSchema.safeParse({ name: "K", vatNumber: "009876543B01" }).success).toBe(false);
    expect(updateCustomerSchema.safeParse({ vatNumber: "BE 0123.456.749" }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ vatNumber: "001234567B01" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ vatNumber: "NL001234567B01" }).success).toBe(true);
  });

  it("Peppol-adres: leeg of een geldig code:nummer", () => {
    expect(createCustomerSchema.safeParse({ name: "K", electronicAddress: "" }).success).toBe(true);
    expect(createCustomerSchema.safeParse({ name: "K", electronicAddress: "0106:12345678" }).success).toBe(true);
    expect(updateCustomerSchema.safeParse({ electronicAddress: "kvk 12345678" }).success).toBe(false);
  });

  it("de momentopname bewaart het Peppol-adres; ontbreekt het, dan het huidige", () => {
    const snap = buildInvoiceSnapshot(liveSource({ electronicAddress: "0106:87654321" }));
    expect(snap.customer.electronicAddress).toBe("0106:87654321");
    const plain = (v: string | null | undefined) => v ?? null;
    const old = { ...snap, customer: { ...snap.customer, electronicAddress: undefined } };
    expect(invoiceParties({ snapshot: old }, liveSource({ electronicAddress: "0190:00000001234567890000" }), plain).customer.electronicAddress).toBe("0190:00000001234567890000");
    expect(invoiceParties({ snapshot: snap }, liveSource({ electronicAddress: null }), plain).customer.electronicAddress).toBe("0106:87654321");
  });
});

describe("referentie van de klant op de factuur", () => {
  it("wordt gevalideerd, opgeslagen en staat op de PDF", async () => {
    const base = { customerId: "c1", lineItems: [{ description: "Werk", quantity: 1, unitPrice: 100, vatRate: 21 }] };
    expect(createInvoiceSchema.safeParse({ ...base, buyerReference: "PO-1" }).success).toBe(true);
    expect(createInvoiceSchema.safeParse({ ...base, buyerReference: "x".repeat(101) }).success).toBe(false);

    const created: Record<string, unknown>[] = [];
    const tx = {
      customer: { findFirst: async () => ({ id: "c1", country: "NL", vatNumber: null, vatScheme: null }) },
      company: { findUnique: async () => ({ vatNumber: "x" }) },
      invoiceSettings: {
        findUnique: async () => ({ korEnabled: false }),
        update: async () => ({ invoicePrefix: "2026-", nextNumber: 8, numberPadding: 4, defaultDueDays: 14, defaultCurrency: "EUR", defaultNotes: null }),
      },
      invoice: { create: async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return { id: "inv1", ...data }; } },
      timeEntry: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
      auditLog: { create: async () => ({}) },
    } as unknown as Parameters<typeof createInvoiceInTransaction>[0];
    await createInvoiceInTransaction(tx, { accountId: "a1", createdById: "u1", customerId: "c1", lineItems: base.lineItems, buyerReference: "  PO-1 " });
    await createInvoiceInTransaction(tx, { accountId: "a1", createdById: "u1", customerId: "c1", lineItems: base.lineItems });
    expect(created[0].buyerReference).toBe("PO-1");
    expect(created[1].buyerReference).toBeNull();

    const pdf = await generateInvoicePdf({
      invoiceNumber: "2026-0008", issueDate: new Date("2026-11-18"), currency: "EUR",
      company: { name: "Jansen" }, customer: { name: "Klant" },
      lineItems: [{ description: "Werk", quantity: 1, unitPrice: 100, vatRate: 21, lineTotal: 100 }],
      subtotal: 100, vatAmount: 21, total: 121, buyerReference: "PO-1", labels: pdfTexts("nl").labels,
    });
    const withoutRef = await generateInvoicePdf({
      invoiceNumber: "2026-0008", issueDate: new Date("2026-11-18"), currency: "EUR",
      company: { name: "Jansen" }, customer: { name: "Klant" },
      lineItems: [{ description: "Werk", quantity: 1, unitPrice: 100, vatRate: 21, lineTotal: 100 }],
      subtotal: 100, vatAmount: 21, total: 121, labels: pdfTexts("nl").labels,
    });
    expect(pdf.length).toBeGreaterThan(withoutRef.length);
    expect(pdfTexts("nl").labels.buyerReference).toBe("Uw referentie:");
    expect(pdfTexts("en").labels.buyerReference).toBe("Your reference:");
  });
});

// ---------------------------------------------------------------- review fase 2

describe("NL-R-005: KvK of OIN van een Nederlandse klant", () => {
  const legalId = (xml: string) => one(parseXml(xml), "cac:AccountingCustomerParty/cac:Party/cac:PartyLegalEntity/cbc:CompanyID");

  it("Peppol-adres met KvK- of OIN-nummer staat ook als juridische identificatie (BT-47)", () => {
    const xml = generateUblInvoice(invoice(MIXED, { customer: { ...NL_CUSTOMER, electronicAddress: "0106:87654321" } }));
    expect(peppolCheck(xml)).toEqual([]);
    expect(legalId(xml)?.attrs.schemeID).toBe("0106");
    expect(legalId(xml)?.text).toBe("87654321");
    const oin = generateUblInvoice(invoice(MIXED, { customer: { ...NL_CUSTOMER, electronicAddress: "0190:00000001234567890000" } }));
    expect(peppolCheck(oin)).toEqual([]);
    expect(legalId(oin)?.attrs.schemeID).toBe("0190");
  });

  it("andere Peppol-adressen komen niet in PartyLegalEntity; een klant (ook een particulier) hoeft geen KvK", () => {
    for (const electronicAddress of ["0088:8712345678906", "9944:NL009876543B01", null]) {
      const data = invoice(MIXED, { customer: { ...NL_CUSTOMER, electronicAddress } });
      const xml = generateUblInvoice(data);
      expect(legalId(xml)).toBeUndefined();
      expect(ublProblems(data)).toEqual([]);
      expect(peppolCheck(xml)).toEqual([]);
    }
  });

  it("de nagebouwde regel vangt een verkeerd schema bij een Nederlandse klant, niet bij een Belgische", () => {
    const wrong = (xml: string) => xml.replace('<cbc:CompanyID schemeID="0106">87654321', '<cbc:CompanyID schemeID="0088">87654321');
    const nlXml = generateUblInvoice(invoice(MIXED, { customer: { ...NL_CUSTOMER, electronicAddress: "0106:87654321" } }));
    expect(peppolCheck(wrong(nlXml))).toContain("NL-R-005");
    const beXml = generateUblInvoice(invoice(ZERO, { vatScheme: "REVERSE_EU", customer: { ...BE_CUSTOMER, electronicAddress: "0106:87654321" } }));
    expect(peppolCheck(wrong(beXml))).not.toContain("NL-R-005");
  });
});

describe("XML zonder Peppol voor een factuur die de Peppol-controle niet haalt", () => {
  it("alleen als de factuur zelf klopt", () => {
    expect(ublPlainAllowed([])).toBe(false);
    expect(ublPlainAllowed(["seller_kvk", "iban_missing"])).toBe(true);
    expect(ublPlainAllowed(["seller_vat"])).toBe(true);
    expect(ublPlainAllowed(["seller_kvk", "totals_mismatch"])).toBe(false);
    expect(ublPlainAllowed(["no_lines"])).toBe(false);
  });

  it("belooft geen Peppol: geen CustomizationID en ProfileID, verder dezelfde inhoud", () => {
    const data = invoice(MIXED, { supplier: { ...SUPPLIER, kvkNumber: null }, iban: null });
    expect(ublPlainAllowed(ublProblems(data))).toBe(true);
    const xml = generateUblInvoice(data, { peppol: false });
    const doc = parseXml(xml);
    expect(one(doc, "cbc:CustomizationID")).toBeUndefined();
    expect(one(doc, "cbc:ProfileID")).toBeUndefined();
    expect(xml).not.toContain("peppol");
    expect(cents(val(doc, "cac:LegalMonetaryTotal/cbc:PayableAmount"))).toBe(Math.round(data.total * 100));
    expect(inOrder(doc, INVOICE_ORDER)).toBe(true);
    // De gewone versie houdt de Peppol-kenmerken.
    expect(val(parseXml(generateUblInvoice(data)), "cbc:CustomizationID")).toContain("peppol.eu");
  });
});

describe("creditnota van een intracommunautaire levering zonder leverdatum", () => {
  it("krijgt de datum van de gecrediteerde factuur als leverdatum, niet de eigen datum", () => {
    const data = creditOf(ZERO, {
      vatScheme: "ICL", customer: BE_CUSTOMER, issueDate: new Date("2026-12-10T12:00:00Z"),
      creditReference: { number: "2026-0042", date: new Date("2026-11-18T12:00:00Z") },
    });
    const xml = generateUblInvoice(data);
    expect(peppolCheck(xml)).toEqual([]);
    expect(val(parseXml(xml), "cac:Delivery/cbc:ActualDeliveryDate")).toBe("2026-11-18");
    // Zonder datum van het origineel: de eigen factuurdatum (BR-IC-11 blijft kloppen).
    const noDate = generateUblInvoice({ ...data, creditReference: { number: "2026-0042", date: null } });
    expect(val(parseXml(noDate), "cac:Delivery/cbc:ActualDeliveryDate")).toBe("2026-12-10");
    // Een gewone ICL-factuur zonder leverdatum: de factuurdatum.
    expect(val(parseXml(generateUblInvoice(invoice(ZERO, { vatScheme: "ICL", customer: BE_CUSTOMER }))), "cac:Delivery/cbc:ActualDeliveryDate")).toBe("2026-11-18");
  });
});

describe("witregels in opmerkingen en betaalvoorwaarden blijven staan", () => {
  it("Note en PaymentTerms zijn precies de opgeslagen tekst", () => {
    const notes = "Creditfactuur voor factuur 2026-0042.\n\nEerste opmerking\n    met inspringing";
    const xml = generateUblInvoice(creditOf(MIXED, { notes }));
    expect(peppolCheck(xml)).toEqual([]);
    expect(decode(one(parseXml(xml), "cbc:Note")!.text)).toBe(notes);
    const terms = "Betaal binnen 14 dagen.\n\nIBAN NL91 ABNA 0417 1643 00";
    const inv = generateUblInvoice(invoice(MIXED, { paymentTerms: terms }));
    expect(peppolCheck(inv)).toEqual([]);
    expect(decode(one(parseXml(inv), "cac:PaymentTerms/cbc:Note")!.text)).toBe(terms);
  });

  it("weggelaten velden laten geen lege regels achter", () => {
    const xml = generateUblInvoice(invoice(MIXED, { dueDate: null, notes: null, iban: null, customer: { ...NL_CUSTOMER, address: null, email: null } }));
    expect(xml).not.toMatch(/\n\s*\n/);
    expect(xml.endsWith("</Invoice>\n")).toBe(true);
  });
});

describe("btw-nummer zonder landcode bij import en bewerken (review fase 2)", () => {
  it("de CSV-import neemt een btw-nummer zonder landcode niet over en meldt de regel", () => {
    const result = parseCustomerCsv("Naam;Land;Btw-nummer\nKlant A;NL;009876543B01\nKlant B;NL;NL 0098.7654.3B01\nKlant C;BE;\n")!;
    expect(result.rows.map((r) => r.vatNumber)).toEqual([null, "NL009876543B01", null]);
    expect(result.vatCleared).toEqual([1]);
    expect(result.rows).toHaveLength(3);
    // Wat de import opslaat, keurt het klantformulier ook goed.
    for (const row of result.rows) expect(createCustomerSchema.safeParse({ name: row.name, vatNumber: row.vatNumber ?? "" }).success).toBe(true);
  });

  it("bewerken met een ongewijzigd oud btw-nummer kan; een gewijzigd ongeldig nummer niet", () => {
    const body = { name: "Klant", address: "Nieuwe straat 1", vatNumber: "009876543B01" };
    expect(updateCustomerSchema.safeParse(body).success).toBe(false);
    const kept = withoutUnchangedVatNumber(body, "009876543B01") as Record<string, unknown>;
    expect(kept).not.toHaveProperty("vatNumber");
    expect(updateCustomerSchema.safeParse(kept).success).toBe(true);
    // Zelfde nummer in een andere schrijfwijze telt als ongewijzigd.
    expect(withoutUnchangedVatNumber({ vatNumber: "0098 7654 3B01" }, "009876543B01")).toEqual({});
    // Gewijzigd: wordt wel gekeurd.
    expect(updateCustomerSchema.safeParse(withoutUnchangedVatNumber({ ...body, vatNumber: "111111111B01" }, "009876543B01")).success).toBe(false);
    expect(withoutUnchangedVatNumber({ vatNumber: "" }, null)).toEqual({});
  });
});
