import { fromCents, percentageOfCents, toCents } from "@/lib/money";

/**
 * Rekenregels tussen offerte en factuur (puur, zonder database).
 */

export interface MoneyLine {
  vatRate: number | string | { toString(): string };
  lineTotal: number | string | { toString(): string };
}

/** Netto bedrag per btw-tarief, in centen. Volgorde: hoogste tarief eerst. */
export function netCentsByVatRate(lines: MoneyLine[]): { vatRate: number; netCents: number }[] {
  const byRate = new Map<number, number>();
  for (const line of lines) {
    const rate = Number(line.vatRate);
    byRate.set(rate, (byRate.get(rate) ?? 0) + toCents(Number(line.lineTotal)));
  }
  return [...byRate.entries()]
    .map(([vatRate, netCents]) => ({ vatRate, netCents }))
    .sort((a, b) => b.vatRate - a.vatRate);
}

/**
 * Aanbetalingsregels: per btw-tarief het netto bedrag x percentage, afgerond in
 * centen. Zo krijgt elk tarief zijn eigen, kloppende btw.
 */
export function depositLines(lines: MoneyLine[], percent: number, quoteNumber: string) {
  const parts = netCentsByVatRate(lines)
    .map(({ vatRate, netCents }) => ({ vatRate, cents: percentageOfCents(netCents, percent) }))
    .filter(({ cents }) => cents > 0);
  return parts.map(({ vatRate, cents }) => ({
    description: `Aanbetaling ${percent}% — offerte ${quoteNumber}${parts.length > 1 ? ` (deel met ${vatRate}% btw)` : ""}`,
    quantity: 1,
    unitPrice: fromCents(cents),
    vatRate,
  }));
}

/**
 * Verrekening op de eindfactuur: per btw-tarief van de aanbetalingsfactuur een
 * negatieve regel, zodat de klant de aanbetaling niet twee keer betaalt.
 */
export function depositSettlementLines(depositInvoice: { invoiceNumber: string; lineItems: MoneyLine[] }) {
  return netCentsByVatRate(depositInvoice.lineItems)
    .filter(({ netCents }) => netCents > 0)
    .map(({ vatRate, netCents }) => ({
      description: `Reeds gefactureerde aanbetaling ${depositInvoice.invoiceNumber}`,
      quantity: 1,
      unitPrice: -fromCents(netCents),
      vatRate,
    }));
}

export type QuoteConvertCheck = { ok: true } | { ok: false; status: number; error: string; code: string };

/** Mag deze offerte nu een factuur worden? */
export function quoteConvertCheck(status: string, confirmed: boolean): QuoteConvertCheck {
  if (status === "ACCEPTED") return { ok: true };
  if (status === "SENT") {
    return confirmed
      ? { ok: true }
      : { ok: false, status: 409, code: "confirm_required", error: "De klant heeft deze offerte nog niet geaccepteerd. Bevestig dat je hem toch wilt omzetten naar een factuur." };
  }
  return { ok: false, status: 409, code: "not_accepted", error: "Alleen een geaccepteerde (of verzonden) offerte kun je omzetten naar een factuur." };
}
