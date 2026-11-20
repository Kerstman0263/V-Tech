import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { sendInvoiceReminder } from "@/lib/reminders";
import { senderName } from "@/lib/email-templates";
import { emailConfigured } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { recordInvoiceReminder } from "@/lib/reminder-record";
import { reminderPaymentTerms } from "@/lib/invoice-snapshot";
import { CREDITED_MESSAGE } from "@/lib/invoice-credit";

// POST /api/invoices/:id/reminder — stuurt nu handmatig één betaalherinnering.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    // Handmatige herinneringen: max 20 per account per uur (beschermt ons mail-domein)
    rateLimit(`reminder:${user.accountId}`, 20, 60 * 60 * 1000);

    const inv = await db.invoice.findFirst({
      where: { id, userId: user.accountId },
      include: {
        customer: { select: { name: true, email: true } },
        user: { select: { email: true, name: true, company: { select: { name: true, logo: true } }, invoiceSettings: { select: { paymentTerms: true } } } },
      },
    });
    if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (inv.status !== "SENT" && inv.status !== "OVERDUE") return NextResponse.json({ error: "Alleen voor een openstaande factuur kun je een herinnering sturen." }, { status: 409 });
    if (inv.creditedAt) return NextResponse.json({ error: CREDITED_MESSAGE, code: "invoice_credited" }, { status: 409 });
    if (Number(inv.total) <= 0) return NextResponse.json({ error: "Voor een creditfactuur stuur je geen betaalherinnering.", code: "credit_note" }, { status: 409 });
    if (inv.lastReminderAt && Date.now() - inv.lastReminderAt.getTime() < 60_000) return NextResponse.json({ ok: true, already: true });
    if (!inv.customer.email) {
      return NextResponse.json({ error: "no_email" }, { status: 400 });
    }
    if (!emailConfigured()) {
      return NextResponse.json({ error: "email_not_configured" }, { status: 503 });
    }

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
      companyName: senderName({ companyName: inv.user.company?.name, userName: inv.user.name, email: inv.user.email }),
      companyLogo: inv.user.company?.logo,
      // Uitgereikte factuur: de betaalgegevens van de vastgezette factuur (zelfde
      // IBAN als op de PDF, de e-factuur en de QR). Oude factuur zonder: de huidige.
      paymentTerms: reminderPaymentTerms(inv.snapshot, inv.user.invoiceSettings?.paymentTerms),
      reminderNumber: inv.reminderCount + 1,
      replyTo: inv.user.email,
    });

    await recordInvoiceReminder(inv.id, user.accountId, inv.reminderCount, new Date(), user.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
