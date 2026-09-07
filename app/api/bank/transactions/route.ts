import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";

// GET /api/bank/transactions — banktransacties + info van de (voorgestelde/
// gekoppelde) factuur, zodat de UI de match kan tonen.
export async function GET() {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const userId = user.accountId;

    const txs = await db.bankTransaction.findMany({
      where: { userId },
      orderBy: [{ date: "desc" }, { importedAt: "desc" }],
      take: 500,
    });

    // Betrokken facturen ophalen en mappen.
    const invoiceIds = [...new Set(txs.flatMap((t) => [t.suggestedInvoiceId, t.matchedInvoiceId]).filter(Boolean))] as string[];
    const invoices = invoiceIds.length
      ? await db.invoice.findMany({
          where: { id: { in: invoiceIds }, userId },
          select: { id: true, invoiceNumber: true, total: true, status: true, customer: { select: { name: true } } },
        })
      : [];
    const invById = new Map(invoices.map((i) => [i.id, { id: i.id, invoiceNumber: i.invoiceNumber, total: Number(i.total), status: i.status, customer: i.customer.name }]));

    return NextResponse.json(
      txs.map((t) => ({
        id: t.id,
        date: t.date.toISOString().slice(0, 10),
        amount: Number(t.amount),
        direction: t.direction,
        description: t.description,
        status: t.status,
        suggested: t.suggestedInvoiceId ? invById.get(t.suggestedInvoiceId) ?? null : null,
        matched: t.matchedInvoiceId ? invById.get(t.matchedInvoiceId) ?? null : null,
      })),
    );
  } catch (err) {
    return errorResponse(err);
  }
}
