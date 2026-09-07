import type { Prisma } from "@prisma/client";
import { calculateInvoiceTotals } from "@/lib/invoice-calc";
import { formatInvoiceNumber } from "@/lib/invoice-settings";
import { HttpError } from "@/lib/http-error";

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
}

/** The number, invoice, hours and audit entry commit together or all roll back. */
export async function createInvoiceInTransaction(tx: Prisma.TransactionClient, opts: CreateInvoiceOptions) {
  const { accountId } = opts;
  const customer = await tx.customer.findFirst({ where: { id: opts.customerId, userId: accountId }, select: { id: true } });
  if (!customer) throw new HttpError(404, "Klant niet gevonden.");
  const totals = calculateInvoiceTotals(opts.lineItems);
  if ([totals.subtotal, totals.vatAmount, totals.total].some((n) => Math.abs(n) > 99_999_999.99)) {
    throw new HttpError(422, "Het factuurbedrag is te hoog. Controleer aantallen en prijzen.");
  }
  // UPDATE holds an account-specific row lock until commit; no read-then-write race.
  const settings = await tx.invoiceSettings.update({
    where: { userId: accountId }, data: { nextNumber: { increment: 1 } },
  });
  const number = formatInvoiceNumber(settings.invoicePrefix, settings.nextNumber - 1, settings.numberPadding);
  const issueDate = opts.issueDate ?? new Date();
  let dueDate = opts.dueDate ?? null;
  if (opts.dueDate === undefined && settings.defaultDueDays > 0) {
    dueDate = new Date(issueDate);
    dueDate.setUTCDate(dueDate.getUTCDate() + settings.defaultDueDays);
  }
  const created = await tx.invoice.create({
    data: {
      userId: accountId, createdById: opts.createdById, customerId: opts.customerId,
      invoiceNumber: number, issueDate, dueDate, currency: opts.currency ?? settings.defaultCurrency,
      notes: opts.notes === undefined ? settings.defaultNotes : opts.notes,
      subtotal: totals.subtotal, vatAmount: totals.vatAmount, total: totals.total,
      lineItems: { create: totals.lineItems.map((li, position) => ({
        description: li.description, quantity: li.quantity, unitPrice: li.unitPrice,
        vatRate: li.vatRate, lineTotal: li.lineTotal, position,
      })) },
    },
    include: { lineItems: true, customer: { select: { name: true, email: true } } },
  });
  const ids = [...new Set(opts.timeEntryIds ?? [])];
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
