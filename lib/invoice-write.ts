import type { Prisma } from "@prisma/client";
import { calculateInvoiceTotals } from "@/lib/invoice-calc";
import { formatInvoiceNumber } from "@/lib/invoice-settings";
import { HttpError } from "@/lib/http-error";
import { korIssuedYearRevenue, korLinesProblem, korThresholdProblem } from "@/lib/kor";
import { implicitVatScheme, storedVatScheme, vatSchemeProblem, type VatScheme } from "@/lib/vat-scheme";
import { InvoiceRuleError } from "@/lib/invoice-rule-error";
import { parseInvoiceSnapshot } from "@/lib/invoice-snapshot";
export { InvoiceRuleError };

export interface CreateInvoiceOptions {
  accountId: string;
  createdById: string | null;
  customerId: string;
  lineItems: { description: string; quantity: number; unitPrice: number; vatRate: number }[];
  notes?: string | null;
  issueDate?: Date;
  dueDate?: Date | null;
  currency?: string;
  timeEntryIds?: string[];
  /** Datum van levering of dienst, of begin van de periode (leeg = factuurdatum). */
  deliveryDate?: Date | null;
  /** Einde van de periode. */
  deliveryEndDate?: Date | null;
  /** Alleen bij een creditfactuur: de factuur die wordt teruggedraaid. */
  originalInvoice?: { id: string; number: string; date: Date } | null;
  /**
   * Btw-soort (lib/vat-scheme.ts). Leeg = de standaard van de klant, maar alleen
   * als alle regels op 0% staan; anders gewone btw. Een creditfactuur geeft de
   * btw-soort van het origineel mee.
   */
  vatScheme?: VatScheme;
  /** Referentie of inkoopordernummer van de klant (leeg = geen). Een creditfactuur neemt die van het origineel over. */
  buyerReference?: string | null;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Periode van de uren op de factuur: eerste en laatste werkdag (één datum als die gelijk zijn). */
export function deliveryPeriodFromDates(dates: Date[]): { deliveryDate: Date | null; deliveryEndDate: Date | null } {
  const valid = dates.filter((d) => d instanceof Date && !Number.isNaN(d.getTime()));
  if (!valid.length) return { deliveryDate: null, deliveryEndDate: null };
  const first = new Date(Math.min(...valid.map((d) => d.getTime())));
  const last = new Date(Math.max(...valid.map((d) => d.getTime())));
  return { deliveryDate: first, deliveryEndDate: dayKey(first) === dayKey(last) ? null : last };
}

/** The number, invoice, hours and audit entry commit together or all roll back. */
export async function createInvoiceInTransaction(tx: Prisma.TransactionClient, opts: CreateInvoiceOptions) {
  const { accountId } = opts;
  const customer = await tx.customer.findFirst({
    where: { id: opts.customerId, userId: accountId },
    select: { id: true, country: true, vatNumber: true, vatScheme: true },
  });
  if (!customer) throw new HttpError(404, "Klant niet gevonden.");
  const totals = calculateInvoiceTotals(opts.lineItems);
  if ([totals.subtotal, totals.vatAmount, totals.total].some((n) => Math.abs(n) > 99_999_999.99)) {
    throw new HttpError(422, "Het factuurbedrag is te hoog. Controleer aantallen en prijzen.");
  }
  const issueDate = opts.issueDate ?? new Date();

  // Btw-soort en KOR: de server beslist, niet alleen het formulier. Deze
  // controles komen vóór de eerste schrijfactie (de nummerteller), zodat een
  // geweigerde factuur nooit een nummer kost, ook niet als de aanroeper de fout opvangt.
  const korSettings = await tx.invoiceSettings.findUnique({ where: { userId: accountId }, select: { korEnabled: true } });
  const rates = totals.lineItems.map((li) => li.vatRate);
  const isCredit = !!opts.originalInvoice;
  const korEnabled = !!korSettings?.korEnabled;
  const vatScheme = opts.vatScheme ?? implicitVatScheme(customer.vatScheme, rates, korEnabled);
  if (vatScheme === "STANDARD") {
    const korProblem = korLinesProblem(korEnabled, rates, isCredit);
    if (korProblem) throw new InvoiceRuleError(korProblem, "kor_vat");
    if (korEnabled && !isCredit) {
      // Harde grens: alleen uitgereikte facturen (geen concepten, geen
      // REVERSE_EU) plus deze. De ruime telling is alleen voor waarschuwingen.
      const year = issueDate.getUTCFullYear();
      const thresholdProblem = korThresholdProblem({
        korEnabled, year, subtotal: totals.subtotal, revenueBefore: await korIssuedYearRevenue(tx, accountId, year),
      });
      if (thresholdProblem) throw new InvoiceRuleError(thresholdProblem, "kor_threshold");
    }
  } else {
    // Een creditfactuur draait het origineel terug: controleer tegen de
    // gegevens die op het origineel stonden (momentopname), niet tegen de
    // huidige klant. Zonder momentopname (oude factuur): de huidige gegevens.
    const original = isCredit
      ? parseInvoiceSnapshot((await tx.invoice.findFirst({ where: { id: opts.originalInvoice!.id, userId: accountId }, select: { snapshot: true } }))?.snapshot)
      : null;
    const company = original ? null : await tx.company.findUnique({ where: { userId: accountId }, select: { vatNumber: true } });
    const schemeProblem = vatSchemeProblem({
      scheme: vatScheme, lineRates: rates, korEnabled, isCredit,
      customer: original
        ? { country: original.customer.country, vatNumber: original.customer.vatNumber }
        : { country: customer.country, vatNumber: customer.vatNumber },
      seller: { vatNumber: original ? original.seller.vatNumber : company?.vatNumber },
    });
    if (schemeProblem) throw new InvoiceRuleError(schemeProblem, "vat_scheme");
  }

  // UPDATE holds an account-specific row lock until commit; no read-then-write race.
  const settings = await tx.invoiceSettings.update({
    where: { userId: accountId }, data: { nextNumber: { increment: 1 } },
  });
  const number = formatInvoiceNumber(settings.invoicePrefix, settings.nextNumber - 1, settings.numberPadding);
  let dueDate = opts.dueDate ?? null;
  if (opts.dueDate === undefined && settings.defaultDueDays > 0) {
    dueDate = new Date(issueDate);
    dueDate.setUTCDate(dueDate.getUTCDate() + settings.defaultDueDays);
  }
  // Leverdatum: wat de gebruiker invulde, anders de periode van de gefactureerde uren.
  let deliveryDate = opts.deliveryDate ?? null;
  let deliveryEndDate = deliveryDate ? opts.deliveryEndDate ?? null : null;
  const entryIds = [...new Set(opts.timeEntryIds ?? [])];
  if (!deliveryDate && opts.deliveryDate === undefined && entryIds.length) {
    const entries = await tx.timeEntry.findMany({ where: { id: { in: entryIds }, userId: accountId }, select: { date: true } });
    ({ deliveryDate, deliveryEndDate } = deliveryPeriodFromDates(entries.map((e) => e.date)));
  }
  if (deliveryDate && deliveryEndDate && dayKey(deliveryEndDate) === dayKey(deliveryDate)) deliveryEndDate = null;
  const created = await tx.invoice.create({
    data: {
      userId: accountId, createdById: opts.createdById, customerId: opts.customerId,
      invoiceNumber: number, issueDate, dueDate, currency: opts.currency ?? settings.defaultCurrency,
      notes: opts.notes === undefined ? settings.defaultNotes : opts.notes,
      subtotal: totals.subtotal, vatAmount: totals.vatAmount, total: totals.total,
      deliveryDate, deliveryEndDate,
      vatScheme: storedVatScheme(vatScheme),
      buyerReference: opts.buyerReference?.trim() || null,
      originalInvoiceId: opts.originalInvoice?.id ?? null,
      originalInvoiceNumber: opts.originalInvoice?.number ?? null,
      originalInvoiceDate: opts.originalInvoice?.date ?? null,
      lineItems: { create: totals.lineItems.map((li, position) => ({
        description: li.description, quantity: li.quantity, unitPrice: li.unitPrice,
        vatRate: li.vatRate, lineTotal: li.lineTotal, position,
      })) },
    },
    include: { lineItems: true, customer: { select: { name: true, email: true } } },
  });
  const ids = entryIds;
  if (ids.length) {
    const claimed = await tx.timeEntry.updateMany({
      where: {
        id: { in: ids }, userId: accountId, status: "OPEN", invoiceId: null,
        approval: { in: ["APPROVED", "NOT_REQUIRED"] },
        OR: [{ customerId: opts.customerId }, { customerId: null }],
      },
      data: { status: "BILLED", invoiceId: created.id },
    });
    if (claimed.count !== ids.length) {
      throw new HttpError(409, "Een of meer uren zijn al gefactureerd, nog niet goedgekeurd of horen bij een andere klant. Vernieuw de urenlijst en probeer opnieuw.");
    }
  }
  await tx.auditLog.create({ data: {
    platform: false, accountId, actorId: opts.createdById,
    actorName: opts.createdById ? "Accountgebruiker" : "Saldova (automatisch)",
    action: "invoice.created", target: created.invoiceNumber,
  } });
  return created;
}
