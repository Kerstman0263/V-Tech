import type { LineItemInput } from "@/lib/validations/invoice";

/**
 * Berekent factuurtotalen op basis van de regels.
 * Werkt in centen-precisie via afronding op 2 decimalen om float-fouten
 * te minimaliseren. De definitieve waarden gaan als Decimal naar de DB.
 */
export function calculateInvoiceTotals(lineItems: LineItemInput[]) {
  let subtotal = 0;
  let vatAmount = 0;

  const computed = lineItems.map((item) => {
    const lineNet = round2(item.quantity * item.unitPrice);
    const lineVat = round2(lineNet * (item.vatRate / 100));
    subtotal = round2(subtotal + lineNet);
    vatAmount = round2(vatAmount + lineVat);
    return { ...item, lineTotal: lineNet };
  });

  return {
    lineItems: computed,
    subtotal,
    vatAmount,
    total: round2(subtotal + vatAmount),
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
