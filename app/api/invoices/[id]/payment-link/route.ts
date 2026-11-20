import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";
import { createInvoicePayment, invoicePaymentsEnabled } from "@/lib/mollie";
import { CREDITED_MESSAGE } from "@/lib/invoice-credit";

// POST /api/invoices/:id/payment-link — genereer een Mollie "betaal nu"-link.
// Staat uit tot MOLLIE_INVOICE_PAYMENTS=1: tot die tijd betaalt de klant via
// de bankgegevens op de factuur.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    if (!invoicePaymentsEnabled()) {
      return NextResponse.json({ error: "Online betalen voor facturen is nog niet beschikbaar", code: "invoice_payments_disabled" }, { status: 501 });
    }
    const { id } = await params;

    const invoice = await db.invoice.findFirst({
      where: { id, userId: user.accountId },
      select: { id: true, invoiceNumber: true, total: true, currency: true, status: true, creditedAt: true },
    });
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (invoice.status === "PAID" || invoice.status === "CANCELED") {
      return NextResponse.json({ error: "Deze factuur is al afgesloten." }, { status: 409 });
    }
    if (invoice.creditedAt) {
      return NextResponse.json({ error: CREDITED_MESSAGE, code: "invoice_credited" }, { status: 409 });
    }

    const checkoutUrl = await createInvoicePayment({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      total: Number(invoice.total),
      currency: invoice.currency,
    });

    return NextResponse.json({ checkoutUrl });
  } catch (err) {
    return errorResponse(err);
  }
}
