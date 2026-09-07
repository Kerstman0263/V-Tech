import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { sendInvoiceEmail } from "@/lib/invoice-send";
import { createRecurringRun } from "@/lib/recurring";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    rateLimit(`recurring-run:${user.accountId}`, 30, 60 * 60 * 1000);
    const rec = await db.recurringInvoice.findFirst({ where: { id, userId: user.accountId } });
    if (!rec) return NextResponse.json({ error: "Periodieke factuur niet gevonden." }, { status: 404 });
    const run = await createRecurringRun(id, user.accountId, rec.nextRunAt, new Date(), user.id);
    if (!run) return NextResponse.json({ error: "Deze factuur is net al aangemaakt. Vernieuw het overzicht." }, { status: 409 });
    let emailed = false;
    if (run.autoSend) {
      try { emailed = await sendInvoiceEmail(run.invoice.id, user.accountId) === "sent"; }
      catch { /* The created draft remains available for a manual retry. */ }
    }
    return NextResponse.json({ ok: true, invoiceId: run.invoice.id, invoiceNumber: run.invoice.invoiceNumber, emailed }, { status: 201 });
  } catch (err) { return errorResponse(err); }
}
