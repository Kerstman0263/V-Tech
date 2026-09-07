import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { updateRecurringSchema } from "@/lib/validations/recurring";

// PATCH /api/recurring/:id — pauzeren/hervatten, interval, datum, regels
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const parsed = updateRecurringSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
    }
    const d = parsed.data;
    const result = await db.recurringInvoice.updateMany({
      where: { id, userId: user.accountId },
      data: {
        ...(d.interval !== undefined ? { interval: d.interval } : {}),
        ...(d.nextRunAt !== undefined ? { nextRunAt: d.nextRunAt } : {}),
        ...(d.active !== undefined ? { active: d.active } : {}),
        ...(d.autoSend !== undefined ? { autoSend: d.autoSend } : {}),
        ...(d.notes !== undefined ? { notes: d.notes } : {}),
        ...(d.lineItems !== undefined ? { lineItems: d.lineItems } : {}),
      },
    });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/recurring/:id — sjabloon verwijderen (al gemaakte facturen blijven)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const result = await db.recurringInvoice.deleteMany({ where: { id, userId: user.accountId } });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
