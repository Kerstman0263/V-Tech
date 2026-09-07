import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { createRecurringSchema } from "@/lib/validations/recurring";
import { calculateInvoiceTotals } from "@/lib/invoice-calc";

// GET /api/recurring — periodieke facturen van het account
export async function GET() {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const items = await db.recurringInvoice.findMany({
      where: { userId: user.accountId },
      include: { customer: { select: { name: true, email: true } } },
      orderBy: [{ active: "desc" }, { nextRunAt: "asc" }],
    });
    // Totaal per termijn meesturen (uit de regels), handig voor de lijst
    return NextResponse.json(
      items.map((r) => {
        const lines = Array.isArray(r.lineItems) ? (r.lineItems as { description: string; quantity: number; unitPrice: number; vatRate: number }[]) : [];
        const totals = calculateInvoiceTotals(lines);
        return { ...r, total: totals.total, lineCount: lines.length };
      }),
    );
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/recurring — nieuw sjabloon
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const parsed = createRecurringSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
    }
    const d = parsed.data;
    const customer = await db.customer.findFirst({ where: { id: d.customerId, userId: user.accountId }, select: { id: true } });
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    const count = await db.recurringInvoice.count({ where: { userId: user.accountId } });
    if (count >= 200) return NextResponse.json({ error: "Maximaal 200 periodieke facturen." }, { status: 400 });

    const start = d.startDate ?? new Date();
    start.setHours(9, 0, 0, 0);

    const created = await db.recurringInvoice.create({
      data: {
        userId: user.accountId,
        createdById: user.id,
        customerId: d.customerId,
        interval: d.interval,
        nextRunAt: start,
        autoSend: d.autoSend ?? false,
        notes: d.notes || null,
        lineItems: d.lineItems,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
