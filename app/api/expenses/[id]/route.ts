import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse, HttpError } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { updateExpenseSchema } from "@/lib/validations/expense";
import { logAccount } from "@/lib/audit";

function vatFromGross(gross: number, rate: number) {
  return Math.round(((gross * rate) / (100 + rate)) * 100) / 100;
}

// PATCH /api/expenses/:id — uitgave bijwerken
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const parsed = updateExpenseSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ongeldige invoer" }, { status: 400 });
    }
    const d = parsed.data;

    const existing = await db.expense.findFirst({ where: { id, userId: user.accountId } });
    if (!existing) throw new HttpError(404, "Uitgave niet gevonden");

    const amountGross = d.amountGross ?? Number(existing.amountGross);
    const vatRate = d.vatRate ?? Number(existing.vatRate);

    await db.expense.update({
      where: { id },
      data: {
        ...(d.date ? { date: new Date(`${d.date}T00:00:00Z`) } : {}),
        ...(d.vendor !== undefined ? { vendor: d.vendor } : {}),
        ...(d.description !== undefined ? { description: d.description || null } : {}),
        ...(d.category !== undefined ? { category: d.category } : {}),
        amountGross,
        vatRate,
        vatAmount: vatFromGross(amountGross, vatRate),
        ...(d.receipt !== undefined ? { receipt: d.receipt } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/expenses/:id — uitgave verwijderen
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const existing = await db.expense.findFirst({ where: { id, userId: user.accountId }, select: { id: true } });
    if (!existing) throw new HttpError(404, "Uitgave niet gevonden");
    await db.expense.delete({ where: { id } });
    logAccount(user.accountId, { id: user.id, name: user.name, email: user.email }, "expense.deleted", existing.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
