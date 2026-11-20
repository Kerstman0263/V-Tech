import { fromCents, percentageOfCents, toCents } from "@/lib/money";
import { type VatScheme } from "@/lib/vat-scheme";
import { endpointFor, validVatId, type PeppolId } from "@/lib/peppol";

/**
 * E-factuur als UBL 2.1 volgens Peppol BIS Billing 3.0 (EN 16931), met de
 * Nederlandse regels (NLCIUS, in Peppol de regels NL-R-001 t/m NL-R-009).
 * Dat XML-bestand leest elk gangbaar boekhoudpakket en Peppol-netwerk in,
 * zodat de klant de factuur niet meer hoeft over te typen.
 *
 * - Een gewone factuur is een Invoice met InvoiceTypeCode 380.
 * - Een creditfactuur (negatief totaal) is een CreditNote met
 *   CreditNoteTypeCode 381: alle bedragen positief, met een verwijzing naar de
 *   originele factuur (BillingReference, verplicht in NLCIUS: NL-R-001).
 *   Peppol staat 381 alleen toe als CreditNote, niet als Invoice.
 * - Een regel met een negatieve prijs krijgt een negatief aantal en een
 *   positieve prijs (BR-27: de prijs mag niet negatief zijn).
 *
 * Bedragen komen 1-op-1 uit de opgeslagen factuur. Btw per tarief is de som
 * van de per regel afgeronde btw — precies zoals Saldova de factuur rekent,
 * dus de XML en de PDF tellen altijd tot hetzelfde totaal op.
 *
 * ublProblems() zegt wat er nog ontbreekt voor een geldige e-factuur. De
 * route maakt geen bestand zolang daar iets in staat.
 */

export interface UblParty {
  name: string;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  vatNumber?: string | null;
  kvkNumber?: string | null;
  email?: string | null;
  /** Peppol-adres ("schema:nummer"), alleen bij de klant. */
  electronicAddress?: string | null;
}

export interface UblInvoiceData {
  invoiceNumber: string;
  issueDate: Date;
  dueDate?: Date | null;
  /** Datum van levering of dienst, of begin van de periode (BT-72 / BT-73). */
  deliveryDate?: Date | null;
  /** Einde van de periode (BT-74). */
  deliveryEndDate?: Date | null;
  currency: string;
  supplier: UblParty;
  customer: UblParty;
  lineItems: { description: string; quantity: number; unitPrice: number; vatRate: number; lineTotal: number }[];
  subtotal: number;
  vatAmount: number;
  total: number;
  notes?: string | null;
  iban?: string | null;
  /** Betaalvoorwaarden als tekst (BT-20). */
  paymentTerms?: string | null;
  /** Referentie of inkoopordernummer van de klant (BT-10). Leeg = het factuurnummer. */
  buyerReference?: string | null;
  /** Creditfactuur: de originele factuur (BT-25 en BT-26). */
  creditReference?: { number: string; date?: Date | null } | null;
  /** Kleineondernemersregeling: 0% wordt "vrijgesteld" (E) in plaats van nultarief. */
  kor?: boolean;
  /**
   * Btw-soort (lib/vat-scheme.ts): btw verlegd wordt categorie AE, een
   * intracommunautaire levering K, elk met de vrijstellingscode (VATEX).
   * Gaat voor de KOR. Leeg = gewone btw.
   */
  vatScheme?: VatScheme | null;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const amt = (n: number) => n.toFixed(2);
const day = (d: Date) => d.toISOString().slice(0, 10);
const country = (c?: string | null) => (c && /^[A-Za-z]{2}$/.test(c.trim()) ? c.trim().toUpperCase() : "NL");
const digits = (s?: string | null) => (s ?? "").replace(/\s+/g, "");
/** Peppol staat geen lege elementen toe (PEPPOL-EN16931-R008): alleen echte tekst telt. */
const text = (s?: string | null) => (s ?? "").trim();
/** Getal zonder zwevende-kommaruis en zonder "-0". */
const num = (n: number) => {
  const v = Math.round(n * 1e6) / 1e6;
  return String(v === 0 ? 0 : v);
};

interface TaxCategory { id: string; reasonCode?: string; reason?: string }

/**
 * Peppol BIS 3 / EN 16931 btw-categorie:
 * S = standaard, Z = nultarief, E = vrijgesteld (KOR),
 * AE = btw verlegd (BR-AE-10: met VATEX-EU-AE), K = intracommunautaire levering (BR-IC-10: VATEX-EU-IC).
 */
export function taxCategory(rate: number, kor: boolean, scheme: VatScheme | null | undefined = "STANDARD"): TaxCategory {
  if (rate > 0) return { id: "S" };
  if (scheme === "REVERSE_NL" || scheme === "REVERSE_EU") return { id: "AE", reasonCode: "VATEX-EU-AE", reason: "Reverse charge" };
  if (scheme === "ICL") return { id: "K", reasonCode: "VATEX-EU-IC", reason: "Intra-Community supply" };
  if (kor) return { id: "E", reason: "Vrijgesteld van btw (kleineondernemersregeling)" };
  return { id: "Z" };
}

export type UblProblemCode =
  | "no_lines"
  | "totals_mismatch"
  | "seller_vat"
  | "seller_kvk"
  | "seller_address"
  | "seller_endpoint"
  | "customer_address"
  | "customer_vat"
  | "customer_endpoint"
  | "iban_missing"
  | "payment_terms_missing"
  | "credit_reference_missing";

interface PreparedLine { description: string; quantity: number; price: number; net: number; rate: number; cat: TaxCategory }
interface PreparedGroup { rate: number; cat: TaxCategory; net: number; vat: number }

interface Prepared {
  credit: boolean;
  lines: PreparedLine[];
  groups: PreparedGroup[];
  /** Centen, met het teken van het document (positief bij een CreditNote). */
  netCents: number;
  vatCents: number;
  /** Klopt de som van de regels en de btw met de opgeslagen totalen? */
  totalsMatch: boolean;
  supplierEndpoint: PeppolId | null;
  customerEndpoint: PeppolId | null;
  supplierVat: string | null;
  customerVat: string | null;
  supplierKvk: string;
}

function prepare(data: UblInvoiceData): Prepared {
  const kor = !!data.kor;
  const scheme = data.vatScheme ?? "STANDARD";
  // Een creditfactuur is in Saldova een factuur met negatieve bedragen; als
  // CreditNote worden alle bedragen positief.
  const credit = data.total < 0;
  const sign = credit ? -1 : 1;

  // Btw per categorie en tarief: som van de per regel afgeronde centen (zoals
  // invoice-calc), berekend op de opgeslagen bedragen en daarna van teken
  // gewisseld, zodat het precies het opgeslagen totaal blijft.
  const groupMap = new Map<string, PreparedGroup>();
  const lines: PreparedLine[] = [];
  for (const li of data.lineItems) {
    const net = toCents(li.lineTotal);
    const cat = taxCategory(li.vatRate, kor, scheme);
    const key = `${cat.id}:${li.vatRate}`;
    const g = groupMap.get(key) ?? { rate: li.vatRate, cat, net: 0, vat: 0 };
    g.net += net;
    g.vat += percentageOfCents(net, li.vatRate);
    groupMap.set(key, g);
    let quantity = sign * li.quantity;
    let price = li.unitPrice;
    // BR-27: prijs nooit negatief. Negatief aantal met positieve prijs geeft hetzelfde regelbedrag.
    if (price < 0) { price = -price; quantity = -quantity; }
    lines.push({ description: li.description, quantity, price, net: sign * net, rate: li.vatRate, cat });
  }
  const groups = [...groupMap.values()].map((g) => ({ ...g, net: sign * g.net, vat: sign * g.vat }));
  const netCents = groups.reduce((s, g) => s + g.net, 0);
  const vatCents = groups.reduce((s, g) => s + g.vat, 0);
  const totalsMatch = netCents === sign * toCents(data.subtotal)
    && vatCents === sign * toCents(data.vatAmount)
    && netCents + vatCents === sign * toCents(data.total);

  const supplierKvk = digits(data.supplier.kvkNumber);
  return {
    credit, lines, groups, netCents, vatCents, totalsMatch,
    supplierEndpoint: endpointFor({ kvkNumber: supplierKvk, vatNumber: data.supplier.vatNumber, email: data.supplier.email }),
    customerEndpoint: endpointFor({ electronicAddress: data.customer.electronicAddress, vatNumber: data.customer.vatNumber, email: data.customer.email }),
    supplierVat: validVatId(data.supplier.vatNumber),
    customerVat: validVatId(data.customer.vatNumber),
    supplierKvk,
  };
}

/**
 * Wat er nog ontbreekt voor een geldige e-factuur volgens Peppol BIS 3 en
 * NLCIUS. Leeg = in orde. Alleen regels die in die standaarden staan.
 */
export function ublProblems(data: UblInvoiceData): UblProblemCode[] {
  const p = prepare(data);
  const problems: UblProblemCode[] = [];
  const dutchSupplier = country(data.supplier.country) === "NL";
  const add = (code: UblProblemCode) => { if (!problems.includes(code)) problems.push(code); };

  if (!data.lineItems.length) add("no_lines"); // BR-16
  if (!p.totalsMatch) add("totals_mismatch"); // BR-CO-10, BR-CO-14, BR-CO-15
  // BR-S-02, BR-Z-02, BR-E-02, BR-AE-02, BR-IC-02: btw-nummer van de verkoper,
  // met landcode (BR-CO-09).
  if (!p.supplierVat) add("seller_vat");
  // NL-R-003: KvK-nummer (of OIN) als identificatie van de Nederlandse leverancier.
  if (dutchSupplier && !/^\d{8}$/.test(p.supplierKvk)) add("seller_kvk");
  // NL-R-002: straat, plaats en postcode van de Nederlandse leverancier.
  if (dutchSupplier && (!text(data.supplier.address) || !text(data.supplier.city) || !text(data.supplier.postalCode))) add("seller_address");
  // PEPPOL-EN16931-R020 en R010: elektronisch adres van verkoper en koper.
  if (!p.supplierEndpoint) add("seller_endpoint");
  if (!p.customerEndpoint) add("customer_endpoint");
  // NL-R-004: adres van een Nederlandse klant volledig.
  if (dutchSupplier && country(data.customer.country) === "NL"
    && (!text(data.customer.address) || !text(data.customer.city) || !text(data.customer.postalCode))) add("customer_address");
  // NL-R-005 (KvK of OIN van een Nederlandse klant) hangt in de officiële
  // schematron (Peppol BIS 3.0.22) aan PartyLegalEntity/CompanyID van de klant:
  // zonder dat element geldt de regel niet. Saldova zet het alleen met schema
  // 0106 of 0190 (legalIdOf), dus hier is geen probleemcode nodig. Een
  // particuliere klant heeft geen KvK-nummer en hoeft er dus ook geen te geven.
  // BR-AE-02 en BR-IC-02: btw-nummer van de koper bij btw verlegd en ICL.
  if (p.groups.some((g) => g.cat.id === "AE" || g.cat.id === "K") && !p.customerVat) add("customer_vat");
  if (!p.credit && p.netCents + p.vatCents > 0) {
    // NL-R-007 en NL-R-008: betaalwijze verplicht als de klant moet betalen;
    // overboeking (58) vraagt het IBAN (BR-61).
    if (dutchSupplier && !text(data.iban)) add("iban_missing");
    // BR-CO-25: vervaldatum of betaalvoorwaarden bij een te betalen bedrag.
    else if (!data.dueDate && !text(data.paymentTerms)) add("payment_terms_missing");
  }
  // NL-R-001: een creditnota verwijst naar de originele factuur.
  if (p.credit && dutchSupplier && !text(data.creditReference?.number)) add("credit_reference_missing");
  return problems;
}

/**
 * Regels samenvoegen met inspringing; weggelaten (lege) onderdelen vallen weg.
 * Alleen de onderdelen zelf worden bekeken, nooit de tekst in een element:
 * witregels in opmerkingen en betaalvoorwaarden blijven dus staan.
 */
type Part = string | false | null | undefined;
const block = (indent: string, parts: Part[]) =>
  parts.filter((part): part is string => !!part).map((part) => indent + part).join("\n");

function endpointXml(endpoint: PeppolId | null): string {
  return endpoint ? `<cbc:EndpointID schemeID="${esc(endpoint.scheme)}">${esc(endpoint.id)}</cbc:EndpointID>` : "";
}

/** KvK (0106) of OIN (0190): de identificaties die NL-R-003 en NL-R-005 toestaan. */
const LEGAL_ID_SCHEMES = ["0106", "0190"];

/**
 * Identificatie als juridische entiteit (BT-30 / BT-47). Verkoper: het KvK-nummer.
 * Klant: alleen als zijn Peppol-adres een KvK- of OIN-nummer is. NL-R-005
 * (Peppol BIS 3.0.22) eist bij een Nederlandse klant dat een opgegeven
 * CompanyID schema 0106 of 0190 heeft. De regel hangt aan dat element: zonder
 * CompanyID geldt hij niet. Andere schema's zetten we daarom niet in dit veld.
 */
function legalIdOf(role: "supplier" | "customer", prepared: Prepared): PeppolId | null {
  if (role === "supplier") return /^\d{8}$/.test(prepared.supplierKvk) ? { scheme: "0106", id: prepared.supplierKvk } : null;
  const endpoint = prepared.customerEndpoint;
  return endpoint && LEGAL_ID_SCHEMES.includes(endpoint.scheme) ? endpoint : null;
}

function partyXml(p: UblParty, role: "supplier" | "customer", prepared: Prepared): string {
  const supplier = role === "supplier";
  // Btw-nummer zonder spaties, punten of streepjes en met landcode (BR-CO-09).
  // Een btw-nummer zonder geldige landcode laten we weg in plaats van een
  // ongeldig bestand te maken (bij de verkoper meldt ublProblems het).
  const vat = supplier ? prepared.supplierVat : prepared.customerVat;
  const legalId = legalIdOf(role, prepared);
  const endpoint = supplier ? prepared.supplierEndpoint : prepared.customerEndpoint;
  const tag = supplier ? "AccountingSupplierParty" : "AccountingCustomerParty";
  const name = text(p.name) || "-";
  return block("  ", [
    `<cac:${tag}>`,
    "  <cac:Party>",
    endpoint && `    ${endpointXml(endpoint)}`,
    `    <cac:PartyName><cbc:Name>${esc(name)}</cbc:Name></cac:PartyName>`,
    "    <cac:PostalAddress>",
    text(p.address) && `      <cbc:StreetName>${esc(text(p.address))}</cbc:StreetName>`,
    text(p.city) && `      <cbc:CityName>${esc(text(p.city))}</cbc:CityName>`,
    text(p.postalCode) && `      <cbc:PostalZone>${esc(text(p.postalCode))}</cbc:PostalZone>`,
    `      <cac:Country><cbc:IdentificationCode>${country(p.country)}</cbc:IdentificationCode></cac:Country>`,
    "    </cac:PostalAddress>",
    vat && `    <cac:PartyTaxScheme><cbc:CompanyID>${esc(vat)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`,
    "    <cac:PartyLegalEntity>",
    `      <cbc:RegistrationName>${esc(name)}</cbc:RegistrationName>`,
    legalId && `      <cbc:CompanyID schemeID="${esc(legalId.scheme)}">${esc(legalId.id)}</cbc:CompanyID>`,
    "    </cac:PartyLegalEntity>",
    text(p.email) && `    <cac:Contact><cbc:ElectronicMail>${esc(text(p.email))}</cbc:ElectronicMail></cac:Contact>`,
    "  </cac:Party>",
    `</cac:${tag}>`,
  ]);
}

/**
 * Problemen waarbij ook een XML-bestand zonder Peppol niet kan: de factuur zelf
 * klopt dan niet (geen regels, of regels die niet optellen tot het totaal).
 */
const STRUCTURAL_PROBLEMS: UblProblemCode[] = ["no_lines", "totals_mismatch"];

/**
 * Mag er een XML-bestand zonder Peppol komen? Alleen als de Peppol-versie niet
 * kan door ontbrekende gegevens (bijv. een al uitgereikte factuur zonder
 * KvK-nummer of IBAN in de momentopname), terwijl de factuur zelf klopt.
 */
export function ublPlainAllowed(problems: UblProblemCode[]): boolean {
  return problems.length > 0 && !problems.some((code) => STRUCTURAL_PROBLEMS.includes(code));
}

export interface UblOptions {
  /**
   * false = gewoon UBL 2.1 zonder CustomizationID en ProfileID: het bestand
   * belooft dan geen Peppol BIS 3 / NLCIUS. Alleen om zelf in te lezen als de
   * Peppol-versie niet kan (ublPlainAllowed). Standaard true.
   */
  peppol?: boolean;
}

export function generateUblInvoice(data: UblInvoiceData, options: UblOptions = {}): string {
  const peppol = options.peppol !== false;
  const p = prepare(data);
  const cur = esc(text(data.currency) || "EUR");
  const doc = p.credit ? "CreditNote" : "Invoice";
  const lineTag = p.credit ? "CreditNoteLine" : "InvoiceLine";
  const qtyTag = p.credit ? "CreditedQuantity" : "InvoicedQuantity";

  const subtotals = p.groups.map((g) => block("    ", [
    "<cac:TaxSubtotal>",
    `  <cbc:TaxableAmount currencyID="${cur}">${amt(fromCents(g.net))}</cbc:TaxableAmount>`,
    `  <cbc:TaxAmount currencyID="${cur}">${amt(fromCents(g.vat))}</cbc:TaxAmount>`,
    "  <cac:TaxCategory>",
    `    <cbc:ID>${g.cat.id}</cbc:ID>`,
    `    <cbc:Percent>${amt(g.rate)}</cbc:Percent>`,
    g.cat.reasonCode && `    <cbc:TaxExemptionReasonCode>${g.cat.reasonCode}</cbc:TaxExemptionReasonCode>`,
    g.cat.reason && `    <cbc:TaxExemptionReason>${esc(g.cat.reason)}</cbc:TaxExemptionReason>`,
    "    <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>",
    "  </cac:TaxCategory>",
    "</cac:TaxSubtotal>",
  ]));

  const lines = p.lines.map((li, i) => block("  ", [
    `<cac:${lineTag}>`,
    `  <cbc:ID>${i + 1}</cbc:ID>`,
    `  <cbc:${qtyTag} unitCode="C62">${num(li.quantity)}</cbc:${qtyTag}>`,
    `  <cbc:LineExtensionAmount currencyID="${cur}">${amt(fromCents(li.net))}</cbc:LineExtensionAmount>`,
    "  <cac:Item>",
    `    <cbc:Name>${esc(text(li.description).slice(0, 200) || "-")}</cbc:Name>`,
    "    <cac:ClassifiedTaxCategory>",
    `      <cbc:ID>${li.cat.id}</cbc:ID>`,
    `      <cbc:Percent>${amt(li.rate)}</cbc:Percent>`,
    "      <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>",
    "    </cac:ClassifiedTaxCategory>",
    "  </cac:Item>",
    `  <cac:Price><cbc:PriceAmount currencyID="${cur}">${amt(li.price)}</cbc:PriceAmount></cac:Price>`,
    `</cac:${lineTag}>`,
  ]));

  // Betaalwijze: SEPA-overboeking (58) met IBAN. Niet bij een creditnota:
  // daar betaalt de verkoper terug, niet de klant.
  const iban = text(data.iban);
  const payment = iban && !p.credit
    ? block("  ", [
      "<cac:PaymentMeans>",
      `  <cbc:PaymentMeansCode name="SEPA credit transfer">58</cbc:PaymentMeansCode>`,
      `  <cbc:PaymentID>${esc(data.invoiceNumber)}</cbc:PaymentID>`,
      `  <cac:PayeeFinancialAccount><cbc:ID>${esc(iban)}</cbc:ID><cbc:Name>${esc(text(data.supplier.name) || "-")}</cbc:Name></cac:PayeeFinancialAccount>`,
      "</cac:PaymentMeans>",
    ])
    : "";
  // Betaalvoorwaarden (BT-20). Bij een creditnota de verwijzing naar het
  // origineel: een CreditNote heeft geen vervaldatum en BR-CO-25 vraagt dan
  // betaalvoorwaarden bij een positief bedrag.
  const creditNumber = text(data.creditReference?.number);
  const termsText = p.credit
    ? (creditNumber ? `Creditfactuur voor factuur ${creditNumber}` : "Creditfactuur")
    : text(data.paymentTerms);
  const paymentTerms = termsText ? `<cac:PaymentTerms><cbc:Note>${esc(termsText.slice(0, 1000))}</cbc:Note></cac:PaymentTerms>` : "";

  // Leverdatum: één datum als Delivery/ActualDeliveryDate (BT-72), een periode
  // als InvoicePeriod met begin- en einddatum (BG-14).
  const periodEnd = data.deliveryDate && data.deliveryEndDate && day(data.deliveryEndDate) > day(data.deliveryDate) ? data.deliveryEndDate : null;
  const invoicePeriod = data.deliveryDate && periodEnd
    ? `<cac:InvoicePeriod><cbc:StartDate>${day(data.deliveryDate)}</cbc:StartDate><cbc:EndDate>${day(periodEnd)}</cbc:EndDate></cac:InvoicePeriod>`
    : "";
  // Intracommunautaire levering (K): leverdatum of periode verplicht (BR-IC-11)
  // en het land van aflevering (BR-IC-12; het land van de klant). Zonder
  // leverdatum geldt de factuurdatum, zoals op de PDF. Bij een creditnota is
  // dat de datum van de gecrediteerde factuur (daar hoort de levering bij),
  // niet de datum van de creditnota zelf.
  const icl = p.groups.some((g) => g.cat.id === "K");
  const fallbackDelivery = (p.credit ? data.creditReference?.date : null) ?? data.issueDate;
  const deliveryDate = data.deliveryDate && !periodEnd ? data.deliveryDate : icl && !periodEnd ? fallbackDelivery : null;
  const deliveryCountry = icl
    ? `<cac:DeliveryLocation><cac:Address><cac:Country><cbc:IdentificationCode>${country(data.customer.country)}</cbc:IdentificationCode></cac:Country></cac:Address></cac:DeliveryLocation>`
    : "";
  const delivery = deliveryDate || deliveryCountry
    ? `<cac:Delivery>${deliveryDate ? `<cbc:ActualDeliveryDate>${day(deliveryDate)}</cbc:ActualDeliveryDate>` : ""}${deliveryCountry}</cac:Delivery>`
    : "";

  // BT-10: referentie van de klant; zonder referentie het factuurnummer, zodat
  // PEPPOL-EN16931-R003 (referentie of ordernummer verplicht) altijd klopt.
  const buyerReference = text(data.buyerReference) || data.invoiceNumber;
  // BG-3: verwijzing naar de originele factuur (creditnota).
  const billingReference = p.credit && creditNumber
    ? `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${esc(creditNumber)}</cbc:ID>${data.creditReference?.date ? `<cbc:IssueDate>${day(data.creditReference.date)}</cbc:IssueDate>` : ""}</cac:InvoiceDocumentReference></cac:BillingReference>`
    : "";
  const note = text(data.notes);

  // Onderdelen in de volgorde van het UBL-schema. Weggelaten onderdelen zijn
  // lege strings en vallen weg; er gaat geen regex over het hele document.
  return block("", [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<${doc} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${doc}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`,
    block("  ", [
      peppol && "<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>",
      peppol && "<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>",
      `<cbc:ID>${esc(data.invoiceNumber)}</cbc:ID>`,
      `<cbc:IssueDate>${day(data.issueDate)}</cbc:IssueDate>`,
      !p.credit && data.dueDate && `<cbc:DueDate>${day(data.dueDate)}</cbc:DueDate>`,
      p.credit ? "<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>" : "<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>",
      note && `<cbc:Note>${esc(note.slice(0, 1000))}</cbc:Note>`,
      `<cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>`,
      `<cbc:BuyerReference>${esc(buyerReference)}</cbc:BuyerReference>`,
      invoicePeriod,
      billingReference,
    ]),
    partyXml(data.supplier, "supplier", p),
    partyXml(data.customer, "customer", p),
    delivery && `  ${delivery}`,
    payment,
    block("  ", [
      paymentTerms,
      "<cac:TaxTotal>",
      `  <cbc:TaxAmount currencyID="${cur}">${amt(fromCents(p.vatCents))}</cbc:TaxAmount>`,
    ]),
    ...subtotals,
    block("  ", [
      "</cac:TaxTotal>",
      "<cac:LegalMonetaryTotal>",
      `  <cbc:LineExtensionAmount currencyID="${cur}">${amt(fromCents(p.netCents))}</cbc:LineExtensionAmount>`,
      `  <cbc:TaxExclusiveAmount currencyID="${cur}">${amt(fromCents(p.netCents))}</cbc:TaxExclusiveAmount>`,
      `  <cbc:TaxInclusiveAmount currencyID="${cur}">${amt(fromCents(p.netCents + p.vatCents))}</cbc:TaxInclusiveAmount>`,
      `  <cbc:PayableAmount currencyID="${cur}">${amt(fromCents(p.netCents + p.vatCents))}</cbc:PayableAmount>`,
      "</cac:LegalMonetaryTotal>",
    ]),
    ...lines,
    `</${doc}>`,
  ]) + "\n";
}
