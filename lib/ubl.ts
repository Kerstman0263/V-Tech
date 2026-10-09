import { fromCents, percentageOfCents, toCents } from "@/lib/money";

/**
 * E-factuur als UBL 2.1 volgens Peppol BIS Billing 3.0 (EN 16931).
 * Dat XML-bestand leest elk gangbaar boekhoudpakket en Peppol-netwerk in,
 * zodat de klant de factuur niet meer hoeft over te typen.
 *
 * Bedragen komen 1-op-1 uit de opgeslagen factuur. Btw per tarief is de som
 * van de per regel afgeronde btw — precies zoals Saldova de factuur rekent,
 * dus de XML en de PDF tellen altijd tot hetzelfde totaal op.
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
}

export interface UblInvoiceData {
  invoiceNumber: string;
  issueDate: Date;
  dueDate?: Date | null;
  currency: string;
  supplier: UblParty;
  customer: UblParty;
  lineItems: { description: string; quantity: number; unitPrice: number; vatRate: number; lineTotal: number }[];
  subtotal: number;
  vatAmount: number;
  total: number;
  notes?: string | null;
  iban?: string | null;
  /** Kleineondernemersregeling: 0% wordt "vrijgesteld" (E) in plaats van nultarief. */
  kor?: boolean;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const amt = (n: number) => n.toFixed(2);
const day = (d: Date) => d.toISOString().slice(0, 10);
const country = (c?: string | null) => (c && /^[A-Za-z]{2}$/.test(c) ? c.toUpperCase() : "NL");
const digits = (s?: string | null) => (s ?? "").replace(/\s+/g, "");

function taxCategory(rate: number, kor: boolean): { id: string; reason?: string } {
  if (rate > 0) return { id: "S" };
  if (kor) return { id: "E", reason: "Vrijgesteld van btw (kleineondernemersregeling)" };
  return { id: "Z" };
}

function partyXml(p: UblParty, role: "supplier" | "customer"): string {
  const vat = digits(p.vatNumber).toUpperCase();
  const kvk = digits(p.kvkNumber);
  // EndpointID (Peppol-adres): KvK (0106) heeft voorrang, anders het btw-nummer (9944).
  const endpoint = kvk && /^\d{8}$/.test(kvk) ? `<cbc:EndpointID schemeID="0106">${kvk}</cbc:EndpointID>`
    : vat ? `<cbc:EndpointID schemeID="9944">${esc(vat)}</cbc:EndpointID>` : "";
  const tag = role === "supplier" ? "AccountingSupplierParty" : "AccountingCustomerParty";
  return `
  <cac:${tag}>
    <cac:Party>
      ${endpoint}
      <cac:PartyName><cbc:Name>${esc(p.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        ${p.address ? `<cbc:StreetName>${esc(p.address)}</cbc:StreetName>` : ""}
        ${p.city ? `<cbc:CityName>${esc(p.city)}</cbc:CityName>` : ""}
        ${p.postalCode ? `<cbc:PostalZone>${esc(p.postalCode)}</cbc:PostalZone>` : ""}
        <cac:Country><cbc:IdentificationCode>${country(p.country)}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      ${vat ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(vat)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ""}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(p.name)}</cbc:RegistrationName>
        ${kvk ? `<cbc:CompanyID schemeID="0106">${esc(kvk)}</cbc:CompanyID>` : ""}
      </cac:PartyLegalEntity>
      ${p.email ? `<cac:Contact><cbc:ElectronicMail>${esc(p.email)}</cbc:ElectronicMail></cac:Contact>` : ""}
    </cac:Party>
  </cac:${tag}>`;
}

export function generateUblInvoice(data: UblInvoiceData): string {
  const kor = !!data.kor;
  const cur = esc(data.currency);

  // Btw per tarief: som van de per regel afgeronde centen (zoals invoice-calc).
  const groups = new Map<number, { net: number; vat: number }>();
  for (const li of data.lineItems) {
    const net = toCents(li.lineTotal);
    const g = groups.get(li.vatRate) ?? { net: 0, vat: 0 };
    g.net += net;
    g.vat += percentageOfCents(net, li.vatRate);
    groups.set(li.vatRate, g);
  }

  const subtotals = [...groups.entries()].map(([rate, g]) => {
    const cat = taxCategory(rate, kor);
    return `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${cur}">${amt(fromCents(g.net))}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${cur}">${amt(fromCents(g.vat))}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${cat.id}</cbc:ID>
        <cbc:Percent>${amt(rate)}</cbc:Percent>
        ${cat.reason ? `<cbc:TaxExemptionReason>${esc(cat.reason)}</cbc:TaxExemptionReason>` : ""}
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`;
  }).join("");

  const lines = data.lineItems.map((li, i) => {
    const cat = taxCategory(li.vatRate, kor);
    return `
  <cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">${li.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${cur}">${amt(li.lineTotal)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${esc(li.description.slice(0, 200) || "-")}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${cat.id}</cbc:ID>
        <cbc:Percent>${amt(li.vatRate)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="${cur}">${amt(li.unitPrice)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`;
  }).join("");

  const payment = data.iban
    ? `
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode name="SEPA credit transfer">58</cbc:PaymentMeansCode>
    <cbc:PaymentID>${esc(data.invoiceNumber)}</cbc:PaymentID>
    <cac:PayeeFinancialAccount><cbc:ID>${esc(data.iban)}</cbc:ID><cbc:Name>${esc(data.supplier.name)}</cbc:Name></cac:PayeeFinancialAccount>
  </cac:PaymentMeans>`
    : "";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(data.invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${day(data.issueDate)}</cbc:IssueDate>
  ${data.dueDate ? `<cbc:DueDate>${day(data.dueDate)}</cbc:DueDate>` : ""}
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  ${data.notes ? `<cbc:Note>${esc(data.notes.slice(0, 1000))}</cbc:Note>` : ""}
  <cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>${esc(data.invoiceNumber)}</cbc:BuyerReference>
  ${partyXml(data.supplier, "supplier")}
  ${partyXml(data.customer, "customer")}
  ${payment}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${cur}">${amt(data.vatAmount)}</cbc:TaxAmount>${subtotals}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${cur}">${amt(data.subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${cur}">${amt(data.subtotal)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${cur}">${amt(data.total)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${cur}">${amt(data.total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${lines}
</Invoice>
`;
  // Lege regels van weggelaten optionele velden opruimen.
  return xml.replace(/\n\s*\n/g, "\n");
}
