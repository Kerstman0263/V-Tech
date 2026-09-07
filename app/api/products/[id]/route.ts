import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { updateProductSchema } from "@/lib/validations/product";

// PATCH /api/products/:id — bijwerken of (de)archiveren
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const parsed = updateProductSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
    }
    const d = parsed.data;
    const result = await db.product.updateMany({
      where: { id, userId: user.accountId },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.description !== undefined ? { description: d.description || null } : {}),
        ...(d.unitPrice !== undefined ? { unitPrice: d.unitPrice } : {}),
        ...(d.vatRate !== undefined ? { vatRate: d.vatRate } : {}),
        ...(d.unit !== undefined ? { unit: d.unit || null } : {}),
        ...(d.active !== undefined ? { active: d.active } : {}),
      },
    });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/products/:id — verwijderen (facturen houden hun eigen kopie van de regel)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;
    const result = await db.product.deleteMany({ where: { id, userId: user.accountId } });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
