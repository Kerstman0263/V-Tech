import { fromCents, percentageOfCents, toCents } from "@/lib/money";

export interface VatGroup {
  /** Btw-tarief in procenten (0, 9, 21). */
  rate: number;
  /** Grondslag: som van de regelbedragen excl. btw met dit tarief. */
  base: number;
  /** Btw over deze grondslag: som van de per regel afgeronde btw. */
  vat: number;
}

/**
 * Btw per tarief (art. 35a Wet OB): grondslag en btw-bedrag per tarief.
 * Zelfde rekenwijze als lib/invoice-calc.ts (btw per regel in centen
 * afgerond en dan opgeteld), dus PDF en UBL tellen op tot het opgeslagen totaal.
 * Volgorde: hoogste tarief eerst.
 */
export function vatBreakdown(lineItems: { lineTotal: number; vatRate: number }[]): VatGroup[] {
  const groups = new Map<number, { net: number; vat: number }>();
  for (const li of lineItems) {
    const net = toCents(li.lineTotal);
    const g = groups.get(li.vatRate) ?? { net: 0, vat: 0 };
    g.net += net;
    g.vat += percentageOfCents(net, li.vatRate);
    groups.set(li.vatRate, g);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([rate, g]) => ({ rate, base: fromCents(g.net), vat: fromCents(g.vat) }));
}
