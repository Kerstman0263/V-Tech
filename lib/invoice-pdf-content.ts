import { creditNoteTemplates, creditNoteTexts, korNoticeTexts } from "@/lib/pdf-labels";
import { removeFixedSentences } from "@/lib/pdf-text";
import { isCreditInvoice, resolveCreditReference, type CreditLookupDb, type CreditReference } from "@/lib/credit-reference";

/**
 * Wat de factuur-PDF naast de regels toont: de vaste vermeldingen (KOR-zin),
 * de vrije opmerkingen en, bij een creditfactuur, de verwijzing naar het
 * origineel. Los van de route, zodat het gedrag bij oude facturen te testen is.
 *
 * Belangrijk: alles komt uit wat bij de factuur is opgeslagen, nooit uit de
 * huidige instellingen. Een uitgereikte factuur mag achteraf niet van inhoud
 * veranderen (bijv. een KOR-zin erbij omdat de KOR nu aan staat).
 */
export interface InvoicePdfContentInput {
  invoiceNumber: string;
  total: number;
  notes: string | null;
  originalInvoiceNumber?: string | null;
  originalInvoiceDate?: Date | null;
}

export interface InvoicePdfContent {
  isCredit: boolean;
  creditReference: CreditReference | null;
  /** Vaste vermeldingen boven de opmerkingen. */
  notices: string[];
  /** Opmerkingen zonder de zinnen die al als vast onderdeel op de PDF staan. */
  notes: string | null;
}

/**
 * De KOR-zin staat alleen op de PDF als hij bij het aanmaken in de opmerkingen
 * is gezet (invoices/new zet hem daar voor KOR-gebruikers). Precies die tekst,
 * in de taal waarin hij is opgeslagen.
 */
export function korNoticeFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  return korNoticeTexts().find((text) => notes.includes(text)) ?? null;
}

export async function invoicePdfContent(db: CreditLookupDb, accountId: string, invoice: InvoicePdfContentInput): Promise<InvoicePdfContent> {
  const isCredit = isCreditInvoice({ total: invoice.total, originalInvoiceNumber: invoice.originalInvoiceNumber });
  const creditReference = isCredit
    ? await resolveCreditReference(db, accountId, invoice, creditNoteTemplates())
    : null;
  const kor = korNoticeFromNotes(invoice.notes);
  const notes = removeFixedSentences(invoice.notes, [
    ...(kor ? korNoticeTexts() : []),
    ...(creditReference ? creditNoteTexts(creditReference.number) : []),
  ]);
  return { isCredit, creditReference, notices: kor ? [kor] : [], notes };
}
