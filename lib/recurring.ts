import { db } from "@/lib/db";
import { createInvoiceInTransaction } from "@/lib/invoice-write";
import { getOrCreateInvoiceSettings } from "@/lib/invoice-settings";
import { serializableTransaction } from "@/lib/transaction";
import { HttpError } from "@/lib/http-error";
import { sendInvoiceEmail } from "@/lib/invoice-send";
import { recurringLineItemsSchema, type RecurringInterval } from "@/lib/validations/recurring";


/**
 * Volgende factuurdatum na `from`. Maandelijks/kwartaal/jaar houdt de dag
 * van de maand vast en klemt op maandeinde (31 jan -> 28 feb).
 */
export function nextRunAfter(from: Date, interval: RecurringInterval): Date {
  const d = new Date(from);
  if (interval === "WEEKLY") {
    d.setDate(d.getDate() + 7);
    return d;
  }
  const months = interval === "MONTHLY" ? 1 : interval === "QUARTERLY" ? 3 : 12;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const daysInTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, daysInTarget));
  return d;
}

/** Claim a schedule and create its invoice in one database transaction. */
export async function createRecurringRun(id: string, accountId: string, expectedRun: Date, now: Date, actorId: string | null) {
  await getOrCreateInvoiceSettings(accountId);
  return serializableTransaction(async (tx) => {
    const rec = await tx.recurringInvoice.findFirst({ where: { id, userId: accountId } });
    if (!rec) throw new HttpError(404, "Periodieke factuur niet gevonden.");
    if (rec.nextRunAt.getTime() !== expectedRun.getTime()) return null;
    const parsed = recurringLineItemsSchema.safeParse(rec.lineItems);
    if (!parsed.success) throw new HttpError(422, "Controleer de regels van de periodieke factuur.");
    let next = nextRunAfter(rec.nextRunAt, rec.interval);
    while (next <= now) next = nextRunAfter(next, rec.interval);
    const claimed = await tx.recurringInvoice.updateMany({
      where: { id, userId: accountId, nextRunAt: expectedRun },
      data: { nextRunAt: next, lastRunAt: now, runCount: { increment: 1 } },
    });
    if (!claimed.count) return null;
    const invoice = await createInvoiceInTransaction(tx, {
      accountId, createdById: actorId, customerId: rec.customerId,
      lineItems: parsed.data, notes: rec.notes, issueDate: now,
    });
    await tx.auditLog.create({ data: {
      accountId, actorId, actorName: actorId ? "Accountgebruiker" : "Saldova (automatisch)",
      action: "invoice.recurring_created", target: invoice.invoiceNumber,
    } });
    return { invoice, autoSend: rec.autoSend };
  });
}

/** One invoice per due schedule; failed mail leaves that invoice available. */
export async function runDueRecurringInvoices(now: Date = new Date()): Promise<{ created: number; sent: number; failed: number }> {
  const due = await db.recurringInvoice.findMany({ where: { active: true, nextRunAt: { lte: now } }, take: 500 });
  let created = 0, sent = 0, failed = 0;
  for (const rec of due) {
    try {
      const run = await createRecurringRun(rec.id, rec.userId, rec.nextRunAt, now, null);
      if (!run) continue;
      created++;
      if (run.autoSend) {
        if (await sendInvoiceEmail(run.invoice.id, rec.userId) === "sent") sent++;
        else failed++;
      }
    } catch (error) {
      console.error("recurring_invoice_failed", { type: error instanceof Error ? error.name : "UnknownError" });
      failed++;
    }
  }
  return { created, sent, failed };
}
