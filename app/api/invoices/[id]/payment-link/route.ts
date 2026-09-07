import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";
import { createInvoicePayment } from "@/lib/mollie";

// POST /api/invoices/:id/payment-link — genereer een Mollie "betaal nu"-link
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;

    const invoice = await db.invoice.findFirst({
      where: { id, userId: user.accountId },
      select: { id: true, invoiceNumber: true, total: true, currency: true, status: true },
    });
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (invoice.status === "PAID" || invoice.status === "CANCELED") {
      return NextResponse.json({ error: "Deze factuur is al afgesloten." }, { status: 409 });
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
