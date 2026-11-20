import type { Prisma } from "@prisma/client";
import { creditNumberFromAuditTarget, originalNumberFromAuditTarget } from "@/lib/credit-reference";

/**
 * Gecrediteerde facturen.
 *
 * Een creditfactuur draait een factuur volledig terug (zelfde regels, negatieve
 * bedragen). De originele factuur blijft bestaan en houdt zijn status (dus
 * verzonden, te laat of betaald): de btw-aangifte en de auditfile tellen het
 * origineel en de creditfactuur allebei, zodat ze elkaar opheffen.
 *
 * Het origineel krijgt `creditedAt` pas als de creditfactuur wordt UITGEREIKT
 * (concept naar verzonden of betaald). Een concept-creditfactuur telt nog niet:
 * juridisch, voor de btw en voor de auditfile staat het origineel dan gewoon
 * open. Vanaf het uitreiken staat het origineel niet meer open:
 * - geen automatische of handmatige betaalherinneringen;
 * - geen nieuwe betaallink;
 * - geen koppeling aan een bankontvangst;
 * - een gecrediteerde aanbetaling wordt niet verrekend op de eindfactuur;
 * - niet meer meegeteld bij "openstaand" en "te laat".
 * Een uitgereikte creditfactuur kan niet meer weg of vervallen, dus
 * `creditedAt` gaat daarna ook niet meer terug.
 *
 * Een creditfactuur zelf (negatief bedrag) is ook geen openstaande vordering.
 */

export const CREDITED_MESSAGE = "Deze factuur is gecrediteerd. Er staat niets meer open.";

const CREDITED_ACTION = "invoice.credited";

/** Staat deze factuur nog open bij de klant? */
export function isOpenReceivable(invoice: {
  status: string;
  total: number | string | { toString(): string };
  creditedAt?: Date | string | null;
}): boolean {
  if (invoice.status !== "SENT" && invoice.status !== "OVERDUE") return false;
  if (invoice.creditedAt) return false;
  return Number(invoice.total) > 0;
}

/** Zelfde regel als isOpenReceivable, als Prisma-filter. */
export const openReceivableWhere = {
  status: { in: ["SENT", "OVERDUE"] },
  creditedAt: null,
  total: { gt: 0 },
} satisfies Prisma.InvoiceWhereInput;

type CreditTx = Pick<Prisma.TransactionClient, "invoice" | "auditLog">;

type Amount = number | string | { toString(): string };

/** Is dit een creditfactuur (vaste verwijzing naar een origineel, of negatief)? */
export function isCreditNote(invoice: { total: Amount; originalInvoiceId?: string | null }): boolean {
  return !!invoice.originalInvoiceId || Number(invoice.total) < 0;
}

/**
 * Bij welk origineel hoort deze creditfactuur?
 * - Nieuwe creditfacturen: de vaste verwijzing (originalInvoiceId).
 * - Oude creditfacturen zonder verwijzing: de logregel "ORIGINEEL → CREDIT".
 *   Factuurnummers kunnen terugkomen (het laatste concept verwijderen zet de
 *   teller één terug). Daarom telt alleen een logregel die is geschreven toen
 *   DEZE creditfactuur al bestond (logregel niet ouder dan de factuur); een
 *   logregel van een eerder, verwijderd concept met hetzelfde nummer telt niet.
 */
export async function findCreditedOriginalId(
  tx: CreditTx,
  accountId: string,
  creditNote: { invoiceNumber: string; total: Amount; originalInvoiceId?: string | null; createdAt?: Date | null },
): Promise<string | null> {
  if (creditNote.originalInvoiceId) return creditNote.originalInvoiceId;
  if (Number(creditNote.total) >= 0) return null;
  const log = await tx.auditLog.findFirst({
    where: {
      accountId, action: CREDITED_ACTION, target: { endsWith: ` → ${creditNote.invoiceNumber}` },
      ...(creditNote.createdAt ? { createdAt: { gte: creditNote.createdAt } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { target: true },
  });
  const number = originalNumberFromAuditTarget(log?.target, creditNote.invoiceNumber);
  if (!number) return null;
  const original = await tx.invoice.findFirst({
    where: { userId: accountId, invoiceNumber: number, total: { gt: 0 } },
    select: { id: true },
  });
  return original?.id ?? null;
}

/**
 * Een creditfactuur wordt uitgereikt (concept naar verzonden of betaald): zet
 * het origineel op gecrediteerd. Doet niets bij een gewone factuur, en laat een
 * al gezette datum staan. Roep dit aan in dezelfde transactie als de
 * statuswijziging.
 */
export async function markOriginalCredited(
  tx: CreditTx,
  accountId: string,
  creditNote: { id: string; invoiceNumber: string; total: Amount; originalInvoiceId?: string | null; createdAt?: Date | null },
): Promise<void> {
  if (!isCreditNote(creditNote)) return;
  const originalId = await findCreditedOriginalId(tx, accountId, creditNote);
  if (!originalId || originalId === creditNote.id) return;
  await tx.invoice.updateMany({
    where: { id: originalId, userId: accountId, creditedAt: null, total: { gt: 0 } },
    data: { creditedAt: new Date() },
  });
}

/**
 * Bestaat er voor dit origineel een creditfactuur met deze status?
 * Zoekt op de vaste verwijzing en, voor oude creditfacturen zonder verwijzing,
 * via het logboek. Ook hier telt een logregel alleen als hij bij de huidige
 * factuur met dat nummer hoort (niet ouder dan die factuur): een hergebruikt
 * nummer van een verwijderd concept telt niet mee.
 * Geeft het nummer van de creditfactuur terug, of null.
 */
export async function findCreditNoteFor(
  tx: CreditTx,
  accountId: string,
  original: { id: string; invoiceNumber: string },
  status: Prisma.InvoiceWhereInput["status"],
): Promise<string | null> {
  const linked = await tx.invoice.findFirst({
    where: { userId: accountId, originalInvoiceId: original.id, total: { lt: 0 }, status },
    select: { invoiceNumber: true },
  });
  if (linked) return linked.invoiceNumber;

  const logs = await tx.auditLog.findMany({
    where: { accountId, action: CREDITED_ACTION, target: { startsWith: `${original.invoiceNumber} → ` } },
    orderBy: { createdAt: "desc" },
    select: { target: true, createdAt: true },
    take: 20,
  });
  // Per creditnummer de nieuwste logregel.
  const loggedAt = new Map<string, Date>();
  for (const log of logs) {
    const number = creditNumberFromAuditTarget(log.target, original.invoiceNumber);
    if (number && !loggedAt.has(number)) loggedAt.set(number, log.createdAt);
  }
  if (loggedAt.size === 0) return null;
  const candidates = await tx.invoice.findMany({
    where: { userId: accountId, invoiceNumber: { in: [...loggedAt.keys()] }, total: { lt: 0 }, originalInvoiceId: null, status },
    select: { invoiceNumber: true, createdAt: true },
  });
  const match = candidates.find((c) => {
    const at = loggedAt.get(c.invoiceNumber);
    return !!at && at.getTime() >= c.createdAt.getTime();
  });
  return match?.invoiceNumber ?? null;
}
