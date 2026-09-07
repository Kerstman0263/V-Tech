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
