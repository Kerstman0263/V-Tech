import type { Prisma } from "@prisma/client";
import { FISCAL_RATES, FISCAL_YEARS, type FiscalYear } from "@/lib/fiscal-rates";
import { fromCents, toCents } from "@/lib/money";
import { InvoiceRuleError } from "@/lib/invoice-rule-error";

/**
 * Kleineondernemersregeling (KOR): regels die bij elke factuur gelden.
 *
 * - Onder de KOR reken je geen btw. Een factuur met 9% of 21% btw moet je
 *   gewoon afdragen, ook als de KOR aan staat. De server weigert die daarom.
 * - De KOR geldt tot een omzet van 20.000 euro per kalenderjaar. Ga je met een
 *   factuur over die grens, dan stopt de KOR vanaf die factuur en reken je weer
 *   btw. De server weigert dan een factuur zonder btw onder de KOR.
 *
 * Twee manieren van tellen:
 * - Waarschuwingen (dashboard, btw-pagina, nieuwe factuur) tellen ruim: alle
 *   facturen van het jaar in euro's die niet vervallen zijn, ook concepten en
 *   facturen naar het buitenland. Zo waarschuwt Saldova eerder, nooit te laat.
 * - De harde weigering telt alleen wat echt omzet is: uitgereikte facturen
 *   (verzonden, betaald of te laat) plus de nieuwe factuur, zonder diensten aan
 *   EU-bedrijven met btw verlegd (REVERSE_EU: belast in het land van de
 *   afnemer, telt niet mee voor de Nederlandse omzetgrens). Zo dwingt Saldova
 *   een ondernemer onder de grens nooit om btw te rekenen.
 * Creditfacturen tellen in beide gevallen negatief mee.
 */
export const KOR_DEFAULT_THRESHOLD = 20_000;
/** Vanaf deze omzet waarschuwt Saldova dat de grens nadert. */
export const KOR_WARNING_FROM = 18_000;

export function korThreshold(year: number): number {
  return FISCAL_YEARS.includes(year as FiscalYear) ? FISCAL_RATES[year as FiscalYear].korThreshold : KOR_DEFAULT_THRESHOLD;
}

export type KorLevel = "ok" | "near" | "over";

/** Waar staat deze jaaromzet (excl. btw) ten opzichte van de KOR-grens? */
export function korLevel(revenue: number, year: number): KorLevel {
  const cents = toCents(revenue);
  if (cents > toCents(korThreshold(year))) return "over";
  if (cents >= toCents(Math.min(KOR_WARNING_FROM, korThreshold(year)))) return "near";
  return "ok";
}

/** Onder de KOR staat er geen btw op een factuur. Een creditfactuur volgt het origineel. */
export function korLinesProblem(korEnabled: boolean, lineRates: number[], isCredit = false): string | null {
  if (!korEnabled || isCredit) return null;
  if (lineRates.every((rate) => Number(rate) === 0)) return null;
  return "De kleineondernemersregeling (KOR) staat aan. Dan zet je geen btw op een factuur: zet alle regels op 0%. Reken je wel btw, zet dan eerst de KOR uit bij Factuurinstellingen.";
}

/**
 * Brengt deze factuur de jaaromzet boven de KOR-grens? Dan geldt de KOR vanaf
 * deze factuur niet meer en moet er btw op. Alleen bij KOR aan en een positief bedrag.
 */
export function korThresholdProblem(input: { korEnabled: boolean; year: number; revenueBefore: number; subtotal: number }): string | null {
  if (!input.korEnabled || input.subtotal <= 0) return null;
  const threshold = korThreshold(input.year);
  const after = fromCents(toCents(input.revenueBefore) + toCents(input.subtotal));
  if (toCents(after) <= toCents(threshold)) return null;
  return `Met deze factuur kom je in ${input.year} boven de KOR-grens van ${threshold.toLocaleString("nl-NL")} euro omzet. Vanaf deze factuur geldt de KOR niet meer en reken je btw. Zet de KOR uit bij Factuurinstellingen en maak de factuur opnieuw met btw. Twijfel je? Overleg met je boekhouder.`;
}

function yearRange(year: number) {
  return { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
}

/** Omzet (excl. btw) in euro's van dit kalenderjaar: alle niet-vervallen facturen, ook concepten. */
export async function korYearRevenue(client: Pick<Prisma.TransactionClient, "invoice">, accountId: string, year: number): Promise<number> {
  const sum = await client.invoice.aggregate({
    where: { userId: accountId, status: { not: "CANCELED" }, currency: "EUR", issueDate: yearRange(year) },
    _sum: { subtotal: true },
  });
  return fromCents(toCents(Number(sum._sum.subtotal ?? 0)));
}

/** Statussen van een uitgereikte factuur (geen concept, niet vervallen). */
export const KOR_ISSUED_STATUSES = ["SENT", "PAID", "OVERDUE"] as const;

/**
 * Omzet (excl. btw) in euro's voor de harde KOR-grens: alleen uitgereikte
 * facturen, zonder REVERSE_EU (diensten belast in het land van de afnemer).
 * Intracommunautaire leveringen (ICL) en btw verlegd binnen Nederland tellen
 * wel mee (veilige kant: dat is omzet van een levering of dienst in Nederland).
 */
export async function korIssuedYearRevenue(client: Pick<Prisma.TransactionClient, "invoice">, accountId: string, year: number): Promise<number> {
  const sum = await client.invoice.aggregate({
    where: {
      userId: accountId, status: { in: [...KOR_ISSUED_STATUSES] }, currency: "EUR", issueDate: yearRange(year),
      // Let op: een lege btw-soort (gewone btw, oude facturen) moet meetellen.
      OR: [{ vatScheme: null }, { vatScheme: { not: "REVERSE_EU" } }],
    },
    _sum: { subtotal: true },
  });
  return fromCents(toCents(Number(sum._sum.subtotal ?? 0)));
}

/**
 * Harde KOR-grens bij het uitreiken van een concept: telt de uitgereikte
 * facturen van dat jaar plus deze. Alleen bij KOR aan, gewone btw, geen credit.
 */
export async function korIssueThresholdProblem(
  client: Pick<Prisma.TransactionClient, "invoice">,
  accountId: string,
  invoice: { korEnabled: boolean; vatScheme: string; isCredit: boolean; subtotal: number; issueDate: Date },
): Promise<string | null> {
  if (!invoice.korEnabled || invoice.isCredit || invoice.vatScheme !== "STANDARD" || invoice.subtotal <= 0) return null;
  const year = invoice.issueDate.getUTCFullYear();
  return korThresholdProblem({
    korEnabled: true, year, subtotal: invoice.subtotal, revenueBefore: await korIssuedYearRevenue(client, accountId, year),
  });
}

/** Voor waarschuwingen op het dashboard, de btw-pagina en bij een nieuwe factuur. */
export async function korYearStatus(client: Pick<Prisma.TransactionClient, "invoice">, accountId: string, year: number) {
  const revenue = await korYearRevenue(client, accountId, year);
  return { year, revenue, threshold: korThreshold(year), level: korLevel(revenue, year) };
}

/** Gooit 422 als de KOR aan staat en een regel btw heeft (offertes, periodieke sjablonen). */
export function assertKorAllowsRates(korEnabled: boolean, lineRates: number[]): void {
  const problem = korLinesProblem(korEnabled, lineRates);
  if (problem) throw new InvoiceRuleError(problem, "kor_vat");
}

/** Zelfde, maar leest de KOR-stand van het account. */
export async function assertAccountKorAllowsRates(client: Pick<Prisma.TransactionClient, "invoiceSettings">, accountId: string, lineRates: number[]): Promise<void> {
  const settings = await client.invoiceSettings.findUnique({ where: { userId: accountId }, select: { korEnabled: true } });
  assertKorAllowsRates(!!settings?.korEnabled, lineRates);
}
