import { toCents } from "@/lib/money";

export function bankMatchError(
  transaction: { direction: string; amount: number },
  invoice: { total: number; currency: string; status: string },
): string | null {
  if (transaction.direction !== "CREDIT") return "Alleen een ontvangen betaling kan een factuur voldoen.";
  if (!Number.isFinite(transaction.amount) || !Number.isFinite(invoice.total) || invoice.total <= 0 || transaction.amount <= 0) return "Controleer het bedrag van de betaling en de factuur.";
  if (invoice.currency !== "EUR") return "Deze bankimport bevat eurobedragen. Koppel alleen een factuur in euro's.";
  if (!["SENT", "OVERDUE", "PAID"].includes(invoice.status)) return "Alleen een verzonden factuur kan aan een ontvangst worden gekoppeld.";
  if (toCents(transaction.amount) !== toCents(invoice.total)) return "Het ontvangen bedrag is niet gelijk aan het factuurbedrag. De factuur is daarom niet als betaald geboekt.";
  return null;
}

/**
 * Status van een factuur nadat een bankkoppeling is losgemaakt of genegeerd.
 * Alleen een betaalde factuur gaat terug naar openstaand (of te laat als de
 * vervaldatum voorbij is), en alleen als er geen andere betaling meer is: geen
 * andere gekoppelde ontvangst en geen betaalde online betaling.
 * Geeft null als de status moet blijven zoals hij is.
 */
export function invoiceStatusAfterUnmatch(
  invoice: { status: string; dueDate: Date | null },
  otherPayments: { otherMatchedTransaction: boolean; paidOnline: boolean },
  now: Date = new Date(),
): "SENT" | "OVERDUE" | null {
  if (invoice.status !== "PAID") return null;
  if (otherPayments.otherMatchedTransaction || otherPayments.paidOnline) return null;
  return invoice.dueDate && invoice.dueDate.getTime() < now.getTime() ? "OVERDUE" : "SENT";
}

/** Laatste Mollie-gebeurtenis voor een factuur: betaald, of (deels) teruggedraaid? */
export function isPaidOnline(events: { action: string; createdAt: Date }[]): boolean {
  const relevant = events
    .filter((e) => e.action === "invoice.payment_received" || e.action === "invoice.payment_reversed")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return relevant[0]?.action === "invoice.payment_received";
}
