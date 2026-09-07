import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendInvoiceReminder } from "@/lib/reminders";
import { runDueRecurringInvoices } from "@/lib/recurring";
import { runTrialReminders } from "@/lib/trial-emails";
import { recordInvoiceReminder } from "@/lib/reminder-record";

// GET /api/cron/send-reminders — dagelijks door Vercel-cron aangeroepen.
// Beveiligd met CRON_SECRET (Vercel stuurt automatisch `Authorization: Bearer <CRON_SECRET>`).
// Zet verlopen facturen op OVERDUE en stuurt betaalherinneringen volgens de
// instellingen van elk account (aan/uit, interval, max).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // In productie nooit zonder secret draaien.
    return NextResponse.json({ error: "CRON_SECRET niet geconfigureerd" }, { status: 500 });
  }

  const now = new Date();

  // 1) Verlopen facturen automatisch op OVERDUE zetten
  const flipped = await db.invoice.updateMany({
    where: { status: "SENT", dueDate: { lt: now } },
    data: { status: "OVERDUE" },
  });

  // 2) Herinneringen sturen voor openstaande, verlopen facturen
  const invoices = await db.invoice.findMany({
    where: { status: "OVERDUE", dueDate: { lt: now } },
    include: {
      customer: { select: { name: true, email: true } },
      user: {
        select: {
          email: true,
          company: { select: { name: true } },
          invoiceSettings: {
            select: { reminderEnabled: true, reminderIntervalDays: true, reminderMaxCount: true, paymentTerms: true },
          },
        },
      },
    },
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const inv of invoices) {
    const s = inv.user.invoiceSettings;
    const enabled = s?.reminderEnabled ?? true;
    const interval = s?.reminderIntervalDays ?? 7;
    const max = s?.reminderMaxCount ?? 3;

    const dueForReminder =
      enabled &&
      inv.customer.email &&
      inv.reminderCount < max &&
      (!inv.lastReminderAt || now.getTime() - inv.lastReminderAt.getTime() >= interval * 86_400_000);

    if (!dueForReminder) {
      skipped++;
      continue;
    }

    try {
    await sendInvoiceReminder({
      invoice: {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        total: Number(inv.total),
        currency: inv.currency,
        dueDate: inv.dueDate,
      },
      customerName: inv.customer.name,
      customerEmail: inv.customer.email,
      companyName: inv.user.company?.name ?? "Saldova",
      paymentTerms: s?.paymentTerms ?? null,
      reminderNumber: inv.reminderCount + 1,
      replyTo: inv.user.email,
    });

    if (await recordInvoiceReminder(inv.id, inv.userId, inv.reminderCount, now, null)) sent++;
    } catch (error) {
      failed++;
      console.error("invoice_reminder_failed", { type: error instanceof Error ? error.name : "UnknownError" });
    }
  }

  // 3) Periodieke facturen die vandaag aan de beurt zijn aanmaken (zelfde dagelijkse run)
  let recurring = { created: 0, sent: 0, failed: 0 };
  try {
    recurring = await runDueRecurringInvoices(now);
  } catch (err) {
    console.error("recurring_job_failed", { type: err instanceof Error ? err.name : "UnknownError" });
  }

  // 4) Proefperiode-herinneringen voor bedrijven (7/3/1 dagen + verlopen)
  let trial = { scanned: 0, sent: 0, failed: 0 };
  try {
    trial = await runTrialReminders(now);
  } catch (err) {
    console.error("trial_job_failed", { type: err instanceof Error ? err.name : "UnknownError" });
  }

  return NextResponse.json({ ok: true, markedOverdue: flipped.count, sent, skipped, failed, scanned: invoices.length, recurring, trial });
}
