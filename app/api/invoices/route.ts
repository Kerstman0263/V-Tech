import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";
import { createInvoiceSchema } from "@/lib/validations/invoice";
import { createInvoiceForAccount } from "@/lib/invoice-create";
import { assertCanCreateInvoice } from "@/lib/plan-limits";


// GET /api/invoices — facturen van de ingelogde gebruiker
export async function GET() {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const invoices = await db.invoice.findMany({
      where: { userId: user.accountId },
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(invoices);
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/invoices — nieuwe factuur (incl. regels), nummering uit instellingen
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const userId = user.accountId;

    const parsed = createInvoiceSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const data = parsed.data;
    await assertCanCreateInvoice(userId);

    const invoice = await createInvoiceForAccount({
      accountId: userId, createdById: user.id, customerId: data.customerId,
      lineItems: data.lineItems, notes: data.notes, issueDate: data.issueDate,
      dueDate: data.dueDate, timeEntryIds: data.timeEntryIds,
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
