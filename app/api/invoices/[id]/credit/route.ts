import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";

import { createInvoiceForAccount } from "@/lib/invoice-create";
import { getTranslations } from "next-intl/server";

// POST /api/invoices/:id/credit — maakt een CREDITFACTUUR: een nieuwe factuur
// die de originele terugdraait (zelfde regels, maar NEGATIEVE bedragen), met een
// nieuw nummer en een verwijzing naar de originele factuur.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const userId = user.accountId;
    const { id } = await params;

    const original = await db.invoice.findFirst({
      where: { id, userId },
      include: { lineItems: { orderBy: { position: "asc" } }, user: { select: { locale: true } } },
    });
    if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const t = await getTranslations({ locale: original.user.locale ?? "nl", namespace: "invoices" });
    const creditNote = t("creditNote", { number: original.invoiceNumber });
    const credit = await createInvoiceForAccount({
      accountId: userId, createdById: user.id, customerId: original.customerId,
      currency: original.currency, notes: [creditNote, original.notes].filter(Boolean).join("\n\n"),
      dueDate: null,
      lineItems: original.lineItems.map((li) => ({
        description: li.description, quantity: -Number(li.quantity),
        unitPrice: Number(li.unitPrice), vatRate: Number(li.vatRate),
      })),
    });

    return NextResponse.json({ id: credit.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
