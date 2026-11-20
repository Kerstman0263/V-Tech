/**
 * Verwijzing van een creditfactuur naar de originele factuur (nummer en
 * datum), voor de kop "CREDITFACTUUR" en de vaste regel
 * "Creditfactuur voor factuur X van <datum>" op de PDF.
 *
 * Nieuwe creditfacturen hebben het nummer en de datum zelf opgeslagen.
 * Oude creditfacturen niet: die zoeken we op via het logboek
 * ("invoice.credited", doel "ORIGINEEL → CREDIT").
 */

export interface CreditReference {
  number: string;
  date: Date | null;
}

const ARROW = " → ";

/** "2026-0007 → 2026-0012" en creditnummer "2026-0012" -> "2026-0007". */
export function originalNumberFromAuditTarget(target: string | null | undefined, creditNumber: string): string | null {
  if (!target) return null;
  const suffix = `${ARROW}${creditNumber}`;
  if (!target.endsWith(suffix)) return null;
  const original = target.slice(0, -suffix.length).trim();
  return original || null;
}

/** "2026-0007 → 2026-0012" en origineel "2026-0007" -> "2026-0012". */
export function creditNumberFromAuditTarget(target: string | null | undefined, originalNumber: string): string | null {
  if (!target) return null;
  const prefix = `${originalNumber}${ARROW}`;
  if (!target.startsWith(prefix)) return null;
  const credit = target.slice(prefix.length).trim();
  return credit || null;
}

/** Een factuur is een creditfactuur als hij naar een origineel verwijst of negatief is. */
export function isCreditInvoice(invoice: { total: number; originalInvoiceNumber?: string | null }): boolean {
  return !!invoice.originalInvoiceNumber || invoice.total < 0;
}

export interface CreditLookupDb {
  auditLog: {
    findFirst(args: {
      where: { accountId: string; action: string; target: { endsWith: string } };
      orderBy: { createdAt: "desc" };
      select: { target: true };
    }): Promise<{ target: string | null } | null>;
  };
  invoice: {
    findFirst(args: {
      where: { userId: string; invoiceNumber: string };
      select: { issueDate: true };
    }): Promise<{ issueDate: Date } | null>;
  };
}

/**
 * Oude creditfacturen beginnen hun opmerkingen met de zin van de credit-route
 * ("Creditfactuur voor factuur {number}."). Geeft dat nummer terug, of null.
 * `templates` zijn die zinnen in elke taal, met {number} als plek.
 */
export function originalNumberFromNotes(notes: string | null | undefined, templates: string[]): string | null {
  if (!notes) return null;
  const text = notes.trimStart();
  for (const template of templates) {
    const at = template.indexOf("{number}");
    if (at < 0) continue;
    const before = template.slice(0, at);
    const after = template.slice(at + "{number}".length);
    if (!text.startsWith(before)) continue;
    const rest = text.slice(before.length);
    // Het nummer loopt tot de eerste spatie of het einde van de zin.
    const match = /^(\S+)/.exec(rest);
    if (!match) continue;
    let number = match[1];
    if (after && number.endsWith(after)) number = number.slice(0, -after.length);
    if (number) return number;
  }
  return null;
}

export async function resolveCreditReference(
  db: CreditLookupDb,
  accountId: string,
  invoice: { invoiceNumber: string; total: number; originalInvoiceNumber?: string | null; originalInvoiceDate?: Date | null; notes?: string | null },
  noteTemplates: string[] = [],
): Promise<CreditReference | null> {
  if (invoice.originalInvoiceNumber) {
    return { number: invoice.originalInvoiceNumber, date: invoice.originalInvoiceDate ?? null };
  }
  if (invoice.total >= 0) return null;
  // Oude creditfactuur: via het logboek, en anders via de zin in de opmerkingen.
  // Mislukt de database, dan blijft de PDF gewoon werken.
  let number: string | null = null;
  try {
    const log = await db.auditLog.findFirst({
      where: { accountId, action: "invoice.credited", target: { endsWith: `${ARROW}${invoice.invoiceNumber}` } },
      orderBy: { createdAt: "desc" },
      select: { target: true },
    });
    number = originalNumberFromAuditTarget(log?.target, invoice.invoiceNumber);
  } catch {
    number = null;
  }
  number ??= originalNumberFromNotes(invoice.notes, noteTemplates);
  if (!number) return null;
  try {
    const original = await db.invoice.findFirst({ where: { userId: accountId, invoiceNumber: number }, select: { issueDate: true } });
    return { number, date: original?.issueDate ?? null };
  } catch {
    return { number, date: null };
  }
}
