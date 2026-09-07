import type { LineItemInput } from "@/lib/validations/invoice";
import { fromCents, multiplyToCents, percentageOfCents, toCents } from "@/lib/money";

/**
 * Berekent factuurtotalen op basis van de regels.
 * Werkt in centen-precisie via afronding op 2 decimalen om float-fouten
 * te minimaliseren. De definitieve waarden gaan als Decimal naar de DB.
 */
export function calculateInvoiceTotals(lineItems: LineItemInput[]) {
  let subtotal = 0;
  let vatAmount = 0;

  const computed = lineItems.map((item) => {
    const quantity = fromCents(toCents(item.quantity));
    const unitPrice = fromCents(toCents(item.unitPrice));
    const vatRate = fromCents(toCents(item.vatRate));
    const lineNet = multiplyToCents(quantity, unitPrice);
    const lineVat = percentageOfCents(lineNet, vatRate);
    subtotal += lineNet;
    vatAmount += lineVat;
    return { ...item, quantity, unitPrice, vatRate, lineTotal: fromCents(lineNet) };
  });

  return {
    lineItems: computed,
    subtotal: fromCents(subtotal),
    vatAmount: fromCents(vatAmount),
    total: fromCents(subtotal + vatAmount),
  };
}
