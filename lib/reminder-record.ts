import { db } from "@/lib/db";

/** Called after provider acceptance; concurrent callbacks count once. */
export async function recordInvoiceReminder(invoiceId: string, accountId: string, previousCount: number, now: Date, actorId: string | null) {
  return db.$transaction(async (tx) => {
    const updated = await tx.invoice.updateMany({
      where: { id: invoiceId, userId: accountId, reminderCount: previousCount },
      data: { reminderCount: { increment: 1 }, lastReminderAt: now },
    });
    if (!updated.count) return false;
    await tx.auditLog.create({ data: {
      accountId, actorId, actorName: actorId ? "Accountgebruiker" : "Saldova (automatisch)",
      action: "invoice.reminder_sent", target: invoiceId,
    } });
    return true;
  });
}
