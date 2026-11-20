import { toCents, fromCents } from "@/lib/money";

/**
 * Online betalingen (Mollie) voor een factuur, opgeteld over ALLE betalingen.
 *
 * Regels:
 * - Een betaling telt mee zolang hij "staat": niet (deels) teruggeboekt door de
 *   bank van de klant en niet volledig teruggestort.
 * - Een gedeeltelijke terugstorting door de ondernemer (bijvoorbeeld 5 euro
 *   coulance op 500 euro) laat de betaling staan: de klant hoeft de factuur
 *   niet opnieuw te betalen. Voor de btw hoort daar een creditfactuur bij; dat
 *   melden we, maar de factuur gaat er niet van open.
 * - Een terugboeking (chargeback) of een volledige terugstorting haalt de
 *   betaling weg. Dekken de overgebleven betalingen het factuurbedrag niet meer,
 *   dan staat de factuur weer open.
 * - Is er netto meer ontvangen dan het factuurbedrag (bijvoorbeeld twee keer
 *   via de betaallink betaald), dan is dat een dubbele betaling.
 * Puur (geen database), zodat het los te testen is.
 */

export interface InvoicePaymentRow {
  amount: number;
  refunded: number;
  chargedBack: number;
}

export interface InvoicePaymentSummary {
  /** Dekken de staande betalingen het hele factuurbedrag? */
  settled: boolean;
  /** Netto ontvangen: betaald min teruggestort min teruggeboekt. */
  net: number;
  /** Netto meer ontvangen dan het factuurbedrag (dubbele betaling), anders 0. */
  overpaid: number;
  /** Gedeeltelijk teruggestort op betalingen die nog staan (coulance). */
  partiallyRefunded: number;
}

function stands(row: { amountCents: number; refundedCents: number; chargedBackCents: number }): boolean {
  return row.chargedBackCents <= 0 && row.refundedCents < row.amountCents;
}

export function summarizeInvoicePayments(rows: InvoicePaymentRow[], invoiceTotal: number): InvoicePaymentSummary {
  const totalCents = toCents(invoiceTotal);
  let standingCents = 0;
  let netCents = 0;
  let partialCents = 0;
  for (const row of rows) {
    const cents = {
      amountCents: Math.max(0, toCents(row.amount)),
      refundedCents: Math.max(0, toCents(row.refunded)),
      chargedBackCents: Math.max(0, toCents(row.chargedBack)),
    };
    netCents += cents.amountCents - cents.refundedCents - cents.chargedBackCents;
    if (stands(cents)) {
      standingCents += cents.amountCents;
      partialCents += cents.refundedCents;
    }
  }
  const settled = totalCents > 0 && standingCents >= totalCents;
  return {
    settled,
    net: fromCents(netCents),
    overpaid: settled && netCents > totalCents ? fromCents(netCents - totalCents) : 0,
    partiallyRefunded: fromCents(partialCents),
  };
}

export type InvoicePaymentStatusChange = "PAID" | "REOPEN" | null;

/**
 * Welke statuswijziging volgt uit een nieuwe stand van de betalingen?
 * - betaald en de factuur stond nog open: PAID;
 * - niet meer gedekt, terwijl de factuur betaald was dankzij deze online
 *   betalingen (en niet ook via de bank): REOPEN (weer openstaand of te laat);
 * - anders niets.
 */
export function invoicePaymentStatusChange(input: {
  status: string;
  before: InvoicePaymentSummary;
  after: InvoicePaymentSummary;
  paidViaBank: boolean;
}): InvoicePaymentStatusChange {
  if (input.status === "CANCELED") return null;
  if (input.after.settled) return input.status === "PAID" ? null : "PAID";
  if (input.status !== "PAID") return null;
  if (!input.before.settled || input.paidViaBank) return null;
  return "REOPEN";
}
