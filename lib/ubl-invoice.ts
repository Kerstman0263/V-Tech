import nl from "@/messages/nl.json";
import en from "@/messages/en.json";
import { extractIban } from "@/lib/iban";
import { invoicePdfContent } from "@/lib/invoice-pdf-content";
import type { CreditLookupDb } from "@/lib/credit-reference";
import type { InvoiceParties } from "@/lib/invoice-snapshot";
import type { UblInvoiceData, UblProblemCode } from "@/lib/ubl";

/**
 * De gegevens voor de e-factuur van één opgeslagen factuur. Gedeeld door de
 * UBL-route en de factuurpagina, zodat de pagina precies dezelfde controle
 * toont als de download.
 */
export interface UblSourceInvoice {
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date | null;
  deliveryDate: Date | null;
  deliveryEndDate: Date | null;
  currency: string;
  subtotal: unknown;
  vatAmount: unknown;
  total: unknown;
  notes: string | null;
  buyerReference?: string | null;
  originalInvoiceNumber?: string | null;
  originalInvoiceDate?: Date | null;
  lineItems: { description: string; quantity: unknown; unitPrice: unknown; vatRate: unknown; lineTotal: unknown }[];
}

export async function ublInvoiceData(
  lookup: CreditLookupDb,
  accountId: string,
  invoice: UblSourceInvoice,
  parties: InvoiceParties,
): Promise<UblInvoiceData> {
  const total = Number(invoice.total);
  // Creditfactuur: het origineel uit de vaste verwijzing, of bij oude
  // creditfacturen via het logboek of de verwijzingszin (zoals de PDF).
  const { creditReference } = await invoicePdfContent(lookup, accountId, {
    invoiceNumber: invoice.invoiceNumber,
    total,
    notes: invoice.notes,
    originalInvoiceNumber: invoice.originalInvoiceNumber,
    originalInvoiceDate: invoice.originalInvoiceDate,
  });
  return {
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    deliveryDate: invoice.deliveryDate,
    deliveryEndDate: invoice.deliveryEndDate,
    currency: invoice.currency,
    supplier: parties.seller,
    customer: parties.customer,
    lineItems: invoice.lineItems.map((li) => ({
      description: li.description,
      quantity: Number(li.quantity),
      unitPrice: Number(li.unitPrice),
      vatRate: Number(li.vatRate),
      lineTotal: Number(li.lineTotal),
    })),
    subtotal: Number(invoice.subtotal),
    vatAmount: Number(invoice.vatAmount),
    total,
    notes: invoice.notes,
    iban: extractIban(parties.paymentTerms),
    paymentTerms: parties.paymentTerms,
    buyerReference: invoice.buyerReference ?? null,
    creditReference,
    kor: parties.korEnabled,
    vatScheme: parties.vatScheme,
  };
}

const MESSAGES = { nl: nl.invoices, en: en.invoices } as const;
const pick = (locale: string | null | undefined) => MESSAGES[locale === "en" ? "en" : "nl"];

/** Uitleg per ontbrekend gegeven, in de taal van het account. */
export function ublProblemTexts(codes: UblProblemCode[], locale: string | null | undefined): string[] {
  const texts = pick(locale).ublProblems;
  return codes.map((code) => texts[code]);
}

/** Antwoord van de download als de e-factuur nog niet kan: kop plus elk ontbrekend gegeven. */
export function ublBlockedMessage(codes: UblProblemCode[], locale: string | null | undefined): string {
  return [pick(locale).ublBlocked, ...ublProblemTexts(codes, locale).map((t) => `- ${t}`)].join("\n");
}
