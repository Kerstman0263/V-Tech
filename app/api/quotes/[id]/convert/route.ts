import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getOrCreateInvoiceSettings } from "@/lib/invoice-settings";
import { createInvoiceInTransaction } from "@/lib/invoice-write";
import { serializableTransaction } from "@/lib/transaction";
import { HttpError } from "@/lib/http-error";

// POST /api/quotes/:id/convert — zet een (geaccepteerde) offerte om in een factuur.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const userId = user.accountId;
    const { id } = await params;

    const quote = await db.quote.findFirst({
      where: { id, userId },
      include: { lineItems: { orderBy: { position: "asc" } } },
    });
    if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (quote.convertedInvoiceId) {
      return NextResponse.json({ invoiceId: quote.convertedInvoiceId, already: true });
    }

    await getOrCreateInvoiceSettings(userId);

    const invoice = await serializableTransaction(async (tx) => {
      const current = await tx.quote.findFirst({ where: { id: quote.id, userId }, include: { lineItems: { orderBy: { position: "asc" } } } });
      if (!current) throw new HttpError(404, "Offerte niet gevonden.");
      if (current?.convertedInvoiceId) return { id: current.convertedInvoiceId };
      const created = await createInvoiceInTransaction(tx, {
        accountId: userId, createdById: user.id, customerId: current.customerId,
        currency: current.currency, notes: current.notes,
        lineItems: current.lineItems.map((li) => ({ description: li.description,
          quantity: Number(li.quantity), unitPrice: Number(li.unitPrice), vatRate: Number(li.vatRate),
        })),
      });
      await tx.quote.update({ where: { id: quote.id, userId }, data: { status: "CONVERTED", convertedInvoiceId: created.id } });
      return created;
    });

    return NextResponse.json({ invoiceId: invoice.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
