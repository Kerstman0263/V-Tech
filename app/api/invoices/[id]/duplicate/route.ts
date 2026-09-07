import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";

import { createInvoiceForAccount } from "@/lib/invoice-create";

// POST /api/invoices/:id/duplicate — maakt een nieuwe CONCEPT-factuur op basis
// van een bestaande (zelfde klant en regels, nieuw nummer, datum vandaag).
// Handig voor terugkerende/gelijksoortige facturen aan dezelfde klant.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const userId = user.accountId;
    const { id } = await params;

    const original = await db.invoice.findFirst({
      where: { id, userId },
      include: { lineItems: { orderBy: { position: "asc" } } },
    });
    if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const copy = await createInvoiceForAccount({
      accountId: userId, createdById: user.id, customerId: original.customerId,
      currency: original.currency, notes: original.notes,
      
      lineItems: original.lineItems.map((li) => ({
        description: li.description, quantity: Number(li.quantity),
        unitPrice: Number(li.unitPrice), vatRate: Number(li.vatRate),
      })),
    });

    return NextResponse.json({ id: copy.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
