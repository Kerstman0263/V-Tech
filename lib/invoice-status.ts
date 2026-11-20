import type { InvoiceStatus } from "@prisma/client";

/**
 * Welke statuswijzigingen mag een gebruiker met de hand doen?
 *
 * - Een concept (DRAFT) is nog niet uitgereikt: het kan verzonden, betaald of
 *   vervallen (CANCELED) worden.
 * - Een uitgereikte factuur (SENT, OVERDUE, PAID) blijft bestaan. Hij kan
 *   alleen tussen openstaand, te laat en betaald wisselen. Terugdraaien gaat
 *   met een creditfactuur, niet door hem te annuleren of terug te zetten.
 * - Een vervallen factuur (CANCELED) is afgesloten.
 *
 * Geeft null terug als de overgang mag, anders een melding voor de gebruiker.
 */
const ISSUED: readonly InvoiceStatus[] = ["SENT", "OVERDUE", "PAID"];

export function invoiceStatusTransitionError(from: InvoiceStatus, to: InvoiceStatus): string | null {
  if (from === to) return null;
  if (to === "DRAFT") return "Een uitgereikte factuur kan niet terug naar concept. Maak zo nodig een creditfactuur.";
  if (from === "CANCELED") return "Deze factuur is vervallen en kan niet meer worden gewijzigd.";
  if (from === "DRAFT") return null;
  if (to === "CANCELED") return "Een uitgereikte factuur kun je niet annuleren. Maak een creditfactuur.";
  if (ISSUED.includes(from) && ISSUED.includes(to)) return null;
  return "Deze statuswijziging is niet mogelijk.";
}

/**
 * Wat er met de betaaldatum (Invoice.paidAt) gebeurt bij een statuswissel:
 * - naar betaald: de betaaldatum wordt `when` (bankdatum, Mollie-datum of nu);
 * - van betaald naar iets anders: de betaaldatum gaat weg (staat weer open);
 * - anders: niets.
 * Het resultaat gaat zo in het `data`-deel van een Prisma-update.
 */
export function paidAtUpdate(from: InvoiceStatus | string, to: InvoiceStatus | string, when: Date = new Date()): { paidAt?: Date | null } {
  if (from === to) return {};
  if (to === "PAID") return { paidAt: when };
  if (from === "PAID") return { paidAt: null };
  return {};
}

/** Is de factuur uitgereikt (dus vastgelegd en niet meer te verwijderen)? */
export function isIssuedInvoice(status: InvoiceStatus): boolean {
  return ISSUED.includes(status);
}

/** Factuurnummer opmaken: prefix "2026-" + nummer 7 + padding 4 -> "2026-0007". */
export function formatInvoiceNumber(prefix: string, sequence: number, padding: number): string {
  return `${prefix}${String(sequence).padStart(padding, "0")}`;
}

/**
 * Is dit het laatst uitgegeven nummer van de reeks? Alleen dan kan een concept
 * echt weg (en schuift de teller één terug) zonder een gat in de nummering.
 */
export function isLatestInvoiceNumber(
  invoiceNumber: string,
  settings: { invoicePrefix: string; nextNumber: number; numberPadding: number },
): boolean {
  if (settings.nextNumber <= 1) return false;
  return invoiceNumber === formatInvoiceNumber(settings.invoicePrefix, settings.nextNumber - 1, settings.numberPadding);
}
